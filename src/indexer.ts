/**
 * Main Indexer
 * Orchestrates the indexing process
 */

import { SettingsManager } from './settings';
import { WordPressClient } from './wordpress';
import { Chunker } from './chunking';
import { EmbeddingsManager } from './embeddings';
import { PineconeManager } from './pinecone';
import { IndexerConfig, IndexingResult, IndexingProgress, VectorMetadata, ProcessedDocument } from './types';
import { processWithConcurrency, createContentHash } from './utils';

export class Indexer {
  private config: IndexerConfig;
  private progress: IndexingProgress;

  constructor(config: IndexerConfig) {
    this.config = config;
    this.progress = {
      totalPosts: 0,
      processedPosts: 0,
      totalChunks: 0,
      processedChunks: 0,
      errors: 0,
    };
  }

  /**
   * Run the indexing process
   */
  async index(): Promise<IndexingResult> {
    const errors: Array<{ post_id?: number; message: string; error?: any }> = [];

    try {
      console.log('\n🚀 Starting WordPress AI Indexer...\n');

      // 1. Load settings
      console.log('📋 Loading settings...');
      const settingsManager = new SettingsManager(this.config);
      const settings = await settingsManager.fetchSettings();

      // 2. Initialize components
      console.log('🔧 Initializing components...');
      const wpClient = new WordPressClient(this.config, settings);
      const chunker = new Chunker(settings);
      const embeddings = new EmbeddingsManager(this.config, settings);
      const pinecone = new PineconeManager(this.config, settings);

      await pinecone.initialize();

      // 3. Fetch all posts first
      console.log('\n📚 Fetching posts...\n');
      const allPosts: ProcessedDocument[] = [];

      for await (const doc of wpClient.fetchAllPosts()) {
        allPosts.push(doc);
      }

      this.progress.totalPosts = allPosts.length;
      console.log(`\n📊 Found ${allPosts.length} posts to index`);

      // 4. Process posts in parallel with configurable concurrency
      console.log(`\n⚡ Processing posts with concurrency: ${this.config.concurrency || 5}\n`);

      const concurrency = this.config.concurrency || 5;
      const results = await processWithConcurrency(
        allPosts,
        async (doc: ProcessedDocument) => {
          // Chunk content
          const chunks = chunker.chunkContent(doc.content);

          if (chunks.length === 0) {
            console.log(`⚠️  Post ${doc.id} has no chunks, skipping`);
            return null;
          }

          console.log(
            `📄 Processing post ${doc.id}: "${doc.title.slice(0, 50)}..." (${chunks.length} chunks)`
          );

          // Create embeddings for all chunks
          const chunkTexts = chunks.map(c => c.text);
          const chunkEmbeddings = await embeddings.createEmbeddings(chunkTexts);

          // Create content hash for caching
          const contentHash = createContentHash(doc.content);

          // Create vectors for Pinecone
          const vectors = chunks.map((chunk, idx) => {
            const metadata: Omit<VectorMetadata, 'chunk_index'> & { content_hash?: string } = {
              post_id: doc.id,
              post_type: doc.type,
              title: doc.title,
              url: doc.url,
              chunk: chunk.text,
              domain: settings.domain,
              schema_version: settings.schema_version,
              post_date: doc.date,
              post_modified: doc.modified,
              author_id: doc.author_id,
              category_ids: doc.category_ids?.join(','),
              tag_ids: doc.tag_ids?.join(','),
              content_hash: contentHash,
            };

            return pinecone.createVector(
              doc.id,
              chunk.index,
              chunkEmbeddings[idx],
              metadata
            );
          });

          // Upsert to Pinecone
          await pinecone.upsertVectors(vectors);

          console.log(`✅ Indexed post ${doc.id} (${chunks.length} chunks)`);

          return { chunks: chunks.length };
        },
        concurrency
      );

      // 5. Process results and collect errors
      results.forEach((result, idx) => {
        const doc = allPosts[idx];

        if (result.status === 'fulfilled' && result.value) {
          this.progress.processedPosts++;
          this.progress.totalChunks += result.value.chunks;
          this.progress.processedChunks += result.value.chunks;
        } else if (result.status === 'fulfilled' && !result.value) {
          // Post was skipped (no chunks)
          this.progress.processedPosts++;
        } else {
          // Error occurred
          this.progress.errors++;
          const error = (result as PromiseRejectedResult).reason;
          const errorMsg = `Failed to process post ${doc.id}: ${error.message}`;
          console.error(`❌ ${errorMsg}`);
          errors.push({
            post_id: doc.id,
            message: errorMsg,
            error: error,
          });
        }
      });

      // 6. Show final stats
      console.log('\n📊 Indexing Complete!\n');
      console.log(`Posts processed: ${this.progress.processedPosts}/${this.progress.totalPosts}`);
      console.log(`Chunks created: ${this.progress.processedChunks}/${this.progress.totalChunks}`);
      console.log(`Vectors upserted: ${pinecone.getUpsertCount()}`);
      console.log(`Embeddings created: ${embeddings.getStats().requestCount}`);
      console.log(`Errors: ${this.progress.errors}`);

      if (errors.length > 0) {
        console.log('\n⚠️  Errors occurred:');
        errors.slice(0, 10).forEach(err => {
          console.log(`  - ${err.message}`);
        });
        if (errors.length > 10) {
          console.log(`  ... and ${errors.length - 10} more errors`);
        }
      }

      // Get final Pinecone stats
      const pineconeStats = await pinecone.getStats();
      console.log('\n🗂️  Pinecone Index Stats:');
      console.log(`  Total vectors: ${pineconeStats.totalRecordCount || 'N/A'}`);
      console.log(`  Dimension: ${pineconeStats.dimension || settings.embedding_dimension}`);

      console.log('\n✨ Done!\n');

      return {
        success: errors.length === 0,
        stats: this.progress,
        errors,
      };
    } catch (error: any) {
      console.error('\n❌ Fatal error:', error.message);
      console.error(error.stack);

      errors.push({
        message: `Fatal error: ${error.message}`,
        error: error,
      });

      return {
        success: false,
        stats: this.progress,
        errors,
      };
    }
  }

