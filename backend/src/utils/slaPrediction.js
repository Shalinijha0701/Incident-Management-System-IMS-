/**
 * SLA Breach Prediction Algorithm
 * Analyzes current SLA status, signal velocity, and incident state
 * to predict likelihood of breach
 */

function predictSLABreach(workItem, slaStatus, signalVelocity = 0) {
  if (!slaStatus || workItem.status === 'CLOSED') {
    return {
      risk: 'NONE',
      score: 0,
      message: 'Incident already closed or SLA unavailable',
      eta_breach_minutes: null
    };
  }

  let score = 0;

  // Already breached is critical
  if (slaStatus.breached) {
    score += 85;
  }

  // Time remaining calculation
  if (slaStatus.remaining) {
    const mins = slaStatus.remaining.minutes;

    if (mins <= 5) score += 65;
    else if (mins <= 15) score += 45;
    else if (mins <= 30) score += 30;
    else if (mins <= 60) score += 15;
  }

  // High signal velocity means issue is growing
  if (signalVelocity > 100) score += 25;
  else if (signalVelocity > 50) score += 15;

  // Status-based weighting
  if (workItem.status === 'OPEN') score += 20;
  else if (workItem.status === 'INVESTIGATING') score += 10;

  // Severity weighting
  const severity = workItem.severity || 'P2';
  if (severity === 'P0') score += 30;
  else if (severity === 'P1') score += 20;
  else if (severity === 'P2') score += 10;

  // Calculate risk level
  let risk = 'LOW';
  if (score >= 80) risk = 'CRITICAL';
  else if (score >= 60) risk = 'HIGH';
  else if (score >= 40) risk = 'MEDIUM';

  // Generate actionable message
  let message = '';
  switch (risk) {
    case 'CRITICAL':
      message = 'CRITICAL: Immediate escalation required. SLA breach is imminent. Assign senior responder now.';
      break;
    case 'HIGH':
      message = 'HIGH: Strong chance of SLA breach within 15 mins. Escalate to on-call team.';
      break;
    case 'MEDIUM':
      message = 'MEDIUM: Monitor closely. Time budget is shrinking. Increase team focus.';
      break;
    default:
      message = 'LOW: SLA breach risk is currently manageable. Continue standard response.';
  }

  return {
    risk,
    score: Math.min(Math.max(score, 0), 100),
    message,
    eta_breach_minutes: slaStatus.remaining?.minutes || null,
    timestamp: new Date().toISOString()
  };
}

module.exports = { predictSLABreach };
