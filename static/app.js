const ICONS = {
  gauge: `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 21a9 9 0 1 1 9-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 12l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>`,
  thermo: `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3a2 2 0 0 0-2 2v9.17a4 4 0 1 0 4 0V5a2 2 0 0 0-2-2z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="18" r="2" fill="currentColor"/></svg>`,
  plug: `<svg viewBox="0 0 24 24" width="15" height="15"><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 17v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 3v5h-5M6 21v-5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  flameOff: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 0 1-7 7"/><path d="M3 3l18 18"/></svg>`,
  sliders: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>`,
  arrowDown: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M18 13l-6 6-6-6"/></svg>`,
  arrowUp: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
};

const CHANNELS = [
  { key: "pressure", label: "Vacuum Pump Pressure", unit: "V", color: "#29d3ff", defaultPort: 8888, icon: ICONS.gauge },
  { key: "temp1", label: "Sandbath Temperature", unit: "\u00b0C", color: "#ffa726", defaultPort: 8889, icon: ICONS.thermo },
  { key: "temp2", label: "Cooling Water Temperature", unit: "\u00b0C", color: "#ff5d8f", defaultPort: 8890, icon: ICONS.thermo },
];

const state = {};
CHANNELS.forEach(ch => state[ch.key] = { points: [] }); // [{t: epochSeconds, v}]
let connectedState = {};

// --------------------------------------------------------------
// Build cards
// --------------------------------------------------------------
const grid = document.getElementById("channel-grid");

CHANNELS.forEach(ch => {
  const isTemp1 = ch.key === "temp1";   // only the Sandbath card gets heater controls
  const card = document.createElement("div");
  card.className = "channel-card";
  card.innerHTML = `
    <div class="head">
      <span class="name" style="color:${ch.color}">${ch.icon}${ch.label}</span>
      <span class="status-dot" id="dot-${ch.key}"></span>
    </div>
    <div class="value-row">
      <span class="value" id="value-${ch.key}" style="color:${ch.color}">---</span>
      <span class="unit">${ch.unit}</span>
      ${isTemp1 ? `<span class="heater-badge off" id="heater-${ch.key}" title="Heater state">${ICONS.flameOff}<span>Heater &mdash;</span></span>` : ``}
    </div>
    <div class="meta" id="meta-${ch.key}">no data yet</div>
    <div class="window-tag" id="window-${ch.key}">window: 30s (auto)</div>
    <div class="chart" id="chart-${ch.key}"></div>
    ${isTemp1 ? `
    <div class="setpoint-panel">
      <div class="sp-title">${ICONS.sliders}Heater Setpoints</div>
      <div class="sp-row">
        <label class="sp-field">
          <span class="sp-label">${ICONS.arrowDown}ON at / below</span>
          <span class="sp-input-wrap"><input type="number" step="0.1" id="low-${ch.key}" class="sp-input" placeholder="208.0"><span class="sp-unit">${ch.unit}</span></span>
        </label>
        <label class="sp-field">
          <span class="sp-label">${ICONS.arrowUp}OFF at / above</span>
          <span class="sp-input-wrap"><input type="number" step="0.1" id="high-${ch.key}" class="sp-input" placeholder="210.0"><span class="sp-unit">${ch.unit}</span></span>
        </label>
        <button class="small icon-btn sp-apply" id="applyBtn-${ch.key}">${ICONS.check}Apply</button>
      </div>
      <div class="sp-hint" id="sp-hint-${ch.key}">Heater turns ON below the low limit and OFF above the high limit.</div>
    </div>` : ``}
    <div class="conn-row">
      <input type="text" id="ip-${ch.key}" placeholder="Board IP, e.g. 192.168.1.101">
      <input type="number" class="port" id="port-${ch.key}" value="${ch.defaultPort}">
    </div>
    <div class="actions">
      <button class="small icon-btn" id="connectBtn-${ch.key}">${ICONS.plug}Connect</button>
      <button class="small icon-btn" id="refreshBtn-${ch.key}">${ICONS.refresh}Refresh</button>
    </div>
  `;
  grid.appendChild(card);

  document.getElementById(`connectBtn-${ch.key}`).onclick = () => toggleConnect(ch.key);
  document.getElementById(`refreshBtn-${ch.key}`).onclick = () => refreshChannel(ch.key);
  if (isTemp1) {
    document.getElementById(`applyBtn-${ch.key}`).onclick = () => applySetpoints(ch.key);
    document.getElementById(`low-${ch.key}`).addEventListener("keydown", e => { if (e.key === "Enter") applySetpoints(ch.key); });
    document.getElementById(`high-${ch.key}`).addEventListener("keydown", e => { if (e.key === "Enter") applySetpoints(ch.key); });
  }

  Plotly.newPlot(`chart-${ch.key}`, [{
    x: [], y: [], customdata: [], mode: "lines",
    line: { color: ch.color, width: 2.5, shape: "spline" },
    hovertemplate: "%{customdata}<br>" + ch.unit + ": %{y:.3f}<extra></extra>",
  }], {
    paper_bgcolor: "transparent", plot_bgcolor: "transparent",
    font: { color: "#8b96a5", size: 11 },
    margin: { l: 52, r: 15, t: 10, b: 34 },
    xaxis: {
      type: "linear", gridcolor: "#232c38", showgrid: true,
      ticksuffix: " s", zeroline: false,
    },
    yaxis: { gridcolor: "#232c38", showgrid: true, zeroline: false },
    showlegend: false,
    hoverlabel: { bgcolor: "#151b24", bordercolor: ch.color, font: { color: "#eef2f7" } },
  }, { responsive: true, displayModeBar: false });
});

