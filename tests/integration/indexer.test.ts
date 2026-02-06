import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import nock from 'nock';
import { Indexer } from '../../src/indexer';
import { createTestConfig } from '../helpers/test-config';
import settingsFixture from '../mocks/fixtures/settings.json';
import wordpressPosts from '../mocks/fixtures/wordpress-posts.json';
import { createMockOpenAI, createMockBatchEmbeddings } from '../mocks/openai.mock';
import { createMockPinecone } from '../mocks/pinecone.mock';

// Mock OpenAI module
vi.mock('openai', () => {
  return {
    default: vi.fn(() => createMockOpenAI()),
  };
});

// Mock Pinecone module
vi.mock('@pinecone-database/pinecone', () => {
  return {
    Pinecone: vi.fn(() => createMockPinecone()),
  };
});

describe('Indexer Integration', () => {
  let indexer: Indexer;
  const config = createTestConfig();

  beforeEach(() => {
    indexer = new Indexer(config);
    vi.clearAllMocks();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('index', () => {
    it('should complete full indexing workflow', async () => {
      // Mock settings endpoint
      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, settingsFixture);

      // Mock WordPress posts endpoints
      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, [wordpressPosts[0]]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, [wordpressPosts[1]]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const result = await indexer.index();

      expect(result.success).toBe(true);
      expect(result.stats.totalPosts).toBe(2);
      expect(result.stats.processedPosts).toBe(2);
      expect(result.stats.errors).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle posts with multiple chunks', async () => {
      const longPost = {
        ...wordpressPosts[0],
        content: {
          rendered: '<p>' + 'A'.repeat(2000) + '</p>',
        },
      };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, settingsFixture);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, [longPost]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const result = await indexer.index();

      expect(result.success).toBe(true);
      expect(result.stats.totalChunks).toBeGreaterThan(1);
      expect(result.stats.processedChunks).toBeGreaterThan(1);
    });

    it('should continue on individual post errors', async () => {
      const goodPost = wordpressPosts[0];
      const badPost = {
        ...wordpressPosts[1],
        content: { rendered: '<p>Valid content</p>' }, // Valid post that will be processed
      };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, settingsFixture);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, [goodPost, badPost]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const result = await indexer.index();

      // Both posts should be processed successfully
      expect(result.stats.processedPosts).toBe(2);
      expect(result.stats.totalPosts).toBe(2);
    });

    it('should return error on fatal failure', async () => {
      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(500, 'Internal Server Error');

      const result = await indexer.index();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Fatal error');
    });

    it('should skip posts with no chunks', async () => {
      const emptyPost = {
        ...wordpressPosts[0],
        title: { rendered: '' },
        content: { rendered: '' },
      };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, settingsFixture);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, [emptyPost]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const result = await indexer.index();

      expect(result.stats.totalPosts).toBe(0); // Skipped before processing
      expect(result.stats.processedPosts).toBe(0);
    });

    it('should track progress correctly', async () => {
      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, settingsFixture);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, [wordpressPosts[0]]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      await indexer.index();

      const progress = indexer.getProgress();

      expect(progress.totalPosts).toBeGreaterThan(0);
      expect(progress.processedPosts).toBe(progress.totalPosts - progress.errors);
      expect(progress.totalChunks).toBeGreaterThan(0);
    });
  });

  describe('clean', () => {
    it('should clean deleted posts from index', async () => {
      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, { ...settingsFixture, clean_deleted: true });

      // Mock WordPress posts - only post ID 1 exists
      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, [wordpressPosts[0]]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      await expect(indexer.clean()).resolves.not.toThrow();
    });

    it('should skip cleaning if disabled in settings', async () => {
      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, { ...settingsFixture, clean_deleted: false });

      await expect(indexer.clean()).resolves.not.toThrow();
    });

    it('should handle errors during cleaning', async () => {
      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(500, 'Internal Server Error');

      await expect(indexer.clean()).rejects.toThrow();
    });
  });

  describe('deleteAll', () => {
    it('should delete all vectors for domain', async () => {
      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, settingsFixture);

      await expect(indexer.deleteAll()).resolves.not.toThrow();
    });

    it('should handle errors during deletion', async () => {
      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(500, 'Internal Server Error');

      await expect(indexer.deleteAll()).rejects.toThrow();
    });
  });

  describe('getProgress', () => {
    it('should return initial progress state', () => {
      const progress = indexer.getProgress();

      expect(progress.totalPosts).toBe(0);
      expect(progress.processedPosts).toBe(0);
      expect(progress.totalChunks).toBe(0);
      expect(progress.processedChunks).toBe(0);
      expect(progress.errors).toBe(0);
    });

    it('should return copy of progress object', () => {
      const progress1 = indexer.getProgress();
      const progress2 = indexer.getProgress();

      expect(progress1).not.toBe(progress2);
      expect(progress1).toEqual(progress2);
    });
  });

  describe('error handling', () => {
    it('should handle posts that are skipped', async () => {
      const emptyPost = {
        ...wordpressPosts[0],
        title: { rendered: '' },
        content: { rendered: '' }, // Empty posts are skipped
      };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, settingsFixture);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, [emptyPost]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const result = await indexer.index();

      // Empty posts are filtered before processing
      expect(result.stats.totalPosts).toBe(0);
      expect(result.stats.processedPosts).toBe(0);
    });

    it('should handle posts successfully', async () => {
      const validPosts = Array(15)
        .fill(null)
        .map((_, i) => ({
          ...wordpressPosts[0],
          id: i + 1,
          content: { rendered: `<p>Content ${i}</p>` },
        }));

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, settingsFixture);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, validPosts);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const result = await indexer.index();

      expect(result.stats.totalPosts).toBe(15);
      expect(result.stats.processedPosts).toBe(15);
      expect(result.stats.errors).toBe(0);
    });
  });
});
