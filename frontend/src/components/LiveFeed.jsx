import React, { useEffect, useState } from 'react';

/**
 * LiveFeed component fetches the list of work items from the backend and
 * subscribes to a WebSocket feed for newly created work items. Clicking
 * on an incident invokes the onSelect callback passed by the parent.
 */
function LiveFeed({ onSelect, refreshKey }) {
  const [workItems, setWorkItems] = useState([]);
  const [filter, setFilter] = useState('All');
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    // Fetch existing work items
    async function fetchWorkItems() {
      try {
        const res = await fetch('/work-items');
        const data = await res.json();
        // Sort by severity (P0->P2) before setting state. Map types to numeric order.
        const order = { RDBMS: 0, API: 1, CACHE: 2, 'Async Queue': 3, MCP: 4 };
        const sorted = [...data].sort((a, b) => {
          const aVal = order[a.component_type] ?? 99;
          const bVal = order[b.component_type] ?? 99;
          return aVal - bVal;
        });
        setWorkItems(sorted);
        setError(null);
      } catch (e) {
        console.error('Failed to fetch work items', e);
        setError('Failed to load incidents. Check your connection.');
      }
    }
    fetchWorkItems();
    // Subscribe to WebSocket for new work items
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${window.location.host}/live-feed`;
    const socket = new WebSocket(wsUrl);
    socket.onmessage = event => {
      try {
        const newItem = JSON.parse(event.data);
        setWorkItems(prev => {
          const order = { RDBMS: 0, API: 1, CACHE: 2, 'Async Queue': 3, MCP: 4 };
          const updated = [newItem, ...prev];
          return updated.sort((a, b) => {
            const aVal = order[a.component_type] ?? 99;
            const bVal = order[b.component_type] ?? 99;
            return aVal - bVal;
          });
        });
      } catch (e) {
        console.error('Failed to parse WebSocket message', e);
      }
    };
    return () => socket.close();
  }, []);

  // Re-fetch work items whenever the refreshKey prop changes
  useEffect(() => {
    async function refreshList() {
      try {
        const res = await fetch('/work-items');
        const data = await res.json();
        const order = { RDBMS: 0, API: 1, CACHE: 2, 'Async Queue': 3, MCP: 4 };
        const sorted = [...data].sort((a, b) => {
          const aVal = order[a.component_type] ?? 99;
          const bVal = order[b.component_type] ?? 99;
          return aVal - bVal;
        });
        setWorkItems(sorted);
        setError(null);
      } catch (e) {
        console.error('Failed to refresh work items', e);
        setError('Failed to load incidents. Check your connection.');
      }
    }
    refreshList();
  }, [refreshKey]);

  const handleSelect = (item) => {
    setSelectedId(item.id);
    onSelect(item);
  };

  const getSeverityBadge = (componentType) => {
    const severityMap = {
      RDBMS: { level: 'P0', className: 'badge-p0' },
      API: { level: 'P1', className: 'badge-p1' },
      CACHE: { level: 'P2', className: 'badge-p2' },
      'Async Queue': { level: 'P3', className: 'badge-p3' },
      MCP: { level: 'P3', className: 'badge-p3' }
    };
    return severityMap[componentType] || { level: 'P3', className: 'badge-p3' };
  };

  const getStatusBadge = (status) => {
    const badgeMap = {
      OPEN: 'badge-open',
      INVESTIGATING: 'badge-investigating',
      RESOLVED: 'badge-resolved',
      CLOSED: 'badge-closed'
    };
    return badgeMap[status] || 'badge-open';
  };

  const filteredItems = workItems.filter(item => filter === 'All' || item.status === filter);

  return (
    <div className="card">
      <div className="section-title">Active Incidents</div>
      <div style={{ fontSize: '0.9rem', color: 'var(--gray-600)', marginBottom: '1.5rem' }}>
        {filteredItems.length} incident{filteredItems.length !== 1 ? 's' : ''}
      </div>

      {error && (
        <div className="error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Status filter dropdown */}
      <div className="filter-group">
        <label htmlFor="status-filter" className="filter-label">Filter by Status</label>
        <select
          id="status-filter"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="filter-select"
        >
          <option value="All">All Incidents</option>
          <option value="OPEN">Open</option>
          <option value="INVESTIGATING">Investigating</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {/* Incidents List */}
      <div className="incidents-list">
        {filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--gray-400)' }}>
            <p>No incidents found</p>
          </div>
        ) : (
          filteredItems.map(item => {
            const severity = getSeverityBadge(item.component_type);
            const statusBadgeClass = getStatusBadge(item.status);
            return (
              <div
                key={item.id}
                onClick={() => handleSelect(item)}
                className={`incident-item ${selectedId === item.id ? 'active' : ''}`}
              >
                <div className="incident-badge">
                  <span className={`badge ${severity.className}`}>
                    {severity.level}
                  </span>
                </div>
                <div className="incident-content">
                  <div className="incident-title">{item.component_id}</div>
                  <div className="incident-meta">
                    <span className={`badge ${statusBadgeClass}`} style={{ marginRight: '0.5rem', display: 'inline-block' }}>
                      {item.status}
                    </span>
                  </div>
                  <div className="incident-type">{item.component_type}</div>
                  <small style={{ display: 'block', marginTop: '0.5rem' }}>
                    {new Date(item.start_time).toLocaleString()}
                  </small>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default LiveFeed;