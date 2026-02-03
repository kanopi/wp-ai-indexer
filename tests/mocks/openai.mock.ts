import { vi } from 'vitest';

/**
 * Mock OpenAI client
 */
export const createMockOpenAI = () => {
  return {
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: new Array(1536).fill(0.1) }],
      }),
    },
  };
};

/**
 * Mock batch embeddings response
 */
export const createMockBatchEmbeddings = (count: number) => {
  return {
    data: Array(count).fill(null).map(() => ({
      embedding: new Array(1536).fill(0.1),
    })),
  };
};

/**
 * Mock rate limit error
 */
export const createRateLimitError = () => {
  const error: any = new Error('Rate limit exceeded');
  error.status = 429;
  return error;
};

/**
 * Mock server error
 */
export const createServerError = () => {
  const error: any = new Error('Internal server error');
  error.status = 500;
  return error;
};

/**
 * Mock network error
 */
export const createNetworkError = () => {
  const error: any = new Error('Connection reset');
  error.code = 'ECONNRESET';
  return error;
};
