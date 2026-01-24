# Collector Agent Component

## Overview

The Docker Metrics Collector is a .NET 8.0 background service that collects container metrics from the local Docker daemon and exposes them via REST API.

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                  Docker Metrics Collector                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Program.cs                            │   │
│  │              (ASP.NET Core Minimal API)                 │   │
│  │                                                         │   │
│  │  Endpoints:                                             │   │
│  │  GET  /                      → Service info             │   │
│  │  GET  /api/info              → Agent health             │   │
│  │  GET  /api/stats             → Cache statistics         │   │
│  │  GET  /api/containers        → List containers          │   │
│  │  GET  /api/containers/{id}/status → Real-time status    │   │
│  │  GET  /api/metrics           → Query metrics            │   │
│  │  GET  /api/metrics/latest    → Latest metrics           │   │
│  │  POST /api/containers/{id}/{action} → Control           │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │                                       │
│           ┌─────────────┼─────────────┐                        │
│           ▼             ▼             ▼                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ Collector   │ │ Metrics     │ │ LocalDocker │               │
│  │ Service     │─│ Cache       │─│ Client      │               │
│  │             │ │             │ │             │               │
│  │ Background  │ │ In-memory   │ │ Docker API  │               │
│  │ worker      │ │ storage     │ │ client      │               │
│  │ (10s poll)  │ │ (6h retain) │ │             │               │
│  └──────┬──────┘ └─────────────┘ └──────┬──────┘               │
│         │                               │                       │
│         │        ┌─────────────┐        │                       │
│         └───────▶│ PsiReader   │◀───────┘                       │
│                  │             │                                 │
│                  │ cgroup v2   │                                 │
│                  │ PSI reader  │                                 │
│                  └─────────────┘                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
    /sys/fs/cgroup                    /var/run/docker.sock
    (PSI metrics)                     (Docker daemon)
```

## Services

### CollectorService

**File**: `Services/CollectorService.cs`

Background worker implementing `IHostedService` that:
- Runs collection loop every 10 seconds
- Waits for Docker connection before starting
- Iterates all containers and collects metrics
- Stores results in `MetricsCache`
- Triggers cache trim every 5 minutes

### LocalDockerClient

**File**: `Services/LocalDockerClient.cs`

Docker API client that:
- Connects via Unix socket (`/var/run/docker.sock`)
- Uses `SocketsHttpHandler` with `UnixDomainSocketEndPoint`
- Parses Docker stats JSON for metrics extraction
- Calculates CPU percentage from deltas
- Aggregates network I/O across interfaces
- Extracts uptime from container start time

**Key Methods**:
| Method | Purpose |
|--------|---------|
| `CheckConnectionAsync` | Verify Docker connectivity |
| `GetContainersAsync` | List containers (all or running) |
| `GetContainerMetricsAsync` | Collect full metrics for a container |
| `GetContainerStatusAsync` | Get real-time container state |
| `ExecuteActionAsync` | Start/stop/restart/pause/unpause |

### MetricsCache

**File**: `Services/MetricsCache.cs`

Thread-safe in-memory storage:
- `ConcurrentDictionary<string, List<ContainerMetrics>>`
- Lock-protected list operations
- 6-hour default retention (configurable)
- Supports time-range queries with limit
- Field projection for bandwidth optimization

### PsiReader

**File**: `Services/PsiReader.cs`

Linux PSI metrics reader:
- Detects cgroup v2 path (system.slice, docker, root)
- Parses PSI files for CPU, memory, I/O pressure
- Extracts `some` and `full` percentages at 10/60/300 second windows
- Gracefully disables if cgroup v2 unavailable

## Data Models

**File**: `Models/ContainerMetrics.cs`

```csharp
record ContainerMetrics(
    string Id, string Name, DateTime Timestamp,
    double CpuPercent,
    long MemoryBytes, double MemoryPercent,
    long NetworkRxBytes, long NetworkTxBytes,
    long DiskReadBytes, long DiskWriteBytes,
    long UptimeSeconds,
    bool IsRunning, bool IsPaused,
    PsiMetrics? CpuPressure,
    PsiMetrics? MemoryPressure,
    PsiMetrics? IoPressure
);

record PsiMetrics(
    double Some10, double Some60, double Some300,
    double Full10, double Full60, double Full300
);
```

## Configuration

**File**: `appsettings.json`

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*"
}
```

**Environment Variables**:
| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 5000 | API listen port |
| `HOSTNAME` | (system) | Reported in `/api/info` |

## Deployment

**Dockerfile**: Multi-stage build with Alpine runtime

Required volume mounts:
- `/var/run/docker.sock:/var/run/docker.sock:ro`
- `/sys/fs/cgroup:/sys/fs/cgroup:ro`

Required permissions:
- Docker group membership (`group_add: [${DOCKER_GID}]`)
