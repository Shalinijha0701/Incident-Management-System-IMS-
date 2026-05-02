/*
 * Unit tests for the WorkItemStateMachine. These tests verify that
 * transitions into the CLOSED state are only permitted when a root
 * cause analysis (RCA) object containing all required fields is provided.
 *
 * The tests use Node's built-in assert module instead of Jest to avoid
 * external dependencies. Each test throws an error if expectations
 * are not met; otherwise it logs success.
 */
const assert = require('assert');
const { WorkItemStateMachine } = require('../src/workflows/stateMachine');

function testPreventsClosingWithoutRCA() {
  const machine = new WorkItemStateMachine();
  const item = { rca: null };
  let threw = false;
  try {
    machine.transition('RESOLVED', 'CLOSED', item);
  } catch (e) {
    threw = true;
    assert(/RCA mandatory/.test(e.message));
  }
  assert(threw, 'Expected transition to throw when RCA is missing');
}

function testAllowsValidTransition() {
  const machine = new WorkItemStateMachine();
  const item = {
    rca: {
      rootCause: 'database issue',
      category: 'Database Failure',
      fix: 'Restarted DB',
      prevention: 'Added monitoring'
    }
  };
  // Should not throw
  machine.transition('RESOLVED', 'CLOSED', item);
}

function testPreventsIncompleteRCA() {
  const machine = new WorkItemStateMachine();
  // Missing category
  assert.throws(() => {
    machine.transition('RESOLVED', 'CLOSED', {
      rca: { rootCause: 'x', fix: 'y', prevention: 'z' }
    });
  });
  // Missing fix
  assert.throws(() => {
    machine.transition('RESOLVED', 'CLOSED', {
      rca: { rootCause: 'x', category: 'API Failure', prevention: 'z' }
    });
  });
  // Missing prevention
  assert.throws(() => {
    machine.transition('RESOLVED', 'CLOSED', {
      rca: { rootCause: 'x', category: 'API Failure', fix: 'y' }
    });
  });
}

// Run tests when executed directly via `node rca.test.js`
if (require.main === module) {
  try {
    testPreventsClosingWithoutRCA();
    console.log('✔ testPreventsClosingWithoutRCA passed');
    testAllowsValidTransition();
    console.log('✔ testAllowsValidTransition passed');
    testPreventsIncompleteRCA();
    console.log('✔ testPreventsIncompleteRCA passed');
  } catch (err) {
    console.error('Test failed:', err.message);
    process.exit(1);
  }
}