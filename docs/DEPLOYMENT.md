# Pandita's Aether-DCTWIN — Deployment & Cloud Operations Guide

This guide covers all supported deployment topologies for **Pandita's Aether-DCTWIN**, ranging from local single-command evaluation to containerized Docker Compose, cloud PaaS (Render, Railway, Fly.io), AWS/GCP/Azure VM + Nginx reverse proxy, and on-premises Kubernetes (`k8s`) inside a data center management VLAN.

---

## Table of Contents
1. [Option 1: Local Bare-Metal / Laptop Quick Start (`start_twin.sh`)](#1-option-1-local-bare-metal--laptop-quick-start-start_twinsh)
2. [Option 2: Docker & Docker Compose (Single-Command Production Container)](#2-option-2-docker--docker-compose-single-command-production-container)
3. [Option 3: Cloud PaaS Deployment (Render / Railway / Fly.io)](#3-option-3-cloud-paas-deployment-render--railway--flyio)
4. [Option 4: Cloud VM (AWS EC2 / GCP Compute Engine / Azure VM) + Systemd & Nginx TLS](#4-option-4-cloud-vm-aws-ec2--gcp-compute-engine--azure-vm--systemd--nginx-tls)
5. [Option 5: On-Premises Data Center Kubernetes (`k8s`) Deployment](#5-option-5-on-premises-data-center-kubernetes-k8s-deployment)
6. [Environment Variables & Secret Management](#6-environment-variables--secret-management)
7. [Production Hardening & Network Firewall Rules for BMS/DCIM Connectors](#7-production-hardening--network-firewall-rules-for-bmsdcim-connectors)

---

## 1. Option 1: Local Bare-Metal / Laptop Quick Start (`start_twin.sh`)

### Prerequisites
- **Python**: `3.11+` (`3.12` or `3.13` recommended)
- **Node.js**: `20+` or `22+` (with `npm`)

### Steps
```bash
git clone https://github.com/bhandiwad/dc-digital-twin.git
cd dc-digital-twin

# Optional: configure OpenRouter API key
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY=sk-or-v1-...

chmod +x start_twin.sh
./start_twin.sh
```
The script automatically creates `.venv`, installs `backend/requirements.txt`, builds the `frontend/dist` WebGL bundle if not present, seeds the DuckDB + Parquet 24-hour benchmark datasets in `data/`, and starts the FastAPI + WebSocket server on **http://127.0.0.1:8000**.

---

## 2. Option 2: Docker & Docker Compose (Single-Command Production Container)

The repository includes a multi-stage [`Dockerfile`](file:///Users/pb/dctwin/Dockerfile) (`node:22-alpine` frontend builder + `python:3.12-slim` runtime) and [`docker-compose.yml`](file:///Users/pb/dctwin/docker-compose.yml).

### Run with Docker Compose
```bash
# Optional: pass your OpenRouter key in environment or .env file
export OPENROUTER_API_KEY="sk-or-v1-..."

docker compose up --build -d
```

### Verify Container Health
```bash
curl http://127.0.0.1:8000/api/health
# Expected: {"status":"ok","service":"dctwin-engine"}
```

### Direct Docker CLI Build & Run
```bash
docker build -t aether-dctwin:latest .
docker run -d \
  --name aether-dctwin \
  -p 8000:8000 \
  -e OPENROUTER_API_KEY="sk-or-v1-..." \
  -v aether_twin_data:/app/data \
  aether-dctwin:latest
```

---

## 3. Option 3: Cloud PaaS Deployment (Render / Railway / Fly.io)

Because the [`Dockerfile`](file:///Users/pb/dctwin/Dockerfile) packages both the compiled React + Three.js static assets and the FastAPI + WebSocket backend on a single port (`8000`), you can deploy the repository directly to any container-based PaaS:

### Railway / Render
1. Connect your GitHub repository `https://github.com/bhandiwad/dc-digital-twin`.
2. Select **Docker** as the runtime environment (it will automatically detect the root `Dockerfile`).
3. Add environment variable:
   - `OPENROUTER_API_KEY` = `sk-or-v1-...`
   - `PORT` = `8000`
4. Set Health Check Path to `/api/health`.

### Fly.io
```bash
fly launch --image-label aether-dctwin --internal-port 8000
fly secrets set OPENROUTER_API_KEY="sk-or-v1-..."
fly deploy
```

---

## 4. Option 4: Cloud VM (AWS EC2 / GCP Compute Engine / Azure VM) + Systemd & Nginx TLS

For customer demos over HTTPS (`wss://` WebSocket streaming):

### 4.1 Systemd Service (`/etc/systemd/system/aether-dctwin.service`)
```ini
[Unit]
Description=Pandita's Aether-DCTWIN High-Density AI Data Center Digital Twin
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/dc-digital-twin
EnvironmentFile=/opt/dc-digital-twin/.env
Environment="PYTHONPATH=/opt/dc-digital-twin/backend"
ExecStart=/opt/dc-digital-twin/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
> **Important Note on `--workers 1`**: Because the in-memory `DataHallTwinEngine` and embedded `DuckDB` file lock maintain stateful real-time simulation in process memory, run a single Uvicorn worker process (`--workers 1`) per data hall instance.

### 4.2 Nginx Reverse Proxy with WebSocket (`wss://`) Upgrade
```nginx
server {
    listen 443 ssl http2;
    server_name twin.yourdomain.com;

    # SSL certificates (e.g., Let's Encrypt / Certbot)
    ssl_certificate /etc/letsencrypt/live/twin.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/twin.yourdomain.com/privkey.pem;

    client_max_body_size 25M; # Allow large BYOD CSV/Parquet uploads

    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 5. Option 5: On-Premises Data Center Kubernetes (`k8s`) Deployment

When deploying inside an operator's management cluster:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aether-dctwin
  namespace: dcim-ai
spec:
  replicas: 1
  selector:
    matchLabels:
      app: aether-dctwin
  template:
    metadata:
      labels:
        app: aether-dctwin
    spec:
      containers:
        - name: aether-dctwin
          image: ghcr.io/bhandiwad/dc-digital-twin:latest
          ports:
            - containerPort: 8000
          env:
            - name: OPENROUTER_API_KEY
              valueFrom:
                secretKeyRef:
                  name: aether-dctwin-secrets
                  key: openrouter-api-key
          readinessProbe:
            httpGet:
              path: /api/health
              port: 8000
            initialDelaySeconds: 5
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: aether-dctwin-svc
  namespace: dcim-ai
spec:
  selector:
    app: aether-dctwin
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8000
```

---

## 6. Environment Variables & Secret Management

| Variable | Default | Description |
| :--- | :--- | :--- |
| `OPENROUTER_API_KEY` | `""` | API key (`sk-or-v1-...`) for live LLM function-calling in the **Agent** tab. Can also be entered at runtime in the UI. |
| `OPENAI_API_KEY` | `""` | Optional direct OpenAI API key if `openai` provider is selected. |
| `HOST` | `127.0.0.1` | Bind address for `start_twin.sh` (`0.0.0.0` inside Docker). |
| `PORT` | `8000` | HTTP & WebSocket port. |

---

## 7. Production Hardening & Network Firewall Rules for BMS/DCIM Connectors

When transitioning from **Stage 1 (BYOD CSV Upload)** to **Stage 2 (Read-Only Shadow Mode Polling)** inside a physical data center, request the following outbound firewall openings from the Critical Facilities network team:

| Connector Bridge | Target Subsystem | Protocol / Port | Access Mode |
| :--- | :--- | :--- | :--- |
| `conn_bacnet_bms` | Facility BMS / Chiller / CRAC / CDU Gateways | **BACnet/IP (`UDP 47808`)** & **Modbus TCP (`TCP 502`)** | Read-Only (`ReadPropertyMultiple` / FC03/FC04) in Shadow Pilot; Write Holding Registers only in Stage 3 Advisory/Auto-Pilot |
| `conn_nvidia_dcgm` | Kubernetes / Slurm AI GPU Prometheus Scraper | **HTTP/HTTPS (`TCP 9400` / `9090`)** | Read-Only OpenMetrics scrape (`/metrics`) |
| `conn_redfish_bmc` | Out-of-Band Rack Manager / OpenBMC Aggregator | **HTTPS (`TCP 443`)** | Read-Only `Operator` / `ReadOnly` Redfish role |
| `conn_mqtt_sparkplug` | Smart PDU & Wireless Cold-Aisle Sensor Broker | **MQTTS (`TCP 8883`)** | Subscribe-only (`spBv1.0/+/DDATA/#`) |
