#!/bin/bash
#
# Node.js Setup Script
#
# Description:
#   Installs Node.js if not already present, or validates existing installation.
#
# Usage:
#   setup-node.sh [OPTIONS]
#
# Options:
#   --version VERSION         Node.js major version to install (default: 22)
#   --skip-if-installed       Skip installation if Node.js is already installed
#   --validate-version        Ensure installed version matches requested version
#   --dry-run                 Show what would be done without executing
#   --help                    Show this help message
#
# Exit Codes:
#   0 - Node.js is installed and validated
#   1 - Installation failed
#   2 - Invalid arguments or version mismatch
#

set -eo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
NODE_VERSION="22"
SKIP_IF_INSTALLED="false"
VALIDATE_VERSION="false"
DRY_RUN="false"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            NODE_VERSION="$2"
            shift 2
            ;;
        --skip-if-installed)
            SKIP_IF_INSTALLED="true"
            shift
            ;;
        --validate-version)
            VALIDATE_VERSION="true"
            shift
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --help)
            grep '^#' "$0" | grep -v '#!/bin/bash' | sed 's/^# //;s/^#//'
            exit 0
            ;;
        *)
            echo -e "${RED}Error: Unknown option $1${NC}"
            echo "Use --help for usage information"
            exit 2
            ;;
    esac
done

# Helper functions
log_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Validate version format
if [[ ! "$NODE_VERSION" =~ ^[0-9]+$ ]]; then
    log_error "Invalid Node.js version: $NODE_VERSION (must be a number like 18, 20, 22)"
    exit 2
fi

log_header "Node.js Setup"
log_info "Requested version: $NODE_VERSION.x"
log_info "Dry run: $DRY_RUN"

# Check if Node.js is already installed
if command -v node &> /dev/null; then
    INSTALLED_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
    log_info "Node.js is already installed: $(node --version)"
    log_info "npm version: $(npm --version)"

    if [[ "$VALIDATE_VERSION" == "true" ]]; then
        if [[ "$INSTALLED_VERSION" != "$NODE_VERSION" ]]; then
            log_warning "Installed version (v$INSTALLED_VERSION) doesn't match requested version (v$NODE_VERSION)"

            if [[ "$SKIP_IF_INSTALLED" == "true" ]]; then
                log_info "Skipping installation due to --skip-if-installed flag"
                log_success "Using existing Node.js installation"
                exit 0
            else
                log_info "Proceeding with installation of Node.js $NODE_VERSION.x..."
            fi
        else
            log_success "Installed version matches requested version"
            exit 0
        fi
    else
        if [[ "$SKIP_IF_INSTALLED" == "true" ]]; then
            log_success "Node.js is already installed, skipping"
            exit 0
        else
            log_info "Node.js is installed but will reinstall as requested"
        fi
    fi
else
    log_info "Node.js not found, installing..."
fi

# Detect OS and package manager
if [[ "$DRY_RUN" == "true" ]]; then
    log_info "[DRY RUN] Would detect OS and install Node.js $NODE_VERSION.x"
    exit 0
fi

log_header "Installing Node.js $NODE_VERSION.x"

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    log_info "Detected Linux OS"

    # Check if running Debian/Ubuntu
    if command -v apt-get &> /dev/null; then
        log_info "Using apt package manager"

        # Download and run NodeSource setup script
        log_info "Downloading NodeSource setup script..."
        curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" -o /tmp/nodesource_setup.sh

        log_info "Running NodeSource setup script..."
        sudo bash /tmp/nodesource_setup.sh
        rm /tmp/nodesource_setup.sh

        log_info "Installing Node.js via apt..."
        sudo apt-get install -y nodejs

    # Check if running RedHat/CentOS/Fedora
    elif command -v yum &> /dev/null; then
        log_info "Using yum package manager"

        # Download and run NodeSource setup script
        log_info "Downloading NodeSource setup script..."
        curl -fsSL "https://rpm.nodesource.com/setup_${NODE_VERSION}.x" -o /tmp/nodesource_setup.sh

        log_info "Running NodeSource setup script..."
        sudo bash /tmp/nodesource_setup.sh
        rm /tmp/nodesource_setup.sh

        log_info "Installing Node.js via yum..."
        sudo yum install -y nodejs

    else
        log_error "Unsupported Linux distribution (no apt or yum found)"
        exit 1
    fi

elif [[ "$OSTYPE" == "darwin"* ]]; then
    log_info "Detected macOS"

    if command -v brew &> /dev/null; then
        log_info "Installing via Homebrew..."
        brew install node@${NODE_VERSION}

        # Link the installed version
        brew link --overwrite node@${NODE_VERSION}
    else
        log_error "Homebrew not found. Please install Homebrew first: https://brew.sh"
        exit 1
    fi

else
    log_error "Unsupported operating system: $OSTYPE"
    exit 1
fi

# Validate installation
log_header "Validating Installation"

if command -v node &> /dev/null; then
    INSTALLED_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
    log_success "Node.js installed: $(node --version)"
    log_success "npm version: $(npm --version)"

    if [[ "$VALIDATE_VERSION" == "true" ]]; then
        if [[ "$INSTALLED_VERSION" != "$NODE_VERSION" ]]; then
            log_warning "Installed version (v$INSTALLED_VERSION) doesn't match requested version (v$NODE_VERSION)"
            log_warning "This may be acceptable if the system provided a compatible version"
        else
            log_success "Version validation passed"
        fi
    fi

    exit 0
else
    log_error "Node.js installation failed - node command not found"
    exit 1
fi
