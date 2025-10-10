require('dotenv').config();
const axios = require('axios');
const WebSocket = require('ws');

class AdsPowerService {
  constructor() {
    this.baseURL = "http://127.0.0.1:50325";
    this.apiKey = process.env.ADSPOWER_API_KEY || null;
    this.isConnected = false;
    this.demoMode = false;
    this.lastConnectionCheck = null;
    this.connectionCheckInterval = 30000;
    
    // Store active browser connections
    this.browserConnections = new Map();

    // CRITICAL FIX: Reduced minInterval from 10000ms to 500ms
    this.rateLimit = {
      minInterval: 500, // FIXED: Was 10000, now 500ms between requests
      lastRequestTime: 0,
      queue: [],
      processing: false,
      maxRetries: Number(process.env.ADSPOWER_MAX_RETRIES || 4),
      backoffBase: Number(process.env.ADSPOWER_BACKOFF_BASE_MS || 800)
    };

    this.apiClient = axios.create({
      baseURL: this.baseURL,
      timeout: 15000, // INCREASED: From 5000ms to 15000ms
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
      this.apiClient.defaults.headers['Authorization'] = `Bearer ${key}`;
    } else {
      delete this.apiClient.defaults.headers['Authorization'];
    }
  }

  async _schedule(fn) {
    if (!this.rateLimit) {
      this.rateLimit = {
        minInterval: 500,
        lastRequestTime: 0,
        queue: [],
        processing: false,
        maxRetries: 3,
        backoffBase: 800
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

  async makeRequest(endpoint, method = 'GET', data = null, params = null, attempt = 1) {
    return this._schedule(async () => {
      try {
        const headers = {};
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
        if (/Too many request per second/i.test(msg)) {
          if (attempt <= this.rateLimit.maxRetries) {
            // IMPROVED: Better backoff calculation
            const backoff = this._computeBackoff(attempt);
            console.warn(`⚠️ Rate limited (attempt ${attempt}/${this.rateLimit.maxRetries}) – retrying in ${backoff}ms`);
            await new Promise(r => setTimeout(r, backoff));
            return this.makeRequest(endpoint, method, data, params, attempt + 1);
          }
          throw new Error(`Rate limit exceeded after ${this.rateLimit.maxRetries} retries`);
        }

        throw new Error(`AdsPower API Error: ${msg}`);
      } catch (error) {
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
    // IMPROVED: Exponential backoff with jitter
    const base = this.rateLimit.backoffBase;
    const exponential = Math.pow(2, attempt - 1);
    const jitter = Math.floor(Math.random() * 300);
    return Math.min(base * exponential + jitter, 10000); // Cap at 10 seconds
  }

  async checkConnection() {
    const now = Date.now();
    const cacheMs = 15000;
    if (this.isConnected && this.lastConnectionCheck && (now - this.lastConnectionCheck.getTime() < cacheMs)) {
      return true;
    }

    if (this._connectionCheckPromise) {
      return this._connectionCheckPromise;
    }

    this._connectionCheckPromise = (async () => {
      try {
        console.log('[checkConnection] Starting AdsPower connection check...');
        
        // CRITICAL FIX: Increased timeout from 10s to 30s
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection check timed out after 30s')), 30000)
        );
        
        let res = await Promise.race([
          this.makeRequest('/api/v1/user/list', 'GET', null, { page: 1, page_size: 1 }),
          timeoutPromise
        ]);

        if (res && res.error && /too many request/i.test(res.error)) {
          console.warn('[checkConnection] Rate limited, retrying after 2s...');
          await new Promise(r => setTimeout(r, 2000));
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

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      demoMode: this.demoMode,
      lastCheck: this.lastConnectionCheck,
      baseURL: this.baseURL
    };
  }

  updateBaseURL(url) {
    this.baseURL = url;
    this.apiClient.defaults.baseURL = url;
    this.checkConnection();
  }

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

  async createGroup(groupData) {
    if (!this.isConnected || this.demoMode) {
      return {
        success: true,
        data: { group_id: Math.floor(Math.random() * 1000), group_name: groupData.group_name, remark: groupData.remark }
      };
    }
    return await this.makeRequest('/api/v1/group/create', 'POST', groupData);
  }

  async createProfile(profileConfig) {
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

      if (group_id === undefined || group_id === null || group_id === '') {
        console.warn('group_id missing in payload, attempting auto-resolution...');
        const groups = await this.getGroups();
        if (groups.success && groups.data.length) {
          group_id = groups.data[0].group_id;
          console.log('Resolved group_id:', group_id);
        }
      }

      if (group_id === undefined || group_id === null || group_id === '') {
        throw new Error('group_id is required');
      }

      group_id = Number(group_id);
      if (Number.isNaN(group_id)) throw new Error('group_id is not a valid number');

      if (target_url) {
        domain_name = this.extractDomain(target_url);
        open_urls = [target_url];
      } else {
        domain_name = domain_name ? this.extractDomain(domain_name) : 'google.com';
        open_urls = Array.isArray(open_urls) && open_urls.length ? open_urls : ['https://google.com'];
      }

      fingerprint_config = fingerprint_config || {};

      if (fingerprint_config.screen_resolution) {
        fingerprint_config.screen_resolution = fingerprint_config.screen_resolution.replace(',', 'x');
      } else {
        fingerprint_config.screen_resolution = '1920x1080';
      }
      
      if (!fingerprint_config.automatic_timezone) {
        fingerprint_config.automatic_timezone = 1;
      }
      
      if (!fingerprint_config.language) {
        fingerprint_config.language = ['en-US', 'en'];
      }
      
      const validWebRtcValues = ['forward', 'proxy', 'local', 'disabled'];
      if (!fingerprint_config.webrtc || !validWebRtcValues.includes(fingerprint_config.webrtc)) {
        fingerprint_config.webrtc = 'proxy';
        console.log('🔧 WebRTC set to: proxy');
      }

      if (
        typeof fingerprint_config.location_longitude !== 'number' ||
        isNaN(fingerprint_config.location_longitude)
      ) {
        fingerprint_config.location_longitude = 0;
      }
      if (
        typeof fingerprint_config.location_latitude !== 'number' ||
        isNaN(fingerprint_config.location_latitude)
      ) {
        fingerprint_config.location_latitude = 0;
      }

      let validProxyConfig = user_proxy_config;
      
      if (!validProxyConfig || typeof validProxyConfig !== 'object') {
        validProxyConfig = {
          proxy_type: 'noproxy',
          proxy_soft: 'no_proxy'
        };
        console.log('🚫 No proxy provided - using noproxy configuration');
      } else if (validProxyConfig.proxy_type === 'noproxy') {
        validProxyConfig = {
          proxy_type: 'noproxy',
          proxy_soft: 'no_proxy'
        };
      } else if (validProxyConfig.proxy_host && validProxyConfig.proxy_port) {
        validProxyConfig = {
          proxy_type: (validProxyConfig.proxy_type || 'http').toLowerCase(),
          proxy_host: validProxyConfig.proxy_host,
          proxy_port: String(validProxyConfig.proxy_port),
          proxy_user: validProxyConfig.proxy_user || '',
          proxy_password: validProxyConfig.proxy_password || '',
          proxy_soft: validProxyConfig.proxy_soft || 'other'
        };
        console.log('📡 Using provided proxy configuration');
      } else {
        validProxyConfig = {
          proxy_type: 'noproxy',
          proxy_soft: 'no_proxy'
        };
        console.warn('⚠️ Invalid proxy config, using noproxy');
      }

      const payload = {
        name,
        domain_name,
        open_urls,
        group_id,
        fingerprint_config,
        user_proxy_config: validProxyConfig,
        remark
      };

      console.log('Creating profile with payload:', JSON.stringify(payload, null, 2));

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

  extractDomain(url) {
    try {
      if (!url) return 'google.com';
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

  async startProfile(profileId, options = {}) {
    try {
      console.log(`🚀 [ADS] Starting profile ${profileId}...`);
      
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

      const queryParams = {
        user_id: profileId,
        headless: options.headless ? 1 : 0,
        disable_password_filling: options.disable_password_filling ? 1 : 0,
        clear_cache_after_closing: options.clear_cache_after_closing ? 1 : 0,
        enable_password_saving: options.enable_password_saving ? 1 : 0
      };

      if (options.launch_args && Array.isArray(options.launch_args) && options.launch_args.length > 0) {
        queryParams.launch_args = JSON.stringify(options.launch_args);
      }

      console.log(`🚀 [ADS] Query params:`, JSON.stringify(queryParams, null, 2));
      
      const response = await this.makeRequest(
        '/api/v1/browser/start',
        'GET',
        null,
        queryParams
      );

      console.log(`🔄 [ADS] AdsPower response:`, JSON.stringify(response, null, 2));

      if (!response.success) {
        throw new Error(response.error || 'Failed to start profile in AdsPower');
      }

      const data = response.data || {};
      const ws = data.ws || data.webdriver || '';
      const debugPort = data.debug_port || ws.match(/:(\d+)\//)?.[1] || '50325';
      
      const result = {
        success: true,
        profile_id: profileId,
        ws_endpoint: ws,
        selenium_endpoint: data.selenium || `http://127.0.0.1:${debugPort}`,
        debug_port: parseInt(debugPort),
        webdriver: data.webdriver || null
      };
      
      console.log(`✅ [ADS] Successfully started profile ${profileId}`);
      console.log(`📊 [ADS] Result:`, JSON.stringify(result, null, 2));
      
      return result;

    } catch (error) {
      console.error(`❌ [ADS] Error starting profile ${profileId}:`, error);
      return {
        success: false,
        error: error.message,
        profile_id: profileId
      };
    }
  }

  async stopProfile(profileId) {
  try {
    console.log(`🛑 [ADS] Stopping profile ${profileId}...`);
    
    if (!this.isConnected || this.demoMode) {
      console.log(`🎭 Simulating profile stop: ${profileId}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const connection = this.browserConnections.get(profileId);
      if (connection && connection.ws) {
        connection.ws.close();
        this.browserConnections.delete(profileId);
      }
      
      return {
        success: true,
        data: {
          user_id: profileId,
          status: 'Stopped'
        }
      };
    }

    // Close WebSocket connection if exists
    const connection = this.browserConnections.get(profileId);
    if (connection && connection.ws) {
      try {
        connection.ws.close();
        console.log(`🔌 [ADS] Closed WebSocket connection for ${profileId}`);
      } catch (err) {
        console.warn(`⚠️ [ADS] Error closing WebSocket:`, err.message);
      }
      this.browserConnections.delete(profileId);
    }

    // CRITICAL FIX: Always attempt to stop, don't skip based on status check
    console.log(`🛑 [ADS] Sending stop command to profile ${profileId}...`);
    
    const apiRes = await this.makeRequest('/api/v1/browser/stop', 'POST', { user_id: profileId });
    
    if (apiRes.success) {
      console.log(`✅ [ADS] Successfully stopped profile ${profileId}`);
      return { success: true, data: apiRes.data };
    }
    
    // Handle specific errors
    const errorMsg = apiRes.error || '';
    
    // If 404 or "not found", browser is already stopped
    if (errorMsg.includes('404') || errorMsg.includes('not found') || errorMsg.includes('not active')) {
      console.log(`ℹ️ [ADS] Profile ${profileId} was already stopped`);
      return {
        success: true,
        data: {
          user_id: profileId,
          status: 'Already Stopped',
          skipped: true
        }
      };
    }
    
    // Other errors
    console.warn(`⚠️ [ADS] Failed to stop profile ${profileId}:`, errorMsg);
    return { success: false, error: errorMsg };
    
  } catch (error) {
    console.error(`❌ [ADS] Error in stopProfile for ${profileId}:`, error.message);
    return { success: false, error: error.message };
  }
}

  async deleteProfile(profileId) {
    if (!this.isConnected || this.demoMode) {
      console.log(`🎭 Simulating profile deletion: ${profileId}`);
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
  async forceDeleteProfile(profileId, maxAttempts = 3) {
  console.log(`🔨 [ADS] Force deleting profile ${profileId} with ${maxAttempts} attempts...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🔨 [ADS] Force delete attempt ${attempt}/${maxAttempts} for ${profileId}...`);
      
      // CRITICAL FIX: Always try to stop the browser, ignore status check failures
      console.log(`🛑 [ADS] Forcefully stopping browser for profile ${profileId}...`);
      
      try {
        // Direct stop command without checking status first
        const stopRes = await this.makeRequest('/api/v1/browser/stop', 'POST', { user_id: profileId });
        
        if (stopRes.success) {
          console.log(`✅ [ADS] Successfully stopped browser for profile ${profileId}`);
        } else {
          // Log but continue - the browser might already be stopped
          console.log(`ℹ️ [ADS] Stop command response:`, stopRes.error || 'no error message');
        }
      } catch (stopError) {
        console.log(`ℹ️ [ADS] Stop error (continuing anyway):`, stopError.message);
      }

      // Wait progressively longer between attempts to ensure browser fully closes
      const waitTime = attempt * 3000; // 3s, 6s, 9s
      console.log(`⏳ [ADS] Waiting ${waitTime}ms for browser to fully close...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Try to close via alternative endpoint if available
      if (attempt === 1) {
        try {
          const closeRes = await this.makeRequest('/api/v1/browser/close', 'POST', { user_id: profileId });
          if (closeRes.success) {
            console.log(`✅ [ADS] Browser closed via /browser/close endpoint`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Extra wait after close
          }
        } catch (closeErr) {
          console.log(`ℹ️ [ADS] /browser/close not available or failed (this is normal)`);
        }
      }

      // Now try to delete
      console.log(`🗑️ [ADS] Attempting delete for profile ${profileId}...`);
      const deleteRes = await this.deleteProfile(profileId);

      if (deleteRes.success) {
        console.log(`✅ [ADS] Successfully force deleted profile ${profileId} on attempt ${attempt}`);
        return { success: true, data: deleteRes.data, attempts: attempt };
      }

      // Check error type
      const errorMsg = deleteRes.error || '';
      
      if (errorMsg.includes('being used')) {
        console.warn(`⚠️ [ADS] Profile ${profileId} still in use on attempt ${attempt}/${maxAttempts}`);
        
        if (attempt < maxAttempts) {
          console.log(`🔄 [ADS] Will retry after longer wait...`);
          // Extra wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        } else {
          console.error(`❌ [ADS] Profile ${profileId} still in use after ${maxAttempts} attempts`);
          console.log(`💡 [ADS] Manual intervention may be required - close the browser window manually in AdsPower`);
          return { 
            success: false, 
            error: `Profile still in use after ${maxAttempts} attempts. Please close browser manually in AdsPower.`,
            attempts: attempt 
          };
        }
      } else if (errorMsg.includes('not found') || errorMsg.includes('404')) {
        // Profile already deleted
        console.log(`✅ [ADS] Profile ${profileId} already deleted (404)`);
        return { success: true, data: { alreadyDeleted: true }, attempts: attempt };
      } else {
        // Other error - return immediately
        console.error(`❌ [ADS] Delete failed with error:`, errorMsg);
        return { success: false, error: errorMsg, attempts: attempt };
      }

    } catch (error) {
      console.error(`❌ [ADS] Error in force delete attempt ${attempt}:`, error.message);
      
      if (attempt === maxAttempts) {
        return { success: false, error: error.message, attempts: attempt };
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return {
    success: false,
    error: `Failed to delete profile ${profileId} after ${maxAttempts} attempts. Browser may still be open.`,
    attempts: maxAttempts
  };
}
  async getProfile(profileId) {
    const apiRes = await this.makeRequest('/api/v1/user/list', 'GET', null, { user_id: profileId });
    return apiRes.success ? { success: true, data: apiRes.data } : { success: false, error: apiRes.error };
  }

  async getAllProfiles(page = 1, pageSize = 50) {
    const apiRes = await this.makeRequest('/api/v1/user/list', 'GET', null, { page, page_size: pageSize });
    return apiRes.success ? { success: true, data: apiRes.data } : { success: false, error: apiRes.error };
  }

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

  async updateProfile(profileId, profileConfig) {
    const payload = { user_id: profileId, ...profileConfig };
    const apiRes = await this.makeRequest('/api/v1/user/update', 'POST', payload);
    return apiRes.success ? { success: true, data: apiRes.data } : { success: false, error: apiRes.error };
  }

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

  generateFingerprintConfig(deviceType = 'PC') {
    const configs = {
      PC: {
        automatic_timezone: 1,
        language: ['en-US', 'en'],
        page_language: 'en-US',
        screen_resolution: '1920_1080',
        fonts: ['Arial', 'Times New Roman', 'Courier New'],
        canvas: 1,
        webgl_image: 1,
        webgl_metadata: 1,
        webrtc: 'proxy',
        location_switch: 0,
        longitude: 0,
        latitude: 0,
        cpu_number: 8,
        memory_size: 8,
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 
        flash: 0
      },
      Mac: {
        automatic_timezone: 1,
        language: ['en-US', 'en'],
        page_language: 'en-US',
        screen_resolution: '1440_900',
        fonts: ['Arial', 'Times New Roman', 'Courier New'],
        canvas: 1,
        webgl_image: 1,
        webgl_metadata: 1,
        webrtc: 'proxy',
        location_switch: 0,
        longitude: 0,
        latitude: 0,
        cpu_number: 8,
        memory_size: 16,
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        flash: 0
      },
      Mobile: {
        automatic_timezone: 1,
        language: ['en-US', 'en'],
        page_language: 'en-US',
        screen_resolution: '375_667',
        fonts: ['Arial', 'Times New Roman', 'Courier New'],
        canvas: 1,
        webgl_image: 1,
        webgl_metadata: 1,
        webrtc: 'proxy',
        location_switch: 0,
        longitude: 0,
        latitude: 0,
        cpu_number: 4,
        memory_size: 4,
        ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        flash: 0
      }
    };

    return configs[deviceType] || configs.PC;
  }

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

  async getProfileStatus(profileId) {
    const apiRes = await this.makeRequest('/api/v1/user/list', 'GET', null, { user_id: profileId });
    if (apiRes.success && apiRes.data?.list?.length) {
      return { success: true, status: apiRes.data.list[0].status };
    }
    return { success: false, error: 'Profile not found' };
  }

  // IMPROVED: Better error handling and WebSocket management
  async executeScript(adsPowerProfileId, script) {
    try {
      let connection = this.browserConnections.get(adsPowerProfileId);
      
      if (!connection || !connection.ws || connection.ws.readyState !== WebSocket.OPEN) {
        console.log(`🔌 Establishing CDP connection for profile ${adsPowerProfileId}...`);
        
        const statusRes = await this.makeRequest('/api/v1/browser/active', 'POST', { user_id: adsPowerProfileId });
        
        if (!statusRes.success || statusRes.data.status !== 'Active') {
          console.log(`⚠️ Profile ${adsPowerProfileId} is not active`);
          return { success: false, error: 'Profile is not active' };
        }

        let wsEndpoint = statusRes.data.ws || statusRes.data.webdriver;
        
        if (wsEndpoint && typeof wsEndpoint === 'object' && wsEndpoint.puppeteer) {
          wsEndpoint = wsEndpoint.puppeteer;
        }
        
        if (!wsEndpoint || typeof wsEndpoint !== 'string') {
          console.error('Invalid WebSocket endpoint:', wsEndpoint);
          return { success: false, error: 'No valid WebSocket endpoint available' };
        }

        console.log(`🔗 Connecting to WebSocket: ${wsEndpoint}`);

        const ws = new WebSocket(wsEndpoint);
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('WebSocket connection timeout (10s)'));
          }, 10000);
          
          ws.on('open', () => {
            clearTimeout(timeout);
            resolve();
          });
          ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });

        connection = { ws, messageId: 1 };
        this.browserConnections.set(adsPowerProfileId, connection);
        console.log(`✅ CDP connection established for profile ${adsPowerProfileId}`);
      }

      return await this._executeCDPCommand(connection, script);

    } catch (error) {
      console.error(`❌ Error executing script for profile ${adsPowerProfileId}:`, error.message);
      
      const connection = this.browserConnections.get(adsPowerProfileId);
      if (connection && connection.ws) {
        connection.ws.close();
        this.browserConnections.delete(adsPowerProfileId);
      }
      
      return { success: false, error: error.message };
    }
  }

  async _executeCDPCommand(connection, script) {
    return new Promise((resolve, reject) => {
      const messageId = connection.messageId++;
      const timeout = setTimeout(() => {
        reject(new Error('CDP command timeout (10s)'));
      }, 10000);

      const messageHandler = (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.id === messageId) {
            clearTimeout(timeout);
            connection.ws.removeListener('message', messageHandler);
            
            if (message.error) {
              reject(new Error(message.error.message));
            } else {
              resolve({ success: true, result: message.result });
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      connection.ws.on('message', messageHandler);

      const command = {
        id: messageId,
        method: 'Runtime.evaluate',
        params: {
          expression: script,
          returnByValue: true,
          awaitPromise: false
        }
      };

      connection.ws.send(JSON.stringify(command));
    });
  }
}

module.exports = AdsPowerService;