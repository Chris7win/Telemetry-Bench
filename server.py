"""
ESP32 Web Monitor — FastAPI backend
====================================
Owns the persistent TCP socket connections to the 3 ESP32 boards
(same WiFiServer / client.println protocol as the firmware) and streams
every new sample to all connected browsers over a single WebSocket.

Run with:
    python -m uvicorn server:app --host 0.0.0.0 --port 8000

On startup this prints every URL other devices on your network can use
to reach the dashboard (e.g. for typing into your TV's browser).
"""

import asyncio
import csv
import io
import socket
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

MAX_BUFFER_PER_CHANNEL = 200_000  # samples kept per channel (memory cap)
PORT = 8000

CHANNELS = [
    {"key": "pressure", "label": "Vacuum Pump Pressure", "unit": "V", "default_port": 8888},
    {"key": "temp1", "label": "Sandbath Temperature", "unit": "\u00b0C", "default_port": 8889},
    {"key": "temp2", "label": "Cooling Water Temperature", "unit": "\u00b0C", "default_port": 8890},
]


def parse_last_field(raw_line: str) -> float:
    """
    Generic parser used for the cooling-water temperature channel (temp2).
    It sends a plain float per line, e.g. "23.45".
    """
    line = raw_line.strip()
    if not line:
        raise ValueError("empty line")
    token = line.split("\t")[-1].strip().lstrip("<").strip()
    return float(token)


def parse_temp1_line(raw_line: str):
    """
    Parser for the Sandbath board (temp1). It streams:
        "<temp>\\t<heater 0|1>\\t<seconds-in-state>"
    The temperature is always the FIRST field (so the plotted/displayed
    value is unchanged); the heater flag and duration ride along as extras
    used only for the card's heater alert. Falls back gracefully if the
    board ever sends a bare float.
    Returns (value, heater_on: bool, heater_secs: int | None).
    """
    line = raw_line.strip()
    if not line:
        raise ValueError("empty line")
    parts = line.split("\t")
    value = float(parts[0].strip())
    heater = False
    heater_secs = None
    if len(parts) > 1:
        heater = parts[1].strip() in ("1", "ON", "on", "true", "True")
    if len(parts) > 2:
        try:
            heater_secs = int(float(parts[2].strip()))
        except ValueError:
            heater_secs = None
    return value, heater, heater_secs


# --------------------------------------------------------------------------
# Pressure calibration (Pirani gauge)
# --------------------------------------------------------------------------
# The firmware streams "VBR\tmbar\tTorr" but we deliberately IGNORE its
# precomputed mbar/Torr fields and only trust the raw bridge voltage
# (VBR, 0-5 V, always the FIRST tab-separated field). Conversion to
# pressure happens here in Python instead, so the calibration table can
# be retuned any time by editing this file -- no reflashing the ESP32.
#
# This table must be kept in descending-voltage order, matching the
# firmware's own calV/calP arrays in board1_pressure_pirani.ino.
CAL_V = [2.10, 1.80, 1.40, 1.05]           # bridge voltage anchors (V)
CAL_P_MBAR = [1013.0, 13.0, 0.7, 0.013]    # corresponding pressure anchors (mbar)


def voltage_to_pressure(vbr: float):
    """Log-linear interpolation identical to the firmware's voltsToMbar()."""
    if vbr >= CAL_V[0]:
        mbar = CAL_P_MBAR[0]
    elif vbr <= CAL_V[-1]:
        mbar = CAL_P_MBAR[-1]
    else:
        mbar = CAL_P_MBAR[-1]
        for i in range(len(CAL_V) - 1):
            if CAL_V[i] >= vbr > CAL_V[i + 1]:
                f = (vbr - CAL_V[i + 1]) / (CAL_V[i] - CAL_V[i + 1])
                import math
                log_p = math.log(CAL_P_MBAR[i + 1]) + f * (math.log(CAL_P_MBAR[i]) - math.log(CAL_P_MBAR[i + 1]))
                mbar = math.exp(log_p)
                break
    torr = mbar * 0.750062
    return mbar, torr


def parse_pressure_line(raw_line: str):
    """
    Extracts VBR (the first field) from the pressure board's line and
    returns (vbr, mbar, torr). Works whether the firmware sends the full
    "VBR\\tmbar\\tTorr" line or, if ever simplified, just a bare VBR value.
    """
    line = raw_line.strip()
    if not line:
        raise ValueError("empty line")
    vbr = float(line.split("\t")[0].strip())
    mbar, torr = voltage_to_pressure(vbr)
    return vbr, mbar, torr


def get_local_ips():
    """Best-effort list of this machine's LAN IPv4 addresses."""
    ips = set()
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                ips.add(ip)
    except Exception:
        pass
    # Fallback: open a dummy UDP socket to a public IP to see which
    # local interface the OS would route through (doesn't actually send
    # any traffic).
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    return sorted(ips) or ["127.0.0.1"]


