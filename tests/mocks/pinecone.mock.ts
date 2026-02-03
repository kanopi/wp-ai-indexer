import { vi } from 'vitest';

/**
 * Mock Pinecone client
 */
export const createMockPinecone = () => {
  const mockNamespace = {
    upsert: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({}),
    fetch: vi.fn().mockResolvedValue({ records: {} }),
    listPaginated: vi.fn().mockResolvedValue({ vectors: [] }),
    query: vi.fn().mockResolvedValue({ matches: [] }),
  };

  const mockIndex = {
    namespace: vi.fn().mockReturnValue(mockNamespace),
    describeIndexStats: vi.fn().mockResolvedValue({
      namespaces: {},
      dimension: 1536,
      indexFullness: 0,
      totalVectorCount: 0,
    }),
  };

  return {
    index: vi.fn().mockReturnValue(mockIndex),
    _mockIndex: mockIndex,
    _mockNamespace: mockNamespace,
  };
};

/**
 * Mock vector data
 */
export const createMockVector = (id: string, postId: number, chunkIndex: number) => {
  return {
    id,
    values: new Array(1536).fill(0.1),
    metadata: {
      post_id: postId,
      post_type: 'post',
      title: 'Test Post',
      url: 'https://example.com/test',
      chunk: 'Test content',
      domain: 'example.com',
      schema_version: 1,
      post_date: '2024-01-01',
      post_modified: '2024-01-01',
      author_id: 1,
      chunk_index: chunkIndex,
    },
  };
};

/**
 * Mock list response with pagination
 */
export const createMockListResponse = (vectorIds: string[], hasNext: boolean = false) => {
  return {
    vectors: vectorIds.map(id => ({ id })),
    pagination: hasNext ? { next: 'next-token' } : undefined,
  };
};

/**
 * Mock fetch response
 */
export const createMockFetchResponse = (vectors: any[]) => {
  const records: Record<string, any> = {};

  vectors.forEach(vector => {
    records[vector.id] = vector;
  });

  return { records };
};
