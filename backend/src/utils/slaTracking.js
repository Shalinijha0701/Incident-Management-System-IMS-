/**
 * SLA Management and Breach Detection
 * 
 * Defines SLA thresholds for different severity levels and
 * provides functions to calculate SLA status and breach predictions.
 */

const SLA_CONFIG = {
  P0: { minutes: 15, description: 'Critical - Resolve within 15 minutes' },
  P1: { minutes: 60, description: 'High - Resolve within 60 minutes' },
  P2: { minutes: 240, description: 'Medium - Resolve within 4 hours' },
  P3: { minutes: 1440, description: 'Low - Resolve within 24 hours' }
};

/**
 * Determine severity level based on component type and signal volume
 * @param {string} componentType - Type of component
 * @param {number} signalCount - Number of signals for this incident
 * @returns {string} Severity level (P0, P1, P2, P3)
 */
function determineSeverity(componentType, signalCount = 0) {
  // Component type severity mapping
  const componentSeverity = {
    'RDBMS': 'P0',
    'API': 'P1',
    'CACHE': 'P2',
    'Async Queue': 'P2',
    'MCP': 'P1'
  };

  let severity = componentSeverity[componentType] || 'P2';

  // Auto-escalate based on signal volume
  if (signalCount > 200) {
    severity = 'P0';
  } else if (signalCount > 50) {
    severity = 'P1';
  }

  return severity;
}

/**
 * Calculate SLA status for a work item
 * @param {object} workItem - Work item object with start_time and status
 * @param {string} severity - Severity level (P0, P1, P2, P3)
 * @returns {object} SLA status with remaining time, breached flag, etc.
 */
function calculateSLAStatus(workItem, severity = 'P2') {
  const slaConfig = SLA_CONFIG[severity] || SLA_CONFIG['P2'];
  const startTime = new Date(workItem.start_time);
  const slaDeadline = new Date(startTime.getTime() + slaConfig.minutes * 60 * 1000);
  const now = new Date();
  const timeRemaining = slaDeadline - now;
  const minutesRemaining = Math.floor(timeRemaining / 60000);
  const hoursRemaining = Math.floor(minutesRemaining / 60);

  // If already closed, use actual resolution time
  let isBreached = false;
  let remainingTime = null;

  if (workItem.status === 'CLOSED' && workItem.end_time) {
    const endTime = new Date(workItem.end_time);
    const actualResolutionTime = endTime - startTime;
    const slaTime = slaConfig.minutes * 60 * 1000;
    isBreached = actualResolutionTime > slaTime;
  } else {
    isBreached = timeRemaining < 0;
    if (timeRemaining > 0) {
      remainingTime = {
        minutes: minutesRemaining,
        hours: hoursRemaining,
        formatted: hoursRemaining > 0 
          ? `${hoursRemaining}h ${minutesRemaining % 60}m`
          : `${minutesRemaining}m`
      };
    }
  }

  return {
    severity,
    slaMinutes: slaConfig.minutes,
    description: slaConfig.description,
    deadline: slaDeadline,
    breached: isBreached,
    remaining: remainingTime,
    status: isBreached ? 'SLA Breached' : (remainingTime ? `Breaching in ${remainingTime.formatted}` : 'Resolved within SLA')
  };
}

/**
 * Get SLA color for display
 * @param {string} status - SLA status
 * @returns {string} Color code for UI rendering
 */
function getSLAColor(slaStatus) {
  if (slaStatus.breached) return '#ff6b6b'; // Red
  if (!slaStatus.remaining) return '#51cf66'; // Green - resolved within SLA
  const minutesRemaining = slaStatus.remaining.minutes;
  if (minutesRemaining < 5) return '#ff922b'; // Orange - critical
  return '#4c6ef5'; // Blue - normal
}

module.exports = {
  SLA_CONFIG,
  determineSeverity,
  calculateSLAStatus,
  getSLAColor
};