@dataclass
class Channel:
    key: str
    label: str
    unit: str
    ip: str = ""
    port: int = 0
    connected: bool = False
    monitoring: bool = True         # recording is on by default once connected
    temp_low: float = 208.0         # heater ON  at/below (temp1 only; mirrors firmware)
    temp_high: float = 210.0        # heater OFF at/above (temp1 only; mirrors firmware)
    thread: Optional["TCPReaderThread"] = None
    buffer: deque = field(default_factory=lambda: deque(maxlen=MAX_BUFFER_PER_CHANNEL))
    lock: threading.Lock = field(default_factory=threading.Lock)


class TCPReaderThread(threading.Thread):
    """Persistent, blocking-read TCP client for one ESP32 board."""

    def __init__(self, key, host, port, on_line, on_status):
        super().__init__(daemon=True)
        self.key = key
        self.host = host
        self.port = port
        self.on_line = on_line       # callback(key, raw_line)
        self.on_status = on_status   # callback(key, connected: bool, reason: str)
        self._sock = None
        self._manual_stop = False
        self._lock = threading.Lock()

    def run(self):
        try:
            sock = socket.create_connection((self.host, self.port), timeout=5)
            sock.settimeout(None)
            with self._lock:
                self._sock = sock
            self.on_status(self.key, True, "connected")
            sock_file = sock.makefile("r", newline="\n")
            while True:
                line = sock_file.readline()
                if line == "":
                    if not self._manual_stop:
                        self.on_status(self.key, False, "connection closed by device")
                    break
                self.on_line(self.key, line)
        except Exception as exc:
            if not self._manual_stop:
                self.on_status(self.key, False, str(exc))
        finally:
            with self._lock:
                if self._sock is not None:
                    try:
                        self._sock.close()
                    except Exception:
                        pass
                    self._sock = None

    def send(self, text: str) -> bool:
        """Write a command line back to the board (e.g. a SET setpoint line)."""
        with self._lock:
            if self._sock is None:
                return False
            try:
                self._sock.sendall(text.encode())
                return True
            except Exception:
                return False

    def stop(self):
        self._manual_stop = True
        with self._lock:
            if self._sock is not None:
                try:
                    self._sock.shutdown(socket.SHUT_RDWR)
                except Exception:
                    pass
                try:
                    self._sock.close()
                except Exception:
                    pass


# --------------------------------------------------------------------------
# App state
# --------------------------------------------------------------------------
app = FastAPI(title="ESP32 Web Monitor")
app.mount("/static", StaticFiles(directory="static"), name="static")

channels = {ch["key"]: Channel(key=ch["key"], label=ch["label"], unit=ch["unit"])
            for ch in CHANNELS}

clients: set[WebSocket] = set()
MAIN_LOOP: Optional[asyncio.AbstractEventLoop] = None


async def broadcast(message: dict):
    dead = []
    for ws in clients:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)


def schedule_broadcast(message: dict):
    """Call from a non-async thread to push a message to all browsers."""
    if MAIN_LOOP is not None:
        asyncio.run_coroutine_threadsafe(broadcast(message), MAIN_LOOP)


# --------------------------------------------------------------------------
# Callbacks invoked from reader threads
# --------------------------------------------------------------------------
def handle_line(key, raw_line):
    ch = channels[key]

    # The Sandbath board (temp1) also emits setpoint-report lines
    # ("SP\tlow\thigh"). Handle those regardless of monitoring state so the
    # card's heater limits always reflect the board, then stop -- they are
    # not data samples.
    if key == "temp1" and raw_line.strip().startswith("SP"):
        try:
            _, low, high = raw_line.strip().split("\t")
            ch.temp_low, ch.temp_high = float(low), float(high)
        except Exception:
            return
        schedule_broadcast({"type": "setpoints", "channel": key,
                            "low": ch.temp_low, "high": ch.temp_high})
        return

    if not ch.monitoring:
        return
    extra = {}
    try:
        if key == "pressure":
            # Primary displayed/plotted value is the raw bridge voltage
            # (0-5 V) -- NOT the computed pressure. mbar/Torr are still
            # computed and carried along as extra info (shown in the
            # meta line and included in CSV export) but are not the
            # main number or the graph's y-axis.
            vbr, mbar, torr = parse_pressure_line(raw_line)
            value = vbr
            extra = {"mbar": round(mbar, 4), "torr": round(torr, 4)}
        elif key == "temp1":
            # Temperature is still the first field, so the plotted/displayed
            # value is identical to before; heater flag/duration ride along.
            value, heater, heater_secs = parse_temp1_line(raw_line)
            extra = {"heater": heater}
            if heater_secs is not None:
                extra["heater_secs"] = heater_secs
        else:
            value = parse_last_field(raw_line)
    except Exception:
        return
    ts = time.time()
    with ch.lock:
        ch.buffer.append((ts, value, extra))
    schedule_broadcast({"type": "sample", "channel": key, "t": ts, "v": value, **extra})


