/**
 * Audit Logging for State Changes
 * 
 * Tracks all transitions and state changes for incidents to provide
 * a complete audit trail of who did what and when.
 */

const { initDb } = require('../models');
const { v4: uuidv4 } = require('uuid');

/**
 * Create audit log table if it doesn't exist
 * @param {Pool} pgPool - PostgreSQL connection pool
 */
async function initAuditLog(pgPool) {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY,
      work_item_id UUID NOT NULL REFERENCES work_items(id),
      action TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT,
      changed_by TEXT DEFAULT 'system',
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      details JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_audit_work_item_id ON audit_logs(work_item_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
  `);
}

/**
 * Log a state transition
 * @param {string} workItemId - Work item ID
 * @param {string} fromStatus - Previous status
 * @param {string} toStatus - New status
 * @param {object} details - Additional details (rca, user, etc.)
 */
async function logTransition(workItemId, fromStatus, toStatus, details = {}) {
  try {
    const db = await initDb();
    const id = uuidv4();
    const timestamp = new Date();

    await db.pg.query(
      `INSERT INTO audit_logs (id, work_item_id, action, old_status, new_status, changed_by, timestamp, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        workItemId,
        `${fromStatus} → ${toStatus}`,
        fromStatus,
        toStatus,
        details.changedBy || 'system',
        timestamp,
        JSON.stringify(details)
      ]
    );
  } catch (e) {
    console.error('Failed to log audit entry:', e);
    // Don't throw - audit logging shouldn't break the main flow
  }
}

/**
 * Log RCA submission
 * @param {string} workItemId - Work item ID
 * @param {object} rca - RCA object
 * @param {string} submittedBy - User who submitted RCA
 */
async function logRCASubmission(workItemId, rca, submittedBy = 'unknown') {
  try {
    const db = await initDb();
    const id = uuidv4();

    await db.pg.query(
      `INSERT INTO audit_logs (id, work_item_id, action, changed_by, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        workItemId,
        'RCA Submitted',
        submittedBy,
        JSON.stringify({
          category: rca.category,
          rootCause: rca.rootCause,
          submittedAt: new Date()
        })
      ]
    );
  } catch (e) {
    console.error('Failed to log RCA submission:', e);
  }
}

/**
 * Get audit trail for a work item
 * @param {string} workItemId - Work item ID
 * @returns {Promise<array>} Array of audit log entries
 */
async function getAuditLog(workItemId) {
  try {
    const db = await initDb();
    const res = await db.pg.query(
      `SELECT * FROM audit_logs WHERE work_item_id = $1 ORDER BY timestamp ASC`,
      [workItemId]
    );
    return res.rows;
  } catch (e) {
    console.error('Failed to fetch audit log:', e);
    return [];
  }
}

/**
 * Format audit log for display
 * @param {array} logs - Raw audit log entries
 * @returns {array} Formatted logs
 */
function formatAuditLog(logs) {
  return logs.map(log => ({
    ...log,
    timestamp: new Date(log.timestamp).toLocaleString(),
    details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details
  }));
}

module.exports = {
  initAuditLog,
  logTransition,
  logRCASubmission,
  getAuditLog,
  formatAuditLog
};
