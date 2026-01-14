#!/bin/bash
set -e

# Docker Metrics Agent Deployment Script
# Usage: ./deploy.sh [GITHUB_USER] [VERSION]

GITHUB_USER="${1:-your-username}"
VERSION="${2:-latest}"
IMAGE="ghcr.io/${GITHUB_USER}/docker-metrics-agent:${VERSION}"
CONTAINER_NAME="docker-metrics-agent"
PORT="${PORT:-5000}"

echo "=== Docker Metrics Agent Deployment ==="
echo "Image: ${IMAGE}"
echo "Port: ${PORT}"
echo ""

# Get docker group ID
DOCKER_GID=$(getent group docker | cut -d: -f3)
echo "Docker GID: ${DOCKER_GID}"

# Pull latest image
echo ""
echo "Pulling image..."
docker pull "${IMAGE}"

# Stop and remove existing container if running
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping existing container..."
    docker stop "${CONTAINER_NAME}" 2>/dev/null || true
    docker rm "${CONTAINER_NAME}" 2>/dev/null || true
fi

# Run new container
echo ""
echo "Starting container..."
docker run -d \
    --name "${CONTAINER_NAME}" \
    --restart unless-stopped \
    -p "${PORT}:5000" \
    -v /var/run/docker.sock:/var/run/docker.sock:ro \
    -v /sys/fs/cgroup:/sys/fs/cgroup:ro \
    --group-add "${DOCKER_GID}" \
    "${IMAGE}"

# Wait for health check
echo ""
echo "Waiting for agent to be healthy..."
sleep 3

# Check if running
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo ""
    echo "=== Deployment successful ==="
    echo "Agent URL: http://$(hostname -I | awk '{print $1}'):${PORT}"
    echo ""
    echo "Verify with: curl http://localhost:${PORT}/api/info"
else
    echo "Error: Container failed to start"
    docker logs "${CONTAINER_NAME}"
    exit 1
fi
