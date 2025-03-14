export class TokenBucket {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per millisecond
  private lastRefillTimestamp: number;

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefillTimestamp = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefillTimestamp;
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefillTimestamp = now;
  }

  public async consume(tokensToConsume: number = 1): Promise<void> {
    this.refill();

    if (this.tokens >= tokensToConsume) {
      this.tokens -= tokensToConsume;
      return Promise.resolve();
    }

    // Calculate how long to wait for enough tokens
    const tokensNeeded = tokensToConsume - this.tokens;
    const waitTime = Math.ceil(tokensNeeded / this.refillRate);

    return new Promise((resolve) => {
      setTimeout(() => {
        this.tokens = 0; // Reset tokens to 0 after waiting
        resolve();
      }, waitTime);
    });
  }

  public getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

export class RateLimiter {
  private static instance: RateLimiter;
  private tokenBucket: TokenBucket;
  
  private constructor() {
    // Default: 48 requests per minute = 0.8 requests per second
    const maxTokens = 48;
    const refillRate = 48 / 60000; // tokens per millisecond
    this.tokenBucket = new TokenBucket(maxTokens, refillRate);
  }

  public static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  public async acquireToken(cost: number = 1): Promise<void> {
    return this.tokenBucket.consume(cost);
  }

  public getAvailableTokens(): number {
    return this.tokenBucket.getAvailableTokens();
  }

  public updateRateLimit(requestsPerMinute: number): void {
    const refillRate = requestsPerMinute / 60000; // tokens per millisecond
    this.tokenBucket = new TokenBucket(requestsPerMinute, refillRate);
  }
} 