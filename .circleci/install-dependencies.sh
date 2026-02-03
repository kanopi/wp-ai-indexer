#!/bin/bash
#
# Unified Dependency Installation Script
#
# Description:
#   Installs dependencies for Node.js (npm) or PHP (Composer) projects with caching support.
#
# Usage:
#   install-dependencies.sh [OPTIONS] PROJECT_PATH
#
# Arguments:
#   PROJECT_PATH              Path to the project directory
#
# Options:
#   --type TYPE               Dependency type: npm|composer (default: auto-detect)
#   --cache-key KEY           Cache key prefix (default: v1-deps)
#   --skip-cache              Skip cache restoration and saving
#   --npm-command CMD         npm install command: ci|install (default: ci)
#   --composer-options OPTS   Additional Composer install options (default: --prefer-dist --no-interaction)
#   --acf-auth                Enable ACF authentication for Composer (requires ACF_USERNAME, ACF_PROD_URL)
#   --yoast-auth              Enable Yoast authentication for Composer (requires YOAST_TOKEN)
#   --dry-run                 Show what would be done without executing
#   --help                    Show this help message
#
# Environment Variables:
#   ACF_USERNAME              Advanced Custom Fields username (for Composer with --acf-auth)
#   ACF_PROD_URL              Advanced Custom Fields production URL (for Composer with --acf-auth)
#   YOAST_TOKEN               Yoast token (for Composer with --yoast-auth)
#   CIRCLECI                  Set automatically in CircleCI environment
#
# Exit Codes:
#   0 - Dependencies installed successfully
#   1 - Installation failed
#   2 - Invalid arguments or missing files
#

set -eo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
PROJECT_PATH=""
TYPE="auto"
CACHE_KEY="v1-deps"
SKIP_CACHE="false"
NPM_COMMAND="ci"
COMPOSER_OPTIONS="--prefer-dist --no-interaction"
ACF_AUTH="false"
YOAST_AUTH="false"
DRY_RUN="false"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --type)
            TYPE="$2"
            shift 2
            ;;
        --cache-key)
            CACHE_KEY="$2"
            shift 2
            ;;
        --skip-cache)
            SKIP_CACHE="true"
            shift
            ;;
        --npm-command)
            NPM_COMMAND="$2"
            shift 2
            ;;
        --composer-options)
            COMPOSER_OPTIONS="$2"
            shift 2
            ;;
        --acf-auth)
            ACF_AUTH="true"
            shift
            ;;
        --yoast-auth)
            YOAST_AUTH="true"
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
        -*)
            echo -e "${RED}Error: Unknown option $1${NC}"
            echo "Use --help for usage information"
            exit 2
            ;;
        *)
            PROJECT_PATH="$1"
            shift
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

# Validate required parameters
if [[ -z "$PROJECT_PATH" ]]; then
    log_error "Project path is required"
    echo "Usage: $0 [OPTIONS] PROJECT_PATH"
    exit 2
fi

if [[ ! -d "$PROJECT_PATH" ]]; then
    log_error "Project path does not exist: $PROJECT_PATH"
    exit 2
fi

# Auto-detect dependency type if not specified
if [[ "$TYPE" == "auto" ]]; then
    if [[ -f "$PROJECT_PATH/package.json" ]]; then
        TYPE="npm"
        log_info "Auto-detected: npm (found package.json)"
    elif [[ -f "$PROJECT_PATH/composer.json" ]]; then
        TYPE="composer"
        log_info "Auto-detected: Composer (found composer.json)"
    else
        log_error "Could not auto-detect dependency type (no package.json or composer.json found)"
        exit 2
    fi
fi

# Validate type
if [[ ! "$TYPE" =~ ^(npm|composer)$ ]]; then
    log_error "Invalid dependency type: $TYPE"
    echo "Valid types: npm, composer"
    exit 2
fi

log_header "Dependency Installation"
log_info "Project: $PROJECT_PATH"
log_info "Type: $TYPE"
log_info "Dry run: $DRY_RUN"

