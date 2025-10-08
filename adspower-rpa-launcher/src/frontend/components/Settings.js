import React, { useState, useEffect } from 'react';

const Settings = ({ onStatusUpdate }) => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [connectionTest, setConnectionTest] = useState({ status: null, message: '' });
  const [systemInfo, setSystemInfo] = useState({});

  useEffect(() => {
    fetchSettings();
    fetchSystemInfo();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/settings');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setSettings(result.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  };

  const fetchSystemInfo = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/settings/system/info');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setSystemInfo(result.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch system info:', error);
    }
  };

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/settings/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert('Settings saved successfully!');
          onStatusUpdate();
        } else {
          alert('Failed to save settings: ' + result.error);
        }
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setLoading(true);
    setConnectionTest({ status: 'testing', message: 'Testing connection...' });

    try {
      const response = await fetch('http://localhost:3001/api/settings/test-adspower', {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data.connected) {
          setConnectionTest({ 
            status: 'success', 
            message: 'Successfully connected to AdsPower!' 
          });
        } else {
          setConnectionTest({ 
            status: 'error', 
            message: result.data.message || 'Connection failed' 
          });
        }
      } else {
        setConnectionTest({ 
          status: 'error', 
          message: 'Failed to test connection' 
        });
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      setConnectionTest({ 
        status: 'error', 
        message: 'Connection test failed: ' + error.message 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetSettings = async () => {
    if (!window.confirm('Are you sure you want to reset all settings to defaults?')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/settings/reset', {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          fetchSettings();
          alert('Settings reset to defaults successfully!');
          onStatusUpdate();
        } else {
          alert('Failed to reset settings: ' + result.error);
        }
      }
    } catch (error) {
      console.error('Error resetting settings:', error);
      alert('Failed to reset settings: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Application Settings</h2>
          <div className="card-actions">
            <button
              className="btn btn-warning"
              onClick={handleResetSettings}
              disabled={loading}
            >
              🔄 Reset to Defaults
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSaveSettings}
              disabled={loading}
            >
              {loading ? <span className="loading-spinner"></span> : '💾 Save Settings'}
            </button>
          </div>
        </div>

        <div className="grid grid-2">
          {/* Profile Settings */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Profile Configuration</h3>
            </div>
            
            <div className="form-group">
              <label className="form-label">Maximum Concurrent Profiles</label>
              <input
                type="number"
                className="form-input"
                value={settings.max_concurrent_profiles || '40'}
                onChange={(e) => handleSettingChange('max_concurrent_profiles', e.target.value)}
                min="1"
                max="100"
              />
              <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '5px' }}>
                Maximum number of profiles that can run simultaneously
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Default Device Type</label>
              <select
                className="form-select"
                value={settings.default_device_type || 'PC'}
                onChange={(e) => handleSettingChange('default_device_type', e.target.value)}
              >
                <option value="PC">PC</option>
                <option value="Mac">Mac</option>
                <option value="Mobile">Mobile</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Default Target URL</label>
              <input
                type="url"
                className="form-input"
                value={settings.target_url || ''}
                onChange={(e) => handleSettingChange('target_url', e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Profile Timeout (minutes)</label>
              <input
                type="number"
                className="form-input"
                value={settings.profile_timeout_minutes || '30'}
                onChange={(e) => handleSettingChange('profile_timeout_minutes', e.target.value)}
                min="5"
                max="180"
              />
              <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '5px' }}>
                Maximum time a profile can run before being considered inactive
              </div>
            </div>
          </div>

          {/* Automation Settings */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Automation Configuration</h3>
            </div>

            <div className="form-group">
              <label className="form-label">Mouse Movement Simulation</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <input
                    type="radio"
                    name="mouse_movement"
                    checked={settings.mouse_movement_enabled === 'true'}
                    onChange={() => handleSettingChange('mouse_movement_enabled', 'true')}
                  />
                  Enabled
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <input
                    type="radio"
                    name="mouse_movement"
                    checked={settings.mouse_movement_enabled === 'false'}
                    onChange={() => handleSettingChange('mouse_movement_enabled', 'false')}
                  />
                  Disabled
                </label>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Auto-delete Completed Profiles</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <input
                    type="radio"
                    name="auto_delete"
                    checked={settings.auto_delete_completed === 'true'}
                    onChange={() => handleSettingChange('auto_delete_completed', 'true')}
                  />
                  Enabled
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <input
                    type="radio"
                    name="auto_delete"
                    checked={settings.auto_delete_completed === 'false'}
                    onChange={() => handleSettingChange('auto_delete_completed', 'false')}
                  />
                  Disabled
                </label>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '5px' }}>
                Automatically delete profiles when their tasks are completed
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">AdsPower API URL</label>
              <input
                type="url"
                className="form-input"
                value={settings.adspower_api_url || ''}
                onChange={(e) => handleSettingChange('adspower_api_url', e.target.value)}
                placeholder="http://local.adspower.net:50325"
              />
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  className="btn btn-outline"
                  onClick={handleTestConnection}
                  disabled={loading}
                >
                  🔍 Test Connection
                </button>
                {connectionTest.status && (
                  <div className={`alert alert-${connectionTest.status === 'success' ? 'success' : connectionTest.status === 'error' ? 'error' : 'info'}`} style={{ margin: 0, padding: '5px 10px', fontSize: '0.85rem' }}>
                    {connectionTest.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System Information */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">System Information</h3>
        </div>
        <div className="grid grid-3">
          <div>
            <h4 style={{ marginBottom: '10px', color: '#555' }}>Platform</h4>
            <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>
              {systemInfo.platform} {systemInfo.arch}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>
              {systemInfo.hostname}
            </div>
          </div>
          <div>
            <h4 style={{ marginBottom: '10px', color: '#555' }}>Memory</h4>
            <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>
              {systemInfo.memory?.free}GB / {systemInfo.memory?.total}GB
            </div>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>
              Available / Total
            </div>
          </div>
          <div>
            <h4 style={{ marginBottom: '10px', color: '#555' }}>CPU</h4>
            <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>
              {systemInfo.cpu?.count} cores
            </div>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>
              {systemInfo.cpu?.model?.substring(0, 30)}...
            </div>
          </div>
        </div>
      </div>

      {/* Performance Recommendations */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Performance Recommendations</h3>
        </div>
        <div className="grid grid-2">
          <div>
            <h4 style={{ marginBottom: '10px', color: '#555' }}>Profile Limits</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#666' }}>
              <li>For 8GB RAM: Maximum 20-30 profiles</li>
              <li>For 16GB RAM: Maximum 40-50 profiles</li>
              <li>For 32GB RAM: Maximum 80-100 profiles</li>
              <li>Monitor system resources during operation</li>
            </ul>
          </div>
          <div>
            <h4 style={{ marginBottom: '10px', color: '#555' }}>Optimization Tips</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#666' }}>
              <li>Enable auto-delete for completed profiles</li>
              <li>Use proxy rotation for better performance</li>
              <li>Adjust mouse movement based on detection risk</li>
              <li>Set appropriate timeout values</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;