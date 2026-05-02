/*
 * Redis client shared across the IMS backend and workers. This client is
 * responsible for caching debouncing keys and may be reused wherever
 * low-latency key/value access is required.
 */
const Redis = require('ioredis');

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379
});

module.exports = { redisClient };