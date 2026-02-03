/**
 * Utility functions for the indexer
 */

/**
 * Process items with controlled concurrency
 * Similar to Promise.allSettled but with concurrency control
 *
 * @param items Array of items to process
 * @param processor Function to process each item
 * @param concurrency Maximum number of concurrent operations
 * @returns Array of results with same order as input
 */
export async function processWithConcurrency<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency: number = 5
): Promise<Array<{ status: 'fulfilled'; value: R } | { status: 'rejected'; reason: any }>> {
  const results: Array<{ status: 'fulfilled'; value: R } | { status: 'rejected'; reason: any }> =
    new Array(items.length);

  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Create promise for this item
    const promise = processor(item, i)
      .then((value) => {
        results[i] = { status: 'fulfilled', value };
      })
      .catch((reason) => {
        results[i] = { status: 'rejected', reason };
      });

    // Add to executing queue
    executing.push(promise);

    // If we've reached max concurrency, wait for one to complete
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // Remove completed promises
      const completedIndices: number[] = [];
      executing.forEach((p, idx) => {
        // Check if the corresponding result is filled
        const resultIndex = items.findIndex((_, itemIdx) =>
          itemIdx >= i - executing.length + 1 &&
          itemIdx <= i &&
          results[itemIdx] !== undefined
        );
        if (resultIndex >= 0) {
          completedIndices.push(idx);
        }
      });

      // Remove the first completed promise
      if (completedIndices.length > 0) {
        executing.splice(0, 1);
      }
    }
  }

  // Wait for all remaining items to complete
  await Promise.all(executing);

  return results;
}

/**
 * Create content hash using a simple string hashing algorithm
 * Used for detecting content changes
 */
export function createContentHash(content: string): string {
  let hash = 0;

  if (content.length === 0) return hash.toString();

  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(36);
}

/**
 * Rate limiter using token bucket algorithm
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;

  /**
   * @param requestsPerSecond Maximum requests per second
   * @param burstSize Maximum burst size (defaults to requestsPerSecond)
   */
  constructor(requestsPerSecond: number, burstSize?: number) {
    this.capacity = burstSize || requestsPerSecond;
    this.refillRate = requestsPerSecond;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Wait until a token is available, then consume it
   */
  async acquire(tokensNeeded: number = 1): Promise<void> {
    while (true) {
      this.refill();

      if (this.tokens >= tokensNeeded) {
        this.tokens -= tokensNeeded;
        return;
      }

      // Wait before checking again
      const tokensShortage = tokensNeeded - this.tokens;
      const waitTime = (tokensShortage / this.refillRate) * 1000;
      await this.delay(Math.min(waitTime, 100));
    }
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refill(): void {
    const now = Date.now();
    const timeSinceLastRefill = (now - this.lastRefill) / 1000;
    const tokensToAdd = timeSinceLastRefill * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit breaker for handling cascading failures
 */
export class CircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly resetTimeout: number = 60000 // 60 seconds
  ) {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();

      // Success - reset failure count if in half-open state
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      // Open circuit if threshold exceeded
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'open';
      }

      throw error;
    }
  }

  getState(): string {
    return this.state;
  }

  reset(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  maxDelay: number = 60000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry if this is the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = delay * 0.25 * (Math.random() - 0.5);
      const waitTime = Math.floor(delay + jitter);

      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw lastError;
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: any): boolean {
  // Retry on rate limit, timeout, or server errors
  if (error.status) {
    return error.status === 429 || error.status >= 500;
  }

  // Retry on network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  return false;
}
