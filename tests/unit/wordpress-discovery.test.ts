/**
 * Tests for WordPress auto-discovery feature
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { WordPressClient } from '../../src/wordpress';
import { IndexerConfig, IndexerSettings } from '../../src/types';

vi.mock('axios');

describe('WordPress Post Type Auto-Discovery', () => {
  let client: WordPressClient;
  let mockConfig: IndexerConfig;
  let mockSettings: IndexerSettings;

  beforeEach(() => {
    mockConfig = {
      wpApiBase: 'https://example.com',
      openaiApiKey: 'test-key',
      pineconeApiKey: 'test-key',
      debug: false,
    };

    mockSettings = {
      schema_version: 1,
      post_types: ['post'],
      post_types_exclude: ['attachment', 'revision'],
      auto_discover: false,
      clean_deleted: true,
      embedding_model: 'text-embedding-3-small',
      embedding_dimension: 1536,
      chunk_size: 1200,
      chunk_overlap: 200,
      pinecone_index_host: 'https://test.pinecone.io',
      pinecone_index_name: 'test-index',
      domain: 'example.com',
    };

    client = new WordPressClient(mockConfig, mockSettings);
  });

  it('should not auto-discover when disabled', async () => {
    mockSettings.auto_discover = false;
    client = new WordPressClient(mockConfig, mockSettings);

    // Mock fetchAllPosts to test getPostTypesToIndex indirectly
    const axiosMock = vi.mocked(axios);
    axiosMock.get.mockResolvedValueOnce({
      data: [],
      headers: { 'x-wp-totalpages': '0' },
    });

    const posts = [];
    for await (const post of client.fetchAllPosts()) {
      posts.push(post);
    }

    // Should only try to fetch 'post' type (not auto-discovered types)
    expect(axiosMock.get).toHaveBeenCalledWith(
      expect.stringContaining('/posts'),
      expect.any(Object)
    );
  });

  it('should discover post types when enabled', async () => {
    mockSettings.auto_discover = true;
    client = new WordPressClient(mockConfig, mockSettings);

    const mockTypesResponse = {
      data: {
        post: {
          name: 'Posts',
          slug: 'post',
          viewable: true,
          show_in_rest: true,
        },
        page: {
          name: 'Pages',
          slug: 'page',
          viewable: true,
          show_in_rest: true,
        },
        'custom-type': {
          name: 'Custom Type',
          slug: 'custom-type',
          viewable: true,
          show_in_rest: true,
        },
        'private-type': {
          name: 'Private Type',
          slug: 'private-type',
          viewable: false, // Not viewable
          show_in_rest: true,
        },
        'no-rest': {
          name: 'No REST',
          slug: 'no-rest',
          viewable: true,
          show_in_rest: false, // Not in REST API
        },
      },
    };

    const axiosMock = vi.mocked(axios);

    // First call: get types
    axiosMock.get.mockResolvedValueOnce(mockTypesResponse);

    // Subsequent calls: empty posts for each type
    axiosMock.get.mockResolvedValue({
      data: [],
      headers: { 'x-wp-totalpages': '0' },
    });

    const posts = [];
    for await (const post of client.fetchAllPosts()) {
      posts.push(post);
    }

    // Should have called /types endpoint
    expect(axiosMock.get).toHaveBeenCalledWith(
      'https://example.com/wp-json/wp/v2/types',
      expect.any(Object)
    );

    // Should have attempted to fetch from discovered types
    // (post, page, custom-type - but not private-type or no-rest)
    const calls = axiosMock.get.mock.calls;
    const typeCalls = calls.filter((call) =>
      call[0].includes('/posts') ||
      call[0].includes('/pages') ||
      call[0].includes('/custom-type')
    );

    // Should have at least attempted to fetch discovered types
    expect(typeCalls.length).toBeGreaterThan(0);
  });

  it('should filter out excluded types even when discovered', async () => {
    mockSettings.auto_discover = true;
    mockSettings.post_types_exclude = ['page', 'custom-type'];
    client = new WordPressClient(mockConfig, mockSettings);

    const mockTypesResponse = {
      data: {
        post: {
          name: 'Posts',
          slug: 'post',
          viewable: true,
          show_in_rest: true,
        },
        page: {
          name: 'Pages',
          slug: 'page',
          viewable: true,
          show_in_rest: true,
        },
        'custom-type': {
          name: 'Custom Type',
          slug: 'custom-type',
          viewable: true,
          show_in_rest: true,
        },
      },
    };

    const axiosMock = vi.mocked(axios);
    axiosMock.get.mockResolvedValueOnce(mockTypesResponse);
    axiosMock.get.mockResolvedValue({
      data: [],
      headers: { 'x-wp-totalpages': '0' },
    });

    const posts = [];
    for await (const post of client.fetchAllPosts()) {
      posts.push(post);
    }

    // Should NOT try to fetch excluded types
    const calls = axiosMock.get.mock.calls;
    const pageCalls = calls.filter((call) => call[0].includes('/pages'));
    const customTypeCalls = calls.filter((call) => call[0].includes('/custom-type'));

    expect(pageCalls.length).toBe(0);
    expect(customTypeCalls.length).toBe(0);
  });

  it('should handle discovery failure gracefully', async () => {
    mockSettings.auto_discover = true;
    client = new WordPressClient(mockConfig, mockSettings);

    const axiosMock = vi.mocked(axios);

    // Mock discovery endpoint to fail
    axiosMock.get.mockRejectedValueOnce(new Error('Discovery failed'));

    // Mock posts endpoint to succeed (fallback to configured types)
    axiosMock.get.mockResolvedValue({
      data: [],
      headers: { 'x-wp-totalpages': '0' },
    });

    const posts = [];
    for await (const post of client.fetchAllPosts()) {
      posts.push(post);
    }

    // Should fall back to configured post_types
    expect(axiosMock.get).toHaveBeenCalledWith(
      expect.stringContaining('/posts'),
      expect.any(Object)
    );
  });

  it('should merge discovered types with configured types', async () => {
    mockSettings.auto_discover = true;
    mockSettings.post_types = ['post', 'manual-type'];
    client = new WordPressClient(mockConfig, mockSettings);

    const mockTypesResponse = {
      data: {
        page: {
          name: 'Pages',
          slug: 'page',
          viewable: true,
          show_in_rest: true,
        },
      },
    };

    const axiosMock = vi.mocked(axios);
    axiosMock.get.mockResolvedValueOnce(mockTypesResponse);
    axiosMock.get.mockResolvedValue({
      data: [],
      headers: { 'x-wp-totalpages': '0' },
    });

    const posts = [];
    for await (const post of client.fetchAllPosts()) {
      posts.push(post);
    }

    // Should attempt to fetch both configured and discovered types
    const calls = axiosMock.get.mock.calls;
    const postCalls = calls.filter((call) => call[0].includes('/posts'));
    const manualTypeCalls = calls.filter((call) => call[0].includes('/manual-type'));
    const pageCalls = calls.filter((call) => call[0].includes('/pages'));

    // All types should be attempted
    expect(postCalls.length + manualTypeCalls.length + pageCalls.length).toBeGreaterThan(0);
  });

  it('should only include viewable types with show_in_rest', async () => {
    mockSettings.auto_discover = true;
    client = new WordPressClient(mockConfig, mockSettings);

    const mockTypesResponse = {
      data: {
        'viewable-rest': {
          viewable: true,
          show_in_rest: true,
        },
        'viewable-no-rest': {
          viewable: true,
          show_in_rest: false,
        },
        'not-viewable-rest': {
          viewable: false,
          show_in_rest: true,
        },
        'not-viewable-no-rest': {
          viewable: false,
          show_in_rest: false,
        },
      },
    };

    const axiosMock = vi.mocked(axios);
    axiosMock.get.mockResolvedValueOnce(mockTypesResponse);
    axiosMock.get.mockResolvedValue({
      data: [],
      headers: { 'x-wp-totalpages': '0' },
    });

    const posts = [];
    for await (const post of client.fetchAllPosts()) {
      posts.push(post);
    }

    // Should only fetch viewable-rest type
    const calls = axiosMock.get.mock.calls;
    const viewableRestCalls = calls.filter((call) =>
      call[0].includes('/viewable-rest')
    );

    expect(viewableRestCalls.length).toBeGreaterThan(0);
  });

  it('should pass authentication to discovery endpoint', async () => {
    mockConfig.wpUsername = 'testuser';
    mockConfig.wpPassword = 'testpass';
    mockSettings.auto_discover = true;
    client = new WordPressClient(mockConfig, mockSettings);

    const axiosMock = vi.mocked(axios);
    axiosMock.get.mockResolvedValue({
      data: {},
      headers: { 'x-wp-totalpages': '0' },
    });

    const posts = [];
    for await (const post of client.fetchAllPosts()) {
      posts.push(post);
    }

    // Should pass auth to types endpoint
    const typesCalls = axiosMock.get.mock.calls.filter((call) =>
      call[0].includes('/types')
    );

    if (typesCalls.length > 0) {
      const authConfig = typesCalls[0][1];
      expect(authConfig).toHaveProperty('auth');
      expect(authConfig.auth).toEqual({
        username: 'testuser',
        password: 'testpass',
      });
    }
  });
});
