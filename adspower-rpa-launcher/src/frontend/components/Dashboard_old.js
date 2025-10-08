import React, { useState, useEffect, useMemo } from 'react';

const Dashboard = ({ systemStatus, onStatusUpdate }) => {
  const [settings, setSettings] = useState({});
  const [recentLogs, setRecentLogs] = useState([]);
  const [availableSlots, setAvailableSlots] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [performanceMetrics, setPerformanceMetrics] = useState({
    cpuUsage: 0,
    memoryUsage: 0,
    networkStatus: 'good'
  });

  useEffect(() => {
    fetchSettings();
    fetchRecentLogs();
    fetchAvailableSlots();
    fetchPerformanceMetrics();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:3001/api/settings');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setSettings(result.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRecentLogs = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/logs?limit=5');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setRecentLogs(result.data.logs);
        }
      }
    } catch (error) {
      console.error('Failed to fetch recent logs:', error);
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

  const fetchPerformanceMetrics = async () => {
    // Simulate performance metrics (in real app, this would come from backend)
    setPerformanceMetrics({
      cpuUsage: Math.floor(Math.random() * 100),
      memoryUsage: Math.floor(Math.random() * 100),
      networkStatus: ['good', 'fair', 'poor'][Math.floor(Math.random() * 3)]
    });
  };

  const StatCard = ({ title, value, subtitle, color = '#667eea', icon, trend, onClick }) => (
    <div className="stat-card" onClick={onClick} style={{ '--card-color': color }}>
      <div className="stat-card-header">
        <div className="stat-icon">{icon}</div>
        {trend && (
          <div className={`stat-trend ${trend > 0 ? 'positive' : 'negative'}`}>
            {trend > 0 ? '↗️' : '↘️'}
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>
      <div className="stat-content">
        <h3 className="stat-value">{value}</h3>
        <p className="stat-title">{title}</p>
        {subtitle && <p className="stat-subtitle">{subtitle}</p>}
      </div>
      <div className="stat-card-overlay"></div>
    </div>
  );

  const MetricCard = ({ title, value, max, unit, color, icon }) => {
    const percentage = (value / max) * 100;
    
    return (
      <div className="metric-card">
        <div className="metric-header">
          <span className="metric-icon">{icon}</span>
          <span className="metric-title">{title}</span>
        </div>
        <div className="metric-content">
          <div className="metric-value">
            {value}{unit}
            <span className="metric-max">/{max}{unit}</span>
          </div>
          <div className="metric-bar">
            <div 
              className="metric-progress" 
              style={{ 
                width: `${percentage}%`,
                backgroundColor: color 
              }}
            ></div>
          </div>
          <div className={`metric-status ${percentage > 80 ? 'high' : percentage > 50 ? 'medium' : 'low'}`}>
            {percentage > 80 ? 'High Usage' : percentage > 50 ? 'Moderate' : 'Normal'}
          </div>
        </div>
      </div>
    );
  };

  const getLogLevelColor = (level) => {
    switch (level) {
      case 'error': return '#f04141';
      case 'warn': return '#ff9500';
      case 'info': return '#4facfe';
      case 'debug': return '#95a5a6';
      default: return '#ffffff';
    }
  };

  const systemHealth = useMemo(() => {
    const { profiles, proxies, isConnected } = systemStatus;
    const totalProfiles = profiles.total || 1;
    const activeRatio = profiles.active / totalProfiles;
    const proxyRatio = proxies.available / (proxies.total || 1);
    
    if (!isConnected) return { status: 'critical', color: '#f04141', message: 'System Disconnected' };
    if (activeRatio > 0.8) return { status: 'excellent', color: '#10dc60', message: 'System Running Optimally' };
    if (activeRatio > 0.5) return { status: 'good', color: '#4facfe', message: 'System Running Well' };
    if (activeRatio > 0.2) return { status: 'fair', color: '#ff9500', message: 'System Needs Attention' };
    return { status: 'poor', color: '#f04141', message: 'System Performance Poor' };
  }, [systemStatus]);

  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
        </div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Dashboard Overview</h1>
        <div className="dashboard-actions">
          <button className="btn btn-primary" onClick={onStatusUpdate}>
            <span className="btn-icon">🔄</span>
            Refresh All
          </button>
        </div>
      </div>

      {/* System Health Banner */}
      <div className={`health-banner ${systemHealth.status}`} style={{ '--health-color': systemHealth.color }}>
        <div className="health-content">
          <div className="health-icon">
            {systemHealth.status === 'excellent' ? '🟢' : 
             systemHealth.status === 'good' ? '🔵' : 
             systemHealth.status === 'fair' ? '🟡' : '🔴'}
          </div>
          <div className="health-text">
            <h3>System Health: {systemHealth.status.toUpperCase()}</h3>
            <p>{systemHealth.message}</p>
          </div>
        </div>
        <div className="health-pulse"></div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-4">
        <StatCard
          title="Active Profiles"
          value={systemStatus.profiles.active}
          subtitle={`of ${settings.max_concurrent_profiles || 40} max`}
          color="#10dc60"
          icon="👤"
          trend={systemStatus.profiles.active > 0 ? 12 : -5}
          onClick={() => console.log('Navigate to profiles')}
        />
        <StatCard
          title="Available Slots"
          value={availableSlots}
          subtitle="Ready for new profiles"
          color="#4facfe"
          icon="🎯"
          trend={availableSlots > 10 ? 8 : -3}
          onClick={() => console.log('Navigate to profiles')}
        />
        <StatCard
          title="Active Proxies"
          value={systemStatus.proxies.available}
          subtitle={`${systemStatus.proxies.total} total configured`}
          color="#764ba2"
          icon="🌐"
          trend={systemStatus.proxies.available > 0 ? 15 : -10}
          onClick={() => console.log('Navigate to proxies')}
        />
        <StatCard
          title="Completed Tasks"
          value={systemStatus.profiles.completed}
          subtitle="Successfully finished"
          color="#f093fb"
          icon="✅"
          trend={systemStatus.profiles.completed > 0 ? 25 : 0}
          onClick={() => console.log('Navigate to logs')}
        />
      </div>

      <div className="grid grid-2">
        {/* System Metrics */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">System Performance</h3>
            <div className="card-actions">
              <button className="btn btn-secondary" onClick={fetchPerformanceMetrics}>
                <span className="btn-icon">📊</span>
                Update
              </button>
            </div>
          </div>
          <div className="metrics-grid">
            <MetricCard
              title="CPU Usage"
              value={performanceMetrics.cpuUsage}
              max={100}
              unit="%"
              color="#667eea"
              icon="🖥️"
            />
            <MetricCard
              title="Memory Usage"
              value={performanceMetrics.memoryUsage}
              max={100}
              unit="%"
              color="#764ba2"
              icon="💾"
            />
          </div>
          <div className="network-status">
            <div className="network-header">
              <span className="network-icon">🌐</span>
              <span className="network-title">Network Status</span>
            </div>
            <div className={`network-indicator ${performanceMetrics.networkStatus}`}>
              <div className="network-pulse"></div>
              <span className="network-text">{performanceMetrics.networkStatus.toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* Quick Settings */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Quick Settings</h3>
            <div className="card-actions">
              <button className="btn btn-secondary" onClick={() => console.log('Navigate to settings')}>
                <span className="btn-icon">⚙️</span>
                Configure
              </button>
            </div>
          </div>
          <div className="settings-grid">
            <div className="setting-item">
              <div className="setting-label">Max Concurrent Profiles</div>
              <div className="setting-value">{settings.max_concurrent_profiles || 40}</div>
            </div>
            <div className="setting-item">
              <div className="setting-label">Default Device Type</div>
              <div className="setting-value">{settings.default_device_type || 'PC'}</div>
            </div>
            <div className="setting-item">
              <div className="setting-label">Mouse Movement</div>
              <div className={`status-badge ${settings.mouse_movement_enabled === 'true' ? 'active' : 'inactive'}`}>
                {settings.mouse_movement_enabled === 'true' ? 'Enabled' : 'Disabled'}
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-label">Target URL</div>
              <div className="setting-url" title={settings.target_url}>
                {settings.target_url ? 
                  settings.target_url.length > 30 ? 
                    settings.target_url.substring(0, 30) + '...' : 
                    settings.target_url 
                  : 'https://example.com'
                }
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Recent Activity</h3>
          <div className="card-actions">
            <button className="btn btn-secondary" onClick={() => console.log('Navigate to logs')}>
              <span className="btn-icon">📋</span>
              View All Logs
            </button>
          </div>
        </div>
        <div className="activity-list">
          {recentLogs.length > 0 ? (
            recentLogs.map((log, index) => (
              <div key={index} className="activity-item">
                <div 
                  className="activity-indicator"
                  style={{ backgroundColor: getLogLevelColor(log.level) }}
                ></div>
                <div className="activity-content">
                  <div className="activity-message">{log.message}</div>
                  <div className="activity-meta">
                    <span className={`activity-level ${log.level}`}>{log.level}</span>
                    <span className="activity-time">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <p className="empty-message">No recent activity</p>
              <p className="empty-subtitle">Logs will appear here as the system operates</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
                    padding: '10px',
                    borderBottom: index < recentLogs.length - 1 ? '1px solid #eee' : 'none',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px'
                  }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: getLogLevelColor(log.level),
                      marginTop: '6px',
                      flexShrink: 0
                    }}
                  ></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', marginBottom: '2px' }}>
                      {log.message}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#777' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                      {log.profile_name && ` • ${log.profile_name}`}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', color: '#777', padding: '20px' }}>
                No recent activity
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">System Status</h3>
        </div>
        <div className="grid grid-3">
          <div>
            <h4 style={{ marginBottom: '10px', color: '#555' }}>Connection Status</h4>
            <div className={`status-badge ${systemStatus.isConnected ? 'active' : 'inactive'}`}>
              {systemStatus.isConnected ? 'Connected to Backend' : 'Backend Disconnected'}
            </div>
          </div>
          <div>
            <h4 style={{ marginBottom: '10px', color: '#555' }}>Profile Utilization</h4>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${(systemStatus.profiles.active / (parseInt(settings.max_concurrent_profiles) || 40)) * 100}%`
                }}
              ></div>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#777', marginTop: '5px' }}>
              {systemStatus.profiles.active} of {settings.max_concurrent_profiles || 40} slots used
            </div>
          </div>
          <div>
            <h4 style={{ marginBottom: '10px', color: '#555' }}>Proxy Availability</h4>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${systemStatus.proxies.total > 0 ? (systemStatus.proxies.available / systemStatus.proxies.total) * 100 : 0}%`,
                  backgroundColor: '#27ae60'
                }}
              ></div>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#777', marginTop: '5px' }}>
              {systemStatus.proxies.available} of {systemStatus.proxies.total} proxies available
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;