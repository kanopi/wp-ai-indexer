# @kanopi/wp-ai-indexer

Shared Node-based indexer for WordPress AI plugins (Chatbot & Search). This package provides a single, reusable indexer that creates embeddings from WordPress content and stores them in Pinecone for use by multiple plugins.

## Features

- 📚 **WordPress Integration**: Fetches content via WordPress REST API
- 🔐 **Secure Authentication**: Supports WordPress Application Passwords
- ✂️ **Deterministic Chunking**: Consistent content chunking with configurable size and overlap
- 🤖 **OpenAI Embeddings**: Creates embeddings using OpenAI models
- 📊 **Pinecone Storage**: Upserts vectors to Pinecone with comprehensive metadata
- 🌐 **Domain Filtering**: Multi-environment support with automatic domain isolation
- 🔄 **Retry Logic**: Automatic retries with exponential backoff
- ⚙️ **Schema Versioning**: Enforces index schema compatibility
- 🎯 **Configurable**: Highly configurable via WordPress settings endpoint
- 🚀 **CLI Interface**: Easy-to-use command-line interface

## Installation

```bash
npm install @kanopi/wp-ai-indexer
```

Or install globally:

```bash
npm install -g @kanopi/wp-ai-indexer
```

## Requirements

- Node.js >= 18.0.0
- WordPress site with REST API enabled
- WordPress Application Password (recommended for secure authentication)
- OpenAI API key
- Pinecone API key
- WP AI Assistant plugin (provides `/wp-json/ai-assistant/v1/indexer-settings` endpoint)

## Configuration

### Environment Variables

Create a `.env` file in your project root:

```bash
# Required
WP_API_BASE=https://your-wordpress-site.com
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=...

# Authentication (recommended if REST API is restricted)
WP_API_USERNAME=your-admin-username
WP_API_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx  # Application Password

# Optional
WP_AI_SETTINGS_URL=https://your-site.com/wp-json/ai-assistant/v1/indexer-settings
WP_AI_DEBUG=1
WP_AI_TIMEOUT_MS=30000
WP_AI_CONCURRENCY=2
WP_AI_NAMESPACE=
```

### Authentication

The indexer supports WordPress Application Passwords for secure authentication:

1. **Create an Application Password** (WordPress 5.6+):
   ```bash
   wp user application-password create USERNAME "AI Indexer"
   ```
   This returns a password like: `xxxx xxxx xxxx xxxx xxxx xxxx`

2. **Use the Application Password**:
   - Set `WP_API_USERNAME` to your WordPress username
   - Set `WP_API_PASSWORD` to the Application Password (not your regular password)

3. **Security Benefits**:
   - ✅ Revocable without changing main password
   - ✅ Auditable (tracks last used date and IP)
   - ✅ Scoped per application
   - ✅ Compatible with security plugins (Solid Security, etc.)

**Note:** Application Passwords are required if your WordPress site uses security plugins that restrict REST API access.

### WordPress Settings Endpoint

The indexer fetches configuration from WordPress via the shared settings endpoint:

**Endpoint:** `GET /wp-json/ai-assistant/v1/indexer-settings`

**Required Response Fields:**

```json
{
  "schema_version": 1,
  "domain": "your-wordpress-site.com",
  "post_types": ["post", "page"],
  "post_types_exclude": ["attachment", "revision"],
  "auto_discover": false,
  "clean_deleted": false,
  "embedding_model": "text-embedding-3-small",
  "embedding_dimension": 1536,
  "chunk_size": 500,
  "chunk_overlap": 50,
  "pinecone_index_host": "your-index-host.pinecone.io",
  "pinecone_index_name": "your-index-name"
}
```

**Note:** The `domain` field is automatically extracted from `WP_API_BASE` and is used for multi-environment filtering.

## Usage

### WP-CLI Commands (WordPress Plugin Integration)

If you have the WP AI Assistant WordPress plugin installed, you can use WordPress-native commands:

```bash
# Index all content
wp ai-indexer index

# Clean deleted posts
wp ai-indexer clean

# Delete all vectors for domain
wp ai-indexer delete-all

# Show configuration
wp ai-indexer config

# Check system requirements
wp ai-indexer check
```

