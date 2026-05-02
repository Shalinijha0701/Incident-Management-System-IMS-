import React, { useEffect, useState } from 'react';

/**
 * Metrics component fetches timeseries data from the backend and
 * renders a simple table summarising the number of incidents per hour.
 */
function Metrics() {
  const [incidentsMetrics, setIncidentsMetrics] = useState([]);
  const [mttrMetrics, setMttrMetrics] = useState([]);
  const [error, setError] = useState(null);
  useEffect(() => {
    async function fetchAll() {
      try {
        // Fetch incidents per hour
        const res1 = await fetch('/metrics/incidents-per-hour');
        const data1 = await res1.json();
        if (!res1.ok) {
          throw new Error(data1.error || 'Failed to fetch incidents metrics');
        }
        // Fetch MTTR per hour
        const res2 = await fetch('/metrics/mttr-per-hour');
        const data2 = await res2.json();
        if (!res2.ok) {
          throw new Error(data2.error || 'Failed to fetch MTTR metrics');
        }
        setIncidentsMetrics(data1);
        setMttrMetrics(data2);
      } catch (e) {
        console.error('Failed to load metrics', e);
        setError(e.message);
      }
    }
    fetchAll();
  }, []);

  if (error) {
    return (
      <div className="section" style={{ marginBottom: '2rem' }}>
        <h2>Metrics</h2>
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  if ((!incidentsMetrics || incidentsMetrics.length === 0) && (!mttrMetrics || mttrMetrics.length === 0)) {
    return null;
  }

  // Determine maximums for bar widths
  const maxIncidents = incidentsMetrics.reduce((max, row) => (row.count > max ? row.count : max), 0) || 1;
  const maxMttr = mttrMetrics.reduce((max, row) => (Number(row.avg_mttr) > max ? Number(row.avg_mttr) : max), 0) || 1;

  return (
    <div className="section" style={{ marginBottom: '2rem' }}>
      {incidentsMetrics && incidentsMetrics.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div className="section-title">Incidents per Hour</div>
          <div className="metrics-grid">
            {incidentsMetrics.map(row => (
              <div key={row.bucket} className="metric-card">
                <div className="metric-label">{row.bucket}</div>
                <div className="metric-value">{row.count}</div>
                <div className="metric-bar">
                  <div
                    className="metric-bar-fill"
                    style={{
                      width: `${(row.count / maxIncidents) * 100}%`
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mttrMetrics && mttrMetrics.length > 0 && (
        <div>
          <div className="section-title">Average MTTR per Hour</div>
          <div className="metrics-grid">
            {mttrMetrics.map(row => (
              <div key={row.bucket} className="metric-card">
                <div className="metric-label">{row.bucket}</div>
                <div className="metric-value">{Number(row.avg_mttr).toFixed(0)}s</div>
                <div className="metric-bar">
                  <div
                    className="metric-bar-fill"
                    style={{
                      width: `${(Number(row.avg_mttr) / maxMttr) * 100}%`,
                      background: 'linear-gradient(90deg, var(--success) 0%, var(--info) 100%)'
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Metrics;