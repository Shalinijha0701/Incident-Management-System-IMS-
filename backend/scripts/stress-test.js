#!/usr/bin/env node
/*
 * Stress test script for the IMS ingestion API. This utility sends a large
 * number of signals in parallel to the /ingest endpoint and measures
 * throughput. Use it to demonstrate the backpressure behaviour of the
 * system when handling bursts of traffic. Configure the number of
 * concurrent requests and total signals via command line arguments.
 *
 * Usage:
 *   node stress-test.js [concurrency] [total]
 *
 * Example:
 *   node stress-test.js 100 10000
 *
 * Environment variables:
 *   IMS_HOST: Hostname of the backend server (default: localhost)
 *   IMS_PORT: Port of the backend server (default: 3000)
 */

const http = require('http');

const host = process.env.IMS_HOST || 'localhost';
const port = process.env.IMS_PORT ? parseInt(process.env.IMS_PORT, 10) : 3000;
const concurrency = parseInt(process.argv[2], 10) || 50;
const total = parseInt(process.argv[3], 10) || 5000;

// Construct an array of dummy signals. Each signal uses a unique timestamp
// but shares the same component for the purposes of stressing the queue.
function createSignal(i) {
  return JSON.stringify({
    componentId: `STRESS_COMPONENT_${i % 10}`,
    componentType: 'API',
    message: 'Stress test signal',
    timestamp: Date.now()
  });
}

function sendSignal(payload) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: host,
        port: port,
        path: '/ingest',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      res => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      }
    );
    req.on('error', err => reject(err));
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log(`Starting stress test with concurrency=${concurrency}, total=${total}`);
  const start = Date.now();
  let inFlight = 0;
  let sent = 0;
  let resolved = 0;
  let nextIndex = 0;
  return new Promise(resolve => {
    function maybeSend() {
      while (inFlight < concurrency && sent < total) {
        const payload = createSignal(nextIndex++);
        inFlight++;
        sent++;
        sendSignal(payload)
          .then(() => {
            inFlight--;
            resolved++;
            maybeSend();
            if (resolved === total) {
              const elapsed = (Date.now() - start) / 1000;
              console.log(`Completed ${total} requests in ${elapsed.toFixed(2)}s`);
              console.log(`Throughput: ${(total / elapsed).toFixed(2)} req/s`);
              resolve();
            }
          })
          .catch(err => {
            console.error('Request failed', err);
            inFlight--;
            resolved++;
            maybeSend();
          });
      }
    }
    maybeSend();
  });
}

run().catch(err => {
  console.error(err);
});
