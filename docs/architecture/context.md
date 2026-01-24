# System Context (C4 Level 1)

## Context Diagram

```
                                    ┌─────────────────┐
                                    │   Operations    │
                                    │   Team / User   │
                                    └────────┬────────┘
                                             │
                                             │ Views dashboards
                                             │ Controls containers
                                             ▼
┌────────────────────────────────────────────────────────────────────┐
│                         Grafana Server                             │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Bitforge Docker Metrics Panel                   │  │
│  │              (Custom Grafana Panel Plugin)                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                                             │
                                             │ HTTP REST API
                                             │ GET /api/metrics
                                             │ POST /api/containers/*/action
                                             ▼
┌────────────────────────────────────────────────────────────────────┐
│                    Docker Metrics Collector                        │
│                    (One per monitored host)                        │
│                                                                    │
│  Collects metrics from local Docker daemon                        │
│  Stores in memory with 6-hour retention                           │
│  Exposes REST API on port 5000                                    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                                             │
                                             │ Unix Socket
                                             │ /var/run/docker.sock
                                             ▼
┌────────────────────────────────────────────────────────────────────┐
│                         Docker Daemon                              │
│                                                                    │
│  Manages containers on the host                                   │
│  Provides stats API for metrics collection                        │
│  Executes container control commands                              │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## External Systems

### Docker Daemon
- **Interaction**: Unix socket at `/var/run/docker.sock`
- **Data**: Container stats, container list, container state
- **Control**: Start, stop, restart, pause, unpause operations
- **Requirement**: Read access to socket, group membership for control

### Linux Kernel (cgroup v2)
- **Interaction**: Filesystem read at `/sys/fs/cgroup/`
- **Data**: PSI (Pressure Stall Information) metrics
- **Requirement**: Container must have cgroup filesystem mounted
- **Fallback**: Gracefully disabled if unavailable

### Grafana Server
- **Interaction**: Plugin loaded into Grafana
- **Data**: Panel configuration, backend proxy routing
- **Requirement**: Grafana >= 11.6.0, unsigned plugin loading enabled

## System Boundaries

| Boundary | Inside | Outside |
|----------|--------|---------|
| Collector Agent | Metric collection, caching, REST API | Docker daemon, cgroup filesystem |
| Grafana Panel | Visualization, aggregation, controls UI | Collector agents, Grafana core |
| Docker Host | Containers, daemon | External network, storage |

## Communication Protocols

| From | To | Protocol | Port | Authentication |
|------|------|----------|------|----------------|
| Panel | Collector | HTTP REST | 5000 | None (network isolation assumed) |
| Collector | Docker | Unix socket | N/A | Docker group membership |
| Browser | Grafana | HTTPS | 3000 | Grafana auth |
| Grafana | Collector | HTTP (proxied) | 5000 | None |
