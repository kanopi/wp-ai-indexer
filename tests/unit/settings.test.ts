import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { SettingsManager } from '../../src/settings';
import { createTestConfig } from '../helpers/test-config';
import settingsFixture from '../mocks/fixtures/settings.json';

describe('SettingsManager', () => {
  let manager: SettingsManager;
  const config = createTestConfig();

  beforeEach(() => {
    manager = new SettingsManager(config);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('fetchSettings', () => {
    it('should fetch and validate settings from WordPress', async () => {
      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, settingsFixture);

      const settings = await manager.fetchSettings();

      expect(settings.schema_version).toBe(1);
      expect(settings.post_types).toEqual(['post', 'page']);
      expect(settings.embedding_model).toBe('text-embedding-3-small');
      expect(settings.domain).toBe('test.example.com');
    });

    it('should cache settings after first fetch', async () => {
      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, settingsFixture);

      const settings1 = await manager.fetchSettings();
      const settings2 = await manager.fetchSettings();

      expect(settings1).toBe(settings2);
    });

    it('should use custom settings URL if provided', async () => {
      const customConfig = createTestConfig({
        settingsUrl: 'https://test.example.com/custom-settings',
      });
      const customManager = new SettingsManager(customConfig);

      nock('https://test.example.com')
        .get('/custom-settings')
        .reply(200, settingsFixture);

      const settings = await customManager.fetchSettings();

      expect(settings.schema_version).toBe(1);
    });

    it('should include Basic Auth credentials if provided', async () => {
      const authConfig = createTestConfig({
        wpUsername: 'testuser',
        wpPassword: 'testpass',
      });
      const authManager = new SettingsManager(authConfig);

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .basicAuth({ user: 'testuser', pass: 'testpass' })
        .reply(200, settingsFixture);

      const settings = await authManager.fetchSettings();

      expect(settings.schema_version).toBe(1);
    });

    it('should throw error on HTTP error response', async () => {
      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(404, 'Not Found');

      await expect(manager.fetchSettings()).rejects.toThrow(/404/);
    });

    it('should throw error on network error', async () => {
      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .replyWithError('Network error');

      await expect(manager.fetchSettings()).rejects.toThrow(/Network error/);
    });

    it('should respect timeout setting', async () => {
      const timeoutConfig = createTestConfig({ timeout: 100 });
      const timeoutManager = new SettingsManager(timeoutConfig);

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .delay(200)
        .reply(200, settingsFixture);

      await expect(timeoutManager.fetchSettings()).rejects.toThrow();
    });
  });

  describe('validateSettings', () => {
    it('should reject missing required fields', async () => {
      const invalidData = { ...settingsFixture };
      delete (invalidData as any).chunk_size;

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, invalidData);

      await expect(manager.fetchSettings()).rejects.toThrow(/Missing required setting/);
    });

    it('should reject unsupported schema version', async () => {
      const invalidData = { ...settingsFixture, schema_version: 999 };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, invalidData);

      await expect(manager.fetchSettings()).rejects.toThrow(/Unsupported schema version/);
    });

    it('should reject invalid embedding dimension', async () => {
      const invalidData = { ...settingsFixture, embedding_dimension: 0 };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, invalidData);

      await expect(manager.fetchSettings()).rejects.toThrow(/Invalid embedding_dimension/);
    });

    it('should reject embedding dimension too large', async () => {
      const invalidData = { ...settingsFixture, embedding_dimension: 20000 };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, invalidData);

      await expect(manager.fetchSettings()).rejects.toThrow(/Invalid embedding_dimension/);
    });

    it('should reject invalid chunk size (too small)', async () => {
      const invalidData = { ...settingsFixture, chunk_size: 50 };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, invalidData);

      await expect(manager.fetchSettings()).rejects.toThrow(/Invalid chunk_size/);
    });

    it('should reject invalid chunk size (too large)', async () => {
      const invalidData = { ...settingsFixture, chunk_size: 20000 };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, invalidData);

      await expect(manager.fetchSettings()).rejects.toThrow(/Invalid chunk_size/);
    });

    it('should reject invalid chunk overlap (negative)', async () => {
      const invalidData = { ...settingsFixture, chunk_overlap: -10 };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, invalidData);

      await expect(manager.fetchSettings()).rejects.toThrow(/Invalid chunk_overlap/);
    });

    it('should reject chunk overlap >= chunk size', async () => {
      const invalidData = { ...settingsFixture, chunk_size: 500, chunk_overlap: 500 };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, invalidData);

      await expect(manager.fetchSettings()).rejects.toThrow(/Invalid chunk_overlap/);
    });

    it('should reject missing Pinecone configuration', async () => {
      const invalidData = { ...settingsFixture, pinecone_index_name: '' };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, invalidData);

      await expect(manager.fetchSettings()).rejects.toThrow(/Pinecone index/);
    });

    it('should coerce post_types to array', async () => {
      const data = { ...settingsFixture, post_types: undefined };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, data);

      await expect(manager.fetchSettings()).rejects.toThrow(/Missing required setting: post_types/);
    });

    it('should coerce boolean values', async () => {
      const data = {
        ...settingsFixture,
        auto_discover: 'true',
        clean_deleted: 0,
      };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, data);

      const settings = await manager.fetchSettings();

      expect(settings.auto_discover).toBe(true);
      expect(settings.clean_deleted).toBe(false);
    });

    it('should extract domain from wpApiBase', async () => {
      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, settingsFixture);

      const settings = await manager.fetchSettings();

      expect(settings.domain).toBe('test.example.com');
    });
  });

  describe('getDefaults', () => {
    it('should return default settings', () => {
      const defaults = SettingsManager.getDefaults();

      expect(defaults.schema_version).toBe(1);
      expect(defaults.post_types).toContain('post');
      expect(defaults.post_types).toContain('page');
      expect(defaults.embedding_model).toBe('text-embedding-3-small');
      expect(defaults.chunk_size).toBe(500);
      expect(defaults.chunk_overlap).toBe(50);
    });

    it('should include default excluded post types', () => {
      const defaults = SettingsManager.getDefaults();

      expect(defaults.post_types_exclude).toContain('attachment');
      expect(defaults.post_types_exclude).toContain('revision');
    });
  });

  describe('edge cases', () => {
    it('should handle numeric strings in settings', async () => {
      const data = {
        ...settingsFixture,
        schema_version: '1',
        embedding_dimension: '1536',
        chunk_size: '500',
        chunk_overlap: '50',
      };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, data);

      const settings = await manager.fetchSettings();

      expect(typeof settings.schema_version).toBe('number');
      expect(typeof settings.embedding_dimension).toBe('number');
      expect(typeof settings.chunk_size).toBe('number');
      expect(typeof settings.chunk_overlap).toBe('number');
    });

    it('should handle settings with extra fields', async () => {
      const data = {
        ...settingsFixture,
        extra_field: 'some value',
        another_field: 123,
      };

      nock('https://test.example.com')
        .get('/wp-json/semantic-knowledge/v1/indexer-settings')
        .reply(200, data);

      const settings = await manager.fetchSettings();

      expect(settings.schema_version).toBe(1);
    });
  });
});
