/**
 * Notification Service
 * Simulates real-time alert dispatching to monitoring tools
 * In production, this would integrate with Slack/PagerDuty/Opsgenie
 */

const notifications = [];
const MAX_NOTIFICATIONS = 100;

function sendIncidentNotification(workItem, severity) {
  // Determine notification channel based on severity
  let channels = [];
  let priority = 'medium';

  if (severity === 'P0') {
    channels = ['PagerDuty', 'Slack #critical-incidents', 'SMS Alert'];
    priority = 'critical';
  } else if (severity === 'P1') {
    channels = ['PagerDuty', 'Slack #incidents'];
    priority = 'high';
  } else {
    channels = ['Slack #incidents'];
    priority = 'medium';
  }

  const notification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    incidentId: workItem.id,
    componentId: workItem.component_id,
    componentType: workItem.component_type,
    severity,
    priority,
    channels,
    title: `[${severity}] Incident on ${workItem.component_id}`,
    message: `${workItem.component_type} incident detected. Signal count: ${workItem.signal_count || 1}. Status: ${workItem.status}`,
    description: `Component: ${workItem.component_id} | Type: ${workItem.component_type} | Severity: ${severity}`,
    createdAt: new Date().toISOString(),
    status: 'sent'
  };

  notifications.unshift(notification);

  // Keep only recent notifications
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.pop();
  }

  return notification;
}

function getNotifications(limit = 50) {
  return notifications.slice(0, Math.min(limit, notifications.length));
}

function getNotificationStats() {
  const stats = {
    total: notifications.length,
    critical: notifications.filter(n => n.priority === 'critical').length,
    high: notifications.filter(n => n.priority === 'high').length,
    medium: notifications.filter(n => n.priority === 'medium').length,
    channels: {}
  };

  // Count by channel
  notifications.forEach(n => {
    n.channels.forEach(ch => {
      stats.channels[ch] = (stats.channels[ch] || 0) + 1;
    });
  });

  return stats;
}

function clearNotifications() {
  notifications.length = 0;
}

module.exports = {
  sendIncidentNotification,
  getNotifications,
  getNotificationStats,
  clearNotifications
};
