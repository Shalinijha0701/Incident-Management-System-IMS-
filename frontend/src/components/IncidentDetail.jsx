import React, { useEffect, useState } from 'react';

/**
 * IncidentDetail fetches and displays the raw signals associated with a
 * selected work item. The details include a list of error messages and
 * timestamps stored in MongoDB.
 */
function IncidentDetail({ workItem, onTransition }) {
  const [signals, setSignals] = useState([]);

  useEffect(() => {
    async function fetchDetails() {
      try {
        const res = await fetch(`/work-items/${workItem.id}`);
        const data = await res.json();
        setSignals(data.signals);
      } catch (e) {
        console.error('Failed to fetch signals', e);
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

      {/* State transition buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {workItem.status === 'OPEN' && (
          <button 
            onClick={() => onTransition && onTransition('INVESTIGATING')}
            style={{ flex: 1 }}
          >
            Start Investigating
          </button>
        )}
        {workItem.status === 'INVESTIGATING' && (
          <button 
            onClick={() => onTransition && onTransition('RESOLVED')}
            className="success"
            style={{ flex: 1 }}
          >
            Mark Resolved
          </button>
        )}
      </div>

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