// --------------------------------------------------------------
// Connection / control actions
// --------------------------------------------------------------
function toggleConnect(key) {
  if (!connectedState[key]) {
    const ip = document.getElementById(`ip-${key}`).value.trim();
    const port = parseInt(document.getElementById(`port-${key}`).value, 10);
    if (!ip) { alert(`Enter an IP for ${key}`); return; }
    fetch(`/api/channels/${key}/connect`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip, port }),
    });
  } else {
    fetch(`/api/channels/${key}/disconnect`, { method: "POST" });
  }
}

function refreshChannel(key) {
  fetch(`/api/channels/${key}/refresh`, { method: "POST" });
}

// ---- Heater setpoints (Sandbath / temp1 card only) --------------------
function applySetpoints(key) {
  const low = parseFloat(document.getElementById(`low-${key}`).value);
  const high = parseFloat(document.getElementById(`high-${key}`).value);
  if (Number.isNaN(low) || Number.isNaN(high)) { setHint(key, "Enter both limit values.", true); return; }
  if (low >= high) { setHint(key, "Low limit must be below the high limit.", true); return; }
  setHint(key, "Sending to board\u2026", false);
  fetch(`/api/channels/${key}/setpoints`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ low, high }),
  })
    .then(r => r.json())
    .then(res => {
      if (res.ok) setHint(key, `Applied \u2713  ON \u2264 ${low}\u00b0C, OFF \u2265 ${high}\u00b0C.`, false);
      else setHint(key, res.error || "Failed to apply.", true);
    })
    .catch(() => setHint(key, "Network error \u2014 not sent.", true));
}

function setHint(key, text, isError) {
  const hint = document.getElementById(`sp-hint-${key}`);
  if (!hint) return;
  hint.textContent = text;
  hint.classList.toggle("err", !!isError);
}

// Reflect the board's active limits in the inputs (without stomping a field
// the user is currently editing).
function updateSetpoints(key, low, high) {
  const lo = document.getElementById(`low-${key}`);
  const hi = document.getElementById(`high-${key}`);
  if (lo && document.activeElement !== lo) lo.value = low;
  if (hi && document.activeElement !== hi) hi.value = high;
}

// Heater ON/OFF alert badge.
function updateHeater(key, on, secs) {
  const badge = document.getElementById(`heater-${key}`);
  if (!badge) return;
  badge.classList.toggle("on", on);
  badge.classList.toggle("off", !on);
  const label = (on ? "Heater ON" : "Heater OFF") +
    (typeof secs === "number" ? ` \u00b7 ${formatSpan(secs)}` : "");
  badge.innerHTML = (on ? ICONS.flame : ICONS.flameOff) + `<span>${label}</span>`;
}

document.getElementById("clearAllBtn").onclick = () => CHANNELS.forEach(ch => refreshChannel(ch.key));
document.getElementById("exportBtn").onclick = () => window.open("/api/export", "_blank");

// --------------------------------------------------------------
// Auto-expanding time window (NO manual selector). Each chart's x=0
// is always its OWN first currently retained data point, so the line
// always starts drawing immediately from the left with no blank gap.
// The visible span automatically steps up as more real time passes:
// 30s -> 1m -> 2m -> 5m -> 10m -> 30m -> 1h -> everything collected.
// Ticks are plain elapsed seconds; the actual wall-clock date/time +
// exact value is still shown on hover via `customdata`.
// --------------------------------------------------------------
const WINDOW_STAIRCASE = [30, 60, 120, 300, 600, 1800, 3600]; // seconds

