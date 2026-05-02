/*
 * Utilities for maintaining a cached list of active incidents in Redis. The
 * cached list is stored as a single JSON string under the key
 * `dashboard:work_items`. Each entry corresponds to a work item that is
 * currently not closed. Items are sorted by severity so that P0 items
 * appear first on the dashboard. When a new work item is created or an
 * existing item changes state, these functions should be invoked to
 * update the cached list.
 */

// NOTE: We import redisClient lazily within the functions that need it
// to avoid requiring Redis in environments where ioredis may not be installed
// at test time.

// Severity order mapping: smaller numbers indicate higher severity
const SEVERITY_ORDER = {
  RDBMS: 0,
  API: 1,
  CACHE: 2,
  'Async Queue': 3,
  MCP: 4,
  Other: 99
};

/**
 * Retrieve the cached list of work items. Returns null if no cache is set.
 */
async function getList() {
  // Import redisClient lazily to avoid top-level dependency
  const { redisClient } = require('../cache/redis');
  const cached = await redisClient.get('dashboard:work_items');
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch (e) {
    return null;
  }
}

/**
 * Overwrite the cached list with a new array.
 * @param {Array} list
 */
async function setList(list) {
  const { redisClient } = require('../cache/redis');
  await redisClient.set('dashboard:work_items', JSON.stringify(list || []));
}

/**
 * Sort a list of work items by severity order.
 * @param {Array} list
 * @returns {Array}
 */
function sortBySeverity(list) {
  return list.sort((a, b) => {
    const aVal = SEVERITY_ORDER[a.component_type] ?? SEVERITY_ORDER.Other;
    const bVal = SEVERITY_ORDER[b.component_type] ?? SEVERITY_ORDER.Other;
    return aVal - bVal;
  });
}

/**
 * Add a new work item to the cache. The list is sorted by severity.
 * @param {Object} workItem
 */
async function addWorkItem(workItem) {
  let list = (await getList()) || [];
  // Remove any existing entry with the same ID to avoid duplicates
  list = list.filter(item => item.id !== workItem.id);
  list.push(workItem);
  list = sortBySeverity(list);
  await setList(list);
}

/**
 * Update an existing work item in the cache or remove it if closed.
 * @param {Object} workItem
 */
async function updateWorkItem(workItem) {
  let list = (await getList()) || [];
  const idx = list.findIndex(item => item.id === workItem.id);
  if (idx !== -1) {
    if (workItem.status === 'CLOSED') {
      // Remove closed items from active cache
      list.splice(idx, 1);
    } else {
      // Merge new fields into existing entry
      list[idx] = { ...list[idx], ...workItem };
    }
  } else if (workItem.status !== 'CLOSED') {
    list.push(workItem);
  }
  list = sortBySeverity(list);
  await setList(list);
}

module.exports = {
  getList,
  setList,
  addWorkItem,
  updateWorkItem,
  // Export severity order and sort function for testing purposes
  SEVERITY_ORDER,
  sortBySeverity
};