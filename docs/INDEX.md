# Grafana-Docker Documentation Index

## Overview

Grafana-Docker is a distributed Docker container monitoring solution with two main components:
- **Docker Metrics Collector**: C# .NET 8.0 agent that collects container metrics via Docker socket
- **Bitforge Docker Metrics Panel**: Grafana panel plugin (React/TypeScript) for visualization and control

The system monitors CPU, memory, network, disk I/O, and PSI pressure metrics across multiple Docker hosts.

## Quick Start

**Build Collector**:
```bash
cd docker-metrics-collector
docker build -t docker-metrics-agent .
```

**Run Collector** (on each Docker host):
```bash
docker run -d \
  -p 5000:5000 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /sys/fs/cgroup:/sys/fs/cgroup:ro \
  --group-add $(getent group docker | cut -d: -f3) \
  docker-metrics-agent
```

**Build Panel**:
```bash
cd bitforge-dockermetrics-panel
npm install && npm run build
```

**Install Panel**: Copy `dist/` to Grafana plugins directory.

## Architecture

- [Overview](architecture/overview.md) — System purpose, components, data flow
- [Context](architecture/context.md) — External dependencies, system boundaries (C4 Level 1)

### Components

- [Collector Agent](architecture/components/collector-agent.md) — C# metrics collector service
- [Grafana Panel](architecture/components/grafana-panel.md) — React visualization plugin

## Key Decisions

*No ADRs recorded yet. Create decisions/NNNN-title.md as architectural decisions are made.*

## Caveats

- [Proxy Mixed Content](caveats/proxy-mixed-content.md) — Why requests route through Grafana backend
- [PSI cgroup v2](caveats/psi-cgroup-v2.md) — Pressure metrics require Linux cgroup v2

## Standards

- [Logging](standards/logging.md) — Log levels, configuration, patterns for C# and TypeScript

## Guides

*No guides yet. Add how-to documents as common tasks are identified.*

## Project Structure

```
grafan-docker/
├── bitforge-dockermetrics-panel/   # Grafana panel plugin (TypeScript/React)
│   ├── src/                        # Source code
│   ├── dist/                       # Build output
│   └── package.json                # v1.2.14
├── docker-metrics-collector/       # Metrics collector (C# .NET 8.0)
│   ├── DockerMetricsCollector/     # Main project
│   └── Dockerfile                  # Multi-stage build
├── deploy/                         # Production deployment configs
├── tutor/                          # Tutorial lessons
└── docs/                           # This documentation
```

## Logging Retrofit Status

### C# Collector
- ✅ `CollectorService` — Lifecycle, collection cycle
- ✅ `LocalDockerClient` — Connection, parsing
- ⚠️ `MetricsCache` — Partial (only trim operations)
- ✅ `PsiReader` — Cgroup detection, parsing
- ❌ `Program.cs` endpoints — Request/response logging needed

### TypeScript Panel
- ✅ `SimplePanel` — All major operations (DEBUG flag)
- ❌ `proxy.ts` — Request/error logging needed
- ❌ Editor components — Low priority

## Contributing

When working on this codebase:
1. Read relevant architecture docs before making changes
2. Follow [logging standards](standards/logging.md) for all new code
3. Update documentation when architecture changes
4. Create ADRs for significant decisions