  /**
   * Clean deleted posts from index
   */
  async clean(): Promise<void> {
    console.log('\n🧹 Cleaning deleted posts from index...\n');

    try {
      // Load settings
      const settingsManager = new SettingsManager(this.config);
      const settings = await settingsManager.fetchSettings();

      if (!settings.clean_deleted) {
        console.log('⚠️  Clean deleted is disabled in settings');
        return;
      }

      console.log('📋 Loading settings...');
      console.log(`Domain: ${settings.domain}`);

      // Initialize components
      const wpClient = new WordPressClient(this.config, settings);
      const pinecone = new PineconeManager(this.config, settings);
      await pinecone.initialize();

      // 1. Get all current post IDs from WordPress
      console.log('\n📚 Fetching all current WordPress post IDs...');
      const wpPostIds = new Set<number>();

      for await (const doc of wpClient.fetchAllPosts()) {
        wpPostIds.add(doc.id);
      }

      console.log(`Found ${wpPostIds.size} posts in WordPress`);

      // 2. Get Pinecone stats to understand what we're working with
      const stats = await pinecone.getStats();
      console.log(`\nPinecone index has ${stats.totalRecordCount || 'unknown'} total vectors`);

      // 3. List all vector IDs for this domain
      console.log('\n🔍 Enumerating vectors in Pinecone...');
      const allVectorIds = await pinecone.listVectorIdsForDomain();
      console.log(`Found ${allVectorIds.length} vectors for domain ${settings.domain}`);

      // 4. Extract post IDs from vector IDs and build a map
      // Format: post-{id}-chunk-{index}
      const pineconePostIds = new Set<number>();
      const postIdToVectorIds = new Map<number, string[]>();
      const vectorIdPattern = /^post-(\d+)-chunk-\d+$/;

      for (const vectorId of allVectorIds) {
        const match = vectorId.match(vectorIdPattern);
        if (match) {
          const postId = parseInt(match[1], 10);
          pineconePostIds.add(postId);

          if (!postIdToVectorIds.has(postId)) {
            postIdToVectorIds.set(postId, []);
          }
          postIdToVectorIds.get(postId)!.push(vectorId);
        }
      }

      console.log(`Found ${pineconePostIds.size} unique posts in Pinecone`);

      // 5. Find deleted posts and collect their vector IDs
      const deletedPostIds: number[] = [];
      const vectorIdsToDelete: string[] = [];

      for (const postId of pineconePostIds) {
        if (!wpPostIds.has(postId)) {
          deletedPostIds.push(postId);
          const vectors = postIdToVectorIds.get(postId) || [];
          vectorIdsToDelete.push(...vectors);
        }
      }

      console.log(`\nFound ${deletedPostIds.length} deleted posts to clean`);

      // 6. Delete vectors for deleted posts
      if (vectorIdsToDelete.length > 0) {
        console.log('\n🗑️  Deleting vectors for deleted posts...');
        console.log(`Post IDs: ${deletedPostIds.slice(0, 10).join(', ')}${deletedPostIds.length > 10 ? '...' : ''}`);
        console.log(`Total vectors to delete: ${vectorIdsToDelete.length}`);

        await pinecone.deleteByVectorIds(vectorIdsToDelete);

        console.log(`✅ Deleted ${vectorIdsToDelete.length} vectors for ${deletedPostIds.length} posts`);
      } else {
        console.log('\n✅ No deleted posts found. Index is clean!');
      }

      console.log('\n✨ Done!\n');
    } catch (error: any) {
      console.error('❌ Clean failed:', error.message);
      throw error;
    }
  }

  /**
   * Delete all vectors for the current domain
   */
  async deleteAll(): Promise<void> {
    console.log('\n🗑️  Deleting all vectors for the current domain...\n');

    try {
      // Load settings
      const settingsManager = new SettingsManager(this.config);
      const settings = await settingsManager.fetchSettings();

      console.log(`Domain: ${settings.domain}`);

      // Initialize Pinecone
      const pinecone = new PineconeManager(this.config, settings);
      await pinecone.initialize();

      // Get current stats
      const statsBefore = await pinecone.getStats();
      console.log(`\nCurrent index stats:`);
      console.log(`  Total vectors: ${statsBefore.totalRecordCount || 'unknown'}`);

      // Delete all vectors for this domain
      console.log(`\n🗑️  Deleting all vectors for domain: ${settings.domain}...`);
      await pinecone.deleteAllForDomain();

      // Wait a moment for deletion to propagate
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get updated stats
      const statsAfter = await pinecone.getStats();
      console.log(`\n✅ Deletion complete!`);
      console.log(`\nUpdated index stats:`);
      console.log(`  Total vectors: ${statsAfter.totalRecordCount || 'unknown'}`);

      console.log('\n✨ Done!\n');
    } catch (error: any) {
      console.error('❌ Delete all failed:', error.message);
      throw error;
    }
  }

  /**
   * Get current progress
   */
  getProgress(): IndexingProgress {
    return { ...this.progress };
  }
}
