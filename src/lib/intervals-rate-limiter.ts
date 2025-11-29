/**
 * Rate Limiter for Intervals API
 *
 * Ensures we don't exceed 100 requests per minute per IP
 * Safety limit set to 90 req/min to provide buffer
 */

class IntervalRateLimiter {
  private requestTimestamps: number[] = [];
  private readonly maxRequestsPerMinute: number;
  private readonly minuteInMs = 60 * 1000;

  constructor(maxRequestsPerMinute: number = 90) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
  }

  /**
   * Wait if necessary to respect rate limit
   */
  private async throttle(): Promise<void> {
    const now = Date.now();

    // Remove timestamps older than 1 minute
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => now - timestamp < this.minuteInMs
    );

    // If at limit, calculate wait time
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      const oldestTimestamp = this.requestTimestamps[0];
      const waitTime = this.minuteInMs - (now - oldestTimestamp) + 100; // +100ms buffer

      console.log(`[Rate Limiter] At limit (${this.requestTimestamps.length}/${this.maxRequestsPerMinute}). Waiting ${waitTime}ms...`);

      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Remove the oldest timestamp after waiting
      this.requestTimestamps.shift();
    }

    // Record this request
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Execute a request function with rate limiting
   */
  async execute<T>(requestFunction: () => Promise<T>): Promise<T> {
    await this.throttle();
    return await requestFunction();
  }

  /**
   * Get current usage stats
   */
  getStats() {
    const now = Date.now();
    const recentRequests = this.requestTimestamps.filter(
      timestamp => now - timestamp < this.minuteInMs
    );

    return {
      requestsInLastMinute: recentRequests.length,
      maxPerMinute: this.maxRequestsPerMinute,
      remaining: this.maxRequestsPerMinute - recentRequests.length
    };
  }
}

// Export singleton instance
export const intervalsRateLimiter = new IntervalRateLimiter(90);
