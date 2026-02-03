import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PineconeManager } from '../../src/pinecone';
import { createTestConfig, createTestSettings } from '../helpers/test-config';
import {
  createMockPinecone,
  createMockVector,
  createMockListResponse,
  createMockFetchResponse,
} from '../mocks/pinecone.mock';

describe('PineconeManager', () => {
  let manager: PineconeManager;
  const config = createTestConfig();
  const settings = createTestSettings();

  beforeEach(() => {
    manager = new PineconeManager(config, settings);
  });

  describe('initialize', () => {
    it('should initialize Pinecone index', async () => {
      const mockPinecone = createMockPinecone();
      (manager as any).client = mockPinecone;

      await manager.initialize();

      expect(mockPinecone.index).toHaveBeenCalledWith(
        settings.pinecone_index_name,
        settings.pinecone_index_host
      );
      expect(mockPinecone._mockIndex.describeIndexStats).toHaveBeenCalled();
    });

    it('should throw error if initialization fails', async () => {
      const mockPinecone = createMockPinecone();
      mockPinecone._mockIndex.describeIndexStats.mockRejectedValue(new Error('Connection failed'));
      (manager as any).client = mockPinecone;

      await expect(manager.initialize()).rejects.toThrow(/Failed to initialize Pinecone/);
    });
  });

  describe('createVectorId', () => {
    it('should create vector ID from post ID and chunk index', () => {
      const id = manager.createVectorId(123, 0);

      expect(id).toBe('post-123-chunk-0');
    });

    it('should handle multiple chunk indices', () => {
      const id1 = manager.createVectorId(456, 5);
      const id2 = manager.createVectorId(456, 10);

      expect(id1).toBe('post-456-chunk-5');
      expect(id2).toBe('post-456-chunk-10');
    });
  });

  describe('createVector', () => {
    it('should create vector object with correct structure', () => {
      const embedding = new Array(1536).fill(0.1);
      const metadata = {
        post_id: 123,
        post_type: 'post',
        title: 'Test Post',
        url: 'https://example.com/test',
        chunk: 'Test content',
        domain: 'example.com',
        schema_version: 1,
        post_date: '2024-01-01',
        post_modified: '2024-01-01',
        author_id: 1,
      };

      const vector = manager.createVector(123, 0, embedding, metadata);

      expect(vector.id).toBe('post-123-chunk-0');
      expect(vector.values).toEqual(embedding);
      expect(vector.metadata.post_id).toBe(123);
      expect(vector.metadata.chunk_index).toBe(0);
    });
  });

  describe('upsertVectors', () => {
    it('should upsert vectors in batches of 100', async () => {
      const vectors = Array(250)
        .fill(null)
        .map((_, i) => createMockVector(`vec-${i}`, i, 0));

      const mockPinecone = createMockPinecone();
      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await manager.upsertVectors(vectors);

      expect(mockPinecone._mockNamespace.upsert).toHaveBeenCalledTimes(3);
    });

    it('should handle empty vectors array', async () => {
      const mockPinecone = createMockPinecone();
      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await manager.upsertVectors([]);

      expect(mockPinecone._mockNamespace.upsert).not.toHaveBeenCalled();
    });

    it('should use correct namespace', async () => {
      const configWithNamespace = createTestConfig({ namespace: 'test-ns' });
      const managerWithNs = new PineconeManager(configWithNamespace, settings);

      const vectors = [createMockVector('vec-1', 1, 0)];

      const mockPinecone = createMockPinecone();
      (managerWithNs as any).client = mockPinecone;
      (managerWithNs as any).index = mockPinecone._mockIndex;

      await managerWithNs.upsertVectors(vectors);

      expect(mockPinecone._mockIndex.namespace).toHaveBeenCalledWith('test-ns');
    });

    it('should use empty string for default namespace', async () => {
      const vectors = [createMockVector('vec-1', 1, 0)];

      const mockPinecone = createMockPinecone();
      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await manager.upsertVectors(vectors);

      expect(mockPinecone._mockIndex.namespace).toHaveBeenCalledWith('');
    });

    it('should update upsert count', async () => {
      const vectors = Array(25)
        .fill(null)
        .map((_, i) => createMockVector(`vec-${i}`, i, 0));

      const mockPinecone = createMockPinecone();
      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await manager.upsertVectors(vectors);

      expect(manager.getUpsertCount()).toBe(25);
    });

    it('should throw error on upsert failure', async () => {
      const vectors = [createMockVector('vec-1', 1, 0)];

      const mockPinecone = createMockPinecone();
      mockPinecone._mockNamespace.upsert.mockRejectedValue(new Error('Upsert failed'));
      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await expect(manager.upsertVectors(vectors)).rejects.toThrow('Upsert failed');
    });
  });

  describe('deleteByVectorIds', () => {
    it('should delete vectors by IDs', async () => {
      const vectorIds = ['vec-1', 'vec-2', 'vec-3'];

      const mockPinecone = createMockPinecone();
      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await manager.deleteByVectorIds(vectorIds);

      expect(mockPinecone._mockNamespace.deleteMany).toHaveBeenCalledWith(vectorIds);
    });

    it('should handle empty vector IDs array', async () => {
      const mockPinecone = createMockPinecone();
      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await manager.deleteByVectorIds([]);

      expect(mockPinecone._mockNamespace.deleteMany).not.toHaveBeenCalled();
    });

    it('should batch delete in chunks of 1000', async () => {
      const vectorIds = Array(2500)
        .fill(null)
        .map((_, i) => `vec-${i}`);

      const mockPinecone = createMockPinecone();
      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await manager.deleteByVectorIds(vectorIds);

      expect(mockPinecone._mockNamespace.deleteMany).toHaveBeenCalledTimes(3); // 1000, 1000, 500
    });

    it('should throw error on delete failure', async () => {
      const vectorIds = ['vec-1'];

      const mockPinecone = createMockPinecone();
      mockPinecone._mockNamespace.deleteMany.mockRejectedValue(new Error('Delete failed'));
      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await expect(manager.deleteByVectorIds(vectorIds)).rejects.toThrow('Delete failed');
    });
  });

  describe('deleteByPostIds', () => {
    it('should delete vectors by post IDs using metadata filter', async () => {
      const postIds = [1, 2, 3];

      const mockPinecone = createMockPinecone();
      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await manager.deleteByPostIds(postIds);

      expect(mockPinecone._mockNamespace.deleteMany).toHaveBeenCalledWith({
        filter: {
          post_id: { $in: postIds },
          domain: { $eq: settings.domain },
        },
      });
    });

    it('should handle empty post IDs array', async () => {
      const mockPinecone = createMockPinecone();
      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await manager.deleteByPostIds([]);

      expect(mockPinecone._mockNamespace.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('listVectorIdsForDomain', () => {
    it('should list all vector IDs for current domain', async () => {
      const vectors = [
        createMockVector('vec-1', 1, 0),
        createMockVector('vec-2', 2, 0),
        createMockVector('vec-3', 3, 0),
      ];

      vectors.forEach(v => {
        v.metadata.domain = settings.domain;
      });

      const mockPinecone = createMockPinecone();
      mockPinecone._mockNamespace.listPaginated.mockResolvedValue(
        createMockListResponse(['vec-1', 'vec-2', 'vec-3'])
      );
      mockPinecone._mockNamespace.fetch.mockResolvedValue(createMockFetchResponse(vectors));

      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      const vectorIds = await manager.listVectorIdsForDomain();

      expect(vectorIds).toEqual(['vec-1', 'vec-2', 'vec-3']);
    });

    it('should filter vectors by domain', async () => {
      const vectors = [
        { ...createMockVector('vec-1', 1, 0), metadata: { ...createMockVector('vec-1', 1, 0).metadata, domain: settings.domain } },
        { ...createMockVector('vec-2', 2, 0), metadata: { ...createMockVector('vec-2', 2, 0).metadata, domain: 'other.com' } },
        { ...createMockVector('vec-3', 3, 0), metadata: { ...createMockVector('vec-3', 3, 0).metadata, domain: settings.domain } },
      ];

      const mockPinecone = createMockPinecone();
      mockPinecone._mockNamespace.listPaginated.mockResolvedValue(
        createMockListResponse(['vec-1', 'vec-2', 'vec-3'])
      );
      mockPinecone._mockNamespace.fetch.mockResolvedValue(createMockFetchResponse(vectors));

      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      const vectorIds = await manager.listVectorIdsForDomain();

      expect(vectorIds).toEqual(['vec-1', 'vec-3']);
    });

    it('should handle pagination', async () => {
      const vectors1 = [createMockVector('vec-1', 1, 0), createMockVector('vec-2', 2, 0)];
      const vectors2 = [createMockVector('vec-3', 3, 0)];

      vectors1.forEach(v => {
        v.metadata.domain = settings.domain;
      });
      vectors2.forEach(v => {
        v.metadata.domain = settings.domain;
      });

      const mockPinecone = createMockPinecone();
      mockPinecone._mockNamespace.listPaginated
        .mockResolvedValueOnce(createMockListResponse(['vec-1', 'vec-2'], true))
        .mockResolvedValueOnce(createMockListResponse(['vec-3'], false));

      mockPinecone._mockNamespace.fetch
        .mockResolvedValueOnce(createMockFetchResponse(vectors1))
        .mockResolvedValueOnce(createMockFetchResponse(vectors2));

      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      const vectorIds = await manager.listVectorIdsForDomain();

      expect(vectorIds).toEqual(['vec-1', 'vec-2', 'vec-3']);
      expect(mockPinecone._mockNamespace.listPaginated).toHaveBeenCalledTimes(2);
    });

    it('should return empty array if no vectors found', async () => {
      const mockPinecone = createMockPinecone();
      mockPinecone._mockNamespace.listPaginated.mockResolvedValue(createMockListResponse([]));

      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      const vectorIds = await manager.listVectorIdsForDomain();

      expect(vectorIds).toEqual([]);
    });
  });

  describe('deleteAllForDomain', () => {
    it('should delete all vectors for current domain', async () => {
      const vectors = [
        createMockVector('vec-1', 1, 0),
        createMockVector('vec-2', 2, 0),
      ];

      vectors.forEach(v => {
        v.metadata.domain = settings.domain;
      });

      const mockPinecone = createMockPinecone();
      mockPinecone._mockNamespace.listPaginated.mockResolvedValue(
        createMockListResponse(['vec-1', 'vec-2'])
      );
      mockPinecone._mockNamespace.fetch.mockResolvedValue(createMockFetchResponse(vectors));

      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await manager.deleteAllForDomain();

      expect(mockPinecone._mockNamespace.deleteMany).toHaveBeenCalledWith(['vec-1', 'vec-2']);
    });

    it('should handle no vectors found', async () => {
      const mockPinecone = createMockPinecone();
      mockPinecone._mockNamespace.listPaginated.mockResolvedValue(createMockListResponse([]));

      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await manager.deleteAllForDomain();

      expect(mockPinecone._mockNamespace.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('query', () => {
    it('should query vectors', async () => {
      const queryVector = new Array(1536).fill(0.1);

      const mockPinecone = createMockPinecone();
      mockPinecone._mockNamespace.query.mockResolvedValue({ matches: [] });

      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      const results = await manager.query(queryVector, 10);

      expect(mockPinecone._mockNamespace.query).toHaveBeenCalledWith({
        vector: queryVector,
        topK: 10,
        includeMetadata: true,
      });
    });

    it('should apply filters to query', async () => {
      const queryVector = new Array(1536).fill(0.1);
      const filter = { domain: { $eq: 'example.com' } };

      const mockPinecone = createMockPinecone();
      mockPinecone._mockNamespace.query.mockResolvedValue({ matches: [] });

      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await manager.query(queryVector, 5, filter);

      expect(mockPinecone._mockNamespace.query).toHaveBeenCalledWith({
        vector: queryVector,
        topK: 5,
        includeMetadata: true,
        filter,
      });
    });
  });

  describe('getStats', () => {
    it('should return index statistics', async () => {
      const mockPinecone = createMockPinecone();
      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      const stats = await manager.getStats();

      expect(stats).toHaveProperty('dimension');
      expect(mockPinecone._mockIndex.describeIndexStats).toHaveBeenCalled();
    });
  });

  describe('getUpsertCount', () => {
    it('should return zero initially', () => {
      expect(manager.getUpsertCount()).toBe(0);
    });

    it('should track upsert count correctly', async () => {
      const vectors1 = Array(50)
        .fill(null)
        .map((_, i) => createMockVector(`vec-${i}`, i, 0));
      const vectors2 = Array(25)
        .fill(null)
        .map((_, i) => createMockVector(`vec-${i + 50}`, i + 50, 0));

      const mockPinecone = createMockPinecone();
      (manager as any).client = mockPinecone;
      (manager as any).index = mockPinecone._mockIndex;

      await manager.upsertVectors(vectors1);
      await manager.upsertVectors(vectors2);

      expect(manager.getUpsertCount()).toBe(75);
    });
  });
});
