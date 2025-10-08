// Add Puppeteer for browser automation
const puppeteer = require('puppeteer');

require('dotenv').config();
const axios = require('axios');

class AdsPowerService {

  /**
   * Connect Puppeteer to an AdsPower-launched browser instance using DevTools endpoint.
   * @param {string} wsEndpoint - The WebSocket endpoint for Chrome DevTools Protocol (e.g., ws://127.0.0.1:9222/devtools/browser/xxxx)
   * @returns {Promise<Browser>} Puppeteer Browser instance
   */
  async connectPuppeteer(wsEndpoint) {
    try {
      if (!wsEndpoint) {
        throw new Error('No DevTools WebSocket endpoint provided.');
      }
      const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
      console.log('✅ Connected Puppeteer to AdsPower browser:', wsEndpoint);
      return browser;
    } catch (error) {
      console.error('❌ Failed to connect Puppeteer to AdsPower browser:', error);
      throw error;
    }
  }

  /**
   * Get the DevTools WebSocket endpoint for a running AdsPower profile (if available).
   * This requires AdsPower to expose the debugging port for the profile.
   * @param {string} profileId
   * @returns {Promise<string|null>} wsEndpoint or null if not available
   */
  async getDevToolsWsEndpoint(profileId) {
    try {
      // AdsPower API: /api/v1/browser/active returns ws endpoint in some configs
      const res = await this.makeRequest('/api/v1/browser/active', 'POST', { user_id: profileId });
      if (res.success && res.data && res.data.ws && res.data.ws.startsWith('ws://')) {
        return res.data.ws;
      }
      // Some AdsPower configs may return wsEndpoint as res.data.wsEndpoint
      if (res.success && res.data && res.data.wsEndpoint && res.data.wsEndpoint.startsWith('ws://')) {
        return res.data.wsEndpoint;
      }
      return null;
    } catch (error) {
      console.error('Error getting DevTools wsEndpoint:', error);
      return null;
    }
  }

