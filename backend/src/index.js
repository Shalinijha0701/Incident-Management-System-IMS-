/*
 * Entry point for the IMS backend server.
 *
 * This Fastify server exposes several APIs:
 *  - POST /ingest: Accepts incoming signals and enqueues them into a BullMQ queue. A rate
 *    limiter protects this endpoint from excessive load. Signals are always accepted
 *    immediately; persistence is handled asynchronously by workers. Throughput metrics
 *    (signals per second) are printed to the console every 5 seconds.
 *  - GET /health: Returns a simple health report indicating whether Redis, PostgreSQL
 *    and MongoDB are reachable.
 *  - GET /work-items: Returns all recorded work items ordered by start time.
 *  - GET /work-items/:id: Returns a single work item along with its associated raw
 *    signals from MongoDB.
 *  - POST /work-items/:id/transition: Performs a state transition on a work item. A
 *    root cause analysis (RCA) object must be supplied when moving to CLOSED.
 *
 * A WebSocket endpoint at /live-feed streams newly created work items to connected
 * clients. The worker publishes new work item notifications via Redis pub/sub; the
 * server subscribes to this channel and relays messages to WebSocket clients.
 */
require('dotenv').config();
const fastify = require('fastify')({ logger: true });
// Use @fastify/websocket for Fastify v4 compatibility
const websocketPlugin = require('@fastify/websocket');
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const {
  initDb,
  getWorkItems,
  getWorkItemById,
  updateWorkItemStatus,
  getSignalsByWorkItemId
} = require('./models');

const {
  getList: getCachedList,
  setList: setCachedList,
  updateWorkItem: updateCachedWorkItem
} = require('./utils/dashboardCache');
const { redisClient } = require('./cache/redis');
const { WorkItemStateMachine } = require('./workflows/stateMachine');

// Import new utilities for innovative features
const { suggestRCA } = require('./utils/rcaSuggestion');
const { calculateSLAStatus, determineSeverity } = require('./utils/slaTracking');
const { assignOwner } = require('./utils/ownerAssignment');
const { detectCorrelation, buildCascadeChain } = require('./utils/correlationDetection');
const { getAuditLog, logTransition, initAuditLog } = require('./utils/auditLog');
const { generateHTMLReport, generateTextReport } = require('./utils/pdfExport');
const { predictSLABreach } = require('./utils/slaPrediction');
const {
  sendIncidentNotification,
  getNotifications,
  getNotificationStats
} = require('./utils/notificationService');

const redisConnection = {
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
  maxRetriesPerRequest: null
};

// Initialise BullMQ queue for signals
const signalQueue = new Queue('signals', { connection: redisConnection });

// Dead‑letter queue for failed signal processing. Jobs inserted into
// this queue originate from the worker when retries are exhausted.
const dlqQueue = new Queue('dead-letter', { connection: redisConnection });

// Counters to track throughput and total signals. signalCount records
// events in the current 5‑second window; signalTotal accumulates all
// ingested signals for Prometheus metrics. lastThroughput stores the
// most recent throughput calculation.
let signalCount = 0;
let signalTotal = 0;
let lastThroughput = 0;
setInterval(() => {
  const throughput = signalCount / 5;
  lastThroughput = throughput;
  fastify.log.info({ msg: 'Throughput', signalsPerSecond: throughput });
  signalCount = 0;
}, 5000);

// In-memory rate limiter per IP. This avoids the need for an external plugin
// and protects the ingestion endpoint from being overwhelmed. Each IP may
// perform up to `MAX_REQUESTS` requests within `WINDOW_MS` milliseconds.
const rateLimitState = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5000;

fastify.addHook('preHandler', (request, reply, done) => {
  // Only rate limit the ingestion endpoint
  if (request.raw.url !== '/ingest') {
    return done();
  }
  const ip = request.ip || request.headers['x-forwarded-for'] || request.socket.remoteAddress;
  const now = Date.now();
  let entry = rateLimitState.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    entry = { count: 0, start: now };
  }
  entry.count++;
  rateLimitState.set(ip, entry);
  if (entry.count > MAX_REQUESTS) {
    reply.code(429).send({ error: 'Too Many Requests' });
    return;
  }
  done();
});

// Enable WebSocket support
fastify.register(websocketPlugin);

