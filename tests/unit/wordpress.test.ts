import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { WordPressClient } from '../../src/wordpress';
import { createTestConfig, createTestSettings } from '../helpers/test-config';
import wordpressPosts from '../mocks/fixtures/wordpress-posts.json';

describe('WordPressClient', () => {
  let client: WordPressClient;
  const config = createTestConfig();
  const settings = createTestSettings();

  beforeEach(() => {
    client = new WordPressClient(config, settings);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('fetchAllPosts', () => {
    it('should fetch all posts from configured post types', async () => {
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

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      expect(posts).toHaveLength(2);
      expect(posts[0].type).toBe('post');
      expect(posts[1].type).toBe('page');
    });

    it('should handle pagination correctly', async () => {
      const page1Posts = [wordpressPosts[0]];
      const page2Posts = [{ ...wordpressPosts[0], id: 99 }];

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query({ page: 1, per_page: 100, status: 'publish', _embed: 'true' })
        .reply(200, page1Posts, { 'x-wp-totalpages': '2' });

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query({ page: 2, per_page: 100, status: 'publish', _embed: 'true' })
        .reply(200, page2Posts, { 'x-wp-totalpages': '2' });

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, [], { 'x-wp-totalpages': '0' });

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      expect(posts).toHaveLength(2);
    });

    it('should handle 404 errors gracefully', async () => {
      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(404, 'Not Found');

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, [wordpressPosts[1]]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      expect(posts).toHaveLength(1);
      expect(posts[0].type).toBe('page');
    });

    it('should handle 400 errors (end of pagination) gracefully', async () => {
      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query({ page: 1, per_page: 100, status: 'publish', _embed: 'true' })
        .reply(200, [wordpressPosts[0]]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query({ page: 2, per_page: 100, status: 'publish', _embed: 'true' })
        .reply(400, 'Bad Request');

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      expect(posts).toHaveLength(1);
    });

    it('should use Basic Auth if credentials provided', async () => {
      const authConfig = createTestConfig({
        wpUsername: 'testuser',
        wpPassword: 'testpass',
      });
      const authClient = new WordPressClient(authConfig, settings);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .basicAuth({ user: 'testuser', pass: 'testpass' })
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .basicAuth({ user: 'testuser', pass: 'testpass' })
        .reply(200, []);

      const posts = [];
      for await (const post of authClient.fetchAllPosts()) {
        posts.push(post);
      }

      expect(posts).toHaveLength(0);
    });

    it('should skip empty posts', async () => {
      const emptyPost = {
        ...wordpressPosts[0],
        title: { rendered: '' },
        content: { rendered: '' },
      };

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

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      expect(posts).toHaveLength(0);
    });

    it('should exclude post types in exclude list', async () => {
      const customSettings = createTestSettings({
        post_types: ['post', 'page', 'custom'],
        post_types_exclude: ['page'],
      });
      const customClient = new WordPressClient(config, customSettings);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/custom')
        .query(true)
        .reply(200, []);

      const posts = [];
      for await (const post of customClient.fetchAllPosts()) {
        posts.push(post);
      }

      // Should not request 'page' type since it's excluded
      expect(nock.pendingMocks()).toHaveLength(0);
    });
  });

  describe('processPost', () => {
    it('should process post correctly', async () => {
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

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      const processed = posts[0];
      expect(processed.id).toBe(1);
      expect(processed.type).toBe('post');
      expect(processed.title).toBe('Test Post');
      expect(processed.url).toBe('https://example.com/test-post');
      expect(processed.author_id).toBe(1);
      expect(processed.category_ids).toEqual([1, 2]);
      expect(processed.tag_ids).toEqual([1, 2, 3]);
    });

    it('should strip HTML from content', async () => {
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

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      const processed = posts[0];
      expect(processed.content).not.toContain('<p>');
      expect(processed.content).not.toContain('</p>');
      expect(processed.content).toContain('Test Post');
      expect(processed.content).toContain('This is test content');
    });

    it('should decode HTML entities', async () => {
      const postWithEntities = {
        ...wordpressPosts[0],
        title: { rendered: 'Test &amp; Title' },
        content: { rendered: '<p>&lt;strong&gt;Bold&lt;/strong&gt; &nbsp; &mdash; test</p>' },
      };

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, [postWithEntities]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      const processed = posts[0];
      expect(processed.title).toContain('&');
      expect(processed.content).toContain('<strong>');
      expect(processed.content).toContain('—');
    });

    it('should decode numeric HTML entities', async () => {
      const postWithNumericEntities = {
        ...wordpressPosts[0],
        content: { rendered: '<p>&#8220;Quote&#8221; &#169;</p>' },
      };

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, [postWithNumericEntities]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      const processed = posts[0];
      // Numeric entities are decoded
      expect(processed.content).toContain('Quote');
      expect(processed.content).toContain('©');
    });

    it('should combine title and content', async () => {
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

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      const processed = posts[0];
      expect(processed.content).toContain('Test Post');
      expect(processed.content).toContain('\n\n');
      expect(processed.content).toContain('This is test content');
    });

    it('should handle missing optional fields', async () => {
      const minimalPost = {
        id: 123,
        type: 'post',
        date: '2024-01-01T10:00:00',
        modified: '2024-01-01T10:00:00',
        slug: 'minimal',
        status: 'publish',
        link: 'https://example.com/minimal',
        title: { rendered: 'Minimal' },
        content: { rendered: '<p>Content</p>' },
        excerpt: { rendered: '' },
        author: 0,
      };

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, [minimalPost]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      const processed = posts[0];
      expect(processed.author_id).toBe(0);
      expect(processed.category_ids).toEqual([]);
      expect(processed.tag_ids).toEqual([]);
    });
  });

  describe('HTML stripping', () => {
    it('should normalize whitespace', async () => {
      const postWithWhitespace = {
        ...wordpressPosts[0],
        content: { rendered: '<p>Multiple   spaces\n\n\nand   newlines</p>' },
      };

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, [postWithWhitespace]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      const processed = posts[0];
      expect(processed.content).toContain('Multiple spaces');
      expect(processed.content).toContain('and newlines');
      // Content includes title + "\n\n" + body, so some double spaces are expected
      const contentBody = processed.content.split('\n\n')[1];
      expect(contentBody).not.toMatch(/\s{2,}/);
    });

    it('should handle nested HTML tags', async () => {
      const postWithNestedTags = {
        ...wordpressPosts[0],
        content: {
          rendered: '<div><p>Outer <strong>bold <em>italic</em> text</strong> content</p></div>',
        },
      };

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, [postWithNestedTags]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      const processed = posts[0];
      // Content is: title + "\n\n" + body
      expect(processed.content).toContain('Test Post');
      expect(processed.content).toContain('Outer bold italic text content');
    });
  });

  describe('edge cases', () => {
    it('should handle network errors', async () => {
      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .replyWithError('Network error');

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      expect(posts).toHaveLength(0);
    });

    it('should handle timeout errors', async () => {
      const timeoutConfig = createTestConfig({ timeout: 100 });
      const timeoutClient = new WordPressClient(timeoutConfig, settings);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .delay(200)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const posts = [];
      for await (const post of timeoutClient.fetchAllPosts()) {
        posts.push(post);
      }

      expect(posts).toHaveLength(0);
    });

    it('should handle malformed post data', async () => {
      const malformedPost = {
        id: 'not-a-number',
        // Missing required fields
      };

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, [malformedPost]);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/post')
        .query(true)
        .reply(200, []);

      nock('https://test.example.com')
        .get('/wp-json/wp/v2/page')
        .query(true)
        .reply(200, []);

      const posts = [];
      for await (const post of client.fetchAllPosts()) {
        posts.push(post);
      }

      expect(posts).toHaveLength(0);
    });
  });
});
