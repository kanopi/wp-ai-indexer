/**
 * Chunking Module
 * Deterministic content chunking with overlap
 */

import { Chunk, IndexerSettings } from './types';

export class Chunker {
  private settings: IndexerSettings;

  constructor(settings: IndexerSettings) {
    this.settings = settings;
  }

  /**
   * Split content into overlapping chunks
   *
   * Uses character-based chunking (not token-based) for deterministic behavior
   */
  chunkContent(content: string): Chunk[] {
    const chunkSize = this.settings.chunk_size;
    const chunkOverlap = this.settings.chunk_overlap;

    // Normalize whitespace
    content = content.replace(/\s+/g, ' ').trim();

    // If content is smaller than chunk size, return as single chunk
    if (content.length <= chunkSize) {
      return [{ text: content, index: 0 }];
    }

    const chunks: Chunk[] = [];
    let position = 0;
    let chunkIndex = 0;

    while (position < content.length) {
      // Calculate end position for this chunk
      let endPosition = position + chunkSize;

      // If this is not the last chunk, try to break at a sentence or word boundary
      if (endPosition < content.length) {
        endPosition = this.findBreakPoint(content, position, endPosition);
      } else {
        endPosition = content.length;
      }

      // Extract chunk text
      const chunkText = content.slice(position, endPosition).trim();

      if (chunkText.length > 0) {
        chunks.push({
          text: chunkText,
          index: chunkIndex,
        });
        chunkIndex++;
      }

      // Move position forward
      // Overlap with previous chunk if not at the end
      if (endPosition < content.length) {
        position = endPosition - chunkOverlap;
        // Ensure we don't move backwards
        if (position <= chunks[chunks.length - 1]?.text.length) {
          position = endPosition;
        }
      } else {
        break;
      }
    }

    return chunks;
  }

  /**
   * Find a good break point for chunking
   * Prefers: sentence boundary > word boundary > character position
   */
  private findBreakPoint(content: string, start: number, idealEnd: number): number {
    // Look for sentence boundaries within the last 20% of the chunk
    const searchStart = idealEnd - Math.floor(this.settings.chunk_size * 0.2);
    const searchRegion = content.slice(searchStart, idealEnd);

    // Try to find sentence ending
    const sentenceEndings = /[.!?]\s/g;
    let match;
    let lastSentenceEnd = -1;

    while ((match = sentenceEndings.exec(searchRegion)) !== null) {
      lastSentenceEnd = searchStart + match.index + 1;
    }

    if (lastSentenceEnd > start) {
      return lastSentenceEnd;
    }

    // Try to find word boundary
    const wordBoundary = /\s/g;
    let lastWordBoundary = -1;

    while ((match = wordBoundary.exec(searchRegion)) !== null) {
      lastWordBoundary = searchStart + match.index;
    }

    if (lastWordBoundary > start) {
      return lastWordBoundary;
    }

    // Fall back to ideal position
    return idealEnd;
  }

  /**
   * Get chunk statistics
   */
  getChunkStats(chunks: Chunk[]): {
    count: number;
    avgLength: number;
    minLength: number;
    maxLength: number;
  } {
    if (chunks.length === 0) {
      return { count: 0, avgLength: 0, minLength: 0, maxLength: 0 };
    }

    const lengths = chunks.map(c => c.text.length);
    const sum = lengths.reduce((a, b) => a + b, 0);

    return {
      count: chunks.length,
      avgLength: Math.round(sum / chunks.length),
      minLength: Math.min(...lengths),
      maxLength: Math.max(...lengths),
    };
  }
}
