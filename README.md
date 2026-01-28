# Grafana Docker Metrics

A distributed Docker container monitoring solution with real-time metrics and controls for Grafana.

## Components

| Component | Technology | Description |
|-----------|------------|-------------|
| **docker-metrics-collector** | C# .NET 8.0 | Agent that collects Docker metrics via socket API |
| **bitforge-dockermetrics-panel** | TypeScript/React | Grafana panel plugin for visualization and container controls |
| **bitforge-dockermetrics-datasource** | TypeScript/Go | Grafana data source plugin for public dashboard support |

## Requirements

- Docker with API access
- Grafana >= 11.6.0
- Linux with cgroup v2 (for PSI metrics)

---

## Development Deployment

### Collector Agent

```bash
cd docker-metrics-collector
cp .env.example .env
docker compose up --build
```

The agent runs on http://localhost:5000

### Panel Plugin

```bash
cd bitforge-dockermetrics-panel
npm install
npm run dev          # Watch mode for development
npm run server       # Start Grafana with plugin mounted
```

Grafana runs on http://localhost:3000 (admin/admin)

### Data Source Plugin

```bash
cd bitforge-dockermetrics-datasource
npm install
npm run dev          # Watch mode for development
npm run server       # Start Grafana with plugin mounted
```

### Building Plugins Locally

```bash
# Panel
cd bitforge-dockermetrics-panel
npm run build

# Data source (requires Go 1.21+)
cd bitforge-dockermetrics-datasource
npm run build
# Build Go backend
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o dist/gpx_bitforge_dockermetrics_datasource_linux_amd64 ./pkg
```

---

## Production Deployment

### 1. Deploy Collector Agent

Deploy on each Docker host you want to monitor:

```bash
cd deploy

# Get Docker group ID
export DOCKER_GID=$(getent group docker | cut -d: -f3)
export VERSION=v1.2.22  # or desired version

docker compose -f docker-compose.agent.yml up -d
```

Or use the deployment script:

```bash
cd docker-metrics-collector
./deploy.sh <GITHUB_USER> <VERSION>
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 5000 | Agent API port |
| `VERSION` | v1.0.0 | Docker image version tag |
| `DOCKER_GID` | 999 | Docker group ID on host |
| `HOSTNAME` | (auto) | Override reported hostname |

### 2. Install Grafana Plugins

Download release archives from GitHub Releases, then:

**Option A: Volume mount (recommended)**

```bash
mkdir -p ./grafana-plugins

# Extract plugins
tar -xzf bitforge-dockermetrics-panel-v1.2.22.tar.gz -C ./grafana-plugins/
tar -xzf bitforge-dockermetrics-datasource-v1.2.22.tar.gz -C ./grafana-plugins/

# Mount in docker-compose.yml:
# volumes:
#   - ./grafana-plugins:/var/lib/grafana/plugins
```

**Option B: Copy to running container**

```bash
docker cp bitforge-dockermetrics-panel-v1.2.22.tar.gz grafana:/tmp/
docker exec grafana mkdir -p /var/lib/grafana/plugins/bitforge-dockermetrics-panel
docker exec grafana tar -xzf /tmp/bitforge-dockermetrics-panel-v1.2.22.tar.gz -C /var/lib/grafana/plugins/bitforge-dockermetrics-panel
docker restart grafana
```

### 3. Configure Grafana

Add to `grafana.ini` or set environment variable:

```ini
[plugins]
allow_loading_unsigned_plugins = bitforge-dockermetrics-panel,bitforge-dockermetrics-datasource
```

Or with Docker:

```bash
-e GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=bitforge-dockermetrics-panel,bitforge-dockermetrics-datasource
```

### 4. Configure Panel

1. Add a new panel to your dashboard
2. Select "Docker Metrics" visualization
3. Configure the agent URL (e.g., `http://docker-host:5000`)

For public dashboards, configure the data source plugin and select "Data Source" mode in the panel options.

---

## Creating Releases

Use the release script to build and publish all components:

```bash
# Full release
./release.sh 1.3.0

# Development release (auto-versioned)
./release.sh -D

# Pre-release
./release.sh -p 1.3.0-beta.1

# Build only (skip GitHub push)
./release.sh -s 1.3.0

# Docker image only
./release.sh -d 1.3.0

# Plugins only
./release.sh -g 1.3.0
```

**Prerequisites:**
- Docker, npm, Go 1.21+
- GitHub CLI (`gh auth login`)

---

## API Reference

The collector agent exposes:

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check |
| `GET /api/info` | Agent info and Docker status |
| `GET /api/containers` | List containers (`?all=true` for stopped) |
| `GET /api/containers/{id}/status` | Real-time container status |
| `GET /api/metrics` | Query metrics with filters |

---

## Documentation

See the `docs/` directory for:
- [Architecture Overview](docs/architecture/overview.md)
- [Component Details](docs/architecture/components/)
- [Proxy Configuration](docs/caveats/proxy-mixed-content.md)
- [PSI Metrics Requirements](docs/caveats/psi-cgroup-v2.md)

## License

See LICENSE file for details.