// Maintain a list of connected WebSocket clients
const wsClients = new Set();

// Subscribe to work item creation events via Redis pub/sub
const subscriber = new Redis(redisConnection);
subscriber.subscribe('workitem:created', (err, count) => {
  if (err) {
    fastify.log.error('Failed to subscribe to workitem:created channel', err);
  } else {
    fastify.log.info(`Subscribed to workitem:created channel (${count} subscriptions)`);
  }
});
subscriber.on('message', (channel, message) => {
  if (channel === 'workitem:created') {
    for (const client of wsClients) {
      try {
        client.send(message);
      } catch (e) {
        fastify.log.warn('Failed to send to WebSocket client', e);
      }
    }
  }
});

// Graceful shutdown: handle SIGINT and SIGTERM to close resources cleanly.
async function gracefulShutdown() {
  try {
    fastify.log.info('Received shutdown signal, closing server...');
    // Stop accepting new connections and finish existing ones
    await fastify.close();
  } catch (e) {
    fastify.log.error('Error closing Fastify server', e);
  }
  try {
    // Pause the signal queue so no new jobs are processed
    await signalQueue.close();
  } catch (e) {
    fastify.log.error('Error closing signal queue', e);
  }
  try {
    await dlqQueue.close();
  } catch (e) {
    fastify.log.error('Error closing dead-letter queue', e);
  }
  try {
    // Unsubscribe and disconnect Redis clients
    await subscriber.unsubscribe('workitem:created');
    await subscriber.quit();
  } catch (e) {
    fastify.log.error('Error closing Redis subscriber', e);
  }
  try {
    await redisClient.quit();
  } catch (e) {
    fastify.log.error('Error closing Redis client', e);
  }
  try {
    const db = await initDb();
    await db.pg.end();
    // Close the Mongoose connection (if open)
    if (db.mongooseConnection && db.mongooseConnection.close) {
      await db.mongooseConnection.close();
    }
  } catch (e) {
    fastify.log.error('Error closing database connections', e);
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown());
process.on('SIGTERM', () => gracefulShutdown());

// Ingestion endpoint
fastify.post('/ingest', async (request, reply) => {
  const signal = request.body;
  // Basic input validation: ensure essential fields exist and have correct types
  const { componentId, componentType, message } = signal || {};
  const allowedTypes = ['RDBMS', 'API', 'CACHE', 'Async Queue', 'MCP'];
  if (
    !componentId || typeof componentId !== 'string' ||
    !componentType || typeof componentType !== 'string' ||
    !message || typeof message !== 'string' ||
    !allowedTypes.includes(componentType)
  ) {
    reply.code(400).send({ error: 'Invalid signal payload' });
    return;
  }
  try {
    await signalQueue.add('signal', signal, { removeOnComplete: true, attempts: 3 });
    signalCount += 1;
    signalTotal += 1;
    reply.send({ accepted: true });
  } catch (err) {
    fastify.log.error('Failed to enqueue signal', err);
    reply.code(500).send({ error: 'Failed to enqueue signal' });
  }
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  const health = { redis: false, postgres: false, mongo: false };
  try {
    await redisClient.ping();
    health.redis = true;
  } catch (e) {}
  try {
    const db = await initDb();
    await db.pg.query('SELECT 1');
    health.postgres = true;
  } catch (e) {}
  try {
    const db = await initDb();
    await db.mongooseConnection.db.admin().ping();
    health.mongo = true;
  } catch (e) {}
  reply.send(health);
});

// Retrieve all work items, using Redis cache if available. The list is
// maintained by the worker and update endpoint to avoid frequent database
// queries on the dashboard.
fastify.get('/work-items', async (request, reply) => {
  let items;
  try {
    const cached = await getCachedList();
    if (cached) {
      items = cached;
    } else {
      items = await getWorkItems();
      // Sort items by severity before caching
      const severityOrder = { RDBMS: 0, API: 1, CACHE: 2, 'Async Queue': 3, MCP: 4 };
      items = items.sort((a, b) => {
        const aVal = severityOrder[a.component_type] ?? 99;
        const bVal = severityOrder[b.component_type] ?? 99;
        return aVal - bVal;
      });
      await setCachedList(items);
    }
  } catch (e) {
    // Fallback to DB query on cache errors
    items = await getWorkItems();
  }
  
  // Enrich items with SLA and owner information
  const enrichedItems = items.map(item => {
    const severity = item.severity || determineSeverity(item.component_type, item.signal_count);
    const slaStatus = calculateSLAStatus(item, severity);
    const owner = item.assigned_owner ? { team: item.assigned_team, owner: item.assigned_owner } : assignOwner(item.component_type);
    
    return {
      ...item,
      severity,
      sla: slaStatus,
      assignedTeam: owner.team,
      assignedOwner: owner.owner
    };
  });
  
  reply.send(enrichedItems);
});

// Timeseries metrics endpoint. This endpoint returns an array of buckets
// summarising the number of incidents per hour. It leverages TimescaleDB's
// time_bucket function on the start_time column of the work_items hypertable.
fastify.get('/metrics/incidents-per-hour', async (request, reply) => {
  try {
    const db = await initDb();
    const res = await db.pg.query(
      `SELECT to_char(bucket, 'YYYY-MM-DD HH24:MI') as bucket,
              count AS count
       FROM (
         SELECT time_bucket('1 hour', start_time) AS bucket, COUNT(*) AS count
         FROM work_items
         GROUP BY bucket
         ORDER BY bucket
       ) sub;`
    );
    reply.send(res.rows);
  } catch (e) {
    fastify.log.error('Failed to query timeseries metrics', e);
    reply.code(500).send({ error: 'Failed to compute metrics' });
  }
});

// MTTR metrics endpoint: returns average MTTR per hour bucket for closed
// incidents. This leverages TimescaleDB's time_bucket on the end_time
// column and averages the mttr column.
fastify.get('/metrics/mttr-per-hour', async (request, reply) => {
  try {
    const db = await initDb();
    const res = await db.pg.query(
      `SELECT to_char(bucket, 'YYYY-MM-DD HH24:MI') as bucket,
              avg_mttr
       FROM (
         SELECT time_bucket('1 hour', end_time) AS bucket, AVG(mttr) AS avg_mttr
         FROM work_items
         WHERE mttr IS NOT NULL
         GROUP BY bucket
         ORDER BY bucket
       ) sub;`
    );
    reply.send(res.rows);
  } catch (e) {
    fastify.log.error('Failed to query MTTR metrics', e);
    reply.code(500).send({ error: 'Failed to compute MTTR metrics' });
  }
});

// Prometheus‑style metrics endpoint. Returns counters in the
// Prometheus exposition format. It includes the total number of
// ingested signals, the most recent throughput measurement and the
// number of work items in each state.
fastify.get('/prometheus-metrics', async (request, reply) => {
  let metrics = '';
  metrics += `ims_signals_total ${signalTotal}\n`;
  metrics += `ims_signal_throughput_per_second ${lastThroughput}\n`;
  try {
    const db = await initDb();
    const res = await db.pg.query('SELECT status, COUNT(*) AS count FROM work_items GROUP BY status');
    for (const row of res.rows) {
      metrics += `ims_active_incidents_total{status="${row.status}"} ${row.count}\n`;
    }
  } catch (e) {
    fastify.log.error('Failed to fetch incident counts for metrics', e);
  }
  reply.header('Content-Type', 'text/plain; version=0.0.4');
  reply.send(metrics);
});

// Dead‑letter queue inspection endpoint. Returns a list of entries
// currently stored in the dead-letter queue. At most the first 50 jobs
// across all states are returned.
fastify.get('/dlq', async (request, reply) => {
  try {
    const jobs = await dlqQueue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed'], 0, 50);
    const result = jobs.map(job => job.data);
    reply.send(result);
  } catch (e) {
    fastify.log.error('Failed to retrieve DLQ', e);
    reply.code(500).send({ error: 'Failed to retrieve DLQ' });
  }
});

// Retrieve a single work item and its associated signals
fastify.get('/work-items/:id', async (request, reply) => {
  const id = request.params.id;
  const item = await getWorkItemById(id);
  if (!item) {
    return reply.code(404).send({ error: 'Work item not found' });
  }
  const signals = await getSignalsByWorkItemId(id);
  reply.send({ workItem: item, signals });
});

// Transition a work item to a new state
fastify.post('/work-items/:id/transition', async (request, reply) => {
  const id = request.params.id;
  const { to, rca, start_time: newStart, end_time: newEnd } = request.body;
  const item = await getWorkItemById(id);
  if (!item) {
    return reply.code(404).send({ error: 'Work item not found' });
  }
  // Validate state transition and RCA
  const machine = new WorkItemStateMachine();
  try {
    machine.transition(item.status, to, { ...item, rca });
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
  // Persist changes to DB; update start_time/end_time if provided
  await updateWorkItemStatus(id, to, rca, newStart, newEnd);
  
  // Log transition to audit trail
  try {
    await logTransition(id, item.status, to, { rca, changedBy: 'operator' });
  } catch (e) {
    fastify.log.warn('Failed to log transition to audit trail', e);
  }
  
  // Update cache: fetch updated item from DB and update the cached list
  try {
    const updatedItem = await getWorkItemById(id);
    await updateCachedWorkItem(updatedItem);
  } catch (e) {
    fastify.log.warn('Failed to update dashboard cache', e);
  }
  reply.send({ success: true });
});

// WebSocket endpoint: pushes newly created work items to clients
fastify.get('/live-feed', { websocket: true }, (connection /* SocketStream */, req) => {
  wsClients.add(connection.socket);
  connection.socket.on('close', () => {
    wsClients.delete(connection.socket);
  });
});

// ===== NEW ENDPOINTS FOR INNOVATIVE FEATURES =====

// Suggest RCA based on signals
fastify.get('/work-items/:id/rca-suggestion', async (request, reply) => {
  const id = request.params.id;
  try {
    const signals = await getSignalsByWorkItemId(id);
    const suggestion = suggestRCA(signals);
    reply.send(suggestion);
  } catch (e) {
    fastify.log.error('Failed to generate RCA suggestion', e);
    reply.code(500).send({ error: 'Failed to generate suggestion' });
  }
});

// Get SLA status for a work item
fastify.get('/work-items/:id/sla-status', async (request, reply) => {
  const id = request.params.id;
  try {
    const workItem = await getWorkItemById(id);
    if (!workItem) {
      return reply.code(404).send({ error: 'Work item not found' });
    }
    const severity = workItem.severity || determineSeverity(workItem.component_type, workItem.signal_count);
    const slaStatus = calculateSLAStatus(workItem, severity);
    reply.send(slaStatus);
  } catch (e) {
    fastify.log.error('Failed to fetch SLA status', e);
    reply.code(500).send({ error: 'Failed to fetch SLA status' });
  }
});

// Get audit trail for a work item
fastify.get('/work-items/:id/audit', async (request, reply) => {
  const id = request.params.id;
  try {
    const auditLog = await getAuditLog(id);
    reply.send(auditLog);
  } catch (e) {
    fastify.log.error('Failed to fetch audit log', e);
    reply.code(500).send({ error: 'Failed to fetch audit log' });
  }
});

// Get correlated incidents
fastify.get('/work-items/:id/correlations', async (request, reply) => {
  const id = request.params.id;
  try {
    const workItem = await getWorkItemById(id);
    if (!workItem) {
      return reply.code(404).send({ error: 'Work item not found' });
    }
    const allIncidents = await getWorkItems();
    const correlation = detectCorrelation(workItem, allIncidents);
    const cascadeChain = buildCascadeChain(workItem, allIncidents);
    reply.send({
      correlation,
      cascadeChain: cascadeChain.map(w => ({
        id: w.id,
        component: w.component_type,
        status: w.status,
        startTime: w.start_time
      }))
    });
  } catch (e) {
    fastify.log.error('Failed to fetch correlations', e);
    reply.code(500).send({ error: 'Failed to fetch correlations' });
  }
});

// Export incident as HTML report
fastify.get('/work-items/:id/report/html', async (request, reply) => {
  const id = request.params.id;
  try {
    const workItem = await getWorkItemById(id);
    if (!workItem) {
      return reply.code(404).send({ error: 'Work item not found' });
    }
    const signals = await getSignalsByWorkItemId(id);
    const auditLog = await getAuditLog(id);
    const html = generateHTMLReport(workItem, signals, auditLog);
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.send(html);
  } catch (e) {
    fastify.log.error('Failed to generate report', e);
    reply.code(500).send({ error: 'Failed to generate report' });
  }
});

// Export incident as text report
fastify.get('/work-items/:id/report/text', async (request, reply) => {
  const id = request.params.id;
  try {
    const workItem = await getWorkItemById(id);
    if (!workItem) {
      return reply.code(404).send({ error: 'Work item not found' });
    }
    const signals = await getSignalsByWorkItemId(id);
    const text = generateTextReport(workItem, signals);
    reply.header('Content-Type', 'text/plain');
    reply.send(text);
  } catch (e) {
    fastify.log.error('Failed to generate text report', e);
    reply.code(500).send({ error: 'Failed to generate report' });
  }
});

// Get system observability metrics (live throughput widget)
fastify.get('/observability/live', async (request, reply) => {
  reply.send({
    signalsPerSecond: lastThroughput,
    queueDepth: await signalQueue.count(),
    activeIncidents: (await getWorkItems()).filter(w => w.status !== 'CLOSED').length,
    dlqCount: await dlqQueue.count(),
    timestamp: new Date()
  });
});

// ===== UPGRADE 3: SLA BREACH PREDICTION =====
fastify.get('/work-items/:id/sla-prediction', async (request, reply) => {
  const id = request.params.id;
  try {
    const workItem = await getWorkItemById(id);
    if (!workItem) {
      return reply.code(404).send({ error: 'Work item not found' });
    }

    const severity = workItem.severity || determineSeverity(workItem.component_type, workItem.signal_count);
    const slaStatus = calculateSLAStatus(workItem, severity);
    const signalVelocity = workItem.signal_count || 0;

    const prediction = predictSLABreach(workItem, slaStatus, signalVelocity);
    reply.send(prediction);
  } catch (e) {
    fastify.log.error('Failed to predict SLA breach', e);
    reply.code(500).send({ error: 'Failed to predict SLA breach' });
  }
});

// ===== UPGRADE 4: NOTIFICATION CENTER =====
fastify.get('/notifications', async (request, reply) => {
  try {
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
    const notifications = getNotifications(limit);
    reply.send(notifications);
  } catch (e) {
    fastify.log.error('Failed to fetch notifications', e);
    reply.code(500).send({ error: 'Failed to fetch notifications' });
  }
});

fastify.get('/notifications/stats', async (request, reply) => {
  try {
    const stats = getNotificationStats();
    reply.send(stats);
  } catch (e) {
    fastify.log.error('Failed to fetch notification stats', e);
    reply.code(500).send({ error: 'Failed to fetch notification stats' });
  }
});

// ===== UPGRADE 5: DEMO MODE - SIMULATE OUTAGE =====
fastify.post('/demo/simulate-outage', async (request, reply) => {
  try {
    const scenarios = [
      {
        componentId: 'RDBMS_CLUSTER_01',
        componentType: 'RDBMS',
        message: 'Database connection pool exhausted. Max connections: 100, Current: 112'
      },
      {
        componentId: 'API_SERVICE_01',
        componentType: 'API',
        message: 'API latency spike. Response times up from 50ms to 5000ms'
      },
      {
        componentId: 'CACHE_CLUSTER_01',
        componentType: 'CACHE',
        message: 'Cache miss rate spiking to 85%. Fallback to database load increasing'
      }
    ];

    let totalSignals = 0;

    // Generate signals for cascade effect
    for (const scenario of scenarios) {
      for (let i = 0; i < 25; i++) {
        await signalQueue.add(
          'signal',
          {
            componentId: scenario.componentId,
            componentType: scenario.componentType,
            message: scenario.message
          },
          {
            removeOnComplete: true,
            attempts: 3
          }
        );

        signalCount += 1;
        signalTotal += 1;
        totalSignals += 1;
      }
    }

    reply.send({
      success: true,
      message: 'Demo cascade outage simulated. Check live feed for incidents.',
      totalSignals,
      scenarios: scenarios.length
    });
  } catch (e) {
    fastify.log.error('Failed to simulate outage', e);
    reply.code(500).send({ error: 'Failed to simulate outage' });
  }
});

// Start server
async function startServer() {
  try {
    // Ensure DB connections are established
    const db = await initDb();
    // Initialize audit log table
    await initAuditLog(db.pg);
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`IMS backend listening on port ${port}`);
  } catch (err) {
    fastify.log.error('Error starting server', err);
    process.exit(1);
  }
}
startServer();