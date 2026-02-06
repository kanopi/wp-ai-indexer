/**
 * Settings Module
 * Fetches and validates indexer settings from WordPress
 */

import axios from 'axios';
import { IndexerSettings, IndexerConfig, CURRENT_SCHEMA_VERSION } from './types';

const SUPPORTED_SCHEMA_VERSIONS = [1];

export class SettingsManager {
  private config: IndexerConfig;
  private cachedSettings?: IndexerSettings;

  constructor(config: IndexerConfig) {
    this.config = config;
  }

  /**
   * Fetch settings from WordPress
   */
  async fetchSettings(): Promise<IndexerSettings> {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    const settingsUrl = this.config.settingsUrl ||
      `${this.config.wpApiBase}/wp-json/semantic-knowledge/v1/indexer-settings`;

    try {
      this.log('Fetching indexer settings from:', settingsUrl);

      const requestConfig: any = {
        timeout: this.config.timeout || 30000,
        headers: {
          'User-Agent': '@kanopi/wp-ai-indexer',
        },
      };

      // Add API key header if provided (recommended for CI/CD)
      const indexerKey = process.env.WP_AI_INDEXER_KEY || this.config.indexerApiKey;
      if (indexerKey) {
        requestConfig.headers['X-WP-Indexer-Key'] = indexerKey;
      }

      // Add Basic Auth if credentials provided (fallback)
      if (this.config.wpUsername && this.config.wpPassword) {
        requestConfig.auth = {
          username: this.config.wpUsername,
          password: this.config.wpPassword,
        };
      }

      const response = await axios.get(settingsUrl, requestConfig);

      // Extract domain from wp_api_base
      const domain = new URL(this.config.wpApiBase).hostname;

      const settings = this.validateSettings(response.data, domain);
      this.cachedSettings = settings;

      this.log('Settings loaded successfully');
      this.logSettings(settings);

      return settings;
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `Failed to fetch settings from ${settingsUrl}: ${error.response.status} ${error.response.statusText}`
        );
      } else if (error.request) {
        throw new Error(
          `Failed to connect to ${settingsUrl}: ${error.message}`
        );
      } else {
        throw new Error(`Settings fetch error: ${error.message}`);
      }
    }
  }

  /**
   * Validate and coerce settings
   */
  private validateSettings(data: any, domain: string): IndexerSettings {
    // Required fields
    const required = [
      'schema_version',
      'post_types',
      'embedding_model',
      'embedding_dimension',
      'chunk_size',
      'chunk_overlap',
      'pinecone_index_host',
      'pinecone_index_name',
    ];

    for (const field of required) {
      if (data[field] === undefined || data[field] === null) {
        throw new Error(`Missing required setting: ${field}`);
      }
    }

    // Validate schema version
    const schemaVersion = parseInt(data.schema_version, 10);
    if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)) {
      throw new Error(
        `Unsupported schema version ${schemaVersion}. ` +
        `Supported versions: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`
      );
    }

    // Coerce and validate types
    const settings: IndexerSettings = {
      schema_version: schemaVersion,
      post_types: Array.isArray(data.post_types) ? data.post_types : [],
      post_types_exclude: Array.isArray(data.post_types_exclude) ? data.post_types_exclude : [],
      auto_discover: Boolean(data.auto_discover),
      clean_deleted: Boolean(data.clean_deleted),
      embedding_model: String(data.embedding_model),
      embedding_dimension: parseInt(data.embedding_dimension, 10),
      chunk_size: parseInt(data.chunk_size, 10),
      chunk_overlap: parseInt(data.chunk_overlap, 10),
      pinecone_index_host: String(data.pinecone_index_host),
      pinecone_index_name: String(data.pinecone_index_name),
      domain: domain,
    };

    // Validate numeric ranges
    if (settings.embedding_dimension < 1 || settings.embedding_dimension > 10000) {
      throw new Error(`Invalid embedding_dimension: ${settings.embedding_dimension}`);
    }

    if (settings.chunk_size < 100 || settings.chunk_size > 10000) {
      throw new Error(`Invalid chunk_size: ${settings.chunk_size}`);
    }

    if (settings.chunk_overlap < 0 || settings.chunk_overlap >= settings.chunk_size) {
      throw new Error(`Invalid chunk_overlap: ${settings.chunk_overlap}`);
    }

    // Validate Pinecone config
    if (!settings.pinecone_index_host || !settings.pinecone_index_name) {
      throw new Error('Pinecone index host and name must be configured');
    }

    return settings;
  }

  /**
   * Provide default settings (fallback)
   */
  static getDefaults(): Partial<IndexerSettings> {
    return {
      schema_version: CURRENT_SCHEMA_VERSION,
      post_types: ['post', 'page'],
      post_types_exclude: [
        'attachment',
        'revision',
        'nav_menu_item',
        'customize_changeset',
        'custom_css',
        'oembed_cache',
        'user_request',
        'wp_block',
        'wp_template',
        'wp_template_part',
        'wp_navigation',
      ],
      auto_discover: false,
      clean_deleted: false,
      embedding_model: 'text-embedding-3-small',
      embedding_dimension: 1536,
      chunk_size: 500,
      chunk_overlap: 50,
    };
  }

  /**
   * Log settings (for debugging)
   */
  private logSettings(settings: IndexerSettings): void {
    if (!this.config.debug) return;

    console.log('\n=== Indexer Settings ===');
    console.log(`Schema Version: ${settings.schema_version}`);
    console.log(`Domain: ${settings.domain}`);
    console.log(`Post Types: ${settings.post_types.join(', ')}`);
    console.log(`Excluded: ${settings.post_types_exclude.join(', ')}`);
    console.log(`Auto Discover: ${settings.auto_discover}`);
    console.log(`Clean Deleted: ${settings.clean_deleted}`);
    console.log(`Embedding Model: ${settings.embedding_model}`);
    console.log(`Embedding Dimension: ${settings.embedding_dimension}`);
    console.log(`Chunk Size: ${settings.chunk_size}`);
    console.log(`Chunk Overlap: ${settings.chunk_overlap}`);
    console.log(`Pinecone Index: ${settings.pinecone_index_name}`);
    console.log(`Pinecone Host: ${settings.pinecone_index_host}`);
    console.log('========================\n');
  }

  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[Settings]', ...args);
    }
  }
}