def handle_status(key, connected, reason):
    ch = channels[key]
    ch.connected = connected
    if not connected:
        ch.thread = None
    schedule_broadcast({
        "type": "status", "channel": key,
        "connected": connected, "monitoring": ch.monitoring, "reason": reason,
    })


# --------------------------------------------------------------------------
# REST API
# --------------------------------------------------------------------------
class ConnectRequest(BaseModel):
    ip: str
    port: int


@app.get("/api/status")
async def get_status():
    return {
        key: {
            "label": ch.label, "unit": ch.unit, "ip": ch.ip, "port": ch.port,
            "connected": ch.connected, "monitoring": ch.monitoring,
            "temp_low": ch.temp_low, "temp_high": ch.temp_high,
        } for key, ch in channels.items()
    }


@app.get("/api/history/{key}")
async def get_history(key: str, seconds: float = 120):
    ch = channels[key]
    cutoff = time.time() - seconds
    with ch.lock:
        pts = [(t, v) for t, v, extra in ch.buffer if t >= cutoff]
    return {"channel": key, "points": pts}


@app.post("/api/channels/{key}/connect")
async def connect_channel(key: str, req: ConnectRequest):
    ch = channels[key]
    if ch.thread is not None:
        return {"ok": False, "error": "already connecting/connected"}
    ch.ip, ch.port = req.ip, req.port
    thread = TCPReaderThread(key, req.ip, req.port, handle_line, handle_status)
    ch.thread = thread
    thread.start()
    return {"ok": True}


@app.post("/api/channels/{key}/disconnect")
async def disconnect_channel(key: str):
    ch = channels[key]
    if ch.thread is not None:
        ch.thread.stop()
        ch.thread = None
    ch.connected = False
    await broadcast({"type": "status", "channel": key, "connected": False,
                      "monitoring": ch.monitoring, "reason": "manually disconnected"})
    return {"ok": True}


@app.post("/api/channels/{key}/refresh")
async def refresh_channel(key: str):
    """Clears this channel's history only. Connection stays open."""
    ch = channels[key]
    with ch.lock:
        ch.buffer.clear()
    await broadcast({"type": "refresh", "channel": key})
    return {"ok": True}


class SetpointRequest(BaseModel):
    low: float
    high: float


@app.post("/api/channels/{key}/setpoints")
async def set_setpoints(key: str, req: SetpointRequest):
    """Push new heater limits (TEMP_LOW/TEMP_HIGH) to the board over TCP."""
    ch = channels[key]
    if req.low >= req.high:
        return {"ok": False, "error": "Low value must be below high value"}
    if ch.thread is None or not ch.connected:
        return {"ok": False, "error": "channel not connected"}
    if not ch.thread.send(f"SET\t{req.low:.2f}\t{req.high:.2f}\n"):
        return {"ok": False, "error": "failed to send to device"}
    # Optimistic local update + broadcast; the board echoes an "SP" report
    # that will confirm/refresh these same values shortly after.
    ch.temp_low, ch.temp_high = req.low, req.high
    await broadcast({"type": "setpoints", "channel": key,
                     "low": req.low, "high": req.high})
    return {"ok": True}


@app.post("/api/channels/{key}/monitoring")
async def set_monitoring(key: str, enabled: bool):
    ch = channels[key]
    ch.monitoring = enabled
    await broadcast({"type": "status", "channel": key, "connected": ch.connected,
                      "monitoring": ch.monitoring, "reason": ""})
    return {"ok": True}


@app.get("/api/export")
async def export_csv():
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["channel", "unix_timestamp", "iso_time", "value", "value_unit", "mbar", "torr"])
    for key, ch in channels.items():
        with ch.lock:
            pts = list(ch.buffer)
        for ts, v, extra in pts:
            iso = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))
            mbar = extra.get("mbar", "")
            torr = extra.get("torr", "")
            writer.writerow([ch.label, f"{ts:.3f}", iso, v, ch.unit, mbar, torr])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=esp32_log.csv"},
    )


@app.get("/")
async def index():
    return FileResponse("static/index.html")


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    try:
        status = await get_status()
        await ws.send_json({"type": "snapshot", "status": status})
        for key, ch in channels.items():
            with ch.lock:
                pts = [(t, v) for t, v, extra in list(ch.buffer)[-2000:]]
            await ws.send_json({"type": "history", "channel": key, "points": pts})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        clients.discard(ws)


@app.on_event("startup")
async def on_startup():
    global MAIN_LOOP
    MAIN_LOOP = asyncio.get_event_loop()
    ips = get_local_ips()
    print("\n" + "=" * 60)
    print("  ESP32 Web Monitor is running.")
    print("  Open the dashboard from ANY device on this WiFi network:")
    for ip in ips:
        print(f"      http://{ip}:{PORT}")
    print(f"  (On this laptop only, http://localhost:{PORT} also works)")
    print("=" * 60 + "\n")


@app.on_event("shutdown")
async def on_shutdown():
    for ch in channels.values():
        if ch.thread is not None:
            ch.thread.stop()