# Function to install npm dependencies
install_npm_dependencies() {
    log_header "Installing npm Dependencies"

    # Validate npm is available
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi

    # Determine lock file for cache key
    LOCK_FILE=""
    if [[ -f "$PROJECT_PATH/package-lock.json" ]]; then
        LOCK_FILE="package-lock.json"
    elif [[ -f "$PROJECT_PATH/npm-shrinkwrap.json" ]]; then
        LOCK_FILE="npm-shrinkwrap.json"
    fi

    # Restore cache (if in CircleCI)
    if [[ "$SKIP_CACHE" == "false" ]] && [[ -n "${CIRCLECI:-}" ]]; then
        log_info "Cache restoration handled by CircleCI"
        if [[ -n "$LOCK_FILE" ]]; then
            log_info "Cache key: ${CACHE_KEY}-{{ checksum \"$PROJECT_PATH/$LOCK_FILE\" }}"
        fi
    fi

    if [[ "$DRY_RUN" == "false" ]]; then
        cd "$PROJECT_PATH"

        # Choose install command
        if [[ "$NPM_COMMAND" == "ci" ]]; then
            if [[ -f "package-lock.json" ]] || [[ -f "npm-shrinkwrap.json" ]]; then
                log_info "Running npm ci..."
                npm ci
            else
                log_warning "No lock file found, falling back to npm install..."
                npm install
            fi
        else
            log_info "Running npm install..."
            npm install
        fi

        log_success "npm dependencies installed"
        cd - > /dev/null
    else
        log_info "[DRY RUN] Would run: npm $NPM_COMMAND"
    fi

    # Save cache (if in CircleCI)
    if [[ "$SKIP_CACHE" == "false" ]] && [[ -n "${CIRCLECI:-}" ]]; then
        log_info "Cache saving handled by CircleCI"
        log_info "Cache paths:"
        log_info "  - $PROJECT_PATH/node_modules"
        log_info "  - ~/.npm"
        log_info "  - ~/.cache"
    fi
}

# Function to install Composer dependencies
install_composer_dependencies() {
    log_header "Installing Composer Dependencies"

    # Validate composer is available
    if ! command -v composer &> /dev/null; then
        log_error "Composer is not installed"
        exit 1
    fi

    # Restore cache (if in CircleCI)
    if [[ "$SKIP_CACHE" == "false" ]] && [[ -n "${CIRCLECI:-}" ]]; then
        log_info "Cache restoration handled by CircleCI"
        if [[ -f "$PROJECT_PATH/composer.lock" ]]; then
            log_info "Cache key: ${CACHE_KEY}-{{ checksum \"$PROJECT_PATH/composer.lock\" }}"
        fi
    fi

    # Configure authentication
    if [[ "$ACF_AUTH" == "true" ]] || [[ "$YOAST_AUTH" == "true" ]]; then
        log_header "Configuring Composer Authentication"

        if [[ "$ACF_AUTH" == "true" ]]; then
            if [[ -z "${ACF_USERNAME:-}" ]] || [[ -z "${ACF_PROD_URL:-}" ]]; then
                log_error "ACF authentication requested but ACF_USERNAME or ACF_PROD_URL not set"
                exit 2
            fi

            if [[ "$DRY_RUN" == "false" ]]; then
                log_info "Configuring ACF authentication..."
                composer config -g http-basic.connect.advancedcustomfields.com "$ACF_USERNAME" "$ACF_PROD_URL"
                log_success "ACF authentication configured"
            else
                log_info "[DRY RUN] Would configure ACF authentication"
            fi
        fi

        if [[ "$YOAST_AUTH" == "true" ]]; then
            if [[ -z "${YOAST_TOKEN:-}" ]]; then
                log_error "Yoast authentication requested but YOAST_TOKEN not set"
                exit 2
            fi

            if [[ "$DRY_RUN" == "false" ]]; then
                log_info "Configuring Yoast authentication..."
                composer config -g http-basic.my.yoast.com token "$YOAST_TOKEN"
                log_success "Yoast authentication configured"
            else
                log_info "[DRY RUN] Would configure Yoast authentication"
            fi
        fi
    fi

    if [[ "$DRY_RUN" == "false" ]]; then
        cd "$PROJECT_PATH"

        log_info "Running composer install $COMPOSER_OPTIONS..."
        if composer install $COMPOSER_OPTIONS; then
            log_success "Composer dependencies installed"
        else
            log_error "Composer install failed"
            exit 1
        fi

        cd - > /dev/null
    else
        log_info "[DRY RUN] Would run: composer install $COMPOSER_OPTIONS"
    fi

    # Save cache (if in CircleCI)
    if [[ "$SKIP_CACHE" == "false" ]] && [[ -n "${CIRCLECI:-}" ]]; then
        log_info "Cache saving handled by CircleCI"
        log_info "Cache paths:"
        log_info "  - $PROJECT_PATH/vendor"
        log_info "  - ~/.composer/cache"
        log_info "  - ~/.cache/composer"
    fi
}

# Install dependencies based on type
case "$TYPE" in
    npm)
        install_npm_dependencies
        ;;
    composer)
        install_composer_dependencies
        ;;
esac

log_header "Installation Complete"
log_success "Dependencies installed successfully"
exit 0
