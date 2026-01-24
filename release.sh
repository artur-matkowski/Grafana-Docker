#!/bin/bash
set -e

# =============================================================================
# Docker Metrics Release Script
# Builds and releases both the collector (Docker image) and plugin (tar.gz)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GITHUB_USER="artur-matkowski"
GITHUB_REPO="Grafana-Docker"
IMAGE_NAME="docker-metrics-agent"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1" >&2; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# =============================================================================
# Prerequisites check
# =============================================================================
check_prerequisites() {
    local skip_push="$1"

    log_info "Checking prerequisites..."

    local missing=()

    command -v docker &>/dev/null || missing+=("docker")
    command -v npm &>/dev/null || missing+=("npm")
    command -v git &>/dev/null || missing+=("git")
    command -v go &>/dev/null || missing+=("go (for backend plugin)")

    # gh is only required when pushing releases
    if [ "$skip_push" != "true" ]; then
        command -v gh &>/dev/null || missing+=("gh (GitHub CLI)")
    fi

    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing[*]}"
        exit 1
    fi

    # Check gh auth only when needed
    if [ "$skip_push" != "true" ]; then
        if ! gh auth status &>/dev/null; then
            log_error "GitHub CLI not authenticated. Run: gh auth login"
            exit 1
        fi
    fi

    log_success "All prerequisites met"
}

# =============================================================================
# Version management
# =============================================================================
get_current_versions() {
    local plugin_version=$(grep -oP '"version":\s*"\K[^"]+' "${SCRIPT_DIR}/bitforge-dockermetrics-panel/package.json" | head -1)
    local agent_version=$(grep -oP 'AgentVersion = "\K[^"]+' "${SCRIPT_DIR}/docker-metrics-collector/DockerMetricsCollector/Program.cs" || echo "unknown")

    echo "Plugin: ${plugin_version}, Agent: ${agent_version}"
}

update_versions() {
    local version="$1"

    log_info "Updating versions to ${version}..."

    # Update package.json (using sed for simple replacement)
    local pkg_file="${SCRIPT_DIR}/bitforge-dockermetrics-panel/package.json"
    sed -i 's/"version": "[^"]*"/"version": "'"${version}"'"/' "$pkg_file"

    # Update version.ts for frontend display
    local version_file="${SCRIPT_DIR}/bitforge-dockermetrics-panel/src/version.ts"
    echo "// This file is auto-updated by release.sh" > "$version_file"
    echo "export const PLUGIN_VERSION = '${version}';" >> "$version_file"

    # Update Program.cs AgentVersion
    local program_file="${SCRIPT_DIR}/docker-metrics-collector/DockerMetricsCollector/Program.cs"
    sed -i "s/AgentVersion = \"[^\"]*\"/AgentVersion = \"${version}\"/" "$program_file"

    log_success "Versions updated"
}

# =============================================================================
# Build functions
# =============================================================================
build_docker_image() {
    local version="$1"
    local image="ghcr.io/${GITHUB_USER}/${IMAGE_NAME}:${version}"
    local latest="ghcr.io/${GITHUB_USER}/${IMAGE_NAME}:latest"

    log_info "Building Docker image: ${image}"

    cd "${SCRIPT_DIR}/docker-metrics-collector"

    docker build -t "${image}" -t "${latest}" .

    log_success "Docker image built"

    echo "${image}"
}

push_docker_image() {
    local version="$1"
    local image="ghcr.io/${GITHUB_USER}/${IMAGE_NAME}:${version}"
    local latest="ghcr.io/${GITHUB_USER}/${IMAGE_NAME}:latest"

    log_info "Pushing Docker image to ghcr.io..."

    docker push "${image}"
    docker push "${latest}"

    log_success "Docker image pushed"
}

