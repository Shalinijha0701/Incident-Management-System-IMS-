import React, { useState } from 'react';
import LiveFeed from './components/LiveFeed.jsx';
import IncidentDetail from './components/IncidentDetail.jsx';
import RCAForm from './components/RCAForm.jsx';
import Metrics from './components/Metrics.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

/**
 * Root component for the IMS dashboard. This component renders the live feed of
 * incidents on the left. When a user selects a work item the detail and RCA
 * forms are displayed on the right.
 */
function App() {
  const [selectedItem, setSelectedItem] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  /**
   * Transition a work item to a new state. This helper calls the backend
   * endpoint and updates the selected item upon success. For transitions
   * other than closing, no RCA or time fields are required.
   * @param {string} newStatus
   */
  async function transitionSelected(newStatus) {
    if (!selectedItem) return;
    try {
      const res = await fetch(`/work-items/${selectedItem.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: newStatus })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Transition failed');
      }
      // After a successful transition, fetch the updated work item so that
      // fields like mttr and end_time are fresh. Then update selected item.
      const resItem = await fetch(`/work-items/${selectedItem.id}`);
      const itemData = await resItem.json();
      // itemData has shape { workItem, signals }
      const updatedItem = itemData.workItem || { ...selectedItem, status: newStatus };
      setSelectedItem(updatedItem);
      // Trigger a refresh of the live feed list so that statuses update
      setRefreshKey(k => k + 1);
    } catch (e) {
      console.error('Failed to transition work item', e);
      alert(e.message);
    }
  }

  return (
    <ErrorBoundary>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Header */}
        <div className="header">
          <div className="header-content">
            <h1>🚨 Incident Management System</h1>
            <p className="header-subtitle">Monitor, investigate, and resolve incidents in real-time</p>
          </div>
        </div>

        {/* Main Content */}
        <div className="container">
          {/* Metrics at the top */}
          <Metrics />

          {/* Main Layout - Incidents + Details */}
          <div className="layout-main">
            {/* Sidebar - Live feed of active incidents */}
            <div className="layout-sidebar">
              <LiveFeed
                onSelect={item => setSelectedItem(item)}
                refreshKey={refreshKey}
              />
            </div>

            {/* Main Content - Detail pane appears when a work item is selected */}
            <div className="layout-content">
              {selectedItem ? (
                <>
                  <IncidentDetail
                    workItem={selectedItem}
                    onTransition={transitionSelected}
                  />
                  {/* Display RCA form only when item is resolved */}
                  <RCAForm
                    workItem={selectedItem}
                    onSubmitted={() => setSelectedItem(null)}
                  />
                </>
              ) : (
                <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                  <h2 style={{ color: 'var(--gray-400)', marginBottom: '1rem' }}>Select an Incident</h2>
                  <p style={{ color: 'var(--gray-400)' }}>
                    Choose an incident from the list to view details and take action
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;