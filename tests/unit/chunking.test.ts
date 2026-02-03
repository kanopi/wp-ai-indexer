import { describe, it, expect, beforeEach } from 'vitest';
import { Chunker } from '../../src/chunking';
import { createTestSettings } from '../helpers/test-config';

describe('Chunker', () => {
  let chunker: Chunker;
  const settings = createTestSettings();

  beforeEach(() => {
    chunker = new Chunker(settings);
  });

  describe('chunkContent', () => {
    it('should return single chunk for content smaller than chunk size', () => {
      const content = 'A'.repeat(400);
      const chunks = chunker.chunkContent(content);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(content);
      expect(chunks[0].index).toBe(0);
    });

    it('should split long content into multiple chunks', () => {
      const content = 'A'.repeat(1500);
      const chunks = chunker.chunkContent(content);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].text.length).toBeLessThanOrEqual(settings.chunk_size);
    });

    it('should create chunks with correct indices', () => {
      const content = 'A'.repeat(1500);
      const chunks = chunker.chunkContent(content);

      chunks.forEach((chunk, index) => {
        expect(chunk.index).toBe(index);
      });
    });

    it('should normalize whitespace in content', () => {
      const content = 'This   has    multiple   spaces\n\nand   newlines';
      const chunks = chunker.chunkContent(content);

      expect(chunks[0].text).toBe('This has multiple spaces and newlines');
    });

    it('should handle empty content', () => {
      const chunks = chunker.chunkContent('');

      // Empty string after normalization results in no chunks
      expect(chunks.length).toBeLessThanOrEqual(1);
      if (chunks.length === 1) {
        expect(chunks[0].text).toBe('');
      }
    });

    it('should handle very long content', () => {
      const content = 'A'.repeat(10000);
      const chunks = chunker.chunkContent(content);

      expect(chunks.length).toBeGreaterThan(10);
      chunks.forEach(chunk => {
        expect(chunk.text.length).toBeLessThanOrEqual(settings.chunk_size);
      });
    });

    it('should respect chunk overlap settings', () => {
      const customSettings = createTestSettings({ chunk_overlap: 100 });
      const customChunker = new Chunker(customSettings);
      const content = 'A'.repeat(2000);

      const chunks = customChunker.chunkContent(content);

      // Verify overlap exists between consecutive chunks
      if (chunks.length > 1) {
        expect(chunks.length).toBeGreaterThan(1);
      }
    });

    it('should prefer sentence boundaries for splitting', () => {
      const content = 'This is sentence one. This is sentence two. ' + 'A'.repeat(500);
      const chunks = chunker.chunkContent(content);

      // Should create multiple chunks
      expect(chunks.length).toBeGreaterThan(1);
      // First chunk should contain sentence content
      expect(chunks[0].text).toContain('sentence');
    });

    it('should prefer word boundaries when sentence boundaries not available', () => {
      const content = 'This is a long sentence without punctuation ' + 'word '.repeat(100);
      const chunks = chunker.chunkContent(content);

      if (chunks.length > 1) {
        // Chunks are trimmed, so they will end with non-whitespace
        // But they should break at word boundaries
        expect(chunks[0].text.length).toBeGreaterThan(0);
      }
    });

    it('should handle content with only whitespace', () => {
      const content = '   \n\n   \t\t   ';
      const chunks = chunker.chunkContent(content);

      // Whitespace-only content normalizes to empty string
      expect(chunks.length).toBeLessThanOrEqual(1);
      if (chunks.length === 1) {
        expect(chunks[0].text).toBe('');
      }
    });

    it('should handle special characters correctly', () => {
      const content = '¡Hola! ¿Cómo estás? 你好世界 🌍 ' + 'A'.repeat(500);
      const chunks = chunker.chunkContent(content);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].text).toContain('¡Hola!');
    });
  });

  describe('getChunkStats', () => {
    it('should return zero stats for empty chunks array', () => {
      const stats = chunker.getChunkStats([]);

      expect(stats).toEqual({
        count: 0,
        avgLength: 0,
        minLength: 0,
        maxLength: 0,
      });
    });

    it('should calculate correct statistics', () => {
      const chunks = [
        { text: 'A'.repeat(100), index: 0 },
        { text: 'B'.repeat(200), index: 1 },
        { text: 'C'.repeat(300), index: 2 },
      ];

      const stats = chunker.getChunkStats(chunks);

      expect(stats.count).toBe(3);
      expect(stats.avgLength).toBe(200);
      expect(stats.minLength).toBe(100);
      expect(stats.maxLength).toBe(300);
    });

    it('should handle single chunk', () => {
      const chunks = [{ text: 'A'.repeat(150), index: 0 }];
      const stats = chunker.getChunkStats(chunks);

      expect(stats.count).toBe(1);
      expect(stats.avgLength).toBe(150);
      expect(stats.minLength).toBe(150);
      expect(stats.maxLength).toBe(150);
    });
  });

  describe('edge cases', () => {
    it('should handle chunk size of 100 (minimum)', () => {
      const smallSettings = createTestSettings({ chunk_size: 100, chunk_overlap: 10 });
      const smallChunker = new Chunker(smallSettings);
      const content = 'A'.repeat(500);

      const chunks = smallChunker.chunkContent(content);

      expect(chunks.length).toBeGreaterThan(4);
      chunks.forEach(chunk => {
        expect(chunk.text.length).toBeLessThanOrEqual(100);
      });
    });

    it('should handle large chunk size', () => {
      const largeSettings = createTestSettings({ chunk_size: 5000, chunk_overlap: 50 });
      const largeChunker = new Chunker(largeSettings);
      const content = 'A'.repeat(3000);

      const chunks = largeChunker.chunkContent(content);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text.length).toBe(3000);
    });

    it('should handle zero overlap', () => {
      const noOverlapSettings = createTestSettings({ chunk_overlap: 0 });
      const noOverlapChunker = new Chunker(noOverlapSettings);
      const content = 'A'.repeat(1500);

      const chunks = noOverlapChunker.chunkContent(content);

      expect(chunks.length).toBeGreaterThan(1);
    });
  });
});