build_plugin() {
    local version="$1"

    log_info "Building Grafana plugin..."

    cd "${SCRIPT_DIR}/bitforge-dockermetrics-panel"

    # Install npm dependencies if needed
    if [ ! -d "node_modules" ]; then
        npm install >&2
    fi

    # Build frontend
    npm run build >&2

    # Verify frontend build succeeded
    if [ ! -f "dist/module.js" ]; then
        log_error "Frontend build failed: dist/module.js not found"
        exit 1
    fi

    # Build Go backend for multiple platforms
    log_info "Building backend binaries..."

    # Download Go dependencies
    go mod tidy >&2

    # Build for linux/amd64 (most common for Grafana servers)
    log_info "Building for linux/amd64..."
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" \
        -o dist/gpx_bitforge_dockermetrics_panel_linux_amd64 \
        ./pkg >&2

    # Build for linux/arm64 (Raspberry Pi, ARM servers)
    log_info "Building for linux/arm64..."
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-w -s" \
        -o dist/gpx_bitforge_dockermetrics_panel_linux_arm64 \
        ./pkg >&2

    # Build for darwin/amd64 (Mac Intel - for development)
    log_info "Building for darwin/amd64..."
    CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -ldflags="-w -s" \
        -o dist/gpx_bitforge_dockermetrics_panel_darwin_amd64 \
        ./pkg >&2

    # Build for darwin/arm64 (Mac M1/M2 - for development)
    log_info "Building for darwin/arm64..."
    CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags="-w -s" \
        -o dist/gpx_bitforge_dockermetrics_panel_darwin_arm64 \
        ./pkg >&2

    # Build for windows/amd64 (for development)
    log_info "Building for windows/amd64..."
    CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-w -s" \
        -o dist/gpx_bitforge_dockermetrics_panel_windows_amd64.exe \
        ./pkg >&2

    # Verify backend build succeeded
    if [ ! -f "dist/gpx_bitforge_dockermetrics_panel_linux_amd64" ]; then
        log_error "Backend build failed: linux_amd64 binary not found"
        exit 1
    fi

    log_success "Backend binaries built"

    # Create tar.gz
    local tar_name="bitforge-dockermetrics-panel-${version}.tar.gz"
    local tar_path="${SCRIPT_DIR}/dist/${tar_name}"

    mkdir -p "${SCRIPT_DIR}/dist"

    # Create archive with proper structure for Grafana
    local plugin_dist="${SCRIPT_DIR}/bitforge-dockermetrics-panel/dist"
    cd "${plugin_dist}"
    tar -czvf "${tar_path}" \
        --exclude="*.tar.gz" \
        . >&2
    cd "${SCRIPT_DIR}/bitforge-dockermetrics-panel"

    log_success "Plugin built: ${tar_path}"

    # Return the path (only this goes to stdout)
    echo "${tar_path}"
}

