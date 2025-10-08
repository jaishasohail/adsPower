import React, { useState, useEffect } from 'react';

const Logs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    level: '',
    profile_id: '',
    start_date: '',
    end_date: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });
  const [profiles, setProfiles] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    fetchLogs();
    fetchProfiles();
  }, [filters, pagination.page]);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchLogs, 5000); // Refresh every 5 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, filters]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...Object.fromEntries(Object.entries(filters).filter(([_, value]) => value))
      });

      const response = await fetch(`http://localhost:3001/api/logs?${params}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setLogs(result.data.logs);
          setPagination(prev => ({
            ...prev,
            total: result.data.pagination.total,
            totalPages: result.data.pagination.totalPages
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfiles = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/profiles');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setProfiles(result.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch profiles:', error);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page when filtering
  };

  const clearFilters = () => {
    setFilters({
      level: '',
      profile_id: '',
      start_date: '',
      end_date: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const exportLogs = async () => {
    try {
      const params = new URLSearchParams({
        ...Object.fromEntries(Object.entries(filters).filter(([_, value]) => value))
      });

      const response = await fetch(`http://localhost:3001/api/logs/export?${params}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `adspower-logs-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Failed to export logs:', error);
      alert('Failed to export logs: ' + error.message);
    }
  };

  const clearOldLogs = async () => {
    const days = prompt('Delete logs older than how many days?', '30');
    if (!days || isNaN(days) || days <= 0) return;

    if (!window.confirm(`Are you sure you want to delete logs older than ${days} days?`)) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/logs/cleanup?days=${days}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert(`Deleted ${result.data.deleted_count} old log entries.`);
          fetchLogs();
        }
      }
    } catch (error) {
      console.error('Failed to clear old logs:', error);
      alert('Failed to clear old logs: ' + error.message);
    }
  };

  const getLogLevelColor = (level) => {
    switch (level) {
      case 'error': return '#e74c3c';
      case 'warn': return '#f39c12';
      case 'info': return '#3498db';
      case 'debug': return '#95a5a6';
      default: return '#333';
    }
  };

  const getLogLevelBadgeClass = (level) => {
    switch (level) {
      case 'error': return 'status-badge inactive';
      case 'warn': return 'status-badge launching';
      case 'info': return 'status-badge active';
      case 'debug': return 'status-badge completed';
      default: return 'status-badge';
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const goToPage = (page) => {
    setPagination(prev => ({ ...prev, page }));
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Application Logs</h2>
          <div className="card-actions">
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', marginRight: '10px' }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
            <button className="btn btn-outline" onClick={exportLogs}>
              📥 Export
            </button>
            <button className="btn btn-warning" onClick={clearOldLogs}>
              🗑️ Cleanup
            </button>
            <button className="btn btn-secondary" onClick={fetchLogs}>
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <h3 className="card-title">Filters</h3>
            <button className="btn btn-outline" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>
          <div className="grid grid-4">
            <div className="form-group">
              <label className="form-label">Log Level</label>
              <select
                className="form-select"
                value={filters.level}
                onChange={(e) => handleFilterChange('level', e.target.value)}
              >
                <option value="">All Levels</option>
                <option value="error">Error</option>
                <option value="warn">Warning</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Profile</label>
              <select
                className="form-select"
                value={filters.profile_id}
                onChange={(e) => handleFilterChange('profile_id', e.target.value)}
              >
                <option value="">All Profiles</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Start Date</label>
              <input
                type="datetime-local"
                className="form-input"
                value={filters.start_date}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">End Date</label>
              <input
                type="datetime-local"
                className="form-input"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="table-container" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Level</th>
                <th>Message</th>
                <th>Profile</th>
                <th>Extra Data</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontSize: '0.85rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td>
                    <span className={getLogLevelBadgeClass(log.level)}>
                      {log.level.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ maxWidth: '400px', wordBreak: 'break-word' }}>
                    {log.message}
                  </td>
                  <td>
                    {log.profile_name ? (
                      <span style={{ color: '#3498db', fontWeight: '500' }}>
                        {log.profile_name}
                      </span>
                    ) : (
                      <span style={{ color: '#999' }}>System</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: '#666', maxWidth: '200px' }}>
                    {log.extra_data ? (
                      <details>
                        <summary style={{ cursor: 'pointer' }}>View Data</summary>
                        <pre style={{ 
                          fontSize: '0.75rem', 
                          background: '#f8f9fa', 
                          padding: '5px', 
                          borderRadius: '3px',
                          marginTop: '5px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}>
                          {JSON.stringify(JSON.parse(log.extra_data), null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span style={{ color: '#999' }}>None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {loading && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <span className="loading-spinner"></span> Loading logs...
            </div>
          )}
          
          {!loading && logs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              No logs found matching the current filters.
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            gap: '10px', 
            marginTop: '20px',
            padding: '15px 0',
            borderTop: '1px solid #eee'
          }}>
            <button
              className="btn btn-outline"
              onClick={() => goToPage(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              Previous
            </button>
            
            <span style={{ color: '#666' }}>
              Page {pagination.page} of {pagination.totalPages} 
              ({pagination.total} total logs)
            </span>
            
            <button
              className="btn btn-outline"
              onClick={() => goToPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Logs;