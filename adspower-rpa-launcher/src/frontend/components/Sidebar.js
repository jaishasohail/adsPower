import React, { useState, useEffect } from 'react';
import { 
  FiBarChart2, 
  FiUsers, 
  FiGlobe, 
  FiSettings, 
  FiFileText,
  FiPlay,
  FiSquare,
  FiSearch,
  FiActivity,
  FiChevronDown,
  FiUser,
  FiServer
} from 'react-icons/fi';

const Sidebar = ({ activeView, onViewChange, systemStatus, isOpen, onClose }) => {
  const { profiles, proxies } = systemStatus;
  const [expandedSections, setExpandedSections] = useState({});

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <FiBarChart2 />,
      badge: null,
      description: 'System Overview'
    },
    {
      id: 'profiles',
      label: 'Profiles',
      icon: <FiUsers />,
      badge: profiles.active > 0 ? profiles.active : null,
      badgeType: profiles.active > 0 ? 'success' : null,
      description: 'Manage Browser Profiles'
    },
    {
      id: 'proxies',
      label: 'Proxies',
      icon: <FiGlobe />,
      badge: proxies.available > 0 ? proxies.available : null,
      badgeType: 'success',
      description: 'Proxy Configuration'
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <FiSettings />,
      badge: null,
      description: 'System Configuration'
    },
    {
      id: 'logs',
      label: 'Logs',
      icon: <FiFileText />,
      badge: null,
      description: 'Activity Logs'
    }
  ];

  const quickActions = [
    { id: 'start-all', label: 'Start All Profiles', icon: <FiPlay />, color: 'success' },
    { id: 'stop-all', label: 'Stop All Profiles', icon: <FiSquare />, color: 'danger' },
    { id: 'check-proxies', label: 'Check Proxies', icon: <FiSearch />, color: 'primary' }
  ];

  const handleNavClick = (itemId) => {
    onViewChange(itemId);
    if (window.innerWidth <= 1024) {
      onClose();
    }
  };

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1024) {
        // Auto-close sidebar on mobile when switching to desktop
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && window.innerWidth <= 1024 && (
        <div className="sidebar-overlay" onClick={onClose}></div>
      )}
      
      <nav className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-icon"><FiActivity /></div>
            <div className="logo-text">
              <div className="logo-title">RPA Control</div>
              <div className="logo-subtitle">AdsPower Manager</div>
            </div>
          </div>
        </div>

        <div className="sidebar-nav">
          {/* Main Navigation */}
          <div className="nav-section">
            <div className="nav-section-header">
              <span className="nav-section-title">Navigation</span>
            </div>
            {navItems.map(item => (
              <div
                key={item.id}
                className={`nav-item ${activeView === item.id ? 'active' : ''}`}
                onClick={() => handleNavClick(item.id)}
              >
                <div className="nav-item-content">
                  <span className="icon">{item.icon}</span>
                  <div className="nav-item-text">
                    <span className="nav-label">{item.label}</span>
                    <span className="nav-description">{item.description}</span>
                  </div>
                  {item.badge && (
                    <span className={`nav-badge ${item.badgeType || ''}`}>
                      {item.badge}
                    </span>
                  )}
                </div>
                <div className="nav-item-indicator"></div>
              </div>
            ))}
          </div>

          {/* System Status Section */}
          <div className="nav-section">
            <div 
              className="nav-section-header clickable"
              onClick={() => toggleSection('status')}
            >
              <span className="nav-section-title">System Status</span>
              <span className={`section-toggle ${expandedSections.status ? 'expanded' : ''}`}>
                <FiChevronDown />
              </span>
            </div>
            {expandedSections.status && (
              <div className="status-cards">
                <div className="status-card">
                  <div className="status-card-icon"><FiUser /></div>
                  <div className="status-card-content">
                    <div className="status-card-value">{profiles.active}</div>
                    <div className="status-card-label">Active</div>
                  </div>
                </div>
                <div className="status-card">
                  <div className="status-card-icon"><FiServer /></div>
                  <div className="status-card-content">
                    <div className="status-card-value">{proxies.available}</div>
                    <div className="status-card-label">Available</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="nav-section">
            <div 
              className="nav-section-header clickable"
              onClick={() => toggleSection('actions')}
            >
              <span className="nav-section-title">Quick Actions</span>
              <span className={`section-toggle ${expandedSections.actions ? 'expanded' : ''}`}>
                <FiChevronDown />
              </span>
            </div>
            {expandedSections.actions && (
              <div className="quick-actions">
                {quickActions.map(action => (
                  <button
                    key={action.id}
                    className={`quick-action-btn ${action.color}`}
                    onClick={() => console.log(`Quick action: ${action.id}`)}
                  >
                    <span className="action-icon">{action.icon}</span>
                    <span className="action-label">{action.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="connection-status">
            <div className={`connection-indicator ${systemStatus.isConnected ? 'connected' : 'disconnected'}`}>
              <div className="connection-pulse"></div>
            </div>
            <span className="connection-text">
              {systemStatus.isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </nav>
    </>
  );
};

export default Sidebar;