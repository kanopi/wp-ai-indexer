/**
 * WordPress Module
 * Fetches posts from WordPress REST API
 */

import axios from 'axios';
import { WordPressPost, ProcessedDocument, IndexerConfig, IndexerSettings } from './types';

export class WordPressClient {
  private config: IndexerConfig;
  private settings: IndexerSettings;

  constructor(config: IndexerConfig, settings: IndexerSettings) {
    this.config = config;
    this.settings = settings;
  }

  /**
   * Fetch all posts for configured post types with concurrent pagination
   */
  async *fetchAllPosts(): AsyncGenerator<ProcessedDocument> {
    const postTypes = await this.getPostTypesToIndex();

    for (const postType of postTypes) {
      this.log(`Fetching posts of type: ${postType}`);

      try {
        // Fetch first page to get total pages count
        const { posts: firstPagePosts, totalPages } = await this.fetchPostsPageWithHeaders(
          postType,
          1
        );

        if (firstPagePosts.length === 0) {
          this.log(`Post type '${postType}' has no posts`);
          continue;
        }

        // Process first page posts
        for (const post of firstPagePosts) {
          const processed = this.processPost(post);
          if (processed) {
            yield processed;
          }
        }

        // If there are more pages, fetch them concurrently
        if (totalPages > 1) {
          const remainingPages = Array.from(
            { length: totalPages - 1 },
            (_, i) => i + 2
          );

          // Fetch remaining pages with concurrency control
          const allPosts = await this.fetchPagesWithConcurrency(
            postType,
            remainingPages,
            3 // Max 3 concurrent requests
          );

          // Process all posts from remaining pages
          for (const posts of allPosts) {
            for (const post of posts) {
              const processed = this.processPost(post);
              if (processed) {
                yield processed;
              }
            }
          }
        }

        this.log(`Finished fetching ${postType} (${totalPages} pages)`);
      } catch (error: any) {
        // 404 errors are expected for post types that don't exist
        if (error.response && error.response.status === 404) {
          this.log(`Post type '${postType}': 404 - Not found`);
        } else {
          console.error(`Error fetching ${postType}:`, error.message);
        }
      }
    }
  }

  /**
   * Fetch multiple pages concurrently with controlled concurrency
   */
  private async fetchPagesWithConcurrency(
    postType: string,
    pages: number[],
    maxConcurrency: number
  ): Promise<WordPressPost[][]> {
    const results: WordPressPost[][] = new Array(pages.length);
    const executing: Promise<void>[] = [];

    for (let i = 0; i < pages.length; i++) {
      const pageNumber = pages[i];

      // Create promise for this page
      const promise = this.fetchPostsPage(postType, pageNumber)
        .then(posts => {
          results[i] = posts;
        })
        .catch(error => {
          // Handle errors gracefully
          if (error.response && error.response.status === 400) {
            // Beyond available pages
            this.log(`Page ${pageNumber} beyond available pages`);
          } else {
            console.error(`Error fetching page ${pageNumber}:`, error.message);
          }
          results[i] = [];
        });

      // Add to executing queue
      executing.push(promise);

      // If we've reached max concurrency, wait for one to complete
      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
        // Remove completed promises
        executing.splice(0, 1);
      }

      // Small delay between starting requests
      await this.delay(50);
    }

    // Wait for all remaining pages to complete
    await Promise.all(executing);