  // Execute JavaScript in the browser window of a profile (AdsPower Local API)
  async executeScript(profileId, script) {
    if (!this.isConnected && !this.demoMode) {
      return { success: false, error: 'AdsPower not connected' };
    }
    if (this.demoMode) {
      // Simulate execution in demo mode
      console.log(`[DemoMode] Would execute script for profile ${profileId}:`, script);
      return { success: true, demo: true };
    }
    try {
      const apiRes = await this.makeRequest('/api/v1/browser/execute_script', 'POST', {
        user_id: profileId,
        script: script
      });
      return apiRes.success ? { success: true, data: apiRes.data } : { success: false, error: apiRes.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  constructor() {
    this.baseURL = process.env.ADSPOWER_BASE_URL || 'http://local.adspower.net:50325';
    this.apiKey = process.env.ADSPOWER_API_KEY || null;
    this.isConnected = false;
    this.demoMode = false;
    this.lastConnectionCheck = null;
    this.connectionCheckInterval = 30000;

    // INIT rateLimit BEFORE any request usage
    this.rateLimit = {
      minInterval: Number(process.env.ADSPOWER_MIN_INTERVAL_MS || 350),
      lastRequestTime: 0,
      queue: [],
      processing: false,
      maxRetries: Number(process.env.ADSPOWER_MAX_RETRIES || 4),
      backoffBase: Number(process.env.ADSPOWER_BACKOFF_BASE_MS || 600)
    };

    this.apiClient = axios.create({
      baseURL: this.baseURL,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
      }
    });

    // Call after everything set
    this.checkConnection();
  }

  setApiKey(key) {
    this.apiKey = key;
    if (key) {
      this.apiClient.defaults.headers['Authorization'] = `Bearer ${key}`; // adjust if different header required
    } else {
      delete this.apiClient.defaults.headers['Authorization'];
    }
  }

  async _schedule(fn) {
    // Safety guard if ever called before constructor finished
    if (!this.rateLimit) {
      this.rateLimit = {
        minInterval: 400,
        lastRequestTime: 0,
        queue: [],
        processing: false,
        maxRetries: 3,
        backoffBase: 600
      };
    }
    return new Promise((resolve, reject) => {
      this.rateLimit.queue.push({ fn, resolve, reject });
      this._drainQueue();
    });
  }

  async _drainQueue() {
    if (this.rateLimit.processing) return;
    this.rateLimit.processing = true;

    while (this.rateLimit.queue.length) {
      const { fn, resolve, reject } = this.rateLimit.queue.shift();
      const now = Date.now();
      const elapsed = now - this.rateLimit.lastRequestTime;
      if (elapsed < this.rateLimit.minInterval) {
        const wait = this.rateLimit.minInterval - elapsed;
        await new Promise(r => setTimeout(r, wait));
      }
      try {
        this.rateLimit.lastRequestTime = Date.now();
        const result = await fn();
        resolve(result);
      } catch (e) {
        reject(e);
      }
    }
    this.rateLimit.processing = false;
  }

  // Make API request with error handling
  async makeRequest(endpoint, method = 'GET', data = null, params = null, attempt = 1) {
    return this._schedule(async () => {
      try {
        const headers = {};
        // Fallback inject if header removed somewhere else
        if (this.apiKey && !this.apiClient.defaults.headers['Authorization']) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        const response = await this.apiClient.request({
          url: endpoint,
          method,
          ...(data && { data }),
          ...(params && { params }),
          headers
        });

        if (response.data.code === 0) {
          return { success: true, data: response.data.data };
        }

        const msg = response.data.msg || '';
        // Handle rate limit explicitly
        if (/Too many request per second/i.test(msg)) {
          if (attempt <= this.rateLimit.maxRetries) {
            const backoff = this._computeBackoff(attempt);
            console.warn(`⚠️ Rate limited (${attempt}) – retrying in ${backoff}ms (${msg})`);
            await new Promise(r => setTimeout(r, backoff));
            return this.makeRequest(endpoint, method, data, params, attempt + 1);
          }
          throw new Error(`Rate limit exceeded after ${this.rateLimit.maxRetries} retries`);
        }

        throw new Error(`AdsPower API Error: ${msg}`);
      } catch (error) {
        // Network / server errors: optional retry logic
        if (attempt <= this.rateLimit.maxRetries && /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED/.test(error.code || '')) {
            const backoff = this._computeBackoff(attempt);
            console.warn(`⚠️ Network error ${error.code} retry ${attempt} in ${backoff}ms`);
            await new Promise(r => setTimeout(r, backoff));
            return this.makeRequest(endpoint, method, data, params, attempt + 1);
        }
        console.error('API request error:', error.message);
        return { success: false, error: error.message };
      }
    });
  }

  _computeBackoff(attempt) {
    const base = this.rateLimit.backoffBase;
    const jitter = Math.floor(Math.random() * 250);
    return base * attempt + jitter;
  }

  // Check if AdsPower is running and accessible
  async checkConnection() {
    // Debounce: if last check was successful and recent, return cached result
    const now = Date.now();
    const cacheMs = 15000; // 15 seconds cache window
    if (this.isConnected && this.lastConnectionCheck && (now - this.lastConnectionCheck.getTime() < cacheMs)) {
      //console.log('[checkConnection] Using cached connection status');
      return true;
    }

    // Prevent overlapping checks
    if (this._connectionCheckPromise) {
      //console.log('[checkConnection] Awaiting ongoing connection check');
      return this._connectionCheckPromise;
    }

    this._connectionCheckPromise = (async () => {
      try {
        console.log('[checkConnection] Starting AdsPower connection check...');
        // Hard timeout (3s) in case axios or network hangs
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Connection check timed out after 3s')), 3000));
        let res = await Promise.race([
          this.makeRequest('/api/v1/user/list', 'GET', null, { page: 1, page_size: 1 }),
          timeoutPromise
        ]);

        // If rate limited, wait and retry once
        if (res && res.error && /too many request/i.test(res.error)) {
          console.warn('[checkConnection] Rate limited, retrying after 1s...');
          await new Promise(r => setTimeout(r, 1000));
          res = await this.makeRequest('/api/v1/user/list', 'GET', null, { page: 1, page_size: 1 });
        }

        this.isConnected = res.success;
        this.demoMode = !res.success;
        this.lastConnectionCheck = new Date();
        if (this.isConnected) {
          console.log('✅ AdsPower connection established');
        } else {
          console.log('❌ AdsPower connection failed (API returned unsuccessful)');
        }
        return this.isConnected;
      } catch (e) {
        this.isConnected = false;
        this.demoMode = true;
        this.lastConnectionCheck = new Date();
        console.log('⚠️  AdsPower connection failed - demo mode:', e.message);
        return false;
      } finally {
        this._connectionCheckPromise = null;
      }
    })();
    return this._connectionCheckPromise;
  }

  // Get connection status
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      demoMode: this.demoMode,
      lastCheck: this.lastConnectionCheck,
      baseURL: this.baseURL
    };
  }

