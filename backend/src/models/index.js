/*
 * Database layer for the IMS backend.
 *
 * This module initialises connections to PostgreSQL (for structured work items)
 * and MongoDB (for raw signal storage). It exposes helper functions for
 * creating work items, updating their state, and reading signals associated
 * with a particular work item.
 */
const { Pool } = require('pg');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { withRetry } = require('../utils/retry');

let pgPool;
let mongooseConnection;

/**
 * Initialise database connections. Subsequent calls reuse existing clients.
 *
 * The function also creates the `work_items` table if it does not already
 * exist. This table stores one record per incident or work item.
 *
 * @returns {Promise<{pg: Pool, mongooseConnection: mongoose.Connection}>}
 */
async function initDb() {
  if (!pgPool) {
    pgPool = new Pool({
      host: process.env.PG_HOST || 'postgres',
      port: process.env.PG_PORT ? parseInt(process.env.PG_PORT, 10) : 5432,
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || 'postgres',
      database: process.env.PG_DB || 'ims'
    });
    // Create table for work items if it doesn't exist
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS work_items (
        id UUID PRIMARY KEY,
        component_id TEXT NOT NULL,
        component_type TEXT,
        status TEXT NOT NULL,
        rca JSONB,
        start_time TIMESTAMP NOT NULL,
        -- Timestamp when the work item entered the INVESTIGATING state
        investigating_time TIMESTAMP,
        -- Timestamp when the work item entered the RESOLVED state
        resolved_time TIMESTAMP,
        -- Timestamp when the work item entered the CLOSED state
        end_time TIMESTAMP,
        -- Mean Time To Repair in seconds
        mttr BIGINT
      );
    `);
    // Enable TimescaleDB extension and convert work_items into a hypertable on start_time
    try {
      await pgPool.query(`CREATE EXTENSION IF NOT EXISTS timescaledb;`);
    } catch (e) {
      // extension may already be installed or user may not have permissions; ignore
    }
    try {
      await pgPool.query(`SELECT create_hypertable('work_items', 'start_time', if_not_exists => TRUE);`);
    } catch (e) {
      // If hypertable conversion fails (already converted), ignore
    }
  }
  if (!mongooseConnection) {
    mongooseConnection = await mongoose.connect(
      process.env.MONGO_URL || 'mongodb://mongo:27017/ims',
      {
        dbName: 'ims',
        useNewUrlParser: true,
        useUnifiedTopology: true
      }
    );
    // Define Signal model if it hasn't been registered already
    if (!mongoose.models.Signal) {
      const signalSchema = new mongoose.Schema(
        {
          workItemId: { type: String, index: true },
          data: { type: Object },
          createdAt: { type: Date, default: Date.now }
        },
        { versionKey: false }
      );
      mongoose.model('Signal', signalSchema);
    }
  }
  return { pg: pgPool, mongooseConnection };
}

/**
 * Create a new work item in PostgreSQL.
 * @param {string} componentId Identifier of the component that emitted the signal
 * @param {string} componentType Type of the component (e.g., RDBMS, CACHE)
 * @returns {Promise<object>} The newly created work item
 */
async function createWorkItem(componentId, componentType) {
  const id = uuidv4();
  const now = new Date();
  const sql =
    'INSERT INTO work_items (id, component_id, component_type, status, start_time) VALUES ($1, $2, $3, $4, $5)';
  await withRetry(() => pgPool.query(sql, [id, componentId, componentType, 'OPEN', now]));
  return {
    id,
    component_id: componentId,
    component_type: componentType,
    status: 'OPEN',
    start_time: now
  };
}

/**
 * Update the status of a work item. When closing, MTTR is computed based
 * on start_time and the current timestamp.
 * @param {string} id The work item ID
 * @param {string} status The new status
 * @param {object} [rca] An optional root cause analysis object
 */
async function updateWorkItemStatus(id, status, rca, newStart, newEnd) {
  // Build dynamic SET clause and values based on provided parameters
  const setParts = ['status = $2', 'rca = $3'];
  const values = [id, status, rca];
  let idx = 4; // next placeholder index for dynamic fields
  // update start_time if provided from the UI (rare but supported)
  if (newStart) {
    setParts.push(`start_time = $${idx}`);
    values.push(new Date(newStart));
    idx++;
  }
  // Timestamps for state transitions
  const now = new Date();
  // If transitioning into INVESTIGATING, record investigating_time
  if (status === 'INVESTIGATING') {
    setParts.push(`investigating_time = $${idx}`);
    values.push(now);
    idx++;
  }
  // If transitioning into RESOLVED, record resolved_time
  if (status === 'RESOLVED') {
    setParts.push(`resolved_time = $${idx}`);
    values.push(now);
    idx++;
  }
  // update end_time if explicitly provided (e.g., from RCA form)
  let endTimeForMttr;
  if (newEnd) {
    setParts.push(`end_time = $${idx}`);
    const endDate = new Date(newEnd);
    values.push(endDate);
    endTimeForMttr = endDate;
    idx++;
  }
  // If closing and no end_time provided, set end_time to now
  if (status === 'CLOSED' && !newEnd) {
    setParts.push(`end_time = $${idx}`);
    values.push(now);
    endTimeForMttr = now;
    idx++;
  }
  // Compute MTTR only when closing
  let mttrQuery = '';
  if (status === 'CLOSED') {
    // Compute difference between end_time and start_time; if start_time updated, the difference will use new start_time
    mttrQuery = ', mttr = EXTRACT(EPOCH FROM (end_time - start_time))::BIGINT';
  }
  const query = {
    text: `UPDATE work_items SET ${setParts.join(', ')}${mttrQuery} WHERE id=$1`,
    values
  };
  await withRetry(() => pgPool.query(query));
}

/**
 * Retrieve all work items ordered by start_time descending.
 * @returns {Promise<array>}
 */
async function getWorkItems() {
  const res = await pgPool.query('SELECT * FROM work_items ORDER BY start_time DESC');
  return res.rows;
}

/**
 * Retrieve a single work item by ID.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function getWorkItemById(id) {
  const res = await pgPool.query('SELECT * FROM work_items WHERE id=$1', [id]);
  return res.rows[0];
}

/**
 * Append a raw signal to MongoDB under the specified work item.
 * @param {string} workItemId
 * @param {object} signalData
 */
async function appendSignalToWorkItem(workItemId, signalData) {
  const Signal = mongooseConnection.model('Signal');
  await withRetry(() => Signal.create({ workItemId, data: signalData }));
}

/**
 * Retrieve all signals associated with a work item.
 * @param {string} workItemId
 * @returns {Promise<array>}
 */
async function getSignalsByWorkItemId(workItemId) {
  const Signal = mongooseConnection.model('Signal');
  const docs = await Signal.find({ workItemId }).sort({ createdAt: -1 }).lean().exec();
  return docs;
}

module.exports = {
  initDb,
  createWorkItem,
  updateWorkItemStatus,
  getWorkItems,
  getWorkItemById,
  appendSignalToWorkItem,
  getSignalsByWorkItemId
};