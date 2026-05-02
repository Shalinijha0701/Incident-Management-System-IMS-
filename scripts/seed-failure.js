#!/usr/bin/env node
/*
 * Simulate a failure across multiple components by enqueuing a batch of
 * failure signals into the BullMQ queue. This script can be run from
 * within the backend service container or from the host when the
 * environment variables for Redis are set appropriately. It produces
 * signals for both an RDBMS outage and a generic API failure.
 */
require('dotenv').config();
const { Queue } = require('bullmq');

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;

const queue = new Queue('signals', {
  connection: { host: redisHost, port: redisPort }
});

async function seed() {
  console.log('Seeding failure events...');
  // Create a sequence of simulated failures across different component types.
  // The counts are intentionally varied to reflect different severities and durations.
  const scenarios = [
    {
      type: 'RDBMS',
      id: 'RDBMS_CLUSTER_01',
      message: 'Database connection error',
      count: 50
    },
    {
      type: 'API',
      id: 'API_SERVICE_01',
      message: 'Service unavailable',
      count: 40
    },
    {
      type: 'CACHE',
      id: 'CACHE_CLUSTER_01',
      message: 'Cache miss rate high',
      count: 30
    },
    {
      type: 'Async Queue',
      id: 'ASYNC_QUEUE_01',
      message: 'Queue backlog growing',
      count: 20
    },
    {
      type: 'MCP',
      id: 'MCP_HOST_01',
      message: 'Master Control Program failure',
      count: 10
    }
  ];
  for (const scenario of scenarios) {
    for (let i = 0; i < scenario.count; i++) {
      await queue.add('signal', {
        componentId: scenario.id,
        componentType: scenario.type,
        message: scenario.message,
        timestamp: Date.now()
      });
    }
  }
  console.log('Seeding complete.');
  await queue.close();
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});