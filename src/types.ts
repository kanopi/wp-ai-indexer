/**
 * Type definitions for the WP AI Indexer
 */

export const CURRENT_SCHEMA_VERSION = 1;

export interface IndexerSettings {
  schema_version: number;
  post_types: string[];
  post_types_exclude: string[];
  auto_discover: boolean;
  clean_deleted: boolean;
  embedding_model: string;
  embedding_dimension: number;
  chunk_size: number;
  chunk_overlap: number;
  pinecone_index_host: string;
  pinecone_index_name: string;
  domain: string;
  batch_size?: number; // Batch size for embedding requests (default: 500)
}

export interface WordPressPost {
  id: number;
  type: string;
  date: string;
  modified: string;
  slug: string;
  status: string;
  link: string;
  title: {
    rendered: string;
  };
  content: {
    rendered: string;
  };
  excerpt: {
    rendered: string;
  };
  author: number;
  categories?: number[];
  tags?: number[];
  [key: string]: any;
}

export interface ProcessedDocument {
  id: number;
  type: string;
  title: string;
  content: string;
  url: string;
  date: string;
  modified: string;
  author_id: number;
  category_ids?: number[];
  tag_ids?: number[];
}

export interface Chunk {
  text: string;
  index: number;
}

export interface VectorMetadata {
  post_id: number;
  post_type: string;
  title: string;
  url: string;
  chunk: string;
  domain: string;
  schema_version: number;
  post_date: string;
  post_modified: string;
  author_id: number;
  category_ids?: string;
  tag_ids?: string;
  chunk_index: number;
  content_hash?: string; // Hash of content for cache invalidation
}

export interface IndexerConfig {
  wpApiBase: string;
  openaiApiKey: string;
  pineconeApiKey: string;
  indexerApiKey?: string;
  wpUsername?: string;
  wpPassword?: string;
  settingsUrl?: string;
  debug?: boolean;
  timeout?: number;
  concurrency?: number;
  namespace?: string;
  rateLimit?: number; // Requests per second for OpenAI API (default: 50)
}

export interface IndexingProgress {
  totalPosts: number;
  processedPosts: number;
  totalChunks: number;
  processedChunks: number;
  errors: number;
}

export interface IndexingResult {
  success: boolean;
  stats: IndexingProgress;
  errors: Array<{
    post_id?: number;
    message: string;
    error?: any;
  }>;
}
