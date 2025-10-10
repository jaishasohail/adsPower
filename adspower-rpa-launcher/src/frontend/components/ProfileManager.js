import React, { useState, useEffect } from 'react';
import { 
  FiPlay, 
  FiSquare, 
  FiTrash2, 
  FiPlus, 
  FiRefreshCw
} from 'react-icons/fi';

const ProfileManager = ({ onStatusUpdate }) => {
  const [profiles, setProfiles] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProfile, setNewProfile] = useState({
    name: '',
    device_type: 'PC',
    proxy_id: '',
    target_url: ''
  });
  const [availableSlots, setAvailableSlots] = useState(0);
  const [profileCount, setProfileCount] = useState(1);
  const [lifecycleStats, setLifecycleStats] = useState(null);
  const [runningProfiles, setRunningProfiles] = useState([]);

  useEffect(() => {
    fetchProfiles();
    fetchProxies();
    fetchAvailableSlots();
    fetchLifecycleStats();
    
    // Poll lifecycle stats every 5 seconds
    const interval = setInterval(() => {
      fetchLifecycleStats();
      fetchProfiles();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    fetchRunningProfiles();
    const interval = setInterval(fetchRunningProfiles, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  // Fetch running profiles from backend
  const fetchRunningProfiles = async () => {
    try {
      const res = await fetch('/api/profiles/active/running');
      const json = await res.json();
      if (json.success) {
        setRunningProfiles(json.data || []);
      }
    } catch (err) {
      // Optionally handle error
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

  const fetchProxies = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/proxies/available');
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

  const fetchAvailableSlots = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/profiles/slots/available');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setAvailableSlots(result.data.available_slots);
        }
      }
    } catch (error) {
      console.error('Failed to fetch available slots:', error);
    }
  };

  const fetchLifecycleStats = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/lifecycle/stats');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setLifecycleStats(result.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch lifecycle stats:', error);
    }
  };

  const handleCreateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/profiles/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile: newProfile,
          count: profileCount
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setShowCreateModal(false);
          setNewProfile({ name: '', device_type: 'PC', proxy_id: '', target_url: '' });
          setProfileCount(1);
          fetchProfiles();
          fetchAvailableSlots();
          fetchLifecycleStats();
          onStatusUpdate();
          alert(`Lifecycle started! ${profileCount} profiles will run continuously in a loop.`);
        } else {
          alert('Failed to start lifecycle: ' + result.error);
        }
      } else {
        const errorResult = await response.json();
        alert('Failed to start lifecycle: ' + errorResult.error);
      }
    } catch (error) {
      console.error('Error starting lifecycle:', error);
      alert('Failed to start lifecycle: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStopLifecycle = async () => {
    if (!window.confirm('Are you sure you want to stop the lifecycle manager? All running profiles will be stopped and deleted.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/profiles/lifecycle/stop', {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          fetchProfiles();
          fetchAvailableSlots();
          fetchLifecycleStats();
          onStatusUpdate();
          alert('Lifecycle manager stopped successfully!');
        } else {
          alert('Failed to stop lifecycle: ' + result.error);
        }
      }
    } catch (error) {
      console.error('Error stopping lifecycle:', error);
      alert('Failed to stop lifecycle: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchProfile = async (profileId) => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/profiles/${profileId}/launch`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          fetchProfiles();
          onStatusUpdate();
          alert('Profile launched successfully!');
        } else {
          alert('Failed to launch profile: ' + result.error);
        }
      }
    } catch (error) {
      console.error('Error launching profile:', error);
      alert('Failed to launch profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStopProfile = async (profileId) => {
    // Validate profile ID before making API call
    if (!profileId || isNaN(parseInt(profileId))) {
      console.error('Invalid profile ID:', profileId);
      alert('Error: Invalid profile ID');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/profiles/${profileId}/stop`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          fetchProfiles();
          onStatusUpdate();
          alert('Profile stopped successfully!');
        } else {
          alert('Failed to stop profile: ' + result.error);
        }
      }
    } catch (error) {
      console.error('Error stopping profile:', error);
      alert('Failed to stop profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProfile = async (profileId) => {
    if (!window.confirm('Are you sure you want to delete this profile?')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/profiles/${profileId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchProfiles();
        fetchAvailableSlots();
        onStatusUpdate();
        alert('Profile deleted successfully!');
      } else {
        const errorResult = await response.json();
        alert('Failed to delete profile: ' + errorResult.error);
      }
    } catch (error) {
      console.error('Error deleting profile:', error);
      alert('Failed to delete profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'running':
      case 'active':
        return 'status-badge running';
      case 'launching':
        return 'status-badge launching';
      case 'completed':
        return 'status-badge completed';
      case 'inactive':
      case 'created':
      default:
        return 'status-badge inactive';
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Profile Manager</h2>
          <div className="card-actions">
            {lifecycleStats?.isRunning && (
              <button
                className="btn btn-danger"
                onClick={handleStopLifecycle}
                disabled={loading}
                style={{ marginRight: '10px' }}
              >
                <FiSquare /> Stop Lifecycle
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
              disabled={lifecycleStats?.isRunning}
            >
              <FiPlus /> Start Lifecycle
            </button>
            <button className="btn btn-secondary" onClick={fetchProfiles}>
              <FiRefreshCw /> Refresh
            </button>
          </div>
        </div>

        {lifecycleStats?.isRunning && (
          <div className="alert alert-info" style={{ margin: '15px', background: '#e3f2fd', border: '1px solid #2196f3', borderRadius: '4px', padding: '15px' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#1976d2' }}>🔄 Lifecycle Manager Running</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '0.9rem' }}>
              <div><strong>Active Profiles:</strong> {lifecycleStats.stats.activeCount} / {lifecycleStats.settings.maxConcurrentProfiles}</div>
              <div><strong>Total Launched:</strong> {lifecycleStats.stats.totalLaunched}</div>
              <div><strong>Total Completed:</strong> {lifecycleStats.stats.totalCompleted}</div>
              <div><strong>Errors:</strong> {lifecycleStats.stats.totalErrors}</div>
              <div><strong>Runtime:</strong> {lifecycleStats.stats.runtimeFormatted}</div>
              <div><strong>Success Rate:</strong> {lifecycleStats.stats.successRate}%</div>
            </div>
          </div>
        )}

        {!lifecycleStats?.isRunning && (
          <div className="alert alert-warning" style={{ margin: '15px' }}>
            Click "Start Lifecycle" to begin the automated profile management system. Profiles will be created, launched, and recycled automatically in an infinite loop.
          </div>
        )}

        <div className="table-container" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Device Type</th>
                <th>Status</th>
                <th>Proxy</th>
                <th>Target URL</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id}>
                  <td style={{ fontWeight: '500' }}>{profile.name}</td>
                  <td>{profile.device_type}</td>
                  <td>
                    <span className={getStatusBadgeClass(profile.status)}>
                      {profile.status}
                    </span>
                  </td>
                  <td>
                    {profile.ip_address ? (
                      <span title={`${profile.ip_address}:${profile.port}`}>
                        {profile.ip_address}
                      </span>
                    ) : (
                      <span style={{ color: '#999' }}>No proxy</span>
                    )}
                  </td>
                  <td>
                    {profile.target_url ? (
                      <a
                        href={profile.target_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#3498db', textDecoration: 'none' }}
                      >
                        {profile.target_url.length > 30
                          ? profile.target_url.substring(0, 30) + '...'
                          : profile.target_url}
                      </a>
                    ) : (
                      <span style={{ color: '#999' }}>Not set</span>
                    )}
                  </td>
                  <td style={{ color: '#666', fontSize: '0.85rem' }}>
                    {new Date(profile.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      {profile.status === 'inactive' || profile.status === 'created' ? (
                        <button
                          className="btn btn-success"
                          onClick={() => handleLaunchProfile(profile.id)}
                          disabled={loading || lifecycleStats?.isRunning}
                          style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                        >
                          <FiPlay /> Launch
                        </button>
                      ) : profile.status === 'running' || profile.status === 'active' ? (
                        <button
                          className="btn btn-warning"
                          onClick={() => handleStopProfile(profile.id)}
                          disabled={loading || lifecycleStats?.isRunning}
                          style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                        >
                          <FiSquare /> Stop
                        </button>
                      ) : null}
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDeleteProfile(profile.id)}
                        disabled={loading || lifecycleStats?.isRunning}
                        style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                      >
                        <FiTrash2 /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {profiles.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              {lifecycleStats?.isRunning 
                ? 'Profiles are being created and managed automatically...'
                : 'No profiles yet. Click "Start Lifecycle" to begin automation.'}
            </div>
          )}
        </div>
      </div>

      {/* Create Profile Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Start Lifecycle Manager</h3>
              <button
                className="modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateProfile}>
              <div className="form-group">
                <label className="form-label">Profile Name Prefix *</label>
                <input
                  type="text"
                  className="form-input"
                  value={newProfile.name}
                  onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
                  required
                  placeholder="e.g., MyProfile (will auto-generate unique names)"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Device Type</label>
                <select
                  className="form-select"
                  value={newProfile.device_type}
                  onChange={(e) => setNewProfile({ ...newProfile, device_type: e.target.value })}
                >
                  <option value="PC">PC</option>
                  <option value="Mac">Mac</option>
                  <option value="Mobile">Mobile</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Proxy (Optional)</label>
                <select
                  className="form-select"
                  value={newProfile.proxy_id}
                  onChange={(e) => setNewProfile({ ...newProfile, proxy_id: e.target.value })}
                >
                  <option value="">No proxy</option>
                  {proxies.map((proxy) => (
                    <option key={proxy.id} value={proxy.id}>
                      {proxy.ip_address}:{proxy.port} ({proxy.type})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Target URL *</label>
                <input
                  type="url"
                  className="form-input"
                  value={newProfile.target_url}
                  onChange={(e) => setNewProfile({ ...newProfile, target_url: e.target.value })}
                  placeholder="https://example.com"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Number of Concurrent Profiles *</label>
                <input
                  type="number"
                  className="form-input"
                  min={1}
                  max={100}
                  value={profileCount}
                  onChange={e => setProfileCount(Number(e.target.value))}
                  required
                />
                <small style={{ color: '#666', fontSize: '0.85rem' }}>
                  This many profiles will run simultaneously in an infinite loop
                </small>
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
                  {loading ? <span className="loading-spinner"></span> : 'Start Lifecycle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileManager;