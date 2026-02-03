import { IndexerConfig, IndexerSettings } from '../../src/types';

/**
 * Test configuration for indexer
 */
export const createTestConfig = (overrides?: Partial<IndexerConfig>): IndexerConfig => {
  return {
    wpApiBase: 'https://test.example.com',
    openaiApiKey: 'test-openai-key',
    pineconeApiKey: 'test-pinecone-key',
    debug: false,
    timeout: 5000,
    ...overrides,
  };
};

/**
 * Test settings for indexer
 */
export const createTestSettings = (overrides?: Partial<IndexerSettings>): IndexerSettings => {
  return {
    schema_version: 1,
    post_types: ['post', 'page'],
    post_types_exclude: ['attachment', 'revision'],
    auto_discover: false,
    clean_deleted: false,
    embedding_model: 'text-embedding-3-small',
    embedding_dimension: 1536,
    chunk_size: 500,
    chunk_overlap: 50,
    pinecone_index_host: 'https://test-index.pinecone.io',
    pinecone_index_name: 'test-index',
    domain: 'test.example.com',
    ...overrides,
  };
};
