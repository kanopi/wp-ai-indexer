/**
 * Pinecone Module
 * Manages vector upserts and queries
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { IndexerConfig, IndexerSettings, VectorMetadata } from './types';
import { RateLimiter, retryWithBackoff } from './utils';

interface PineconeVector {
  id: string;
  values: number[];
  metadata: VectorMetadata;
}

export class PineconeManager {
  private client: Pinecone;
  private config: IndexerConfig;
  private settings: IndexerSettings;
  private index: any;
  private upsertCount: number = 0;
  private rateLimiter: RateLimiter;

  constructor(config: IndexerConfig, settings: IndexerSettings) {
    this.config = config;
    this.settings = settings;

    this.client = new Pinecone({
      apiKey: config.pineconeApiKey,
    });

    // Initialize rate limiter for Pinecone
    // Pinecone allows 100 requests per second for most tiers
    this.rateLimiter = new RateLimiter(100);
    this.log('Rate limiter configured: 100 req/s');
  }

  /**
   * Initialize Pinecone index
   */
  async initialize(): Promise<void> {
    try {
      this.log('Initializing Pinecone index:', this.settings.pinecone_index_name);

      this.index = this.client.index(
        this.settings.pinecone_index_name,
        this.settings.pinecone_index_host
      );

      // Test connection
      const stats = await this.index.describeIndexStats();
      this.log('Index stats:', stats);
    } catch (error: any) {
      throw new Error(`Failed to initialize Pinecone: ${error.message}`);
    }
  }

  /**
   * Upsert vectors to Pinecone
   */
  async upsertVectors(vectors: PineconeVector[]): Promise<void> {
    if (vectors.length === 0) {
      return;
    }

    const batchSize = 100; // Pinecone recommended batch size
    const batches: PineconeVector[][] = [];

    // Split into batches
    for (let i = 0; i < vectors.length; i += batchSize) {
      batches.push(vectors.slice(i, i + batchSize));
    }

    // Upsert batches with rate limiting and retry logic
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.log(`Upserting batch ${i + 1}/${batches.length} (${batch.length} vectors)`);

      try {
        // Apply rate limiting
        await this.rateLimiter.acquire(1);

        // Upsert with retry logic
        await retryWithBackoff(async () => {
          const namespace = this.config.namespace || '';
          await this.index.namespace(namespace).upsert(batch);
        }, 3, 1000, 30000);

        this.upsertCount += batch.length;
      } catch (error: any) {
        console.error(`Failed to upsert batch ${i + 1} after retries:`, error.message);
        throw error;
      }
    }
  }

  /**
   * Create a vector ID from post ID and chunk index
   */
  createVectorId(postId: number, chunkIndex: number): string {
    return `post-${postId}-chunk-${chunkIndex}`;
  }

  /**
   * Create a Pinecone vector object
   */
  createVector(
    postId: number,
    chunkIndex: number,
    embedding: number[],
    metadata: Omit<VectorMetadata, 'chunk_index'>
  ): PineconeVector {
    const vectorId = this.createVectorId(postId, chunkIndex);

    return {
      id: vectorId,
      values: embedding,
      metadata: {
        ...metadata,
        chunk_index: chunkIndex,
      },
    };
  }

  /**
   * Delete vectors by their IDs
   */
  async deleteByVectorIds(vectorIds: string[]): Promise<void> {
    if (vectorIds.length === 0) {
      return;
    }

    this.log(`Deleting ${vectorIds.length} vectors by ID`);

    try {
      const namespace = this.config.namespace || '';

      // Delete in batches to avoid API limits
      const batchSize = 1000;
      const batches: string[][] = [];

      for (let i = 0; i < vectorIds.length; i += batchSize) {
        batches.push(vectorIds.slice(i, i + batchSize));
      }

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        this.log(`Deleting batch ${i + 1}/${batches.length} (${batch.length} vectors)`);

        await this.index.namespace(namespace).deleteMany(batch);

        // Small delay between batches
        if (i < batches.length - 1) {
          await this.delay(100);
        }
      }

      this.log(`Deleted ${vectorIds.length} vectors`);
    } catch (error: any) {
      console.error('Failed to delete vectors:', error.message);
      throw error;
    }
  }

  /**
   * Delete vectors for specific post IDs
   */
  async deleteByPostIds(postIds: number[]): Promise<void> {
    if (postIds.length === 0) {
      return;
    }

    this.log(`Deleting vectors for ${postIds.length} posts`);

    try {
      const namespace = this.config.namespace || '';

      // Delete by metadata filter
      await this.index.namespace(namespace).deleteMany({
        filter: {
          post_id: { $in: postIds },
          domain: { $eq: this.settings.domain },
        },
      });

      this.log(`Deleted vectors for posts: ${postIds.join(', ')}`);
    } catch (error: any) {
      console.error('Failed to delete vectors:', error.message);
      throw error;
    }
  }

  /**
   * Delete all vectors for the current domain
   */
  async deleteAllForDomain(): Promise<void> {
    this.log(`Deleting all vectors for domain: ${this.settings.domain}`);

    try {
      // List all vector IDs for this domain
      const vectorIds = await this.listVectorIdsForDomain();

      if (vectorIds.length === 0) {
        this.log('No vectors found for this domain');
        return;
      }

      this.log(`Found ${vectorIds.length} vectors to delete`);

      // Delete by vector IDs
      await this.deleteByVectorIds(vectorIds);

      this.log(`Deleted all vectors for domain: ${this.settings.domain}`);
    } catch (error: any) {
      console.error('Failed to delete vectors:', error.message);
      throw error;
    }
  }

  /**
   * List all vector IDs for the current domain
   * Returns an array of vector IDs
   */
  async listVectorIdsForDomain(): Promise<string[]> {
    try {
      const namespace = this.config.namespace || '';
      const vectorIds: string[] = [];

      this.log('Listing all vectors for domain:', this.settings.domain);

      // Use listPaginated to enumerate all vectors with domain filter
      let paginationToken: string | undefined = undefined;

      while (true) {
        const listResponse: any = await this.index.namespace(namespace).listPaginated({
          limit: 100,
          paginationToken,
        });

        if (listResponse.vectors && listResponse.vectors.length > 0) {
          // Filter vectors by domain using fetch (we need to get metadata)
          const vectorIdsToFetch = listResponse.vectors.map((v: any) => v.id);

          // Fetch vectors to get their metadata
          const fetchResponse = await this.index.namespace(namespace).fetch(vectorIdsToFetch);

          // Filter by domain
          for (const [id, vector] of Object.entries(fetchResponse.records || {})) {
            const metadata = (vector as any).metadata;
            if (metadata && metadata.domain === this.settings.domain) {
              vectorIds.push(id);
            }
          }

          this.log(`Found ${vectorIds.length} vectors so far...`);
        }

        // Check if there are more results
        if (listResponse.pagination?.next) {
          paginationToken = listResponse.pagination.next;
        } else {
          break;
        }
      }

      this.log(`Total vectors for domain ${this.settings.domain}: ${vectorIds.length}`);
      return vectorIds;
    } catch (error: any) {
      console.error('Failed to list vector IDs:', error.message);
      throw error;
    }
  }

  /**
   * Query vectors (for testing/validation)
   */
  async query(
    vector: number[],
    topK: number = 10,
    filter?: Record<string, any>
  ): Promise<any> {
    try {
      const namespace = this.config.namespace || '';

      const queryRequest: any = {
        vector,
        topK,
        includeMetadata: true,
      };

      if (filter) {
        queryRequest.filter = filter;
      }

      const results = await this.index.namespace(namespace).query(queryRequest);
      return results;
    } catch (error: any) {
      console.error('Query failed:', error.message);
      throw error;
    }
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<any> {
    try {
      return await this.index.describeIndexStats();
    } catch (error: any) {
      console.error('Failed to get stats:', error.message);
      throw error;
    }
  }

  /**
   * Get upsert count
   */
  getUpsertCount(): number {
    return this.upsertCount;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[Pinecone]', ...args);
    }
  }
}
