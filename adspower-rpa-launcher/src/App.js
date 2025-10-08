import React, { useState, useEffect, useCallback, Suspense } from 'react';
import './App.css';
import Dashboard from './frontend/components/Dashboard';
import ProfileManager from './frontend/components/ProfileManager';
import ProxyManager from './frontend/components/ProxyManager';
import Settings from './frontend/components/Settings';
import Logs from './frontend/components/Logs';
import Header from './frontend/components/Header';
import Sidebar from './frontend/components/Sidebar';

// Loading component
const LoadingSpinner = () => (
  <div className="loading-container">
    <div className="loading-spinner">
      <div className="spinner-ring"></div>
      <div className="spinner-ring"></div>
      <div className="spinner-ring"></div>
    </div>
    <p className="loading-text">Loading...</p>
  </div>
);

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-container">
          <div className="error-content">
            <h2>Something went wrong</h2>
            <p>We encountered an unexpected error. Please refresh the page.</p>
            <button 
              className="btn btn-primary" 
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [systemStatus, setSystemStatus] = useState({
    profiles: { total: 0, active: 0, completed: 0 },
    proxies: { total: 0, active: 0, available: 0 },
    isConnected: false
  });

  // Memoized fetch function to prevent unnecessary re-renders
  const fetchSystemStatus = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/settings/system/status');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setSystemStatus({
            profiles: result.data.profiles,
            proxies: result.data.proxies,
            isConnected: true
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error);
      setSystemStatus(prev => ({ ...prev, isConnected: false }));
    }
  }, []);

  // Initial load effect
  useEffect(() => {
    const initializeApp = async () => {
      setIsLoading(true);
      await fetchSystemStatus();
      // Simulate initial loading time for smooth UX
      setTimeout(() => setIsLoading(false), 1000);
    };

    initializeApp();
  }, [fetchSystemStatus]);

  // Periodic status updates
  useEffect(() => {
    if (!isLoading) {
      const interval = setInterval(fetchSystemStatus, 10000); // Every 10 seconds
      return () => clearInterval(interval);
    }
  }, [fetchSystemStatus, isLoading]);

  // Handle view changes with transitions
  const handleViewChange = useCallback((newView) => {
    setActiveView(newView);
  }, []);

  // Toggle sidebar for mobile
  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  const renderActiveView = () => {
    const viewProps = {
      systemStatus,
      onStatusUpdate: fetchSystemStatus
    };

    switch (activeView) {
      case 'dashboard':
        return <Dashboard {...viewProps} />;
      case 'profiles':
        return <ProfileManager {...viewProps} />;
      case 'proxies':
        return <ProxyManager {...viewProps} />;
      case 'settings':
        return <Settings {...viewProps} />;
      case 'logs':
        return <Logs />;
      default:
        return <Dashboard {...viewProps} />;
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <ErrorBoundary>
      <div className="app">
        <Header 
          systemStatus={systemStatus} 
          onRefresh={fetchSystemStatus}
          onToggleSidebar={toggleSidebar}
        />
        <div className="app-content">
          <Sidebar 
            activeView={activeView} 
            onViewChange={handleViewChange}
            systemStatus={systemStatus}
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
          />
          <main className={`main-content ${!isSidebarOpen ? 'sidebar-closed' : ''}`}>
            <Suspense fallback={<LoadingSpinner />}>
              <div className="view-transition">
                {renderActiveView()}
              </div>
            </Suspense>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;