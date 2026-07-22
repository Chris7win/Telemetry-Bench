# 📡 Telemetry Bench

> A modern real-time telemetry dashboard for ESP32-based laboratory instrumentation.

Telemetry Bench is a lightweight, real-time monitoring platform designed for laboratory automation, embedded systems, and industrial IoT applications. It provides a centralized dashboard to monitor multiple ESP32 devices simultaneously over a local Wi-Fi network with low-latency telemetry streaming.

![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?logo=fastapi)
![ESP32](https://img.shields.io/badge/ESP32-IoT-orange)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--Time-green)
![License](https://img.shields.io/github/license/Chris7win/Telemetry-Bench)
---

## ✨ Features

- 📈 Real-time telemetry visualization
- 🔌 Multi-device ESP32 monitoring
- ⚡ WebSocket-based live updates
- 📊 Interactive Plotly charts
- 🌡️ Sandbath temperature monitoring
- 💧 Cooling water temperature monitoring
- ⚙️ Remote heater setpoint configuration
- 📉 Vacuum pressure monitoring
- 📁 CSV data export
- 📡 TCP communication with ESP32 devices
- 🎨 Modern responsive dashboard
- 🖥️ Works on desktop, tablet, and smart TVs

---

## 🏗️ System Architecture

```text
                 +----------------------+
                 |     ESP32 Board 1    |
                 | Vacuum Pressure      |
                 +----------+-----------+
                            |
                            |
                 +----------v-----------+
                 |     FastAPI Server   |
                 |  WebSocket + TCP     |
                 +----------+-----------+
                            |
       +--------------------+--------------------+
       |                    |                    |
+------v------+     +-------v------+     +-------v------+
| ESP32 Temp1 |     | ESP32 Temp2  |     |   Web Client |
| Sandbath    |     | Cooling Temp |     | Dashboard    |
+-------------+     +--------------+     +--------------+
```

---

# Dashboard

The dashboard provides live monitoring for:

- Vacuum Pump Pressure
- Sandbath Temperature
- Cooling Water Temperature

Each channel includes:

- Live numerical value
- Connection status
- Real-time graph
- Device connection controls
- Historical plotting
- Automatic time scaling

The Sandbath controller additionally supports:

- Heater status indicator
- Remote temperature setpoint adjustment
- Live heater ON/OFF monitoring

---

# Technologies Used

## Backend

- Python 3.12+
- FastAPI
- Uvicorn
- WebSockets
- TCP Socket Programming

## Frontend

- HTML5
- CSS3
- JavaScript (ES6)
- Plotly.js

## Embedded

- ESP32
- WiFi TCP Server
- Custom Telemetry Protocol

---

# Project Structure

```text
Telemetry-Bench
│
├── server.py
├── requirements.txt
├── LICENSE
├── README.md
│
├── static
│   ├── index.html
│   ├── app.js
│   └── style.css
│
└── .gitignore
```

---

# Installation

Clone the repository

```bash
git clone https://github.com/Chris7win/Telemetry-Bench.git
```

Enter the project

```bash
cd Telemetry-Bench
```

Create a virtual environment

```bash
python -m venv .venv
```

Activate it

### Windows

```bash
.venv\Scripts\activate
```

### Linux / macOS

```bash
source .venv/bin/activate
```

Install dependencies

```bash
pip install -r requirements.txt
```

---

# Running the Server

```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

or

```bash
python -m uvicorn server:app --host 0.0.0.0 --port 8000
```

Open

```
http://localhost:8000
```

or

```
http://<YOUR_LOCAL_IP>:8000
```

to access the dashboard from any device on the same Wi-Fi network.

---

# Supported Telemetry Channels

| Channel | Default Port |
|----------|-------------:|
| Vacuum Pressure | 8888 |
| Sandbath Temperature | 8889 |
| Cooling Water Temperature | 8890 |

---

# Data Export

Telemetry data can be exported directly from the dashboard as CSV.

Each exported record contains:

- Timestamp
- Sensor value
- Unit
- Pressure (mbar)
- Pressure (Torr)

---

# Applications

- Laboratory Automation
- Embedded Systems
- Industrial IoT
- Environmental Monitoring
- Process Monitoring
- Research Laboratories
- Instrumentation Systems

---

# Future Improvements

- PID Controller Integration
- Authentication & User Accounts
- Historical Database Storage
- MQTT Support
- Remote Cloud Dashboard
- Alarm Notifications
- Mobile Application
- Multi-user Monitoring
- Dark/Light Themes
- Docker Deployment

---

# Screenshots

> Add screenshots of the dashboard here.

```text
docs/images/dashboard.png
docs/images/charts.png
docs/images/mobile.png
```

---

# License

This project is licensed under the MIT License.

See the [LICENSE](LICENSE) file for details.

---

# Author

**Chriswin J.**

Electronics & Communication Engineering

Embedded Systems • IoT • Laboratory Automation • Industrial Automation

GitHub: https://github.com/Chris7win

---

## ⭐ Support

If you find this project useful, consider giving it a **⭐ Star** on GitHub.
