#!/bin/bash
#
# Node Package Testing Script
#
# Description:
#   Runs tests for Node.js packages with dependency caching and parallel execution support.
#
# Usage:
#   test-package.sh [OPTIONS] PACKAGE_PATH
#
# Arguments:
#   PACKAGE_PATH              Path to the package (e.g., packages/wp-ai-indexer)
#
# Options:
#   --cache-key KEY           Custom cache key prefix (default: v1-package-deps)
#   --max-workers NUM         Number of parallel test workers (default: 2)
#   --test-command CMD        npm test command to run (default: test:ci)
#   --skip-cache              Skip cache restoration and saving
#   --store-results           Store test results in CircleCI (default: true in CI)
#   --results-path PATH       Path to store test results (default: {package}/coverage)
#   --dry-run                 Show what would be done without executing
#   --help                    Show this help message
#
# Exit Codes:
#   0 - Tests passed
#   1 - Tests failed or execution error
#   2 - Invalid arguments
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
CACHE_KEY="v1-package-deps"
MAX_WORKERS="2"
TEST_COMMAND="test:ci"
SKIP_CACHE="false"
STORE_RESULTS="${CIRCLECI:-false}"
RESULTS_PATH=""
DRY_RUN="false"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --cache-key)
            CACHE_KEY="$2"
            shift 2
            ;;
        --max-workers)
            MAX_WORKERS="$2"
            shift 2
            ;;
        --test-command)
            TEST_COMMAND="$2"
            shift 2
            ;;
        --skip-cache)
            SKIP_CACHE="true"
            shift
            ;;
        --store-results)
            STORE_RESULTS="true"
            shift
            ;;
        --results-path)
            RESULTS_PATH="$2"
            shift 2
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

# Set default results path if not specified
if [[ -z "$RESULTS_PATH" ]]; then
    RESULTS_PATH="$PACKAGE_PATH/coverage"
fi

log_header "Node Package Testing"
log_info "Package: $PACKAGE_PATH"
log_info "Max workers: $MAX_WORKERS"
log_info "Test command: npm run $TEST_COMMAND"
log_info "Dry run: $DRY_RUN"

# Restore cache (if in CircleCI and cache enabled)
if [[ "$SKIP_CACHE" == "false" ]] && [[ -n "${CIRCLECI:-}" ]]; then
    log_header "Restoring Cache"
    if [[ "$DRY_RUN" == "false" ]]; then
        # CircleCI cache restoration would happen via CircleCI's restore_cache step
        # This script focuses on the execution logic
        log_info "Cache restoration handled by CircleCI"
        log_info "Cache keys:"
        log_info "  - ${CACHE_KEY}-{{ checksum \"$PACKAGE_PATH/package-lock.json\" }}"
        log_info "  - ${CACHE_KEY}-{{ .Branch }}-"
        log_info "  - ${CACHE_KEY}-main-"
        log_info "  - ${CACHE_KEY}-"
    else
        log_info "[DRY RUN] Would restore cache with key: $CACHE_KEY"
    fi
fi

# Install dependencies
log_header "Installing Dependencies"
if [[ "$DRY_RUN" == "false" ]]; then
    cd "$PACKAGE_PATH"

    # Use npm ci for clean, reproducible installs
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

# Save cache (if in CircleCI and cache enabled)
if [[ "$SKIP_CACHE" == "false" ]] && [[ -n "${CIRCLECI:-}" ]]; then
    log_header "Saving Cache"
    if [[ "$DRY_RUN" == "false" ]]; then
        # CircleCI cache saving would happen via CircleCI's save_cache step
        log_info "Cache saving handled by CircleCI"
        log_info "Cache paths:"
        log_info "  - $PACKAGE_PATH/node_modules"
        log_info "  - ~/.npm"
        log_info "  - ~/.cache"
    else
        log_info "[DRY RUN] Would save cache to: $CACHE_KEY"
    fi
fi

# Run tests
log_header "Running Tests"
if [[ "$DRY_RUN" == "false" ]]; then
    cd "$PACKAGE_PATH"

    # Check if test command exists in package.json
    if ! npm run | grep -q "$TEST_COMMAND"; then
        log_error "Test command '$TEST_COMMAND' not found in package.json"
        exit 1
    fi

    # Run tests with specified max workers
    log_info "Executing: npm run $TEST_COMMAND -- --maxWorkers=$MAX_WORKERS"
    if npm run "$TEST_COMMAND" -- --maxWorkers="$MAX_WORKERS"; then
        log_success "Tests passed"
        TEST_RESULT=0
    else
        log_error "Tests failed"
        TEST_RESULT=1
    fi

    cd - > /dev/null
else
    log_info "[DRY RUN] Would run: npm run $TEST_COMMAND -- --maxWorkers=$MAX_WORKERS"
    TEST_RESULT=0
fi

# Store test results and artifacts (if in CircleCI)
if [[ "$STORE_RESULTS" == "true" ]] && [[ -n "${CIRCLECI:-}" ]]; then
    log_header "Storing Test Results"
    if [[ "$DRY_RUN" == "false" ]]; then
        if [[ -d "$RESULTS_PATH" ]]; then
            log_success "Test results available at: $RESULTS_PATH"
            log_info "Store test results handled by CircleCI"
            log_info "  - store_test_results: $RESULTS_PATH"
            log_info "  - store_artifacts: $RESULTS_PATH"
        else
            log_info "No test results found at $RESULTS_PATH"
        fi
    else
        log_info "[DRY RUN] Would store test results from: $RESULTS_PATH"
    fi
fi

log_header "Testing Complete"
if [[ $TEST_RESULT -eq 0 ]]; then
    log_success "All tests passed"
else
    log_error "Tests failed"
fi

exit $TEST_RESULT
