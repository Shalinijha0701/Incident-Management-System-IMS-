/*
 * Tests for severity sorting of work items on the dashboard. The dashboard
 * should display incidents in order of severity: RDBMS (P0), API (P1),
 * CACHE (P2), Async Queue (P2), MCP (P2), etc. This test uses the
 * exported sortBySeverity helper to verify ordering logic.
 *
 * The tests use Node's assert module for portability and run when this
 * script is executed directly.
 */

const assert = require('assert');
const { sortBySeverity } = require('../src/utils/dashboardCache');

function testSortsWorkItemsBySeverity() {
  const items = [
    { id: '3', component_type: 'API' },
    { id: '1', component_type: 'RDBMS' },
    { id: '4', component_type: 'CACHE' },
    { id: '2', component_type: 'Async Queue' }
  ];
  const sorted = sortBySeverity(items.slice());
  assert.strictEqual(sorted[0].component_type, 'RDBMS');
  assert.strictEqual(sorted[1].component_type, 'API');
  // The last two should include CACHE and Async Queue in any order
  const remaining = sorted.slice(2).map(i => i.component_type).sort();
  assert.deepStrictEqual(remaining.sort(), ['Async Queue', 'CACHE'].sort());
}

function testLowPriorityUnknownTypes() {
  const items = [
    { id: '1', component_type: 'UnknownA' },
    { id: '2', component_type: 'RDBMS' },
    { id: '3', component_type: 'UnknownB' }
  ];
  const sorted = sortBySeverity(items.slice());
  assert.strictEqual(sorted[0].component_type, 'RDBMS');
  // Unknown types should sort to the end; UnknownB appears after UnknownA due to stable sort
  assert.strictEqual(sorted[sorted.length - 1].component_type, 'UnknownB');
}

if (require.main === module) {
  try {
    testSortsWorkItemsBySeverity();
    console.log('✔ testSortsWorkItemsBySeverity passed');
    testLowPriorityUnknownTypes();
    console.log('✔ testLowPriorityUnknownTypes passed');
  } catch (err) {
    console.error('Test failed:', err.message);
    process.exit(1);
  }
}