function currentSpanFor(elapsedSeconds) {
  for (const bucket of WINDOW_STAIRCASE) if (elapsedSeconds <= bucket) return bucket;
  return elapsedSeconds; // past 1h: just keep showing everything collected
}

function niceDtick(span) {
  const table = [[30, 5], [60, 10], [120, 20], [300, 60], [600, 120], [1800, 300], [3600, 600]];
  for (const [max, step] of table) if (span <= max) return step;
  return undefined; // let Plotly auto-pick beyond 1h
}

function formatSpan(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function fmtDateTime(tSec) {
  const d = new Date(tSec * 1000);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function redrawAll() {
  const nowSec = Date.now() / 1000;

  CHANNELS.forEach(ch => {
    const key = ch.key;
    const pts = state[key].points;

    // safety cap so a very long unattended session doesn't grow forever
    while (pts.length > 20000) pts.shift();

    if (!pts.length) return; // nothing to draw yet -- leave chart empty

    const start = pts[0].t;
    const elapsed = nowSec - start;
    const span = currentSpanFor(elapsed);

    const xs = pts.map(p => p.t - start);
    const ys = pts.map(p => p.v);
    const custom = pts.map(p => fmtDateTime(p.t));

    Plotly.update(`chart-${key}`, { x: [xs], y: [ys], customdata: [custom] }, {
      "xaxis.range": [0, span],
      "xaxis.dtick": niceDtick(span),
    });

    document.getElementById(`window-${key}`).textContent = `window: ${formatSpan(span)} (auto)`;
  });
}

setInterval(redrawAll, 300);

// --------------------------------------------------------------
// Digital readouts / status dots
// --------------------------------------------------------------
function updateDigital(key, value, ts, extra) {
  const digits = key === "pressure" ? 3 : 2;
  document.getElementById(`value-${key}`).textContent = value.toFixed(digits);
  let metaText = `updated ${fmtDateTime(ts)}`;
  if (key === "pressure" && extra && typeof extra.torr === "number") {
    metaText += `  \u2022  \u2248 ${extra.torr.toFixed(2)} Torr`;
  }
  document.getElementById(`meta-${key}`).textContent = metaText;
}

function setDot(key, connected) {
  const dot = document.getElementById(`dot-${key}`);
  dot.classList.toggle("live", connected);
  connectedState[key] = connected;
  document.getElementById(`connectBtn-${key}`).innerHTML = ICONS.plug + (connected ? "Disconnect" : "Connect");
  document.getElementById(`ip-${key}`).disabled = connected;
  document.getElementById(`port-${key}`).disabled = connected;
}

// --------------------------------------------------------------
// WebSocket
// --------------------------------------------------------------
const statusBar = document.getElementById("statusBar");
const proto = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${proto}://${window.location.host}/ws`);

ws.onopen = () => statusBar.textContent = "Connected. Waiting for device data...";
ws.onclose = () => statusBar.textContent = "Server connection lost \u2014 reload to retry.";

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "snapshot") {
    Object.entries(msg.status).forEach(([key, s]) => {
      document.getElementById(`ip-${key}`).value = s.ip || "";
      setDot(key, s.connected);
      if (key === "temp1" && s.temp_low !== undefined) updateSetpoints("temp1", s.temp_low, s.temp_high);
    });
  } else if (msg.type === "history") {
    state[msg.channel].points = msg.points.map(([t, v]) => ({ t, v }));
    const pts = state[msg.channel].points;
    if (pts.length) updateDigital(msg.channel, pts[pts.length - 1].v, pts[pts.length - 1].t);
  } else if (msg.type === "sample") {
    state[msg.channel].points.push({ t: msg.t, v: msg.v });
    updateDigital(msg.channel, msg.v, msg.t, { mbar: msg.mbar, torr: msg.torr });
    if (msg.channel === "temp1" && msg.heater !== undefined) updateHeater("temp1", !!msg.heater, msg.heater_secs);
  } else if (msg.type === "setpoints") {
    updateSetpoints(msg.channel, msg.low, msg.high);
    setHint(msg.channel, `Active limits \u2014 ON \u2264 ${msg.low}\u00b0C, OFF \u2265 ${msg.high}\u00b0C.`, false);
  } else if (msg.type === "status") {
    setDot(msg.channel, msg.connected);
    if (!msg.connected && msg.reason) statusBar.textContent = `[${msg.channel}] ${msg.reason}`;
  } else if (msg.type === "refresh") {
    state[msg.channel].points = [];
    document.getElementById(`value-${msg.channel}`).textContent = "---";
    document.getElementById(`meta-${msg.channel}`).textContent = "no data yet";
    document.getElementById(`window-${msg.channel}`).textContent = "window: 30s (auto)";
  }
};