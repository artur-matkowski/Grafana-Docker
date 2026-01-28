#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] <environment>

Deploy Docker Metrics components to remote server via SSH/SCP.

Arguments:
    environment     Target environment: 'dev' or 'production'

Options:
    -c, --component COMPONENT   Deploy specific component only:
                                'panel', 'datasource', 'agent', 'plugins', 'all'
                                (default: all)
    -b, --build                 Build before deploying
    -v, --version VERSION       Version tag for deployment (default: from package.json)
    -n, --dry-run               Show what would be done without executing
    -h, --help                  Show this help message

Examples:
    $(basename "$0") production                    # Deploy all to production
    $(basename "$0") dev                           # Deploy all to development
    $(basename "$0") -b production                 # Build and deploy to production
    $(basename "$0") -c panel dev                  # Deploy panel only to dev
    $(basename "$0") -c plugins -b production      # Build and deploy both plugins

Environment files:
    scripts/.env              - Production configuration
    scripts/.env.development  - Development configuration

EOF
    exit 0
}

# Default values
COMPONENT="all"
BUILD=false
DRY_RUN=false
VERSION=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--component)
            COMPONENT="$2"
            shift 2
            ;;
        -b|--build)
            BUILD=true
            shift
            ;;
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -n|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        -*)
            log_error "Unknown option: $1"
            usage
            ;;
        *)
            ENVIRONMENT="$1"
            shift
            ;;
    esac
done

# Validate environment
if [[ -z "$ENVIRONMENT" ]]; then
    log_error "Environment argument is required"
    usage
fi

if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "production" ]]; then
    log_error "Environment must be 'dev' or 'production'"
    exit 1
fi

# Validate component
case "$COMPONENT" in
    panel|datasource|agent|plugins|all) ;;
    *)
        log_error "Invalid component: $COMPONENT"
        exit 1
        ;;
esac

# Load environment file
if [[ "$ENVIRONMENT" == "dev" ]]; then
    ENV_FILE="$SCRIPT_DIR/.env.development"
else
    ENV_FILE="$SCRIPT_DIR/.env"
fi

if [[ ! -f "$ENV_FILE" ]]; then
    log_error "Environment file not found: $ENV_FILE"
    log_error "Copy .env.example to $ENV_FILE and configure it"
    exit 1
fi

log_info "Loading configuration from $ENV_FILE"
source "$ENV_FILE"

# Validate required variables
required_vars=(SSH_HOST GRAFANA_PLUGINS_PATH GRAFANA_CONTAINER)
for var in "${required_vars[@]}"; do
    if [[ -z "${!var}" ]]; then
        log_error "Required variable $var is not set in $ENV_FILE"
        exit 1
    fi
done

# Build SSH options
SSH_OPTS=""
if [[ -n "$SSH_KEY" ]]; then
    SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
fi
if [[ -n "$SSH_PORT" && "$SSH_PORT" != "22" ]]; then
    SSH_OPTS="$SSH_OPTS -p $SSH_PORT"
    SCP_OPTS="-P $SSH_PORT"
else
    SCP_OPTS=""
fi

# Get version from package.json if not specified
if [[ -z "$VERSION" ]]; then
    VERSION=$(grep '"version"' "$PROJECT_ROOT/bitforge-dockermetrics-panel/package.json" | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
fi

log_info "Deployment configuration:"
log_info "  Environment: $ENVIRONMENT"
log_info "  Component: $COMPONENT"
log_info "  Version: $VERSION"
log_info "  SSH Host: $SSH_HOST"
log_info "  Build: $BUILD"
log_info "  Dry run: $DRY_RUN"

# Helper functions
run_ssh() {
    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY-RUN] ssh $SSH_OPTS $SSH_HOST \"$1\""
    else
        ssh $SSH_OPTS "$SSH_HOST" "$1"
    fi
}

run_scp() {
    local src="$1"
    local dest="$2"
    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY-RUN] scp $SCP_OPTS $SSH_OPTS $src $SSH_HOST:$dest"
    else
        scp $SCP_OPTS $SSH_OPTS "$src" "$SSH_HOST:$dest"
    fi
}

build_panel() {
    log_info "Building panel plugin..."
    cd "$PROJECT_ROOT/bitforge-dockermetrics-panel"
    npm install
    npm run build

    # Create archive
    cd "$PROJECT_ROOT"
    local archive="dist/bitforge-dockermetrics-panel-${VERSION}.tar.gz"
    mkdir -p dist
    tar -czf "$archive" -C bitforge-dockermetrics-panel/dist .
    log_info "Created: $archive"
}

