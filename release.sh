#!/bin/bash
set -e

# =============================================================================
# Docker Metrics Release Script
# Builds and releases the collector (Docker image), panel plugin, and data source plugin
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
    local panel_version=$(grep -oP '"version":\s*"\K[^"]+' "${SCRIPT_DIR}/bitforge-dockermetrics-panel/package.json" | head -1)
    local datasource_version=$(grep -oP '"version":\s*"\K[^"]+' "${SCRIPT_DIR}/bitforge-dockermetrics-datasource/package.json" | head -1)
    local agent_version=$(grep -oP 'AgentVersion = "\K[^"]+' "${SCRIPT_DIR}/docker-metrics-collector/DockerMetricsCollector/Program.cs" || echo "unknown")

    echo "Panel: ${panel_version}, DataSource: ${datasource_version}, Agent: ${agent_version}"
}

get_base_version() {
    grep -oP '"version":\s*"\K[^"]+' "${SCRIPT_DIR}/bitforge-dockermetrics-panel/package.json" | head -1 | sed 's/-.*$//'
}

update_versions() {
    local version="$1"

    log_info "Updating versions to ${version}..."

    # Update panel package.json
    local panel_pkg="${SCRIPT_DIR}/bitforge-dockermetrics-panel/package.json"
    sed -i 's/"version": "[^"]*"/"version": "'"${version}"'"/' "$panel_pkg"

    # Update panel version.ts
    local panel_version_file="${SCRIPT_DIR}/bitforge-dockermetrics-panel/src/version.ts"
    echo "// This file is auto-updated by release.sh" > "$panel_version_file"
    echo "export const PLUGIN_VERSION = '${version}';" >> "$panel_version_file"

    # Update datasource package.json
    local ds_pkg="${SCRIPT_DIR}/bitforge-dockermetrics-datasource/package.json"
    sed -i 's/"version": "[^"]*"/"version": "'"${version}"'"/' "$ds_pkg"

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

build_panel_plugin() {
    local version="$1"

    log_info "Building Panel plugin..."

    cd "${SCRIPT_DIR}/bitforge-dockermetrics-panel"

    # Install npm dependencies if needed
    if [ ! -d "node_modules" ]; then
        npm install >&2
    fi

    # Build frontend
    npm run build >&2

    # Verify frontend build succeeded
    if [ ! -f "dist/module.js" ]; then
        log_error "Panel frontend build failed: dist/module.js not found"
        exit 1
    fi

    log_success "Panel plugin built (frontend only)"

    # Create tar.gz
    local tar_name="bitforge-dockermetrics-panel-${version}.tar.gz"
    local tar_path="${SCRIPT_DIR}/dist/${tar_name}"

    mkdir -p "${SCRIPT_DIR}/dist"

    local plugin_dist="${SCRIPT_DIR}/bitforge-dockermetrics-panel/dist"
    cd "${plugin_dist}"

    log_info "Packaging panel plugin..."
    tar -czvf "${tar_path}" \
        --exclude="*.tar.gz" \
        --exclude="*.map" \
        . >&2
    cd "${SCRIPT_DIR}/bitforge-dockermetrics-panel"

    log_success "Panel plugin packaged: ${tar_path}"

    echo "${tar_path}"
}

build_datasource_plugin() {
    local version="$1"

    log_info "Building Data Source plugin..."

    cd "${SCRIPT_DIR}/bitforge-dockermetrics-datasource"

    # Install npm dependencies if needed
    if [ ! -d "node_modules" ]; then
        npm install >&2
    fi

    # Build frontend
    npm run build >&2

    # Verify frontend build succeeded
    if [ ! -f "dist/module.js" ]; then
        log_error "DataSource frontend build failed: dist/module.js not found"
        exit 1
    fi

    # Build Go backend for production platforms
    log_info "Building backend binaries..."

    go mod tidy >&2

    # Build for linux/amd64
    log_info "Building for linux/amd64..."
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" \
        -o dist/gpx_bitforge_dockermetrics_datasource_linux_amd64 \
        ./pkg >&2

    # Build for linux/arm64
    log_info "Building for linux/arm64..."
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-w -s" \
        -o dist/gpx_bitforge_dockermetrics_datasource_linux_arm64 \
        ./pkg >&2

    # Verify backend build succeeded
    if [ ! -f "dist/gpx_bitforge_dockermetrics_datasource_linux_amd64" ]; then
        log_error "DataSource backend build failed"
        exit 1
    fi

    log_success "DataSource plugin built"

    # Create tar.gz
    local tar_name="bitforge-dockermetrics-datasource-${version}.tar.gz"
    local tar_path="${SCRIPT_DIR}/dist/${tar_name}"

    mkdir -p "${SCRIPT_DIR}/dist"

    local plugin_dist="${SCRIPT_DIR}/bitforge-dockermetrics-datasource/dist"
    cd "${plugin_dist}"

    log_info "Packaging datasource plugin..."
    tar -czvf "${tar_path}" \
        --exclude="*.tar.gz" \
        --exclude="*_darwin_*" \
        --exclude="*_windows_*" \
        --exclude="*.map" \
        . >&2
    cd "${SCRIPT_DIR}/bitforge-dockermetrics-datasource"

    log_success "DataSource plugin packaged: ${tar_path}"

    echo "${tar_path}"
}

# =============================================================================
# Release functions
# =============================================================================
create_release() {
    local version="$1"
    local panel_tar="$2"
    local datasource_tar="$3"
    local prerelease="$4"

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

    # Build release notes
    local notes_file=$(mktemp)
    cat > "$notes_file" << NOTES_EOF
## Docker Metrics v${version}

Monitor Docker containers directly in Grafana with real-time metrics.

---

## Downloads

| Component | Download |
|-----------|----------|
| **Panel Plugin** | \`bitforge-dockermetrics-panel-${version}.tar.gz\` |
| **Data Source Plugin** | \`bitforge-dockermetrics-datasource-${version}.tar.gz\` |
| **Docker Agent** | \`ghcr.io/${GITHUB_USER}/${IMAGE_NAME}:${version}\` |

> **Note:** Download both plugin archives from the Assets section below.

---

## Installation

### 1. Docker Metrics Agent

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

### 2. Grafana Plugins

Extract both plugins to your Grafana plugins directory:

\`\`\`bash
mkdir -p /var/lib/grafana/plugins/bitforge-dockermetrics-panel
mkdir -p /var/lib/grafana/plugins/bitforge-dockermetrics-datasource

tar -xzf bitforge-dockermetrics-panel-${version}.tar.gz -C /var/lib/grafana/plugins/bitforge-dockermetrics-panel
tar -xzf bitforge-dockermetrics-datasource-${version}.tar.gz -C /var/lib/grafana/plugins/bitforge-dockermetrics-datasource
\`\`\`

Add to \`/etc/grafana/grafana.ini\`:
\`\`\`ini
[plugins]
allow_loading_unsigned_plugins = bitforge-dockermetrics-panel,bitforge-dockermetrics-datasource
\`\`\`

Restart Grafana and configure the data source with your agent URL.

---

## Changelog

See [commits since last release](../../commits/v${version}) for details.
NOTES_EOF

    # Check if release exists
    if gh release view "v${version}" &>/dev/null; then
        log_warn "Release v${version} already exists, uploading assets..."
        gh release upload "v${version}" "${panel_tar}" "${datasource_tar}" --clobber
    else
        local gh_args=("v${version}" "${panel_tar}" "${datasource_tar}" --title "Docker Metrics v${version}" --notes-file "$notes_file")
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
Usage: $0 [OPTIONS] [version]

Options:
  -h, --help          Show this help message
  -p, --prerelease    Mark as pre-release
  -s, --skip-push     Build only, don't push to registries
  -d, --docker-only   Only build and push Docker image
  -g, --plugin-only   Only build and release plugins
  -D, --dev           Development release (auto-generates version: X.Y.Z-dev.TIMESTAMP)
  --no-version-bump   Don't update version numbers in source files

Examples:
  $0 1.3.0                    # Full release v1.3.0
  $0 -D                       # Dev release with auto-generated version
  $0 -p 1.3.0-beta.1          # Pre-release
  $0 -s 1.3.0                 # Build only, no push
  $0 -d 1.3.0                 # Docker image only

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
    local dev_release="false"

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
            -D|--dev)
                dev_release="true"
                prerelease="true"
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

    # Handle dev release version
    if [ "$dev_release" = "true" ]; then
        local base_version=$(get_base_version)
        local timestamp=$(date +%Y%m%d.%H%M%S)
        version="${base_version}-dev.${timestamp}"
        log_info "Development release: ${version}"
    fi

    # Validate version
    if [ -z "$version" ]; then
        log_error "Version is required (or use -D for dev release)"
        usage
        exit 1
    fi

    # Validate version format
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

    local panel_tar=""
    local datasource_tar=""

    # Build Docker image
    if [ "$plugin_only" != "true" ]; then
        build_docker_image "$version"

        if [ "$skip_push" != "true" ]; then
            push_docker_image "$version"
        fi
    fi

    # Build plugins
    if [ "$docker_only" != "true" ]; then
        panel_tar=$(build_panel_plugin "$version")
        datasource_tar=$(build_datasource_plugin "$version")

        if [ "$skip_push" != "true" ]; then
            create_release "$version" "$panel_tar" "$datasource_tar" "$prerelease"
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
    if [ "$docker_only" != "true" ]; then
        echo "Panel plugin: ${panel_tar}" >&2
        echo "DataSource:   ${datasource_tar}" >&2
    fi

    if [ "$skip_push" != "true" ]; then
        echo "Release URL:  https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases/tag/v${version}" >&2
    fi

    echo "" >&2
    if [ "$skip_push" = "true" ]; then
        log_info "Built locally (--skip-push). To push:"
        echo "  docker push ghcr.io/${GITHUB_USER}/${IMAGE_NAME}:${version}" >&2
        echo "  docker push ghcr.io/${GITHUB_USER}/${IMAGE_NAME}:latest" >&2
        echo "  gh release create v${version} ${panel_tar} ${datasource_tar}" >&2
    else
        log_info "Next steps:"
        echo "  1. Verify release at GitHub" >&2
        echo "  2. Update production deployments with new version" >&2
    fi
}

main "$@"
