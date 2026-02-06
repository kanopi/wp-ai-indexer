# Implementation Plan: Update wp-ai-indexer for Semantic Knowledge Plugin Rename

## Summary
Update the wp-ai-indexer npm package to reflect the WordPress plugin rename from "wp-ai-assistant" to "semantic-knowledge". The primary change is updating the REST API endpoint path from `/wp-json/ai-assistant/v1/indexer-settings` to `/wp-json/semantic-knowledge/v1/indexer-settings`.

## Scope
**Total files affected:** 5 files
**Total references to update:** 37 occurrences

## Changes Required

### 1. Source Code Updates

#### File: `src/settings.ts` (1 reference)
**Line 28:** Update the default settings URL construction
```typescript
// OLD:
`${this.config.wpApiBase}/wp-json/ai-assistant/v1/indexer-settings`;

// NEW:
`${this.config.wpApiBase}/wp-json/semantic-knowledge/v1/indexer-settings`;
```

**Impact:** This is the core integration point. All settings fetching will use the new endpoint.

### 2. Documentation Updates

#### File: `README.md` (5 references)
Update all occurrences of the endpoint path and plugin name:

- **Line 37:** Requirements section - Change "WP AI Assistant plugin" to "Semantic Knowledge plugin"
- **Line 56:** Configuration example - Update endpoint path
- **Line 89:** Settings endpoint documentation - Update endpoint path
- **Line 244:** Architecture/integration section - Update endpoint path
- **Line 353:** Troubleshooting section - Update endpoint path

#### File: `.env.example` (2 references)
Update environment variable documentation:

- **Line 23:** Comment with default settings URL - Update endpoint path
- **Line 24:** Example custom settings URL - Update endpoint path

#### File: `PUBLISHING.md` (1 reference)
**Line 128:** Update post-publication checklist item
```markdown
// OLD:
- [ ] Update wp-ai-assistant plugin to use published package

// NEW:
- [ ] Update semantic-knowledge plugin to use published package
```

### 3. Test Updates

#### File: `tests/integration/indexer.test.ts` (14 references)
Update all mock endpoint paths from:
```typescript
.get('/wp-json/ai-assistant/v1/indexer-settings')
```
to:
```typescript
.get('/wp-json/semantic-knowledge/v1/indexer-settings')
```

**Lines affected:** 41, 83, 116, 143, 161, 187, 218, 242, 250, 260, 268, 304, 339

#### File: `tests/unit/settings.test.ts` (13 references)
Update all mock endpoint paths (same pattern as integration tests)

**Lines affected:** 22, 35, 67, 78, 86, 97, 111, 121, 131, 141, 151, 161, 171, 181, 191, 201, 215, 226, 266, 285

### 4. Configuration Considerations

**Approach: Clean Break (No Backward Compatibility)**

The implementation will make a clean break to the new endpoint:
- All references updated to `semantic-knowledge/v1` namespace
- No fallback to old `ai-assistant/v1` endpoint
- Simpler, cleaner code without technical debt

**Important:** Users will need to:
1. Update their WordPress plugin to semantic-knowledge
2. Update their wp-ai-indexer npm package

**No environment variable changes needed** - The `WP_AI_SETTINGS_URL` environment variable can still override the default endpoint if users need custom configuration.

## Critical Files
- `src/settings.ts` - Core settings manager
- `tests/unit/settings.test.ts` - Settings unit tests
- `tests/integration/indexer.test.ts` - Integration tests
- `README.md` - User documentation
- `.env.example` - Configuration examples
- `PUBLISHING.md` - Publishing checklist

## Implementation Steps

1. **Update source code** (`src/settings.ts`)
   - Change default endpoint path to use `semantic-knowledge/v1` namespace

2. **Update unit tests** (`tests/unit/settings.test.ts`)
   - Update all 13 mock endpoint paths
   - Verify tests pass

3. **Update integration tests** (`tests/integration/indexer.test.ts`)
   - Update all 14 mock endpoint paths
   - Verify tests pass

4. **Update documentation** (`README.md`)
   - Update plugin name from "WP AI Assistant" to "Semantic Knowledge"
   - Update all endpoint path examples from `ai-assistant/v1` to `semantic-knowledge/v1`
   - Keep existing structure, no plugin version requirements needed

5. **Update configuration examples** (`.env.example`)
   - Update endpoint path in comments and examples

6. **Update publishing guide** (`PUBLISHING.md`)
   - Update plugin name in checklist

## Verification Steps

### 1. Run Tests
```bash
npm test
```
All tests should pass with the new endpoint paths.

### 2. Build Package
```bash
npm run build
```
Verify TypeScript compilation succeeds.

### 3. Manual Testing (if semantic-knowledge plugin is available)
```bash
# Set up environment with semantic-knowledge plugin
export WP_API_BASE=https://your-test-site.com
export OPENAI_API_KEY=your-key
export PINECONE_API_KEY=your-key

# Run indexer
./bin/wp-ai-indexer.js index
```

Verify:
- Settings are fetched from `/wp-json/semantic-knowledge/v1/indexer-settings`
- Indexing completes successfully
- No endpoint errors in logs

### 4. Configuration Display
```bash
./bin/wp-ai-indexer.js config
```

Verify the displayed settings URL uses the new endpoint path.

## Backward Compatibility Notes

**Breaking Change:** This update introduces a breaking change. The indexer will no longer work with the old wp-ai-assistant plugin.

**Migration Path for Users:**
1. Update WordPress plugin from wp-ai-assistant to semantic-knowledge
2. Update npm package: `npm install @kanopi/wp-ai-indexer@latest`
3. No environment variable changes required
4. Existing Pinecone vectors remain compatible (no data migration needed)

## Version Impact

This will be a **minor version bump** (e.g., 1.1.0 → 1.2.0) because:
- It's a breaking change for plugin compatibility
- The package API remains the same
- Environment variables remain the same
- Existing workflows continue to work after plugin update
- Represents a significant change requiring coordinated updates

## Risk Assessment

**Low Risk** - The changes are straightforward string replacements:
- No logic changes
- No API signature changes
- No new dependencies
- Tests will verify correctness

**Testing Coverage:**
- Unit tests cover settings fetching
- Integration tests cover full indexing flow
- All test mocks will be updated to match

## Notes

- The semantic-knowledge WordPress plugin already uses the new endpoint (`semantic-knowledge/v1`)
- The plugin's own tests still reference the old namespace and should be updated separately
- Consider adding a note in README about minimum required plugin version
