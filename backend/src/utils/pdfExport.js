/**
 * RCA PDF Report Generation
 * 
 * Generates professional PDF reports for closed incidents with RCA details.
 * Uses a simple HTML-to-PDF approach or can be extended with a proper PDF library.
 */

/**
 * Generate HTML report for an incident
 * @param {object} workItem - Work item with RCA
 * @param {array} signals - Associated signals
 * @param {array} auditLog - Audit log entries
 * @returns {string} HTML report
 */
function generateHTMLReport(workItem, signals = [], auditLog = []) {
  const formatDate = (date) => new Date(date).toLocaleString();
  const mttr = workItem.mttr ? `${Math.floor(workItem.mttr / 60)} mins ${workItem.mttr % 60} secs` : 'N/A';

  const auditTimeline = auditLog.map(log => `
    <tr>
      <td>${formatDate(log.timestamp)}</td>
      <td>${log.action}</td>
      <td>${log.changed_by}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>RCA Report - ${workItem.id}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          background: white;
          max-width: 900px;
          margin: 0 auto;
          padding: 40px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        .header {
          border-bottom: 3px solid #2c3e50;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .header h1 {
          margin: 0;
          color: #2c3e50;
          font-size: 28px;
        }
        .header p {
          margin: 5px 0 0 0;
          color: #666;
          font-size: 14px;
        }
        .section {
          margin: 30px 0;
          padding: 20px;
          background: #f9f9f9;
          border-left: 4px solid #3498db;
        }
        .section h2 {
          margin: 0 0 15px 0;
          color: #2c3e50;
          font-size: 18px;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin: 15px 0;
        }
        .info-item {
          padding: 10px;
          background: white;
          border-radius: 4px;
        }
        .info-label {
          font-weight: bold;
          color: #666;
          font-size: 12px;
          text-transform: uppercase;
        }
        .info-value {
          margin-top: 5px;
          color: #2c3e50;
          font-size: 14px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
        }
        th {
          background: #34495e;
          color: white;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          font-size: 12px;
        }
        td {
          padding: 12px;
          border-bottom: 1px solid #ddd;
        }
        tr:nth-child(even) {
          background: #f9f9f9;
        }
        .status-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 3px;
          font-size: 12px;
          font-weight: bold;
        }
        .status-open { background: #ff6b6b; color: white; }
        .status-investigating { background: #ffa500; color: white; }
        .status-resolved { background: #4ecdc4; color: white; }
        .status-closed { background: #51cf66; color: white; }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          color: #999;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚨 Incident Root Cause Analysis Report</h1>
          <p>IMS - Incident Management System</p>
        </div>

        <div class="section">
          <h2>Incident Summary</h2>
          <div class="grid-2">
            <div class="info-item">
              <div class="info-label">Incident ID</div>
              <div class="info-value">${workItem.id}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Component</div>
              <div class="info-value">${workItem.component_type} - ${workItem.component_id}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Status</div>
              <div class="info-value">
                <span class="status-badge status-${workItem.status.toLowerCase()}">${workItem.status}</span>
              </div>
            </div>
            <div class="info-item">
              <div class="info-label">MTTR (Mean Time To Repair)</div>
              <div class="info-value">${mttr}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>Timeline</h2>
          <div class="grid-2">
            <div class="info-item">
              <div class="info-label">Incident Started</div>
              <div class="info-value">${formatDate(workItem.start_time)}</div>
            </div>
            ${workItem.end_time ? `
            <div class="info-item">
              <div class="info-label">Incident Resolved</div>
              <div class="info-value">${formatDate(workItem.end_time)}</div>
            </div>
            ` : ''}
          </div>
        </div>

        <div class="section">
          <h2>Root Cause Analysis</h2>
          ${workItem.rca ? `
            <div class="info-item">
              <div class="info-label">Root Cause</div>
              <div class="info-value">${workItem.rca.rootCause || 'N/A'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Category</div>
              <div class="info-value">${workItem.rca.category || 'N/A'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Fix Applied</div>
              <div class="info-value">${workItem.rca.fix || 'N/A'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Prevention Steps</div>
              <div class="info-value">${workItem.rca.prevention || 'N/A'}</div>
            </div>
          ` : '<p>No RCA submitted yet</p>'}
        </div>

        <div class="section">
          <h2>Raw Signals (${signals.length})</h2>
          ${signals.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                ${signals.slice(0, 10).map(signal => `
                  <tr>
                    <td>${formatDate(signal.createdAt || signal.timestamp)}</td>
                    <td>${signal.data?.message || signal.message || JSON.stringify(signal.data || signal)}</td>
                  </tr>
                `).join('')}
                ${signals.length > 10 ? `<tr><td colspan="2">... and ${signals.length - 10} more signals</td></tr>` : ''}
              </tbody>
            </table>
          ` : '<p>No signals recorded</p>'}
        </div>

        ${auditLog.length > 0 ? `
        <div class="section">
          <h2>State Change Audit Trail</h2>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Changed By</th>
              </tr>
            </thead>
            <tbody>
              ${auditTimeline}
            </tbody>
          </table>
        </div>
        ` : ''}

        <div class="footer">
          <p>Report generated on ${new Date().toLocaleString()}</p>
          <p>This is an official incident report from the Incident Management System</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
}

/**
 * Generate a simple text report
 * @param {object} workItem - Work item with RCA
 * @param {array} signals - Associated signals
 * @returns {string} Text report
 */
function generateTextReport(workItem, signals = []) {
  const formatDate = (date) => new Date(date).toLocaleString();
  const mttr = workItem.mttr ? `${Math.floor(workItem.mttr / 60)} mins` : 'N/A';

  let report = `
INCIDENT ROOT CAUSE ANALYSIS REPORT
====================================

INCIDENT SUMMARY
----------------
ID: ${workItem.id}
Component: ${workItem.component_type} - ${workItem.component_id}
Status: ${workItem.status}
Started: ${formatDate(workItem.start_time)}
${workItem.end_time ? `Resolved: ${formatDate(workItem.end_time)}` : ''}
MTTR: ${mttr}

ROOT CAUSE ANALYSIS
-------------------
${workItem.rca ? `
Root Cause: ${workItem.rca.rootCause}
Category: ${workItem.rca.category}
Fix Applied: ${workItem.rca.fix}
Prevention Steps: ${workItem.rca.prevention}
` : 'No RCA submitted yet'}

SIGNALS (${signals.length} total)
---------
${signals.slice(0, 10).map(s => `- ${s.data?.message || s.message || JSON.stringify(s.data || s)}`).join('\n')}
${signals.length > 10 ? `... and ${signals.length - 10} more signals\n` : ''}

Generated: ${new Date().toLocaleString()}
  `;

  return report;
}

module.exports = {
  generateHTMLReport,
  generateTextReport
};