  // Update base URL from settings
  updateBaseURL(url) {
    this.baseURL = url;
    this.apiClient.defaults.baseURL = url;
    // Recheck connection with new URL
    this.checkConnection();
  }

  // Generate demo profile data
  generateDemoProfile(profileConfig = {}) {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    
    const targetUrl = profileConfig.target_url || profileConfig.open_urls?.[0] || 'https://example.com';
    const domain = this.extractDomain(targetUrl);
    
    return {
      success: true,
      profile_id: `demo_${timestamp}_${randomId}`,
      data: {
        id: `demo_${timestamp}_${randomId}`,
        name: profileConfig.name || `Demo-${timestamp}-${randomId}`,
        domain_name: domain,
        open_urls: [targetUrl],
        group_id: profileConfig.group_id || 0,
        created_time: Math.floor(timestamp / 1000),
        status: 'Active',
        remark: profileConfig.remark || 'Demo profile - AdsPower not connected'
      }
    };
  }

  // Get all groups
  async getGroups() {
    if (!this.isConnected || this.demoMode) {
      return {
        success: true,
        data: [{ group_id: 0, group_name: 'Default Group', remark: 'Demo group' }]
      };
    }
    const response = await this.makeRequest('/api/v1/group/list', 'GET');
    if (!response.success) return response;
    const raw = response.data;
    const groups = Array.isArray(raw) ? raw : (raw?.list || []);
    return { success: true, data: groups };
  }

  // Create a new group
  async createGroup(groupData) {
    if (!this.isConnected || this.demoMode) {
      return {
        success: true,
        data: { group_id: Math.floor(Math.random() * 1000), group_name: groupData.group_name, remark: groupData.remark }
      };
    }
    return await this.makeRequest('/api/v1/group/create', 'POST', groupData);
  }

