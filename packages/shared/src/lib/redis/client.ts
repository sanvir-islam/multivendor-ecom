// // packages/shared/src/lib/redis/client.ts
// // Redis client singleton — used for caching, rate limiting, presence, pub/sub
// //
// // USAGE:
// //   import { redis } from '@multivendor-ecom/shared';
// //
// //   // Cache a value (with 5 min TTL):
// //   await redis.set('user:123:profile', JSON.stringify(user), 'EX', 300);
// //
// //   // Read cached value:
// //   const cached = await redis.get('user:123:profile');
// //   if (cached) return JSON.parse(cached);
// //
// //   // Delete cached value (cache invalidation):
// //   await redis.del('user:123:profile');
// //
// //   // Increment a counter (rate limiting):
// //   const count = await redis.incr('login-attempts:192.168.1.1');
// //   await redis.expire('login-attempts:192.168.1.1', 60); // expires in 60s

// import Redis from 'ioredis';

// const REDIS_URL = process.env.REDIS_URL || 'redis://:ecom_redis_2026@localhost:6379';

// // Create singleton Redis client
// // lazyConnect: true = doesn't connect until first command is sent
// // This prevents connection errors during import in test environments
// export const redis = new Redis(REDIS_URL, {
//   lazyConnect: true,
//   maxRetriesPerRequest: 3,
//   retryStrategy(times) {
//     // Exponential backoff: 200ms, 400ms, 800ms... max 5 seconds
//     const delay = Math.min(times * 200, 5000);
//     return delay;
//   },
// });

// // Connection event handlers
// redis.on('connect', () => {
//   console.log('[Redis] Connected');
// });

// redis.on('error', (err) => {
//   console.error('[Redis] Connection error:', err.message);
// });

// // Helper: connect explicitly (call in main.ts startup)
// export async function connectRedis(): Promise<void> {
//   if (redis.status === 'ready') return;
//   await redis.connect();
// }

// // Helper: disconnect (call in shutdown)
// export async function disconnectRedis(): Promise<void> {
//   if (redis.status === 'end') return;
//   await redis.quit();
// }
