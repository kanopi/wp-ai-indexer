/**
 * Embeddings Module
 * Creates embeddings using OpenAI with retries and rate limiting
 */

import OpenAI from 'openai';
import { IndexerConfig, IndexerSettings } from './types';
import { RateLimiter, CircuitBreaker } from './utils';

export class EmbeddingsManager {
  private openai: OpenAI;
  private config: IndexerConfig;
  private settings: IndexerSettings;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;

  constructor(config: IndexerConfig, settings: IndexerSettings) {
    this.config = config;
    this.settings = settings;
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });

    // Initialize rate limiter
    // OpenAI allows 3000 requests per minute for most tiers
    // We use 50 requests per second (3000/60) as default
    const requestsPerSecond = config.rateLimit || 50;
    this.rateLimiter = new RateLimiter(requestsPerSecond);

    // Initialize circuit breaker
    // Opens after 5 consecutive failures, resets after 60 seconds
    this.circuitBreaker = new CircuitBreaker(5, 60000);

    this.log(`Rate limiter configured: ${requestsPerSecond} req/s`);
  }

  /**
   * Create embedding for a single text
   */
  async createEmbedding(text: string): Promise<number[]> {
    return this.createEmbeddingWithRetry(text, 3);
  }

  /**
   * Create embeddings for multiple texts (batch) with parallel processing
   * OpenAI supports up to 2048 inputs per request
   * We use a more conservative batch size to avoid token limits
   */
  async createEmbeddings(texts: string[]): Promise<number[][]> {
    // Use larger batch size - OpenAI supports up to 2048 inputs
    // We use 500 as a safe default to avoid token limit issues
    const maxBatchSize = this.settings.batch_size || 500;
    const maxConcurrentBatches = 3; // Process up to 3 batches in parallel
    const batches: string[][] = [];

    // Split into batches
    for (let i = 0; i < texts.length; i += maxBatchSize) {
      batches.push(texts.slice(i, i + maxBatchSize));
    }

    this.log(`Processing ${texts.length} texts in ${batches.length} batches (batch size: ${maxBatchSize})`);

    // Process batches in parallel with concurrency control
    const allEmbeddings = await this.processBatchesWithConcurrency(
      batches,
      maxConcurrentBatches
    );

    return allEmbeddings.flat();
  }

  /**
   * Process batches with controlled concurrency
   */
  private async processBatchesWithConcurrency(
    batches: string[][],
    maxConcurrency: number
  ): Promise<number[][][]> {
    const results: number[][][] = [];
    const executing: Promise<void>[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      // Create promise for this batch
      const promise = this.createBatchEmbeddings(batch).then(embeddings => {
        results[i] = embeddings;
      });

      // Add to executing queue
      executing.push(promise);

      // If we've reached max concurrency, wait for one to complete
      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
        // Remove completed promises
        const completedIndex = executing.findIndex(
          p => results[i] !== undefined
        );
        if (completedIndex >= 0) {
          executing.splice(completedIndex, 1);
        }
      }
    }

    // Wait for all remaining batches to complete
    await Promise.all(executing);

    return results;
  }

  /**
   * Create embeddings with retry logic and circuit breaker
   */
  private async createEmbeddingWithRetry(
    text: string,
    maxRetries: number,
    retryCount: number = 0
  ): Promise<number[]> {
    try {
      // Rate limiting: wait if needed
      await this.rateLimit();

      this.log(`Creating embedding (attempt ${retryCount + 1}/${maxRetries + 1})`);

      // Use circuit breaker to protect against cascading failures
      const response = await this.circuitBreaker.execute(async () => {
        return await this.openai.embeddings.create({
          model: this.settings.embedding_model,
          input: text,
          dimensions: this.settings.embedding_dimension,
        });
      });

      this.requestCount++;
      this.lastRequestTime = Date.now();

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data returned');
      }

      return response.data[0].embedding;
    } catch (error: any) {
      // Check if circuit breaker is open
      if (error.message === 'Circuit breaker is open') {
        this.log(`Circuit breaker is open, waiting before retry`);
        // Wait a bit before retrying
        await this.delay(5000);
      }

      // Check if we should retry
      if (retryCount < maxRetries && this.shouldRetry(error)) {
        const delay = this.getRetryDelay(retryCount);
        this.log(`Retrying after ${delay}ms due to error:`, error.message);
        await this.delay(delay);
        return this.createEmbeddingWithRetry(text, maxRetries, retryCount + 1);
      }

      // Re-throw if no more retries
      throw new Error(`Failed to create embedding: ${error.message}`);
    }
  }

  /**
   * Create batch embeddings
   */
  private async createBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      await this.rateLimit();

      this.log(`Creating batch embeddings for ${texts.length} texts`);

      const response = await this.openai.embeddings.create({
        model: this.settings.embedding_model,
        input: texts,
        dimensions: this.settings.embedding_dimension,
      });

      this.requestCount += texts.length;
      this.lastRequestTime = Date.now();

      if (!response.data || response.data.length !== texts.length) {
        throw new Error('Batch embedding count mismatch');
      }

      return response.data.map(item => item.embedding);
    } catch (error: any) {
      // Fall back to individual embeddings on batch error
      console.warn('Batch embedding failed, falling back to individual:', error.message);
      const embeddings: number[][] = [];

      for (const text of texts) {
        const embedding = await this.createEmbedding(text);
        embeddings.push(embedding);
      }

      return embeddings;
    }
  }

  /**
   * Rate limiting using token bucket algorithm
   */
  private async rateLimit(): Promise<void> {
    // Acquire token from rate limiter
    await this.rateLimiter.acquire(1);
  }

  /**
   * Determine if error is retryable
   */
  private shouldRetry(error: any): boolean {
    // Retry on rate limit, timeout, or server errors
    if (error.status) {
      return error.status === 429 || error.status >= 500;
    }

    // Retry on network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }

    return false;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private getRetryDelay(retryCount: number): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 60000; // 60 seconds

    const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);

    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() - 0.5);

    return Math.floor(delay + jitter);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get embedding stats
   */
  getStats(): { requestCount: number } {
    return {
      requestCount: this.requestCount,
    };
  }

  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[Embeddings]', ...args);
    }
  }
}
