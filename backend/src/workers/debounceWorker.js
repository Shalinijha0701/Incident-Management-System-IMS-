/*
 * Debounce worker for the IMS. This worker consumes signals from the BullMQ
 * queue and applies a 10-second debounce per component ID. When a new signal
 * arrives:
 *   - If no debouncing key exists in Redis, a new work item is created in
 *     PostgreSQL and a debouncing key is set with a 10-second expiry. The
 *     signal is stored in MongoDB and an alert is dispatched via the
 *     configured strategy. The new work item is published on a Redis pub/sub
 *     channel so that the WebSocket API can push it to the UI.
 *   - If a debouncing key exists, the signal is simply appended to the
 *     existing work item's signal list in MongoDB.
 */

require('dotenv').config();
const { Worker, Queue } = require('bullmq');
const Redis = require('ioredis');
const {
  createWorkItem,
  appendSignalToWorkItem
} = require('../models');
const { addWorkItem } = require('../utils/dashboardCache');
const { redisClient } = require('../cache/redis');
const { alert } = require('../workflows/alertStrategy');

const connection = {
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379
};

// Separate Redis client for publishing events
const pub = new Redis(connection);

// Dead‑letter queue used to capture failed jobs. When a job fails all
// retries, it is added to this queue along with the original job data
// and error details. This makes it easy to inspect or reprocess failed
// signals without dropping them silently.
const dlqQueue = new Queue('dead-letter', { connection });

// Create a worker to process jobs from the "signals" queue
const worker = new Worker(
  'signals',
  async job => {
    const signal = job.data;
    const componentId = signal.componentId;
    const componentType = signal.componentType;
    const key = `debounce:${componentId}`;
    const existingWorkItemId = await redisClient.get(key);
    if (!existingWorkItemId) {
      // Create a new work item
      const workItem = await createWorkItem(componentId, componentType);
      // Set debounce key with expiry of 10 seconds
      await redisClient.set(key, workItem.id, 'EX', 10);
      // Store signal in Mongo
      await appendSignalToWorkItem(workItem.id, signal);
      // Trigger alert
      alert(componentType, workItem);
      // Publish work item to WebSocket subscribers via Redis pub/sub
      await pub.publish('workitem:created', JSON.stringify(workItem));
      // Update dashboard cache with the new work item
      try {
        await addWorkItem(workItem);
      } catch (e) {
        console.error('Failed to update dashboard cache', e);
      }
    } else {
      // Append signal to existing work item
      await appendSignalToWorkItem(existingWorkItemId, signal);
    }
  },
  { connection }
);

worker.on('completed', job => {
  // Silence completion notifications; could be extended for metrics
});

worker.on('failed', (job, err) => {
  console.error('Worker failed processing job', job.id, err);
  // Enqueue the failed job into the dead-letter queue for later inspection.
  (async () => {
    try {
      await dlqQueue.add('failed-signal', {
        originalJob: job.data,
        error: err && err.message ? err.message : String(err)
      });
    } catch (e) {
      console.error('Failed to enqueue to dead-letter queue', e);
    }
  })();
});