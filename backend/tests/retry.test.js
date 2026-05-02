/*
 * Tests for the withRetry helper. Ensures that functions are retried
 * the correct number of times and that the final error is propagated
 * when all attempts fail.
 */

const assert = require('assert');
const { withRetry } = require('../src/utils/retry');

async function testRetrySuccess() {
  let attempts = 0;
  const result = await withRetry(async () => {
    attempts++;
    if (attempts < 3) {
      throw new Error('fail');
    }
    return 'ok';
  }, 3);
  assert.strictEqual(result, 'ok');
  assert.strictEqual(attempts, 3);
}

async function testRetryFailure() {
  let attempts = 0;
  let threw = false;
  try {
    await withRetry(async () => {
      attempts++;
      throw new Error('always fails');
    }, 2);
  } catch (e) {
    threw = true;
    assert.strictEqual(e.message, 'always fails');
  }
  assert.strictEqual(threw, true);
  assert.strictEqual(attempts, 2);
}

if (require.main === module) {
  (async () => {
    try {
      await testRetrySuccess();
      console.log('✔ testRetrySuccess passed');
      await testRetryFailure();
      console.log('✔ testRetryFailure passed');
    } catch (err) {
      console.error('Test failed:', err.message);
      process.exit(1);
    }
  })();
}