These commands automatically detect whether you have a local or global installation of the indexer package and use whichever is available.

### Direct CLI Usage

You can also run the indexer directly using npx or the global installation:

| Command | Description | Standard | DDEV |
|---------|-------------|----------|------|
| **Index all content** | Process and index all WordPress content | `npx wp-ai-indexer index` | `ddev exec "cd packages/wp-ai-indexer && npx wp-ai-indexer index"` |
| **Index with debug** | Index with verbose debug output | `npx wp-ai-indexer index --debug` | `ddev exec "cd packages/wp-ai-indexer && npx wp-ai-indexer index --debug"` |
| **Clean deleted** | Remove vectors for deleted posts (see note below) | `npx wp-ai-indexer clean` | `ddev exec "cd packages/wp-ai-indexer && npx wp-ai-indexer clean"` |
| **Delete all** | Delete all vectors for current domain (requires confirmation) | `npx wp-ai-indexer delete-all` | `ddev exec "cd packages/wp-ai-indexer && npx wp-ai-indexer delete-all"` |
| **Delete all (skip confirmation)** | Delete all vectors without confirmation prompt | `npx wp-ai-indexer delete-all --yes` | `ddev exec "cd packages/wp-ai-indexer && npx wp-ai-indexer delete-all --yes"` |
| **Show config** | Display current configuration and verify credentials | `npx wp-ai-indexer config` | `ddev exec "cd packages/wp-ai-indexer && npx wp-ai-indexer config"` |

**Note:** When running in DDEV, environment variables are automatically loaded from `.ddev/config.yaml`. For standard usage, set environment variables in `.env` or export them in your shell.

#### Clean vs Delete All

- **`clean`**: Attempts to identify and remove vectors for deleted posts. Due to Pinecone API limitations, this command currently provides guidance rather than automatic cleaning. The recommended approach is to use `delete-all` followed by `index`.

- **`delete-all`**: Removes ALL vectors for the current domain from the Pinecone index. Use this when you need to completely re-index your content. This command requires confirmation (type "DELETE") unless you use the `--yes` flag.

**Recommended workflow for complete re-indexing:**
```bash
# Delete all vectors for current domain
npx wp-ai-indexer delete-all

# Re-index all content
npx wp-ai-indexer index
```

### Programmatic Usage

```typescript
import { Indexer, IndexerConfig } from '@kanopi/wp-ai-indexer';

const config: IndexerConfig = {
  wpApiBase: 'https://your-wordpress-site.com',
  openaiApiKey: process.env.OPENAI_API_KEY!,
  pineconeApiKey: process.env.PINECONE_API_KEY!,
  wpUsername: process.env.WP_API_USERNAME,      // Optional
  wpPassword: process.env.WP_API_PASSWORD,      // Optional (Application Password)
  debug: true,
};

const indexer = new Indexer(config);
const result = await indexer.index();

console.log('Indexing complete:', result.stats);
```

## Index Schema

The indexer creates vectors with the following metadata:

### Required Metadata

- `post_id` (number): WordPress post ID
- `post_type` (string): WordPress post type
- `title` (string): Post title
- `url` (string): Permalink URL
- `chunk` (string): Text content of this chunk
- `domain` (string): WordPress site domain (for multi-environment filtering)
- `schema_version` (number): Schema version (currently 1)
- `post_date` (string): Post publish date (ISO 8601)
- `post_modified` (string): Post modified date (ISO 8601)
- `author_id` (number): Author ID
- `chunk_index` (number): Chunk index within post

### Optional Metadata

- `category_ids` (string): Comma-separated category IDs
- `tag_ids` (string): Comma-separated tag IDs

### Domain Filtering

The `domain` field enables multi-environment support. The same Pinecone index can store vectors from multiple WordPress environments (development, staging, production) without collision.

**Example Query Filter:**
```javascript
{
  domain: { $eq: "your-production-site.com" }
}
```

This ensures queries from production only return production content, staging queries only return staging content, etc.

## Architecture

The indexer is composed of modular components:

- **SettingsManager**: Fetches and validates WordPress settings
- **WordPressClient**: Fetches posts via REST API
- **Chunker**: Splits content into overlapping chunks
- **EmbeddingsManager**: Creates embeddings with OpenAI
- **PineconeManager**: Manages Pinecone vector operations
- **Indexer**: Orchestrates the full indexing pipeline

## Integration

This indexer is designed to work with the **WP AI Assistant** plugin, which provides:

- **AI Chatbot**: RAG-based conversational AI using indexed content
- **Semantic Search**: AI-powered search using vector similarity
- **Domain Filtering**: Multi-environment support (development, staging, production)

The plugin and indexer share:
- The same Pinecone index
- The same indexer settings endpoint (`/wp-json/ai-assistant/v1/indexer-settings`)
- The same index schema (enforced by `schema_version`)
- Automatic domain-based filtering for multi-environment setups

## Schema Versioning

The indexer enforces schema compatibility:

- **Schema Version 1** (current):
  - Includes `domain` field for multi-environment filtering
  - All metadata fields listed above
  - Character-based chunking
  - OpenAI text-embedding-3-small with configurable dimensions

## Performance

- **Chunking**: ~1000 chunks/second
- **Embeddings**: Limited by OpenAI API rate limits (~3000 RPM)
- **Upserting**: Batched (100 vectors/batch) for optimal Pinecone performance
- **Memory**: Processes posts as a stream to minimize memory usage

## Error Handling

The indexer implements robust error handling:

- ✅ Automatic retries with exponential backoff
- ✅ Continues processing on individual post errors
- ✅ Detailed error reporting
- ✅ Graceful degradation
- ✅ Exit codes suitable for CI/CD

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run watch
```

### Test Locally

```bash
# Set up .env file
cp .env.example .env
# Edit .env with your credentials

# Run indexer
npm run index
```

### DDEV Example

For local development with DDEV:

```bash
# Create Application Password
ddev exec "wp user application-password create admin 'AI Indexer' --porcelain"
# Returns: xxxx xxxx xxxx xxxx xxxx xxxx

# Set environment variables in .ddev/config.yaml:
# web_environment:
#   - WP_API_BASE=https://yoursite.ddev.site
#   - WP_API_USERNAME=admin
#   - WP_API_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
#   - OPENAI_API_KEY=sk-...
#   - PINECONE_API_KEY=...

# Restart DDEV
ddev restart

# Run indexer from inside DDEV container
ddev exec "cd packages/wp-ai-indexer && npx wp-ai-indexer index"
```

## Troubleshooting

### "Built files not found"

Run `npm run build` before using the CLI.

### "Request failed with status code 401"

Authentication is required:

1. Create a WordPress Application Password:
   ```bash
   wp user application-password create USERNAME "AI Indexer"
   ```

2. Set environment variables:
   ```bash
   WP_API_USERNAME=your-username
   WP_API_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
   ```

3. Verify credentials:
   ```bash
   npx wp-ai-indexer config
   ```

### "Failed to fetch settings"

- Ensure WordPress site is accessible
- Verify the settings endpoint exists: `/wp-json/ai-assistant/v1/indexer-settings`
- Check that WP AI Assistant plugin is activated
- If using authentication, verify credentials are correct

### "REST API access restricted"

If using a security plugin (Solid Security, Wordfence, etc.):

- ✅ Use Application Passwords (recommended)
- ✅ Security plugins typically allow Application Password authentication
- ❌ Don't disable REST API security globally

### "Unsupported schema version"

Update the indexer package to support the schema version returned by WordPress.

### "Vector dimension mismatch"

The embedding dimension must match your Pinecone index:

- Check Pinecone index dimension
- Update WordPress plugin settings to match
- Common dimensions: 1536 (text-embedding-3-small), 1024 (custom), 3072 (text-embedding-3-large)

### "Rate limit exceeded"

The indexer includes automatic retry logic. If you consistently hit rate limits:

- Reduce concurrency with `WP_AI_CONCURRENCY`
- Increase timeout with `WP_AI_TIMEOUT_MS`

## License

MIT

## Support

For issues and questions:
- GitHub Issues: [kanopi/wp-ai-indexer](https://github.com/kanopi/wp-ai-indexer/issues)
- Documentation: See README.md
