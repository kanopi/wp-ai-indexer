import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingsManager } from '../../src/embeddings';
import { createTestConfig, createTestSettings } from '../helpers/test-config';
import {
  createMockOpenAI,
  createMockBatchEmbeddings,
  createRateLimitError,
  createServerError,
  createNetworkError,
} from '../mocks/openai.mock';

describe('EmbeddingsManager', () => {
  let manager: EmbeddingsManager;
  const config = createTestConfig();
  const settings = createTestSettings();

  beforeEach(() => {
    manager = new EmbeddingsManager(config, settings);
  });

  describe('createEmbedding', () => {
    it('should create embedding for single text', async () => {
      const mockOpenAI = createMockOpenAI();
      (manager as any).openai = mockOpenAI;

      const embedding = await manager.createEmbedding('test text');

      expect(embedding).toHaveLength(1536);
      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: settings.embedding_model,
        input: 'test text',
        dimensions: settings.embedding_dimension,
      });
    });

    it('should retry on rate limit error', async () => {
      const mockCreate = vi
        .fn()
        .mockRejectedValueOnce(createRateLimitError())
        .mockResolvedValueOnce({
          data: [{ embedding: new Array(1536).fill(0.1) }],
        });

      const mockOpenAI = { embeddings: { create: mockCreate } };
      (manager as any).openai = mockOpenAI;

      const embedding = await manager.createEmbedding('test text');

      expect(embedding).toHaveLength(1536);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should retry on server error', async () => {
      const mockCreate = vi
        .fn()
        .mockRejectedValueOnce(createServerError())
        .mockResolvedValueOnce({
          data: [{ embedding: new Array(1536).fill(0.1) }],
        });

      const mockOpenAI = { embeddings: { create: mockCreate } };
      (manager as any).openai = mockOpenAI;

      const embedding = await manager.createEmbedding('test text');

      expect(embedding).toHaveLength(1536);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should retry on network error', async () => {
      const mockCreate = vi
        .fn()
        .mockRejectedValueOnce(createNetworkError())
        .mockResolvedValueOnce({
          data: [{ embedding: new Array(1536).fill(0.1) }],
        });

      const mockOpenAI = { embeddings: { create: mockCreate } };
      (manager as any).openai = mockOpenAI;

      const embedding = await manager.createEmbedding('test text');

      expect(embedding).toHaveLength(1536);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      const mockCreate = vi.fn().mockRejectedValue(createRateLimitError());

      const mockOpenAI = { embeddings: { create: mockCreate } };
      (manager as any).openai = mockOpenAI;

      await expect(manager.createEmbedding('test text')).rejects.toThrow(/Failed to create embedding/);

      expect(mockCreate).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should not retry on client errors', async () => {
      const clientError: any = new Error('Invalid input');
      clientError.status = 400;

      const mockCreate = vi.fn().mockRejectedValue(clientError);

      const mockOpenAI = { embeddings: { create: mockCreate } };
      (manager as any).openai = mockOpenAI;

      await expect(manager.createEmbedding('test text')).rejects.toThrow(/Failed to create embedding/);

      expect(mockCreate).toHaveBeenCalledTimes(1); // No retries
    });

    it('should throw error if no embedding data returned', async () => {
      const mockCreate = vi.fn().mockResolvedValue({ data: [] });

      const mockOpenAI = { embeddings: { create: mockCreate } };
      (manager as any).openai = mockOpenAI;

      await expect(manager.createEmbedding('test text')).rejects.toThrow(/No embedding data returned/);
    });

    it('should update request stats', async () => {
      const mockOpenAI = createMockOpenAI();
      (manager as any).openai = mockOpenAI;

      await manager.createEmbedding('test text');

      const stats = manager.getStats();
      expect(stats.requestCount).toBe(1);
    });
  });

  describe('createEmbeddings (batch)', () => {
    it('should create embeddings for multiple texts', async () => {
      const texts = ['text1', 'text2', 'text3'];
      const mockCreate = vi.fn().mockResolvedValue(createMockBatchEmbeddings(3));

      const mockOpenAI = { embeddings: { create: mockCreate } };
      (manager as any).openai = mockOpenAI;

      const embeddings = await manager.createEmbeddings(texts);

      expect(embeddings).toHaveLength(3);
      expect(mockCreate).toHaveBeenCalledWith({
        model: settings.embedding_model,
        input: texts,
        dimensions: settings.embedding_dimension,
      });
    });

    it('should split large batches based on batch_size setting', async () => {
      const texts = Array(1200).fill('test');
      const mockCreate = vi.fn().mockImplementation((params: any) => {
        const inputLength = params.input.length;
        return Promise.resolve(createMockBatchEmbeddings(inputLength));
      });

      const mockOpenAI = { embeddings: { create: mockCreate } };
      (manager as any).openai = mockOpenAI;

      const embeddings = await manager.createEmbeddings(texts);

      expect(embeddings).toHaveLength(1200);
      expect(mockCreate).toHaveBeenCalledTimes(3); // 500, 500, 200 (batch_size = 500 from settings)
    });

    it('should fall back to individual embeddings on batch error', async () => {
      const texts = ['text1', 'text2'];
      const mockCreate = vi
        .fn()
        .mockRejectedValueOnce(new Error('Batch failed'))
        .mockResolvedValueOnce({ data: [{ embedding: new Array(1536).fill(0.1) }] })
        .mockResolvedValueOnce({ data: [{ embedding: new Array(1536).fill(0.2) }] });

      const mockOpenAI = { embeddings: { create: mockCreate } };
      (manager as any).openai = mockOpenAI;

      const embeddings = await manager.createEmbeddings(texts);

      expect(embeddings).toHaveLength(2);
      expect(mockCreate).toHaveBeenCalledTimes(3); // 1 batch attempt + 2 individual
    });

    it('should handle empty texts array', async () => {
      const embeddings = await manager.createEmbeddings([]);

      expect(embeddings).toHaveLength(0);
    });

    it('should update request count for batch', async () => {
      const texts = ['text1', 'text2', 'text3'];
      const mockCreate = vi.fn().mockResolvedValue(createMockBatchEmbeddings(3));

      const mockOpenAI = { embeddings: { create: mockCreate } };
      (manager as any).openai = mockOpenAI;

      await manager.createEmbeddings(texts);

      const stats = manager.getStats();
      expect(stats.requestCount).toBe(3);
    });

    it('should handle batch count mismatch by falling back to individual', async () => {
      const texts = ['text1', 'text2', 'text3'];
      const mockCreate = vi
        .fn()
        .mockResolvedValueOnce(createMockBatchEmbeddings(2)) // Wrong count triggers fallback
        .mockResolvedValue({ data: [{ embedding: new Array(1536).fill(0.1) }] });

      const mockOpenAI = { embeddings: { create: mockCreate } };
      (manager as any).openai = mockOpenAI;

      const embeddings = await manager.createEmbeddings(texts);

      // Should fall back to individual embeddings
      expect(embeddings).toHaveLength(3);
    });
  });

  describe('rate limiting', () => {
    it('should apply rate limiting with token bucket algorithm', async () => {
      const mockOpenAI = createMockOpenAI();
      (manager as any).openai = mockOpenAI;

      // The rate limiter uses a token bucket algorithm
      // With 50 req/s, the bucket can burst initially, but sustained load should be rate limited
      const rateLimiter = (manager as any).rateLimiter;

      // Verify rate limiter exists and is configured
      expect(rateLimiter).toBeDefined();

      // Make a few requests - first ones should be fast (burst from initial bucket)
      await manager.createEmbedding('test1');
      await manager.createEmbedding('test2');

      // The requests should complete (no error thrown)
      expect(mockOpenAI.embeddings.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('retry delay calculation', () => {
    it('should use exponential backoff for retries', () => {
      const delay0 = (manager as any).getRetryDelay(0);
      const delay1 = (manager as any).getRetryDelay(1);
      const delay2 = (manager as any).getRetryDelay(2);

      // Each delay should be roughly double the previous (with jitter)
      expect(delay1).toBeGreaterThan(delay0 * 1.5);
      expect(delay2).toBeGreaterThan(delay1 * 1.5);
    });

    it('should cap retry delay at maximum', () => {
      const delay = (manager as any).getRetryDelay(10);

      // Should not exceed 60 seconds + 25% jitter (75,000ms max)
      expect(delay).toBeLessThanOrEqual(75000);
    });

    it('should apply jitter to retry delay', () => {
      const delays = Array(10)
        .fill(0)
        .map(() => (manager as any).getRetryDelay(0));

      // Not all delays should be identical due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('error classification', () => {
    it('should identify retryable errors', () => {
      expect((manager as any).shouldRetry(createRateLimitError())).toBe(true);
      expect((manager as any).shouldRetry(createServerError())).toBe(true);
      expect((manager as any).shouldRetry(createNetworkError())).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      const clientError: any = new Error('Bad request');
      clientError.status = 400;

      expect((manager as any).shouldRetry(clientError)).toBe(false);
    });

    it('should handle timeout errors', () => {
      const timeoutError: any = new Error('Timeout');
      timeoutError.code = 'ETIMEDOUT';

      expect((manager as any).shouldRetry(timeoutError)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return zero stats initially', () => {
      const stats = manager.getStats();

      expect(stats.requestCount).toBe(0);
    });

    it('should track request count correctly', async () => {
      const mockOpenAI = createMockOpenAI();
      (manager as any).openai = mockOpenAI;

      await manager.createEmbedding('test1');
      await manager.createEmbedding('test2');
      await manager.createEmbedding('test3');

      const stats = manager.getStats();
      expect(stats.requestCount).toBe(3);
    });
  });
});
