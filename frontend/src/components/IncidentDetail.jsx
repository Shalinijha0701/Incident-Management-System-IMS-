import React, { useEffect, useState } from 'react';

/**
 * IncidentDetail fetches and displays the raw signals associated with a
 * selected work item. The details include a list of error messages and
 * timestamps stored in MongoDB.
 */
function IncidentDetail({ workItem, onTransition }) {
  const [signals, setSignals] = useState([]);
  const [rcaSuggestion, setRcaSuggestion] = useState(null);
  const [slaStatus, setSlaStatus] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [correlations, setCorrelations] = useState(null);
  const [showReportMenu, setShowReportMenu] = useState(false);

  useEffect(() => {
    async function fetchDetails() {
      try {
        const [detailRes, suggestionRes, slaRes, auditRes, corrRes] = await Promise.all([
          fetch(`/work-items/${workItem.id}`),
          fetch(`/work-items/${workItem.id}/rca-suggestion`),
          fetch(`/work-items/${workItem.id}/sla-status`),
          fetch(`/work-items/${workItem.id}/audit`),
          fetch(`/work-items/${workItem.id}/correlations`)
        ]);
        
        const detailData = await detailRes.json();
        setSignals(detailData.signals);
        
        const suggestionData = await suggestionRes.json();
        setRcaSuggestion(suggestionData);
        
        const slaData = await slaRes.json();
        setSlaStatus(slaData);
        
        const auditData = await auditRes.json();
        setAuditLog(auditData);
        
        const corrData = await corrRes.json();
        setCorrelations(corrData);
      } catch (e) {
        console.error('Failed to fetch incident details', e);
      }
    }
    if (workItem) {
      fetchDetails();
    }
  }, [workItem]);

  /**
   * Format a duration in seconds into a human-friendly string. If the
   * duration is undefined or null, returns an empty string.
   * @param {number} seconds
   */
  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts = [];
    if (hrs > 0) parts.push(`${hrs}h`);
    if (mins > 0) parts.push(`${mins}m`);
    if (hrs === 0 && mins === 0) parts.push(`${secs}s`);
    return parts.join(' ');
  }

  const getStatusPill = (status) => {
    const statusMap = {
      OPEN: 'open',
      INVESTIGATING: 'investigating',
      RESOLVED: 'resolved',
      CLOSED: 'closed'
    };
    return statusMap[status] || 'open';
  };

  return (
    <div className="form-section">
      <div className="section-title">Incident Details</div>

      {/* Header with component info */}
      <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--gray-200)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
          <h2 style={{ marginBottom: 0, fontSize: '1.5rem' }}>{workItem.component_id}</h2>
          <span className={`status-pill ${getStatusPill(workItem.status)}`}>
            {workItem.status}
          </span>
        </div>
        <p style={{ marginBottom: 0 }}>
          <strong>Type:</strong> <span style={{ background: 'var(--gray-100)', padding: '0.25rem 0.625rem', borderRadius: '4px', fontSize: '0.9rem' }}>{workItem.component_type}</span>
        </p>
      </div>

      {/* Timeline */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Timeline</h3>
        <div className="timeline">
          <div className="timeline-item">
            <div className="timeline-content">
              <div className="timeline-label">Incident Opened</div>
              <div className="timeline-time">{new Date(workItem.start_time).toLocaleString()}</div>
            </div>
          </div>

          {workItem.investigating_time && (
            <div className="timeline-item">
              <div className="timeline-content">
                <div className="timeline-label">Investigation Started</div>
                <div className="timeline-time">{new Date(workItem.investigating_time).toLocaleString()}</div>
              </div>
            </div>
          )}

          {workItem.resolved_time && (
            <div className="timeline-item resolved">
              <div className="timeline-content">
                <div className="timeline-label">Marked as Resolved</div>
                <div className="timeline-time">{new Date(workItem.resolved_time).toLocaleString()}</div>
              </div>
            </div>
          )}

          {workItem.end_time && (
            <div className="timeline-item resolved">
              <div className="timeline-content">
                <div className="timeline-label">Incident Closed</div>
                <div className="timeline-time">{new Date(workItem.end_time).toLocaleString()}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MTTR display for closed incidents */}
      {workItem.mttr !== undefined && workItem.mttr !== null && (
        <div className="metric-card" style={{ marginBottom: '1.5rem' }}>
          <div className="metric-label">Mean Time to Repair</div>
          <div className="metric-value">{formatDuration(Number(workItem.mttr))}</div>
        </div>
      )}

      {/* SLA Status */}
      {slaStatus && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: slaStatus.breached ? '#fff5f5' : '#f0f9ff', border: `1px solid ${slaStatus.breached ? '#ff6b6b' : '#4c6ef5'}`, borderRadius: 'var(--border-radius)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong>SLA Status</strong>
            <span style={{ fontSize: '0.9rem', color: slaStatus.breached ? '#ff6b6b' : '#4c6ef5' }}>
              {slaStatus.status}
            </span>
          </div>
          {slaStatus.remaining && (
            <small>⏱ {slaStatus.remaining.formatted} remaining (Deadline: {new Date(slaStatus.deadline).toLocaleString()})</small>
          )}
        </div>
      )}

      {/* Owner Assignment */}
      {workItem.assignedOwner && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--border-radius)' }}>
          <div><strong>Assigned To:</strong> {workItem.assignedTeam}</div>
          <div><strong>Owner:</strong> {workItem.assignedOwner}</div>
        </div>
      )}

      {/* RCA Suggestion */}
      {rcaSuggestion && rcaSuggestion.confidence > 0 && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f9f3e6', border: '1px solid #ffa500', borderRadius: 'var(--border-radius)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <strong>💡 AI-Suggested Root Cause</strong>
            <span style={{ fontSize: '0.85rem', background: '#ffa500', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '3px' }}>
              Confidence: {rcaSuggestion.confidence}%
            </span>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <div><strong>Category:</strong> {rcaSuggestion.category}</div>
            <div><strong>Root Cause:</strong> {rcaSuggestion.rootCause}</div>
            <div><strong>Suggested Fix:</strong> {rcaSuggestion.fix}</div>
            <div><strong>Prevention:</strong> {rcaSuggestion.prevention}</div>
          </div>
        </div>
      )}

      {/* Incident Correlation */}
      {correlations && correlations.correlation.isCorrelated && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#ffe6f0', border: '1px solid #ff6b9d', borderRadius: 'var(--border-radius)' }}>
          <strong>🔗 Related Incidents (Cascade Detection)</strong>
          <div style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
            {correlations.correlation.relatedIncidents.map((rel, idx) => (
              <div key={idx} style={{ marginBottom: '0.5rem' }}>
                <div>→ {rel.relatedComponent} (Strength: {rel.correlationStrength})</div>
                <small>Cascade Chain: {rel.cascadeChain}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* State transition buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {workItem.status === 'OPEN' && (
          <button 
            onClick={() => onTransition && onTransition('INVESTIGATING')}
            style={{ flex: 1, minWidth: '150px' }}
          >
            Start Investigating
          </button>
        )}
        {workItem.status === 'INVESTIGATING' && (
          <button 
            onClick={() => onTransition && onTransition('RESOLVED')}
            className="success"
            style={{ flex: 1, minWidth: '150px' }}
          >
            Mark Resolved
          </button>
        )}
        
        {/* Report Export Buttons */}
        {workItem.status === 'CLOSED' && (
          <div style={{ position: 'relative', flex: 1, minWidth: '150px' }}>
            <button 
              onClick={() => setShowReportMenu(!showReportMenu)}
              style={{ width: '100%' }}
            >
              📄 Export Report
            </button>
            {showReportMenu && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--border-radius)', marginTop: '0.5rem', zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                <a 
                  href={`/work-items/${workItem.id}/report/html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'block', padding: '0.75rem 1rem', borderBottom: '1px solid var(--gray-200)', color: 'var(--primary-color)', textDecoration: 'none' }}
                >
                  Download as HTML
                </a>
                <a 
                  href={`/work-items/${workItem.id}/report/text`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'block', padding: '0.75rem 1rem', color: 'var(--primary-color)', textDecoration: 'none' }}
                >
                  Download as Text
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audit Log */}
      {auditLog && auditLog.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Audit Trail</h3>
          <div style={{ fontSize: '0.9rem', background: 'var(--gray-50)', borderRadius: 'var(--border-radius)', overflow: 'hidden' }}>
            {auditLog.map((log, idx) => (
              <div key={idx} style={{ padding: '0.75rem 1rem', borderBottom: idx !== auditLog.length - 1 ? '1px solid var(--gray-200)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <strong>{log.action}</strong>
                  <small style={{ color: 'var(--gray-500)' }}>{new Date(log.timestamp).toLocaleString()}</small>
                </div>
                <small style={{ color: 'var(--gray-600)' }}>By: {log.changed_by}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signals Section */}
      <div>
        <h3 style={{ marginBottom: '1rem' }}>Signals ({signals.length})</h3>
        {signals.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--gray-400)', background: 'var(--gray-50)', borderRadius: 'var(--border-radius)' }}>
            No signals recorded
          </div>
        ) : (
          <div className="signals-container">
            {signals.map((s, idx) => (
              <div key={idx} className="signal-item">
                <div className="signal-data">{JSON.stringify(s.data, null, 2)}</div>
                <div className="signal-time">{new Date(s.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default IncidentDetail;