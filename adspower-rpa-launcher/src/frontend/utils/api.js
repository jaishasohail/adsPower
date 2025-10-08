// API utility functions for frontend
const API_BASE_URL = 'http://localhost:3001/api';

class ApiClient {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
      
      return data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Profile API methods
  async getProfiles() {
    return this.request('/profiles');
  }

  async createProfile(profileData) {
    return this.request('/profiles', {
      method: 'POST',
      body: JSON.stringify(profileData),
    });
  }

  async launchProfile(profileId) {
    return this.request(`/profiles/${profileId}/launch`, {
      method: 'POST',
    });
  }

  async stopProfile(profileId) {
    return this.request(`/profiles/${profileId}/stop`, {
      method: 'POST',
    });
  }

  async deleteProfile(profileId) {
    return this.request(`/profiles/${profileId}`, {
      method: 'DELETE',
    });
  }

  async getAvailableSlots() {
    return this.request('/profiles/slots/available');
  }

  // Proxy API methods
  async getProxies() {
    return this.request('/proxies');
  }

  async getAvailableProxies() {
    return this.request('/proxies/available');
  }

  async createProxy(proxyData) {
    return this.request('/proxies', {
      method: 'POST',
      body: JSON.stringify(proxyData),
    });
  }

  async bulkImportProxies(proxies) {
    return this.request('/proxies/bulk', {
      method: 'POST',
      body: JSON.stringify({ proxies }),
    });
  }

  async deleteProxy(proxyId) {
    return this.request(`/proxies/${proxyId}`, {
      method: 'DELETE',
    });
  }

  async testProxy(proxyId) {
    return this.request(`/proxies/${proxyId}/test`, {
      method: 'POST',
    });
  }

  // Settings API methods
  async getSettings() {
    return this.request('/settings');
  }

  async updateSetting(key, value) {
    return this.request(`/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
  }

  async updateSettings(settings) {
    return this.request('/settings/bulk', {
      method: 'POST',
      body: JSON.stringify({ settings }),
    });
  }

  async testAdsPowerConnection() {
    return this.request('/settings/test-adspower', {
      method: 'POST',
    });
  }

  async getSystemInfo() {
    return this.request('/settings/system/info');
  }

  async getSystemStatus() {
    return this.request('/settings/system/status');
  }

  // Logs API methods
  async getLogs(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/logs${queryString ? `?${queryString}` : ''}`);
  }

  async exportLogs(filters = {}) {
    const queryString = new URLSearchParams(filters).toString();
    const url = `${API_BASE_URL}/logs/export${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Export failed');
    }
    
    return response.blob();
  }

  async clearOldLogs(days) {
    return this.request(`/logs/cleanup?days=${days}`, {
      method: 'DELETE',
    });
  }
}

// Utility functions
export const formatTimestamp = (timestamp) => {
  return new Date(timestamp).toLocaleString();
};

export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getStatusColor = (status) => {
  switch (status) {
    case 'active':
    case 'running':
      return '#27ae60';
    case 'launching':
      return '#f39c12';
    case 'completed':
      return '#3498db';
    case 'inactive':
    case 'error':
      return '#e74c3c';
    default:
      return '#95a5a6';
  }
};

export const validateProxyFormat = (proxyString) => {
  const regex = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{1,5})(:.*)?$/;
  return regex.test(proxyString.trim());
};

export const parseProxyString = (proxyString) => {
  const parts = proxyString.trim().split(':');
  if (parts.length < 2) return null;
  
  return {
    ip_address: parts[0],
    port: parseInt(parts[1]),
    username: parts[2] || '',
    password: parts[3] || '',
    type: 'HTTP'
  };
};

export const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

// Create and export API client instance
const apiClient = new ApiClient();
export default apiClient;