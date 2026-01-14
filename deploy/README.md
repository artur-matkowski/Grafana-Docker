# Docker Metrics - Homelab Deployment Guide

## Overview

This deployment consists of two parts:
1. **Docker Metrics Agent** - Runs on each node to collect Docker container metrics
2. **Grafana Plugin** - Displays the metrics in Grafana dashboards

## 1. Deploy Docker Metrics Agent

Deploy the agent on each node you want to monitor.

### Quick Start

```bash
# Get your docker group ID
export DOCKER_GID=$(getent group docker | cut -d: -f3)

# Start the agent
docker compose -f docker-compose.agent.yml up -d
```

### Verify Agent is Running

```bash
curl http://localhost:5000/api/info
```

Expected response:
```json
{
  "hostname": "your-node",
  "agentVersion": "1.0.0",
  "dockerConnected": true,
  ...
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 5000 | API port to expose |
| VERSION | v1.0.0 | Docker image version |
| DOCKER_GID | 999 | Docker group ID on host |

## 2. Install Grafana Plugin

### Option A: Volume Mount (Recommended)

Add the plugin to your existing Grafana docker-compose:

```yaml
services:
  grafana:
    image: grafana/grafana:latest
    volumes:
      # ... your existing volumes ...
      - ./plugins/bitforge-dockermetrics-panel:/var/lib/grafana/plugins/bitforge-dockermetrics-panel
    environment:
      # Allow unsigned plugins
      - GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=bitforge-dockermetrics-panel
```

Then extract the plugin:
```bash
mkdir -p ./plugins/bitforge-dockermetrics-panel
tar -xzf bitforge-dockermetrics-panel-v1.0.0.tar.gz -C ./plugins/bitforge-dockermetrics-panel
```

Restart Grafana:
```bash
docker compose restart grafana
```

### Option B: Direct Download in Grafana Container

```bash
# Create plugins directory
docker exec grafana mkdir -p /var/lib/grafana/plugins/bitforge-dockermetrics-panel

# Copy and extract plugin
docker cp bitforge-dockermetrics-panel-v1.0.0.tar.gz grafana:/tmp/
docker exec grafana tar -xzf /tmp/bitforge-dockermetrics-panel-v1.0.0.tar.gz -C /var/lib/grafana/plugins/bitforge-dockermetrics-panel

# Restart Grafana
docker restart grafana
```

## 3. Configure the Panel in Grafana

1. Create or edit a dashboard
2. Add a new panel
3. Select "Docker Metrics" as the visualization
4. Go to panel options → "Agents" section
5. Add your Docker Metrics Agent URLs (e.g., `http://192.168.1.10:5000`)
6. Enable agents and select containers to monitor

## Network Considerations

- The Grafana container must be able to reach the agent(s)
- If using Docker networks, ensure they can communicate
- For multi-node setups, use the node's IP address, not `localhost`

## Updating

### Update Agent
```bash
docker compose -f docker-compose.agent.yml pull
docker compose -f docker-compose.agent.yml up -d
```

### Update Plugin
1. Download new plugin archive
2. Extract to plugins folder (overwrite existing)
3. Restart Grafana

## Troubleshooting

### Agent not connecting to Docker
```bash
# Check docker socket permissions
ls -la /var/run/docker.sock

# Verify DOCKER_GID matches
getent group docker | cut -d: -f3
```

### Plugin not loading
```bash
# Check Grafana logs
docker logs grafana | grep -i plugin

# Verify plugin files exist
docker exec grafana ls -la /var/lib/grafana/plugins/bitforge-dockermetrics-panel
```

### Containers not appearing
- Ensure agent is healthy: `curl http://agent-ip:5000/api/info`
- Check that Docker shows containers: `curl http://agent-ip:5000/api/containers`
- Verify Grafana can reach the agent (network/firewall)
