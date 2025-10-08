import React, { useState, useEffect } from 'react';

const ProxyManager = ({ onStatusUpdate }) => {
  const [proxies, setProxies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [newProxy, setNewProxy] = useState({
    ip_address: '',
    port: '',
    username: '',
    password: '',
    type: 'HTTP'
  });
  const [bulkProxies, setBulkProxies] = useState('');

  useEffect(() => {
    fetchProxies();
  }, []);

  const fetchProxies = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/proxies');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setProxies(result.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch proxies:', error);
    }
  };

  const handleCreateProxy = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/proxies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newProxy),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setShowCreateModal(false);
          setNewProxy({ ip_address: '', port: '', username: '', password: '', type: 'HTTP' });
          fetchProxies();
          onStatusUpdate();
          alert('Proxy added successfully!');
        } else {
          alert('Failed to add proxy: ' + result.error);
        }
      } else {
        const errorResult = await response.json();
        alert('Failed to add proxy: ' + errorResult.error);
      }
    } catch (error) {
      console.error('Error creating proxy:', error);
      alert('Failed to add proxy: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkImport = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Parse bulk proxy data
      const lines = bulkProxies.split('\n').filter(line => line.trim());
      const parsedProxies = [];

      for (const line of lines) {
        const parts = line.trim().split(':');
        if (parts.length >= 2) {
          parsedProxies.push({
            ip_address: parts[0],
            port: parseInt(parts[1]),
            username: parts[2] || '',
            password: parts[3] || '',
            type: 'HTTP'
          });
        }
      }

      if (parsedProxies.length === 0) {
        alert('No valid proxies found. Please check the format.');
        setLoading(false);
        return;
      }

      const response = await fetch('http://localhost:3001/api/proxies/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ proxies: parsedProxies }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setShowBulkModal(false);
          setBulkProxies('');
          fetchProxies();
          onStatusUpdate();
          alert(`Successfully imported ${result.data.imported} of ${result.data.total} proxies.${result.data.errors.length > 0 ? ' Some errors occurred.' : ''}`);
        } else {
          alert('Failed to import proxies: ' + result.error);
        }
      }
    } catch (error) {
      console.error('Error importing proxies:', error);
      alert('Failed to import proxies: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProxy = async (proxyId) => {
    if (!window.confirm('Are you sure you want to delete this proxy?')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/proxies/${proxyId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchProxies();
        onStatusUpdate();
        alert('Proxy deleted successfully!');
      } else {
        const errorResult = await response.json();
        alert('Failed to delete proxy: ' + errorResult.error);
      }
    } catch (error) {
      console.error('Error deleting proxy:', error);
      alert('Failed to delete proxy: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTestProxy = async (proxyId) => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/proxies/${proxyId}/test`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert(`Proxy test successful!\nResponse time: ${result.data.response_time}ms\nStatus: ${result.data.status}`);
        } else {
          alert('Proxy test failed: ' + result.error);
        }
      }
    } catch (error) {
      console.error('Error testing proxy:', error);
      alert('Failed to test proxy: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (proxy) => {
    if (!proxy.is_active) return 'status-badge inactive';
    if (proxy.assigned_profile_id) return 'status-badge running';
    return 'status-badge active';
  };

  const getStatusText = (proxy) => {
    if (!proxy.is_active) return 'Inactive';
    if (proxy.assigned_profile_id) return 'Assigned';
    return 'Available';
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Proxy Manager</h2>
          <div className="card-actions">
            <button
              className="btn btn-success"
              onClick={() => setShowBulkModal(true)}
            >
              📦 Bulk Import
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              ➕ Add Proxy
            </button>
            <button className="btn btn-secondary" onClick={fetchProxies}>
              🔄 Refresh
            </button>
          </div>
        </div>

        <div className="table-container" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>IP Address</th>
                <th>Port</th>
                <th>Type</th>
                <th>Username</th>
                <th>Status</th>
                <th>Assigned Profile</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {proxies.map((proxy) => (
                <tr key={proxy.id}>
                  <td style={{ fontWeight: '500', fontFamily: 'monospace' }}>
                    {proxy.ip_address}
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{proxy.port}</td>
                  <td>
                    <span className="status-badge active" style={{ fontSize: '0.7rem' }}>
                      {proxy.type}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>
                    {proxy.username || <span style={{ color: '#999' }}>None</span>}
                  </td>
                  <td>
                    <span className={getStatusBadgeClass(proxy)}>
                      {getStatusText(proxy)}
                    </span>
                  </td>
                  <td>
                    {proxy.assigned_profile_name ? (
                      <span style={{ color: '#3498db', fontWeight: '500' }}>
                        {proxy.assigned_profile_name}
                      </span>
                    ) : (
                      <span style={{ color: '#999' }}>Not assigned</span>
                    )}
                  </td>
                  <td style={{ color: '#666', fontSize: '0.85rem' }}>
                    {new Date(proxy.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        className="btn btn-outline"
                        onClick={() => handleTestProxy(proxy.id)}
                        disabled={loading}
                        style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                      >
                        🔍 Test
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDeleteProxy(proxy.id)}
                        disabled={loading || proxy.assigned_profile_id}
                        style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                        title={proxy.assigned_profile_id ? 'Cannot delete assigned proxy' : 'Delete proxy'}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {proxies.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              No proxies configured yet. Click "Add Proxy" or "Bulk Import" to get started.
            </div>
          )}
        </div>
      </div>

      {/* Create Proxy Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Add New Proxy</h3>
              <button
                className="modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateProxy}>
              <div className="form-group">
                <label className="form-label">IP Address *</label>
                <input
                  type="text"
                  className="form-input"
                  value={newProxy.ip_address}
                  onChange={(e) => setNewProxy({ ...newProxy, ip_address: e.target.value })}
                  required
                  placeholder="192.168.1.1"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Port *</label>
                <input
                  type="number"
                  className="form-input"
                  value={newProxy.port}
                  onChange={(e) => setNewProxy({ ...newProxy, port: e.target.value })}
                  required
                  placeholder="8080"
                  min="1"
                  max="65535"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select
                  className="form-select"
                  value={newProxy.type}
                  onChange={(e) => setNewProxy({ ...newProxy, type: e.target.value })}
                >
                  <option value="HTTP">HTTP</option>
                  <option value="HTTPS">HTTPS</option>
                  <option value="SOCKS4">SOCKS4</option>
                  <option value="SOCKS5">SOCKS5</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="form-input"
                  value={newProxy.username}
                  onChange={(e) => setNewProxy({ ...newProxy, username: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={newProxy.password}
                  onChange={(e) => setNewProxy({ ...newProxy, password: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? <span className="loading-spinner"></span> : 'Add Proxy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Bulk Import Proxies</h3>
              <button
                className="modal-close"
                onClick={() => setShowBulkModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleBulkImport}>
              <div className="form-group">
                <label className="form-label">Proxy List</label>
                <div style={{ marginBottom: '10px', fontSize: '0.9rem', color: '#666' }}>
                  Enter one proxy per line in format: IP:PORT or IP:PORT:USERNAME:PASSWORD
                </div>
                <textarea
                  className="form-input"
                  rows="10"
                  value={bulkProxies}
                  onChange={(e) => setBulkProxies(e.target.value)}
                  placeholder={`192.168.1.1:8080
192.168.1.2:8080:username:password
203.0.113.1:3128
203.0.113.2:3128:user:pass`}
                  required
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                />
              </div>
              <div className="alert alert-info">
                <strong>Format:</strong> Each line should contain IP:PORT or IP:PORT:USERNAME:PASSWORD
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowBulkModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={loading}
                >
                  {loading ? <span className="loading-spinner"></span> : 'Import Proxies'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProxyManager;