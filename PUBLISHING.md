# Publishing Guide for @kanopi/wp-ai-indexer

This document outlines the steps to publish the package to npm.

## Prerequisites

- npm account with access to @kanopi organization
- Local authentication: `npm login`
- All tests passing: `npm test`
- Clean build: `npm run build`

## Pre-Publication Checklist

- [ ] All changes committed and pushed to GitHub
- [ ] Version bumped in `package.json` (if not 1.0.0)
- [ ] CHANGELOG updated with release notes
- [ ] README is up to date
- [ ] Tests passing locally and in CI
- [ ] CircleCI build is green
- [ ] Package built successfully: `npm run build`

## Publication Steps

### 1. Login to npm

```bash
npm login
```

Enter your npm credentials when prompted.

### 2. Verify Package Contents

```bash
# Create package tarball
npm pack

# Inspect contents
tar -tzf kanopi-wp-ai-indexer-1.0.0.tgz

# Verify package includes:
# - dist/ (compiled JS and type definitions)
# - bin/ (CLI executable)
# - README.md
# - LICENSE
# - package.json
# - Does NOT include: node_modules/, src/, tests/ (controlled by .npmignore)
```

### 3. Test Package Locally

```bash
# Install globally from tarball
npm install -g ./kanopi-wp-ai-indexer-1.0.0.tgz

# Verify CLI works
wp-ai-indexer --version
# Should output: 1.0.0

# Test help command
wp-ai-indexer --help

# Clean up
npm uninstall -g @kanopi/wp-ai-indexer
rm kanopi-wp-ai-indexer-1.0.0.tgz
```

### 4. Publish to npm

```bash
# Publish as public package (required for @kanopi scope)
npm publish --access public

# Should output:
# + @kanopi/wp-ai-indexer@1.0.0
```

### 5. Verify Publication

```bash
# View package on npm
npm view @kanopi/wp-ai-indexer

# Should show:
# - name: @kanopi/wp-ai-indexer
# - version: 1.0.0
# - dist.tarball: https://registry.npmjs.org/@kanopi/wp-ai-indexer/-/wp-ai-indexer-1.0.0.tgz
```

```bash
# Test installation from npm
npm install -g @kanopi/wp-ai-indexer
wp-ai-indexer --version
```

### 6. Create GitHub Release

```bash
# Tag the release
git tag v1.0.0
git push --tags

# Or use GitHub CLI
gh release create v1.0.0 \
  --title "v1.0.0 - Initial Release" \
  --notes "First public release of @kanopi/wp-ai-indexer

## Features
- WordPress content indexing via REST API
- OpenAI embeddings generation
- Pinecone vector storage
- Multi-environment support with domain filtering
- CLI interface with comprehensive commands
- Retry logic and error handling

## Installation
\`\`\`bash
npm install @kanopi/wp-ai-indexer
\`\`\`

See [README](https://github.com/kanopi/wp-ai-indexer#readme) for usage instructions."
```

### 7. Post-Publication

- [ ] Verify package appears on https://npmjs.com/package/@kanopi/wp-ai-indexer
- [ ] Test installation from npm on clean machine
- [ ] Update semantic-knowledge plugin to use published package
- [ ] Announce release (Slack, blog post, etc.)

## Troubleshooting

### "You do not have permission to publish"

- Verify you're logged in: `npm whoami`
- Verify you have access to @kanopi org: `npm org ls kanopi`
- Contact org admin to add you as member

### "Package name already exists"

- Check if package was previously published: `npm view @kanopi/wp-ai-indexer`
- Increment version if updating existing package
- Use different package name if claiming for first time

### "Tarball contains unexpected files"

- Check `.npmignore` configuration
- Use `npm pack` to preview what will be published
- Remove sensitive files (secrets, credentials, etc.)

## Version Updates

For subsequent releases:

1. Update version in `package.json`:
   ```bash
   npm version patch  # 1.0.0 -> 1.0.1
   npm version minor  # 1.0.0 -> 1.1.0
   npm version major  # 1.0.0 -> 2.0.0
   ```

2. Update CHANGELOG.md

3. Commit and push:
   ```bash
   git push && git push --tags
   ```

4. Publish:
   ```bash
   npm publish
   ```

5. Create GitHub release

## Rollback

If you need to unpublish or deprecate:

```bash
# Deprecate version (keeps it installable but warns users)
npm deprecate @kanopi/wp-ai-indexer@1.0.0 "Version has critical bug, use 1.0.1+"

# Unpublish (only within 72 hours, not recommended)
npm unpublish @kanopi/wp-ai-indexer@1.0.0
```

## Support

- npm documentation: https://docs.npmjs.com/
- GitHub Issues: https://github.com/kanopi/wp-ai-indexer/issues
