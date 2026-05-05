/**
 * AI-based RCA Suggestion Engine
 * 
 * Uses rule-based keyword matching to suggest root causes, categories,
 * and fixes based on the raw signal messages. This is designed to be
 * LLM-ready for future AI RCA assistance.
 */

const ruleSet = [
  {
    keywords: ['connection timeout', 'connection refused', 'connection pool', 'timeout', 'ECONNREFUSED'],
    category: 'RDBMS Failure',
    rootCause: 'Database connection timeout or pool exhaustion',
    fix: 'Restart database pool and increase max connections',
    prevention: 'Add pool usage monitoring alert at 80% capacity',
    confidence: 85
  },
  {
    keywords: ['deadlock', 'lock timeout', 'wait-for-lock'],
    category: 'RDBMS Failure',
    rootCause: 'Database deadlock or lock contention',
    fix: 'Analyze query execution plan and optimize conflicting queries',
    prevention: 'Implement query timeout and deadlock detection',
    confidence: 80
  },
  {
    keywords: ['out of memory', 'OOM', 'heap space', 'memory exhausted'],
    category: 'Memory Failure',
    rootCause: 'Process memory exhaustion or memory leak',
    fix: 'Restart service and review memory usage patterns',
    prevention: 'Implement memory usage thresholds and auto-scaling',
    confidence: 90
  },
  {
    keywords: ['redis', 'cache', 'timeout', 'cache miss', 'CACHE_FAILURE'],
    category: 'Cache Failure',
    rootCause: 'Cache service unavailable or connection timeout',
    fix: 'Restart cache service and verify network connectivity',
    prevention: 'Monitor cache service health and implement fallback to DB',
    confidence: 88
  },
  {
    keywords: ['queue', 'async', 'broker', 'message lost', 'QUEUE_FAILURE'],
    category: 'Async Queue Failure',
    rootCause: 'Message broker unavailable or queue overflow',
    fix: 'Restart message broker and drain pending queue',
    prevention: 'Monitor queue depth and implement circuit breaker',
    confidence: 82
  },
  {
    keywords: ['API', 'endpoint', '500', '502', '503', 'gateway timeout'],
    category: 'API Failure',
    rootCause: 'Upstream API service unavailable or slow',
    fix: 'Check upstream service health and restart if necessary',
    prevention: 'Implement API rate limiting and circuit breaker pattern',
    confidence: 80
  },
  {
    keywords: ['network', 'dns', 'unreachable', 'connection lost', 'latency'],
    category: 'Network Failure',
    rootCause: 'Network connectivity issue or DNS resolution failure',
    fix: 'Verify network connectivity and DNS configuration',
    prevention: 'Add network monitoring and implement retry with backoff',
    confidence: 75
  },
  {
    keywords: ['MCP', 'model context protocol', 'inference', 'model loading'],
    category: 'MCP Host Failure',
    rootCause: 'MCP service unavailable or model inference timeout',
    fix: 'Restart MCP service and verify model availability',
    prevention: 'Monitor MCP service availability and implement load balancing',
    confidence: 78
  },
  {
    keywords: ['permission', 'unauthorized', 'forbidden', 'access denied'],
    category: 'Security/Auth Failure',
    rootCause: 'Authorization or authentication failure',
    fix: 'Verify credentials and check IAM/RBAC configuration',
    prevention: 'Implement audit logging for access attempts',
    confidence: 85
  },
  {
    keywords: ['disk', 'storage', 'full', 'I/O error', 'read timeout'],
    category: 'Storage Failure',
    rootCause: 'Disk space exhausted or I/O performance degradation',
    fix: 'Free up disk space and optimize I/O operations',
    prevention: 'Monitor disk usage and implement automatic cleanup policies',
    confidence: 86
  }
];

/**
 * Analyze raw signals and suggest RCA
 * @param {array} signals - Array of signal objects with 'message' or 'data' fields
 * @returns {object} Suggested RCA with category, rootCause, fix, prevention, and confidence
 */
function suggestRCA(signals) {
  if (!signals || signals.length === 0) {
    return {
      category: 'Unknown',
      rootCause: 'Unable to determine root cause from signals',
      fix: 'Review incident manually',
      prevention: 'Enable detailed logging for future incidents',
      confidence: 0
    };
  }

  // Combine all signal messages
  const allMessages = signals
    .map(s => {
      if (typeof s === 'string') return s.toLowerCase();
      if (s.message) return s.message.toLowerCase();
      if (s.data && typeof s.data === 'object') {
        return JSON.stringify(s.data).toLowerCase();
      }
      return '';
    })
    .join(' ');

  // Score each rule based on keyword matches
  const scores = ruleSet.map(rule => {
    const matchCount = rule.keywords.filter(keyword =>
      allMessages.includes(keyword.toLowerCase())
    ).length;
    return {
      ...rule,
      matchCount,
      score: (matchCount / rule.keywords.length) * rule.confidence
    };
  });

  // Sort by score and return top match
  scores.sort((a, b) => b.score - a.score);

  if (scores[0].matchCount === 0) {
    return {
      category: 'Unknown',
      rootCause: 'Unable to determine root cause from signals',
      fix: 'Review incident manually',
      prevention: 'Enable detailed logging for future incidents',
      confidence: 0
    };
  }

  const topMatch = scores[0];
  return {
    category: topMatch.category,
    rootCause: topMatch.rootCause,
    fix: topMatch.fix,
    prevention: topMatch.prevention,
    confidence: Math.min(100, Math.round(topMatch.score))
  };
}

module.exports = { suggestRCA };
