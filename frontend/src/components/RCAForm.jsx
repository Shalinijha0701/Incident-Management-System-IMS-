import React, { useState } from 'react';

/**
 * RCAForm allows a user to supply root cause analysis details for a work
 * item and transition it to a new state. By default the form transitions
 * an incident from RESOLVED to CLOSED, but this could be extended to
 * support other transitions if required.
 */
function RCAForm({ workItem, onSubmitted }) {
  const [rootCause, setRootCause] = useState('');
  const [fix, setFix] = useState('');
  const [prevention, setPrevention] = useState('');
  const [category, setCategory] = useState('Database Failure');
  // Prepopulate the start and end times from the work item when available.
  const initialStart = workItem.start_time
    ? new Date(workItem.start_time).toISOString().slice(0, 16)
    : '';
  const initialEnd = workItem.end_time
    ? new Date(workItem.end_time).toISOString().slice(0, 16)
    : new Date().toISOString().slice(0, 16);
  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(initialEnd);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const rca = {
      rootCause,
      category,
      fix,
      prevention
    };
    const payload = {
      to: 'CLOSED',
      rca,
      start_time: startTime ? new Date(startTime).toISOString() : undefined,
      end_time: endTime ? new Date(endTime).toISOString() : undefined
    };
    try {
      const res = await fetch(`/work-items/${workItem.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unknown error');
      }
      // Reset form and notify parent
      setRootCause('');
      setFix('');
      setPrevention('');
      setCategory('Database Failure');
      onSubmitted && onSubmitted();
    } catch (e) {
      console.error('Failed to submit RCA', e);
      setError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Only show the form if the item is in RESOLVED state
  if (workItem.status !== 'RESOLVED') return null;

  return (
    <div className="form-section">
      <div className="section-title">📋 Root Cause Analysis</div>
      <p style={{ marginBottom: '1.5rem', color: 'var(--gray-600)' }}>
        Complete the RCA details below to close this incident
      </p>

      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="start-time">Incident Start Time</label>
            <input
              id="start-time"
              type="datetime-local"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="end-time">Incident End Time</label>
            <input
              id="end-time"
              type="datetime-local"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="category">Root Cause Category</label>
          <select
            id="category"
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            <option value="Database Failure">Database Failure</option>
            <option value="Cache Failure">Cache Failure</option>
            <option value="API Failure">API Failure</option>
            <option value="Async Queue Failure">Async Queue Failure</option>
            <option value="MCP Failure">MCP Failure</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="root-cause">Root Cause Analysis</label>
          <textarea
            id="root-cause"
            value={rootCause}
            onChange={e => setRootCause(e.target.value)}
            placeholder="Describe what caused the incident..."
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="fix">Applied Fix</label>
          <textarea
            id="fix"
            value={fix}
            onChange={e => setFix(e.target.value)}
            placeholder="Describe the fix that was applied..."
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="prevention">Prevention Steps</label>
          <textarea
            id="prevention"
            value={prevention}
            onChange={e => setPrevention(e.target.value)}
            placeholder="What steps should be taken to prevent this in the future?..."
            required
          />
        </div>

        <button 
          type="submit" 
          disabled={isSubmitting}
          className="success"
          style={{ width: '100%', padding: '0.875rem' }}
        >
          {isSubmitting ? '⏳ Submitting...' : '✓ Submit RCA & Close Incident'}
        </button>
      </form>
    </div>
  );
}

export default RCAForm;