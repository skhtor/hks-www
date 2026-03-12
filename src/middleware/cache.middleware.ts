import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../config/redis';

/**
 * Cache middleware factory
 * Caches GET responses in Redis with a configurable TTL
 *
 * Requirements: 3.5, 3.6 - Performance caching
 */
export function cacheResponse(ttlSeconds: number, keyPrefix?: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      next();
      return;
    }

    const prefix = keyPrefix ?? req.baseUrl.replace(/\//g, ':').replace(/^:/, '');
    const cacheKey = `${prefix}:${req.url}`;

    try {
      const redis = getRedisClient();
      if (redis.isOpen) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          res.setHeader('X-Cache', 'HIT');
          res.json(JSON.parse(cached));
          return;
        }
      }
    } catch {
      // Redis unavailable - fall through
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        getRedisClient()
          .setEx(cacheKey, ttlSeconds, JSON.stringify(body))
          .catch(() => {/* non-fatal */});
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

/**
 * Invalidate cache keys matching a pattern
 */
export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const redis = getRedisClient();
    if (!redis.isOpen) return;

    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch {
    // Non-fatal
  }
}