    return results.filter(posts => posts && posts.length > 0);
  }

  /**
   * Fetch a single page with headers to get total pages
   */
  private async fetchPostsPageWithHeaders(
    postType: string,
    page: number
  ): Promise<{ posts: WordPressPost[]; totalPages: number }> {
    const url = `${this.config.wpApiBase}/wp-json/wp/v2/${postType}`;

    const params = {
      page,
      per_page: 100,
      status: 'publish',
      _embed: 'true',
    };

    const requestConfig: any = {
      params,
      timeout: this.config.timeout || 30000,
      headers: {
        'User-Agent': '@kanopi/wp-ai-indexer',
      },
    };

    // Add Basic Auth if credentials provided
    if (this.config.wpUsername && this.config.wpPassword) {
      requestConfig.auth = {
        username: this.config.wpUsername,
        password: this.config.wpPassword,
      };
    }

    const response = await axios.get(url, requestConfig);

    // Extract total pages from headers
    const totalPages = parseInt(response.headers['x-wp-totalpages'] || '1', 10);

    return {
      posts: response.data,
      totalPages,
    };
  }

  /**
   * Fetch a single page of posts
   */
  private async fetchPostsPage(postType: string, page: number): Promise<WordPressPost[]> {
    const url = `${this.config.wpApiBase}/wp-json/wp/v2/${postType}`;

    const params = {
      page,
      per_page: 100,
      status: 'publish',
      _embed: 'true', // Get author and other embedded data
    };

    const requestConfig: any = {
      params,
      timeout: this.config.timeout || 30000,
      headers: {
        'User-Agent': '@kanopi/wp-ai-indexer',
      },
    };

    // Add Basic Auth if credentials provided
    if (this.config.wpUsername && this.config.wpPassword) {
      requestConfig.auth = {
        username: this.config.wpUsername,
        password: this.config.wpPassword,
      };
    }

    try {
      const response = await axios.get(url, requestConfig);

      return response.data;
    } catch (error: any) {
      if (error.response) {
        // 400 or 404 - post type doesn't exist or isn't accessible
        if (error.response.status === 400 || error.response.status === 404) {
          // Throw the error so it can be handled gracefully by the caller
          throw error;
        }
      }
      throw error;
    }
  }

  /**
   * Process a raw WordPress post into a normalized document
   */
  private processPost(post: WordPressPost): ProcessedDocument | null {
    try {
      // Extract rendered content and strip HTML
      const title = this.stripHtml(post.title?.rendered || '');
      const content = this.stripHtml(post.content?.rendered || '');

      // Skip empty posts
      if (!title && !content) {
        this.log(`Skipping empty post: ${post.id}`);
        return null;
      }

      // Combine title and content for indexing
      const fullContent = title + '\n\n' + content;

      return {
        id: post.id,
        type: post.type,
        title,
        content: fullContent,
        url: post.link,
        date: post.date,
        modified: post.modified,
        author_id: post.author || 0,
        category_ids: post.categories || [],
        tag_ids: post.tags || [],
      };
    } catch (error: any) {
      console.error(`Error processing post ${post.id}:`, error.message);
      return null;
    }
  }

  /**
   * Strip HTML tags from content
   */
  private stripHtml(html: string): string {
    // Remove HTML tags
    let text = html.replace(/<[^>]*>/g, ' ');

    // Decode HTML entities
    text = this.decodeHtmlEntities(text);

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Decode common HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#039;': "'",
      '&nbsp;': ' ',
      '&mdash;': '—',
      '&ndash;': '–',
      '&rsquo;': '\u2019',
      '&lsquo;': '\u2018',
      '&rdquo;': '\u201D',
      '&ldquo;': '\u201C',
    };

    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }

    // Decode numeric entities
    decoded = decoded.replace(/&#(\d+);/g, (match, code) => {
      return String.fromCharCode(parseInt(code, 10));
    });

    return decoded;
  }

  /**
   * Get list of post types to index
   */
  private async getPostTypesToIndex(): Promise<string[]> {
    let postTypes = [...this.settings.post_types];

    // Auto-discover post types if enabled
    if (this.settings.auto_discover) {
      try {
        const discoveredTypes = await this.discoverPostTypes();
        // Merge discovered types with configured types (remove duplicates)
        const allTypes = [...new Set([...postTypes, ...discoveredTypes])];
        postTypes = allTypes;
        this.log(`Auto-discovery: found ${discoveredTypes.length} post types`);
      } catch (error: any) {
        this.log('Auto-discovery failed, using configured post types only:', error.message);
      }
    }

    // Filter out excluded types
    postTypes = postTypes.filter(
      (type) => !this.settings.post_types_exclude.includes(type)
    );

    return postTypes;
  }

  /**
   * Discover available post types via WordPress REST API
   */
  private async discoverPostTypes(): Promise<string[]> {
    const url = `${this.config.wpApiBase}/types`;

    const requestConfig: any = {
      timeout: this.config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // Add Basic Auth if credentials provided
    if (this.config.wpUsername && this.config.wpPassword) {
      requestConfig.auth = {
        username: this.config.wpUsername,
        password: this.config.wpPassword,
      };
    }

    try {
      const response = await axios.get(url, requestConfig);
      const types = response.data;

      // Filter to only public, viewable post types
      const publicTypes: string[] = [];
      for (const [slug, typeData] of Object.entries(types)) {
        const data = typeData as any;
        // Only include post types that are viewable and have show_in_rest enabled
        if (data.viewable && data.show_in_rest) {
          publicTypes.push(slug);
        }
      }

      return publicTypes;
    } catch (error: any) {
      this.log('Failed to discover post types:', error.message);
      throw new Error(`Post type discovery failed: ${error.message}`);
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[WordPress]', ...args);
    }
  }
}
