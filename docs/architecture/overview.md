# Architecture Overview

## System Purpose

Grafana-Docker is a distributed Docker container monitoring solution consisting of a lightweight C# metrics collector agent and a Grafana panel plugin for visualization and container management.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Docker Host(s)                              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │           Docker Metrics Collector (C# .NET 8.0)              │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │  │
│  │  │ Collector   │  │ LocalDocker │  │     PsiReader       │    │  │
│  │  │ Service     │──│ Client      │──│  (cgroup v2 PSI)    │    │  │
│  │  │ (10s poll)  │  │             │  │                     │    │  │
│  │  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘    │  │
│  │         │                │                                     │  │
│  │         ▼                ▼                                     │  │
│  │  ┌─────────────┐  ┌─────────────────────────────────────┐     │  │
│  │  │ Metrics     │  │ /var/run/docker.sock (Docker API)   │     │  │
│  │  │ Cache       │  │ /sys/fs/cgroup (PSI metrics)        │     │  │
│  │  │ (6h retain) │  └─────────────────────────────────────┘     │  │
│  │  └──────┬──────┘                                              │  │
│  │         │ REST API :5000                                      │  │
│  └─────────┼─────────────────────────────────────────────────────┘  │
└────────────┼────────────────────────────────────────────────────────┘
             │
             │ HTTP (GET /api/metrics, POST /api/containers/*/action)
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Grafana Server                              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │         Bitforge Docker Metrics Panel (React/TypeScript)      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │  │
│  │  │ SimplePanel │  │ Container   │  │    Host Manager     │    │  │
│  │  │ (metrics    │──│ Controls    │──│    (multi-agent     │    │  │
│  │  │  display)   │  │ (actions)   │  │     config)         │    │  │
│  │  └──────┬──────┘  └─────────────┘  └─────────────────────┘    │  │
│  │         │                                                      │  │
│  │         ▼                                                      │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │ Grafana Backend Proxy (HTTPS→HTTP mixed content fix)    │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Docker Metrics Collector (`docker-metrics-collector/`)

**Technology**: C# .NET 8.0, ASP.NET Core Minimal APIs

**Responsibilities**:
- Connects to Docker daemon via Unix socket
- Collects container metrics every 10 seconds
- Reads PSI (Pressure Stall Information) from cgroup v2
- Stores metrics in memory with 6-hour retention
- Exposes REST API for metric queries and container control

**Key Services**:
| Service | Purpose |
|---------|---------|
| `CollectorService` | Background worker polling Docker every 10s |
| `LocalDockerClient` | Docker socket communication, stats parsing |
| `PsiReader` | Linux cgroup v2 PSI metric extraction |
| `MetricsCache` | Thread-safe in-memory metric storage |

### 2. Grafana Panel Plugin (`bitforge-dockermetrics-panel/`)

**Technology**: TypeScript, React 18, Grafana Plugin SDK

**Responsibilities**:
- Fetch and aggregate metrics from multiple collector agents
- Display container metrics with sparkline visualizations
- Provide container management controls (start/stop/restart/pause)
- Handle multi-host configuration and filtering

**Key Components**:
| Component | Purpose |
|-----------|---------|
| `SimplePanel` | Main dashboard rendering, state management |
| `ContainerControls` | Action buttons with pending state tracking |
| `HostManagerEditor` | Configure agent endpoints |
| `proxy.ts` | Route requests through Grafana backend |

## Data Flow

1. **Collection** (every 10 seconds):
   - `CollectorService` triggers collection cycle
   - `LocalDockerClient` queries Docker API for container stats
   - `PsiReader` reads PSI from `/sys/fs/cgroup/`
   - Metrics stored in `MetricsCache`

2. **Query** (panel refresh interval):
   - Panel fetches container list via `/api/containers`
   - Panel queries metrics via `/api/metrics?containerIds=...&fields=...`
   - Data aggregated from multiple hosts in panel state

3. **Control** (user action):
   - Panel sends POST to `/api/containers/{id}/{action}`
   - Collector executes via Docker socket
   - Panel polls `/api/containers/{id}/status` until state matches

## Metrics Collected

| Metric | Source | Description |
|--------|--------|-------------|
| CPU % | Docker stats | CPU usage percentage |
| Memory bytes/% | Docker stats | Memory usage absolute/relative |
| Network RX/TX | Docker stats | Bytes received/transmitted |
| Disk Read/Write | Docker stats | Block I/O bytes |
| Uptime | Container inspect | Seconds since container start (displayed as static value, not graphed) |
| PSI CPU/Memory/IO | cgroup v2 | Resource pressure (some/full 10/60/300s) |

## External Dependencies

| Dependency | Required By | Purpose |
|------------|-------------|---------|
| Docker daemon | Collector | Container stats and control |
| Linux cgroup v2 | Collector | PSI metrics (optional, graceful fallback) |
| Grafana >= 11.6.0 | Panel | Plugin host environment |
| .NET 8.0 runtime | Collector | Application runtime |

## Deployment Model

- **One collector per Docker host** - Agents deployed alongside containers
- **Single Grafana instance** - Aggregates data from all agents
- **No database required** - In-memory storage with configurable retention
