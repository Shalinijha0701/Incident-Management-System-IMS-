/**
 * Execute an asynchronous function with automatic retry attempts.
 * If the function throws, it will be invoked again up to the specified
 * number of retries. Optionally waits between attempts.
 *
 * @param {Function} fn The async function to invoke
 * @param {number} retries The maximum number of attempts
 * @param {number} delayMs Delay in milliseconds between attempts
 * @returns {Promise<any>} The result of the function
 * @throws The last error if all retries fail
 */
async function withRetry(fn, retries = 3, delayMs = 0) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < retries - 1 && delayMs > 0) {
        await new Promise(res => setTimeout(res, delayMs));
      }
    }
  }
  throw lastErr;
}

module.exports = { withRetry };