# =============================================================================
# Release functions
# =============================================================================
create_release() {
    local version="$1"
    local plugin_tar="$2"
    local prerelease="$3"

    log_info "Creating GitHub release v${version}..."

    cd "${SCRIPT_DIR}"

    # Create git tag if it doesn't exist
    if ! git tag -l "v${version}" | grep -q "v${version}"; then
        git tag -a "v${version}" -m "Release v${version}"
        git push origin "v${version}"
        log_success "Git tag v${version} created and pushed"
    else
        log_warn "Git tag v${version} already exists"
    fi

    # Build release notes to a temp file (avoids shell escaping issues)
    local notes_file=$(mktemp)
    cat > "$notes_file" << NOTES_EOF
## Docker Metrics v${version}

Monitor Docker containers directly in Grafana with real-time metrics and controls.

---

## Downloads

| Component | Download |
|-----------|----------|
| **Grafana Plugin** | \`bitforge-dockermetrics-panel-${version}.tar.gz\` (below) |
| **Docker Agent** | \`ghcr.io/${GITHUB_USER}/${IMAGE_NAME}:${version}\` |

> **Note:** The source code archives (zip/tar.gz) are auto-generated by GitHub. For the Grafana plugin, download **\`bitforge-dockermetrics-panel-${version}.tar.gz\`** from the Assets section below.

---

## Installation

### 1. Grafana Plugin

Download \`bitforge-dockermetrics-panel-${version}.tar.gz\` and install:

\`\`\`bash
# Create plugin directory
mkdir -p /var/lib/grafana/plugins/bitforge-dockermetrics-panel

# Extract plugin (from the directory containing the tar.gz)
tar -xzf bitforge-dockermetrics-panel-${version}.tar.gz -C /var/lib/grafana/plugins/bitforge-dockermetrics-panel

# Set ownership (if needed)
chown -R grafana:grafana /var/lib/grafana/plugins/bitforge-dockermetrics-panel
\`\`\`

Add to \`/etc/grafana/grafana.ini\`:
\`\`\`ini
[plugins]
allow_loading_unsigned_plugins = bitforge-dockermetrics-panel
\`\`\`

Restart Grafana:
\`\`\`bash
systemctl restart grafana-server
\`\`\`

### 2. Docker Metrics Agent

#### Option A: Docker Compose (recommended)

Create \`docker-compose.yml\`:

\`\`\`yaml
services:
  docker-metrics-agent:
    image: ghcr.io/${GITHUB_USER}/${IMAGE_NAME}:${version}
    container_name: docker-metrics-agent
    restart: unless-stopped
    ports:
      - "5000:5000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /sys/fs/cgroup:/sys/fs/cgroup:ro
    group_add:
      - \${DOCKER_GID:-999}
    environment:
      - PORT=5000
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/api/info"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
\`\`\`

Run with:
\`\`\`bash
# Get docker group ID and start
DOCKER_GID=\$(getent group docker | cut -d: -f3) docker compose up -d
\`\`\`

#### Option B: Docker CLI

\`\`\`bash
docker run -d \\
  --name docker-metrics-agent \\
  --restart unless-stopped \\
  -p 5000:5000 \\
  -v /var/run/docker.sock:/var/run/docker.sock:ro \\
  -v /sys/fs/cgroup:/sys/fs/cgroup:ro \\
  --group-add \$(getent group docker | cut -d: -f3) \\
  ghcr.io/${GITHUB_USER}/${IMAGE_NAME}:${version}
\`\`\`

#### Verify

\`\`\`bash
curl http://localhost:5000/api/info
\`\`\`

### 3. Configure Panel

1. Add a new panel in Grafana
2. Select "Docker Metrics Panel" as visualization
3. Go to panel options → Agents → Add your agent URL (e.g., \`http://docker-host:5000\`)

---

## Changelog

See [commits since last release](../../commits/v${version}) for details.
NOTES_EOF

    # Check if release exists
    if gh release view "v${version}" &>/dev/null; then
        log_warn "Release v${version} already exists, uploading assets..."
        gh release upload "v${version}" "${plugin_tar}" --clobber
    else
        local gh_args=("v${version}" "${plugin_tar}" --title "Docker Metrics v${version}" --notes-file "$notes_file")
        if [ "$prerelease" = "true" ]; then
            gh_args+=(--prerelease)
        fi
        gh release create "${gh_args[@]}"
    fi

    rm -f "$notes_file"

    log_success "GitHub release created: https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases/tag/v${version}"
}

# =============================================================================
# Main
# =============================================================================
usage() {
    cat <<EOF
Usage: $0 [OPTIONS] <version>

Options:
  -h, --help          Show this help message
  -p, --prerelease    Mark as pre-release (for dev/testing)
  -s, --skip-push     Build only, don't push to registries
  -d, --docker-only   Only build and push Docker image
  -g, --plugin-only   Only build and release plugin
  --no-version-bump   Don't update version numbers in source files

Examples:
  $0 1.1.0                    # Full release v1.1.0
  $0 -p 1.1.0-beta.1          # Pre-release
  $0 -s 1.1.0                 # Build only, no push
  $0 -d 1.1.0                 # Docker image only

Current versions: $(get_current_versions)
EOF
}

main() {
    local version=""
    local prerelease="false"
    local skip_push="false"
    local docker_only="false"
    local plugin_only="false"
    local no_version_bump="false"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -p|--prerelease)
                prerelease="true"
                shift
                ;;
            -s|--skip-push)
                skip_push="true"
                shift
                ;;
            -d|--docker-only)
                docker_only="true"
                shift
                ;;
            -g|--plugin-only)
                plugin_only="true"
                shift
                ;;
            --no-version-bump)
                no_version_bump="true"
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
            *)
                version="$1"
                shift
                ;;
        esac
    done

    # Validate version
    if [ -z "$version" ]; then
        log_error "Version is required"
        usage
        exit 1
    fi

    # Validate version format (semver)
    if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
        log_error "Invalid version format: ${version}"
        log_info "Expected semver format: X.Y.Z or X.Y.Z-suffix"
        exit 1
    fi

    echo ""
    echo "=============================================="
    echo "  Docker Metrics Release v${version}"
    echo "=============================================="
    echo ""

    check_prerequisites "$skip_push"

    # Update versions in source files
    if [ "$no_version_bump" != "true" ]; then
        update_versions "$version"
    fi

    local plugin_tar=""

    # Build Docker image
    if [ "$plugin_only" != "true" ]; then
        build_docker_image "$version"

        if [ "$skip_push" != "true" ]; then
            push_docker_image "$version"
        fi
    fi

    # Build plugin
    if [ "$docker_only" != "true" ]; then
        plugin_tar=$(build_plugin "$version")

        if [ "$skip_push" != "true" ]; then
            create_release "$version" "$plugin_tar" "$prerelease"
        fi
    fi

    echo "" >&2
    echo "==============================================" >&2
    log_success "Release v${version} complete!"
    echo "==============================================" >&2
    echo "" >&2

    # Show what was built
    if [ "$plugin_only" != "true" ]; then
        echo "Docker image: ghcr.io/${GITHUB_USER}/${IMAGE_NAME}:${version}" >&2
    fi
    if [ "$docker_only" != "true" ] && [ -n "$plugin_tar" ]; then
        echo "Plugin:       ${plugin_tar}" >&2
    fi

    if [ "$skip_push" != "true" ]; then
        echo "Release URL:  https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases/tag/v${version}" >&2
    fi

    echo "" >&2
    if [ "$skip_push" = "true" ]; then
        log_info "Built locally (--skip-push). To push:"
        echo "  docker push ghcr.io/${GITHUB_USER}/${IMAGE_NAME}:${version}" >&2
        echo "  docker push ghcr.io/${GITHUB_USER}/${IMAGE_NAME}:latest" >&2
        echo "  gh release create v${version} ${plugin_tar}" >&2
    else
        log_info "Next steps:"
        echo "  1. Verify release at GitHub" >&2
        echo "  2. Update production deployments with new version" >&2
    fi
}

main "$@"
