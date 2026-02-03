#!/bin/bash
#
# npm Security Audit Script
#
# Description:
#   Runs npm audit on Node.js packages to detect security vulnerabilities.
#
# Usage:
#   security-audit-npm.sh [OPTIONS] PACKAGE_PATH
#
# Arguments:
#   PACKAGE_PATH              Path to the package (e.g., packages/wp-ai-indexer)
#
# Options:
#   --audit-level LEVEL       Audit level: info|low|moderate|high|critical (default: high)
#   --cache-key KEY           Custom cache key prefix (default: v1-indexer-deps)
#   --skip-cache              Skip cache restoration
#   --fail-on-vulnerabilities Fail (exit 1) if vulnerabilities are found (default: false)
#   --output-file FILE        Custom output file path (default: {package}/npm-audit-report.json)
#   --store-artifacts         Store audit report as artifact (default: true in CI)
#   --dry-run                 Show what would be done without executing
#   --help                    Show this help message
#
# Exit Codes:
#   0 - No vulnerabilities found or vulnerabilities ignored
#   1 - Vulnerabilities found (when --fail-on-vulnerabilities is set)
#   2 - Invalid arguments or execution error
#

set -eo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
PACKAGE_PATH=""
AUDIT_LEVEL="high"
CACHE_KEY="v1-indexer-deps"
SKIP_CACHE="false"
FAIL_ON_VULNERABILITIES="false"
OUTPUT_FILE=""
STORE_ARTIFACTS="${CIRCLECI:-false}"
DRY_RUN="false"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --audit-level)
            AUDIT_LEVEL="$2"
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
        --fail-on-vulnerabilities)
            FAIL_ON_VULNERABILITIES="true"
            shift
            ;;
        --output-file)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --store-artifacts)
            STORE_ARTIFACTS="true"
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
            PACKAGE_PATH="$1"
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
if [[ -z "$PACKAGE_PATH" ]]; then
    log_error "Package path is required"
    echo "Usage: $0 [OPTIONS] PACKAGE_PATH"
    exit 2
fi

if [[ ! -d "$PACKAGE_PATH" ]]; then
    log_error "Package path does not exist: $PACKAGE_PATH"
    exit 2
fi

if [[ ! -f "$PACKAGE_PATH/package.json" ]]; then
    log_error "No package.json found in $PACKAGE_PATH"
    exit 2
fi

# Validate audit level
if [[ ! "$AUDIT_LEVEL" =~ ^(info|low|moderate|high|critical)$ ]]; then
    log_error "Invalid audit level: $AUDIT_LEVEL"
    echo "Valid levels: info, low, moderate, high, critical"
    exit 2
fi

# Set default output file if not specified
if [[ -z "$OUTPUT_FILE" ]]; then
    OUTPUT_FILE="$PACKAGE_PATH/npm-audit-report.json"
fi

log_header "npm Security Audit"
log_info "Package: $PACKAGE_PATH"
log_info "Audit level: $AUDIT_LEVEL"
log_info "Output file: $OUTPUT_FILE"
log_info "Dry run: $DRY_RUN"

# Restore cache (if in CircleCI and cache enabled)
if [[ "$SKIP_CACHE" == "false" ]] && [[ -n "${CIRCLECI:-}" ]]; then
    log_header "Restoring Cache"
    if [[ "$DRY_RUN" == "false" ]]; then
        log_info "Cache restoration handled by CircleCI"
        log_info "Cache key: ${CACHE_KEY}-{{ checksum \"$PACKAGE_PATH/package-lock.json\" }}"
    else
        log_info "[DRY RUN] Would restore cache with key: $CACHE_KEY"
    fi
fi

# Install dependencies
log_header "Installing Dependencies"
if [[ "$DRY_RUN" == "false" ]]; then
    cd "$PACKAGE_PATH"

    if [[ -f "package-lock.json" ]]; then
        log_info "Running npm ci..."
        npm ci
        log_success "Dependencies installed"
    else
        log_info "No package-lock.json found, running npm install..."
        npm install
        log_success "Dependencies installed"
    fi

    cd - > /dev/null
else
    log_info "[DRY RUN] Would run: cd $PACKAGE_PATH && npm ci"
fi

# Run npm audit
log_header "Running npm audit"
AUDIT_RESULT=0

if [[ "$DRY_RUN" == "false" ]]; then
    cd "$PACKAGE_PATH"

    # Run audit with JSON output (continue on failure)
    log_info "Generating JSON audit report..."
    if npm audit --audit-level="$AUDIT_LEVEL" --json > "$(basename "$OUTPUT_FILE")" 2>&1; then
        log_success "No vulnerabilities found at $AUDIT_LEVEL level or above"
        AUDIT_RESULT=0
    else
        VULNERABILITIES_EXIT_CODE=$?
        log_warning "Vulnerabilities detected"
        AUDIT_RESULT=1
    fi

    # Run audit again for human-readable output
    echo ""
    log_info "Running audit for display output..."
    if npm audit --audit-level="$AUDIT_LEVEL"; then
        log_success "Audit passed"
    else
        # Parse JSON report to show summary
        if [[ -f "$(basename "$OUTPUT_FILE")" ]]; then
            if command -v jq &> /dev/null; then
                echo ""
                log_info "Vulnerability summary:"
                jq -r '.metadata | "Total: \(.vulnerabilities.total)\nInfo: \(.vulnerabilities.info)\nLow: \(.vulnerabilities.low)\nModerate: \(.vulnerabilities.moderate)\nHigh: \(.vulnerabilities.high)\nCritical: \(.vulnerabilities.critical)"' "$(basename "$OUTPUT_FILE")"
            fi
        fi
    fi

    # Move output file to final location if different
    if [[ "$(basename "$OUTPUT_FILE")" != "$OUTPUT_FILE" ]]; then
        mkdir -p "$(dirname "$OUTPUT_FILE")"
        mv "$(basename "$OUTPUT_FILE")" "$OUTPUT_FILE"
    fi

    cd - > /dev/null

    if [[ -f "$OUTPUT_FILE" ]]; then
        log_success "Audit report saved to: $OUTPUT_FILE"
    fi
else
    log_info "[DRY RUN] Would run: npm audit --audit-level=$AUDIT_LEVEL"
    AUDIT_RESULT=0
fi

# Store artifacts (if in CircleCI)
if [[ "$STORE_ARTIFACTS" == "true" ]] && [[ -n "${CIRCLECI:-}" ]]; then
    log_header "Storing Artifacts"
    if [[ "$DRY_RUN" == "false" ]]; then
        if [[ -f "$OUTPUT_FILE" ]]; then
            log_info "Artifact storage handled by CircleCI"
            log_info "  - store_artifacts: $OUTPUT_FILE"
        else
            log_warning "Output file not found: $OUTPUT_FILE"
        fi
    else
        log_info "[DRY RUN] Would store artifact: $OUTPUT_FILE"
    fi
fi

log_header "Security Audit Complete"

if [[ $AUDIT_RESULT -eq 0 ]]; then
    log_success "No vulnerabilities found at $AUDIT_LEVEL level or above"
    exit 0
else
    if [[ "$FAIL_ON_VULNERABILITIES" == "true" ]]; then
        log_error "Vulnerabilities found - failing build"
        exit 1
    else
        log_warning "Vulnerabilities found but not failing build"
        log_info "Use --fail-on-vulnerabilities to fail on vulnerabilities"
        exit 0
    fi
fi