build_datasource() {
    log_info "Building datasource plugin..."
    cd "$PROJECT_ROOT/bitforge-dockermetrics-datasource"
    npm install
    npm run build

    # Build Go backend
    log_info "Building Go backend..."
    go mod tidy
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" \
        -o dist/gpx_bitforge_dockermetrics_datasource_linux_amd64 ./pkg
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-w -s" \
        -o dist/gpx_bitforge_dockermetrics_datasource_linux_arm64 ./pkg

    # Create archive
    cd "$PROJECT_ROOT"
    local archive="dist/bitforge-dockermetrics-datasource-${VERSION}.tar.gz"
    mkdir -p dist
    tar -czf "$archive" -C bitforge-dockermetrics-datasource/dist .
    log_info "Created: $archive"
}

deploy_panel() {
    log_info "Deploying panel plugin..."

    local archive="$PROJECT_ROOT/dist/bitforge-dockermetrics-panel-${VERSION}.tar.gz"
    if [[ ! -f "$archive" ]]; then
        log_error "Archive not found: $archive"
        log_error "Run with -b flag to build first"
        exit 1
    fi

    local remote_plugin_dir="$GRAFANA_PLUGINS_PATH/bitforge-dockermetrics-panel"
    local tmp_archive="/tmp/bitforge-dockermetrics-panel-${VERSION}.tar.gz"

    # Copy archive to remote
    log_info "Copying archive to remote..."
    run_scp "$archive" "$tmp_archive"

    # Extract and set permissions on remote
    log_info "Extracting and setting permissions..."
    run_ssh "sudo rm -rf $remote_plugin_dir && sudo mkdir -p $remote_plugin_dir && sudo tar -xzf $tmp_archive -C $remote_plugin_dir && sudo chown -R 472:472 $remote_plugin_dir && rm -f $tmp_archive"

    log_info "Panel plugin deployed to $remote_plugin_dir"
}

deploy_datasource() {
    log_info "Deploying datasource plugin..."

    local archive="$PROJECT_ROOT/dist/bitforge-dockermetrics-datasource-${VERSION}.tar.gz"
    if [[ ! -f "$archive" ]]; then
        log_error "Archive not found: $archive"
        log_error "Run with -b flag to build first"
        exit 1
    fi

    local remote_plugin_dir="$GRAFANA_PLUGINS_PATH/bitforge-dockermetrics-datasource"
    local tmp_archive="/tmp/bitforge-dockermetrics-datasource-${VERSION}.tar.gz"

    # Copy archive to remote
    log_info "Copying archive to remote..."
    run_scp "$archive" "$tmp_archive"

    # Extract and set permissions on remote
    log_info "Extracting and setting permissions..."
    run_ssh "sudo rm -rf $remote_plugin_dir && sudo mkdir -p $remote_plugin_dir && sudo tar -xzf $tmp_archive -C $remote_plugin_dir && sudo chown -R 472:472 $remote_plugin_dir && rm -f $tmp_archive"

    log_info "Datasource plugin deployed to $remote_plugin_dir"
}

deploy_agent() {
    log_info "Deploying agent via Docker..."

    if [[ -z "$AGENT_CONTAINER" ]]; then
        log_warn "AGENT_CONTAINER not set, skipping agent deployment"
        return
    fi

    local image="${DOCKER_REGISTRY}/docker-metrics-agent:v${VERSION}"

    log_info "Pulling and restarting agent container..."
    run_ssh "docker pull $image && docker stop $AGENT_CONTAINER 2>/dev/null || true && docker rm $AGENT_CONTAINER 2>/dev/null || true"

    # Get docker GID on remote
    run_ssh "export DOCKER_GID=\$(getent group docker | cut -d: -f3) && docker run -d --name $AGENT_CONTAINER --restart unless-stopped -p 5000:5000 -v /var/run/docker.sock:/var/run/docker.sock:ro -v /sys/fs/cgroup:/sys/fs/cgroup:ro --group-add \$DOCKER_GID $image"

    log_info "Agent deployed: $image"
}

restart_grafana() {
    log_info "Restarting Grafana container..."
    run_ssh "docker restart $GRAFANA_CONTAINER"
    log_info "Grafana restarted"
}

# Main deployment logic
if [[ "$BUILD" == true ]]; then
    case "$COMPONENT" in
        panel)
            build_panel
            ;;
        datasource)
            build_datasource
            ;;
        plugins)
            build_panel
            build_datasource
            ;;
        agent)
            log_info "Agent uses Docker image from registry, no local build needed"
            ;;
        all)
            build_panel
            build_datasource
            ;;
    esac
fi

# Deploy components
case "$COMPONENT" in
    panel)
        deploy_panel
        restart_grafana
        ;;
    datasource)
        deploy_datasource
        restart_grafana
        ;;
    plugins)
        deploy_panel
        deploy_datasource
        restart_grafana
        ;;
    agent)
        deploy_agent
        ;;
    all)
        deploy_panel
        deploy_datasource
        restart_grafana
        if [[ -n "$AGENT_CONTAINER" ]]; then
            deploy_agent
        fi
        ;;
esac

log_info "Deployment complete!"
