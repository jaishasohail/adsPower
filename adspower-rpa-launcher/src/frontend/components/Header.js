import React, { useState, useEffect } from 'react';
import { 
  FiUsers, 
  FiGlobe, 
  FiClock, 
  FiRefreshCw,
  FiActivity
} from 'react-icons/fi';

const Header = ({ systemStatus, onRefresh, onToggleSidebar }) => {
  const { profiles, proxies, isConnected } = systemStatus;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    setLastUpdated(new Date());
  }, [systemStatus]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <header className="header">
      <div className="header-left">
        <button 
          className="sidebar-toggle-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>
        <h1>AdsPower RPA Launcher</h1>
        <div className="version-badge">v2.1.0</div>
      </div>
      
      <div className="header-center">
        <div className="status-indicator">
          <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></div>
          <span className="status-text">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        
        <div className="status-indicator">
          <div className="status-icon"><FiUsers /></div>
          <span className="status-text">
            <span className="status-primary">{profiles.active}</span>
            <span className="status-secondary">/{profiles.total}</span>
          </span>
          <div className="status-label">Profiles</div>
        </div>
        
        <div className="status-indicator">
          <div className="status-icon"><FiGlobe /></div>
          <span className="status-text">
            <span className="status-primary">{proxies.available}</span>
            <span className="status-secondary">/{proxies.total}</span>
          </span>
          <div className="status-label">Proxies</div>
        </div>

        <div className="status-indicator time-indicator">
          <div className="status-icon"><FiClock /></div>
          <span className="status-text">
            <span className="status-primary">{formatTime(lastUpdated)}</span>
          </span>
          <div className="status-label">Updated</div>
        </div>
      </div>
      
      <div className="header-right">
        <div className="header-actions">
          <button 
            className={`refresh-btn ${isRefreshing ? 'refreshing' : ''}`}
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Refresh system status"
          >
            <span className={`icon ${isRefreshing ? 'spinning' : ''}`}><FiRefreshCw /></span>
            <span className="btn-text">
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </span>
          </button>
          
          <div className="system-health">
            <div className={`health-indicator ${isConnected ? 'healthy' : 'unhealthy'}`}>
              <div className="health-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;