  // Create a new profile in AdsPower
  async createProfile(profileConfig) {
    if (!this.isConnected) {
      const since = Date.now() - (this.lastConnectionCheck ? this.lastConnectionCheck.getTime() : 0);
      if (since > this.connectionCheckInterval) {
        await this.checkConnection();
      }
    }

    if (!this.isConnected || this.demoMode) {
      console.log('🎭 Creating demo profile (AdsPower not available)');
      return this.generateDemoProfile(profileConfig);
    }

    try {
      let {
        name,
        target_url,
        domain_name,
        open_urls,
        group_id,
        user_proxy_config,
        fingerprint_config,
        remark = ''
      } = profileConfig || {};

      // Auto-resolve group if missing
      if (group_id === undefined || group_id === null || group_id === '') {
        console.warn('group_id missing in payload, attempting auto-resolution...');
        const groups = await this.getGroups();
        if (groups.success && groups.data.length) {
          group_id = groups.data[0].group_id;
          console.log('Resolved group_id:', group_id);
        }
      }

      if (group_id === undefined || group_id === null || group_id === '') {
        throw new Error('group_id is required (not resolved in caller)');
      }

      group_id = Number(group_id);
      if (Number.isNaN(group_id)) throw new Error('group_id is not a valid number');

      // Derive domain/open_urls
      if (target_url) {
        domain_name = this.extractDomain(target_url);
        open_urls = [target_url];
      } else {
        domain_name = domain_name ? this.extractDomain(domain_name) : 'google.com';
        open_urls = Array.isArray(open_urls) && open_urls.length ? open_urls : ['https://google.com'];
      }

      // Normalize fingerprint
      fingerprint_config = fingerprint_config || {};
      if (fingerprint_config.screen_resolution) {
        fingerprint_config.screen_resolution = fingerprint_config.screen_resolution.replace(',', 'x');
      } else {
        fingerprint_config.screen_resolution = '1920x1080';
      }
      if (!fingerprint_config.automatic_timezone) fingerprint_config.automatic_timezone = 1;
      if (!fingerprint_config.language) fingerprint_config.language = ['en-US', 'en'];

      // Proxy normalization
      if (user_proxy_config) {
        if (!Object.keys(user_proxy_config).length) {
          // Empty object -> drop
          user_proxy_config = undefined;
        } else {
          if (!user_proxy_config.proxy_host || !user_proxy_config.proxy_port) {
            console.log('Removing user_proxy_config (missing host/port)');
            user_proxy_config = undefined;
          } else {
            user_proxy_config.proxy_type = (user_proxy_config.proxy_type || 'http').toLowerCase();
            user_proxy_config.proxy_port = String(user_proxy_config.proxy_port);
            user_proxy_config.proxy_user = user_proxy_config.proxy_user || '';
            user_proxy_config.proxy_password = user_proxy_config.proxy_password || '';
            user_proxy_config.proxy_soft = user_proxy_config.proxy_soft || 'other';
          }
        }
      }

      const payload = {
        name,
        domain_name,
        open_urls,
        group_id,
        fingerprint_config,
        remark
      };
      if (user_proxy_config) payload.user_proxy_config = user_proxy_config;

      console.log('Creating profile with payload:', payload);

      // Replace direct axios call:
      const apiRes = await this.makeRequest('/api/v1/user/create', 'POST', payload);
      if (apiRes.success) {
        return { success: true, profile_id: apiRes.data.id, data: apiRes.data };
      }
      return { success: false, error: apiRes.error };
    } catch (error) {
      console.error('Error creating AdsPower profile:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Add helper method to extract domain from URL
  extractDomain(url) {
    try {
      if (!url) return 'google.com';
      
      // Add protocol if missing
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      console.error('Error extracting domain from URL:', url, error);
      return 'google.com';
    }
  }

  // Launch/Start a profile with enhanced options for automation
  // CRITICAL FIX: Replace the startProfile method in AdsPowerService.js

async startProfile(profileId, options = {}) {
  try {
    console.log(`🚀 [ADS] Starting profile ${profileId}...`);
    
    // Handle demo mode
    if (!this.isConnected || this.demoMode) {
      console.log(`🎭 [ADS] Demo mode - simulating profile start: ${profileId}`);
      return {
        success: true,
        profile_id: profileId,
        ws_endpoint: `ws://localhost:50325/devtools/browser/${profileId}`,
        selenium_endpoint: `http://localhost:50325/selenium/${profileId}`,
        debug_port: 9222
      };
    }

    // Default launch options
    const launchOptions = {
      user_id: profileId, // CRITICAL: This is the AdsPower profile ID
      headless: 0, // 0 = visible, 1 = headless
      disable_password_filling: options.disable_password_filling ? 1 : 0,
      clear_cache_after_closing: options.clear_cache_after_closing ? 1 : 0,
      enable_password_saving: options.enable_password_saving ? 1 : 0,
    };

    // Add launch_args if provided
    if (options.launch_args && Array.isArray(options.launch_args) && options.launch_args.length > 0) {
      launchOptions.launch_args = options.launch_args;
    }

    console.log(`🚀 [ADS] Sending start request to AdsPower:`, JSON.stringify(launchOptions, null, 2));
    
    // Make the API request to start the browser
    const response = await this.makeRequest(
      '/api/v1/browser/start',
      'GET', // IMPORTANT: AdsPower uses GET with query params, not POST
      null,
      launchOptions // Pass as query parameters
    );

    console.log(`🔄 [ADS] AdsPower response:`, JSON.stringify(response, null, 2));

    if (!response.success) {
      throw new Error(response.error || 'Failed to start profile in AdsPower');
    }

    // Extract connection details from response
    const data = response.data || {};
    const debugPort = data.debug_port || data.ws?.match(/:(\d+)\//)?.[1] || 50325;
    const wsEndpoint = data.ws || `ws://local.adspower.net:${debugPort}/devtools/browser/${profileId}`;
    const seleniumEndpoint = data.selenium || `http://local.adspower.net:${debugPort}/selenium/${profileId}`;
    
    console.log(`✅ [ADS] Successfully started profile ${profileId}`);
    console.log(`📊 [ADS] Debug Port: ${debugPort}`);
    console.log(`📊 [ADS] WS Endpoint: ${wsEndpoint}`);
    console.log(`📊 [ADS] Selenium Endpoint: ${seleniumEndpoint}`);
    
    return {
      success: true,
      profile_id: profileId,
      ws_endpoint: wsEndpoint,
      selenium_endpoint: seleniumEndpoint,
      debug_port: debugPort,
      webdriver: data.webdriver || null
    };

  } catch (error) {
    console.error(`❌ [ADS] Error starting profile ${profileId}:`, error);
    console.error(`❌ [ADS] Error details:`, error.message);
    
    // If connection fails, try to reconnect and retry once
    if (!this.isConnected) {
      console.log('🔌 [ADS] Attempting to reconnect to AdsPower...');
      await this.checkConnection();
      
      if (this.isConnected) {
        console.log('🔄 [ADS] Retrying profile start after reconnection');
        // Recursive retry - but only once to avoid infinite loop
        if (!options._retried) {
          options._retried = true;
          return await this.startProfile(profileId, options);
        }
      }
    }
    
    return {
      success: false,
      error: error.message,
      profile_id: profileId
    };
  }
}

  // Stop/Close a profile
  async stopProfile(profileId) {
    // Handle demo mode
    if (!this.isConnected || this.demoMode) {
      console.log(`🎭 Simulating profile stop: ${profileId}`);
      // Wait a bit to simulate real stop time
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        success: true,
        data: {
          user_id: profileId,
          status: 'Stopped'
        }
      };
    }

    const apiRes = await this.makeRequest('/api/v1/browser/stop', 'POST', { user_id: profileId });
    return apiRes.success ? { success: true, data: apiRes.data } : { success: false, error: apiRes.error };
  }

  // Delete a profile from AdsPower
  async deleteProfile(profileId) {
    // Handle demo mode
    if (!this.isConnected || this.demoMode) {
      console.log(`🎭 Simulating profile deletion: ${profileId}`);
      // Wait a bit to simulate real deletion time
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return {
        success: true,
        data: {
          user_id: profileId,
          status: 'Deleted'
        }
      };
    }

    const apiRes = await this.makeRequest('/api/v1/user/delete', 'POST', { user_ids: [profileId] });
    return apiRes.success ? { success: true, data: apiRes.data } : { success: false, error: apiRes.error };
  }

  // Get profile information
  async getProfile(profileId) {
    const apiRes = await this.makeRequest('/api/v1/user/list', 'GET', null, { user_id: profileId });
    return apiRes.success ? { success: true, data: apiRes.data } : { success: false, error: apiRes.error };
  }

  // Get list of all profiles
  async getAllProfiles(page = 1, pageSize = 50) {
    const apiRes = await this.makeRequest('/api/v1/user/list', 'GET', null, { page, page_size: pageSize });
    return apiRes.success ? { success: true, data: apiRes.data } : { success: false, error: apiRes.error };
  }

  // Check profile status
  async checkProfileStatus(profileId) {
    const apiRes = await this.makeRequest('/api/v1/browser/active', 'POST', { user_id: profileId });
    if (apiRes.success) {
      return {
        success: true,
        is_active: apiRes.data.status === 'Active',
        status: apiRes.data.status,
        data: apiRes.data
      };
    }
    return { success: false, error: apiRes.error };
  }

  // Update profile configuration
  async updateProfile(profileId, profileConfig) {
    const payload = { user_id: profileId, ...profileConfig };
    const apiRes = await this.makeRequest('/api/v1/user/update', 'POST', payload);
    return apiRes.success ? { success: true, data: apiRes.data } : { success: false, error: apiRes.error };
  }

  // Generate proxy configuration for AdsPower
  generateProxyConfig(proxyData) {
    const { ip_address, port, username, password, type = 'HTTP' } = proxyData;
    
    return {
      proxy_type: type.toLowerCase(),
      proxy_host: ip_address,
      proxy_port: port,
      proxy_user: username || '',
      proxy_password: password || '',
      proxy_soft: 'other'
    };
  }

  // Generate fingerprint configuration
  generateFingerprintConfig(deviceType = 'PC') {
    const configs = {
      PC: {
        automatic_timezone: 1,
        language: ['en-US', 'en'],
        page_language: 'en-US',
        screen_resolution: '1920x1080',
        fonts: 1,
        canvas: 1,
        webgl_image: 1,
        webgl_metadata: 1,
        webrtc: 1,
        location_switch: 0,
        location_longitude: 0,
        location_latitude: 0,
        cpu_number: 8,
        memory_size: 8,
        ua: 'default',
        flash: 0
      },
      Mac: {
        automatic_timezone: 1,
        language: ['en-US', 'en'],
        page_language: 'en-US',
        screen_resolution: '1440x900',
        fonts: 1,
        canvas: 1,
        webgl_image: 1,
        webgl_metadata: 1,
        webrtc: 1,
        location_switch: 0,
        location_longitude: 0,
        location_latitude: 0,
        cpu_number: 8,
        memory_size: 16,
        ua: 'default',
        flash: 0
      },
      Mobile: {
        automatic_timezone: 1,
        language: ['en-US', 'en'],
        page_language: 'en-US',
        screen_resolution: '375x667',
        fonts: 1,
        canvas: 1,
        webgl_image: 1,
        webgl_metadata: 1,
        webrtc: 1,
        location_switch: 0,
        location_longitude: 0,
        location_latitude: 0,
        cpu_number: 4,
        memory_size: 4,
        ua: 'default',
        flash: 0
      }
    };

    return configs[deviceType] || configs.PC;
  }

  // Test connection to AdsPower
  async testConnection() {
    const isConnected = await this.checkConnection();
    
    return {
      success: isConnected,
      isConnected: this.isConnected,
      demoMode: this.demoMode,
      lastCheck: this.lastConnectionCheck,
      baseURL: this.baseURL,
      message: isConnected ? 'AdsPower connection successful' : 'AdsPower not available - using demo mode'
    };
  }

  // Get profile status
  async getProfileStatus(profileId) {
    const apiRes = await this.makeRequest('/api/v1/user/list', 'GET', null, { user_id: profileId });
    if (apiRes.success && apiRes.data?.list?.length) {
      return { success: true, status: apiRes.data.list[0].status };
    }
    return { success: false, error: 'Profile not found' };
  }
}

module.exports = AdsPowerService;