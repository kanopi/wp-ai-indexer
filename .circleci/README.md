# wp-ai-indexer CircleCI Scripts

CI/CD scripts for the wp-ai-indexer Node.js package.

## Scripts

### test-package.sh
Runs npm tests with caching and parallelism support.

Usage:
```bash
./test-package.sh [--cache-key KEY] [--max-workers NUM] [--test-command CMD]
```

### security-audit-npm.sh
Runs npm security audits with configurable severity levels.

Usage:
```bash
./security-audit-npm.sh PACKAGE_PATH [--audit-level LEVEL] [--fail-on-vulnerabilities]
```

### setup-node.sh
Installs Node.js if not already present.

Usage:
```bash
./setup-node.sh [--version VERSION] [--skip-if-installed]
```

### install-dependencies.sh
Unified dependency installer for npm or Composer projects.

Usage:
```bash
./install-dependencies.sh PROJECT_PATH [--type npm|composer]
```

## Integration

These scripts are designed to work both in CircleCI and locally. See the main project's `.circleci/INTEGRATION.md` for complete integration examples.
