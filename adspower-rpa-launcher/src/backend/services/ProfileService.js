const AdsPowerService = require('./AdsPowerService');

class ProfileService {
  constructor(database) {
    this.db = database;
    this.activeProfiles = new Map();
    this.profileQueue = [];
    this.isProcessing = false;
    this.adsPowerService = new AdsPowerService();
  }

  // Get or create a default group for profiles
  async getOrCreateDefaultGroup() {
    try {
      console.log('🏷️ Getting or creating default group...');
      
      // First, try to get existing groups
      const groupsResult = await this.adsPowerService.getGroups();
      console.log('Groups result:', groupsResult);
      
      if (groupsResult.success && groupsResult.data && groupsResult.data.length > 0) {
        // Use the first available group
        const groupId = groupsResult.data[0].group_id;
        console.log(`✅ Using existing group: ${groupId}`);
        return groupId;
      }

      // If no groups exist, create a default one
      console.log('📁 No groups found, creating default group...');
      const createGroupResult = await this.adsPowerService.createGroup({
        group_name: 'RPA Launcher Profiles',
        remark: 'Default group for RPA Launcher created profiles'
      });

      console.log('Create group result:', createGroupResult);

      if (createGroupResult.success && createGroupResult.data) {
        const groupId = createGroupResult.data.group_id;
        console.log(`✅ Created default group: ${groupId}`);
        return groupId;
      } else {
        console.warn('⚠️ Failed to create group, using group_id 0 as fallback');
        return 0; // Fallback to default group
      }

    } catch (error) {
      console.error('❌ Error getting/creating group:', error);
      return 0; // Fallback to default group
    }
  }

  // Create profile in AdsPower with enhanced group handling
  async createAdsPowerProfile(profileData, localProfileId) {
    try {
      console.log(`🎨 Creating AdsPower profile for local profile ${localProfileId}`);
      const { name, target_url, proxy_id, device_type = 'PC' } = profileData;

      // Build proxy config only if valid proxy
      let proxyConfig = null;
      if (proxy_id) {
        const proxy = await this.db.get('SELECT * FROM proxies WHERE id = ?', [proxy_id]);
        if (proxy) {
          if (proxy.ip_address && proxy.port) {
            proxyConfig = {
              proxy_type: (proxy.protocol || 'http').toLowerCase(),
              proxy_host: proxy.ip_address,
              proxy_port: String(proxy.port),
              proxy_user: proxy.username || '',
              proxy_password: proxy.password || '',
              proxy_soft: 'other'
            };
            console.log('📡 Using proxy configuration for profile');
          } else {
            console.warn('Proxy record missing host/port; skipping proxy assignment.');
          }
        } else {
          console.warn('Proxy not found; skipping proxy assignment.');
        }
      }

      const groupId = await this.getOrCreateDefaultGroup();
      if (groupId === undefined || groupId === null || groupId === '') {
        throw new Error('Resolved groupId is invalid (undefined/null/empty)');
      }

      const derivedDomain = target_url ? this.extractDomain(target_url) : 'google.com';
      const openUrls = [target_url || 'https://google.com'];

      const fingerprint = this.adsPowerService.generateFingerprintConfig(device_type);
      if (fingerprint.screen_resolution.includes(',')) {
        fingerprint.screen_resolution = fingerprint.screen_resolution.replace(',', 'x');
      }

      const adsPowerConfig = {
        name: `${name} (ID: ${localProfileId})`,
        domain_name: derivedDomain,
        open_urls: openUrls,
        group_id: groupId,
        fingerprint_config: fingerprint,
        remark: `Created by RPA Launcher - Profile ID: ${localProfileId}`
      };
      if (proxyConfig) adsPowerConfig.user_proxy_config = proxyConfig;

      console.log('🚀 Creating AdsPower profile with config:', JSON.stringify(adsPowerConfig, null, 2));

      const result = await this.adsPowerService.createProfile(adsPowerConfig);
      console.log('🔄 AdsPower profile creation result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error creating AdsPower profile:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Create a new profile with AdsPower integration
  async createProfile(profileData) {
    try {
      console.log('📝 Creating new profile:', profileData);
      const { name, device_type = 'PC', proxy_id, target_url } = profileData;

      // Insert profile & reliably fetch ID - SET STATUS TO 'launching' IMMEDIATELY
      await this.db.run(
        'INSERT INTO profiles (name, device_type, proxy_id, target_url, status) VALUES (?, ?, ?, ?, ?)',
        [name, device_type, proxy_id, target_url, 'launching']
      );

      // Reliable ID retrieval
      let row = await this.db.get('SELECT id FROM profiles ORDER BY id DESC LIMIT 1');
      const profileId = row?.id;
      if (!profileId) throw new Error('Failed to obtain inserted profile ID');

      console.log(`✅ Profile created in database with ID: ${profileId}`);

      const adsPowerProfile = await this.createAdsPowerProfile(profileData, profileId);

      if (adsPowerProfile.success && adsPowerProfile.profile_id) {
        await this.db.run(
          'UPDATE profiles SET ads_power_id = ? WHERE id = ?',
          [adsPowerProfile.profile_id, profileId]
        );
        console.log(`✅ Updated profile ${profileId} with AdsPower ID: ${adsPowerProfile.profile_id}`);
      } else {
        console.error('❌ Failed to create AdsPower profile:', adsPowerProfile);
      }

      await this.logAction('info', 'Profile created', profileId, {
        ads_power_id: adsPowerProfile.profile_id,
        success: adsPowerProfile.success,
        error: adsPowerProfile.error
      });

      return {
        id: profileId,
        ...profileData,
        status: 'launching',
        ads_power_id: adsPowerProfile.profile_id || null,
        creation_success: adsPowerProfile.success
      };
    } catch (error) {
      console.error('❌ Error creating profile:', error.message);
      throw error;
    }
  }

  // Extract domain from URL
  extractDomain(url) {
    try {
      if (!url) return 'google.com';
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname;
    } catch (error) {
      return 'google.com';
    }
  }

  // Check if AdsPower profile exists
  async verifyAdsPowerProfile(adsPowerProfileId) {
    try {
      const result = await this.adsPowerService.getProfile(adsPowerProfileId);
      return result.success;
    } catch (error) {
      console.error('Error verifying AdsPower profile:', error);
      return false;
    }
  }

  // Comprehensive profile launch diagnostics
  async diagnoseProfileLaunch(profileId) {
    const diagnosis = {
      profileId,
      issues: [],
      recommendations: [],
      canLaunch: true
    };

    try {
      console.log(`🔍 Running diagnostics for profile ${profileId}`);

      // Check if profile exists in database
      const profile = await this.db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
      if (!profile) {
        diagnosis.issues.push('Profile not found in database');
        diagnosis.canLaunch = false;
        return diagnosis;
      }

      console.log(`✅ Profile found in database: ${profile.name}`);

      // Check if profile has AdsPower ID
      if (!profile.ads_power_id) {
        diagnosis.issues.push('Profile missing AdsPower profile ID');
        diagnosis.recommendations.push('Recreate the profile to generate AdsPower profile ID');
        diagnosis.canLaunch = false;
      } else {
        console.log(`✅ Profile has AdsPower ID: ${profile.ads_power_id}`);
      }

      // Check AdsPower connection
      console.log('🔗 Checking AdsPower connection...');
      const connectionBool = await this.adsPowerService.checkConnection(); // boolean
      const connectionStatusObj = this.adsPowerService.getConnectionStatus();
      console.log('AdsPower connection status:', connectionStatusObj);

      if (!connectionBool) {
        diagnosis.issues.push('AdsPower is not connected');
        diagnosis.recommendations.push('Start AdsPower desktop application');
        diagnosis.recommendations.push('Enable Local API in AdsPower settings');
        diagnosis.canLaunch = false;
      } else {
        console.log('✅ AdsPower is connected');
      }

      // AUTO-CREATE missing AdsPower profile ID
      if (!profile.ads_power_id && connectionBool) {
        console.log('⚙️ Attempting to auto-create missing AdsPower profile in AdsPower...');
        const createRes = await this.createAdsPowerProfile({
          name: profile.name,
          target_url: profile.target_url,
          device_type: profile.device_type,
          proxy_id: profile.proxy_id
        }, profile.id);

        if (createRes.success && createRes.profile_id) {
          await this.db.run(
            'UPDATE profiles SET ads_power_id = ? WHERE id = ?',
            [createRes.profile_id, profile.id]
          );
          profile.ads_power_id = createRes.profile_id;
          console.log('✅ Auto-created AdsPower profile ID:', createRes.profile_id);
        } else {
          diagnosis.issues.push('Profile missing AdsPower profile ID');
          diagnosis.recommendations.push('Recreate the profile to generate AdsPower profile ID');
          diagnosis.canLaunch = false;
        }
      } else if (!profile.ads_power_id) {
        diagnosis.issues.push('Profile missing AdsPower profile ID');
        diagnosis.recommendations.push('Recreate the profile to generate AdsPower profile ID');
        diagnosis.canLaunch = false;
      }

      // Check if AdsPower profile exists (after possible auto-create)
      if (profile.ads_power_id && connectionBool) {
        console.log(`🔍 Verifying AdsPower profile ${profile.ads_power_id} exists...`);
        const profileExists = await this.verifyAdsPowerProfile(profile.ads_power_id);
        if (!profileExists) {
          diagnosis.issues.push('AdsPower profile does not exist');
          diagnosis.recommendations.push('Recreate the profile in AdsPower');
          diagnosis.canLaunch = false;
        } else {
          console.log('✅ AdsPower profile exists');
        }
      }

      // Check available slots (only block if profile not already running)
      const availableSlots = await this.getAvailableSlots();
      console.log(`📊 Available slots: ${availableSlots}`);
      if (availableSlots <= 0 && !['running','launching','active'].includes(profile.status)) {
        diagnosis.issues.push('No available profile slots');
        diagnosis.recommendations.push('Close some running profiles or increase max concurrent profiles');
        diagnosis.canLaunch = false;
      }

    } catch (error) {
      console.error('Diagnostic error:', error);
      diagnosis.issues.push(`Diagnostic error: ${error.message}`);
      diagnosis.canLaunch = false;
    }

    console.log('🔍 Diagnosis complete:', diagnosis);
    return diagnosis;
  }

  // Launch a profile using AdsPower with enhanced error handling and automation
  // CRITICAL FIX: Replace the launchProfile method in ProfileService.js

async launchProfile(profileId, options = {}) {
  try {
    console.log(`🚀 [LAUNCH] Starting launch for profile ${profileId}...`);
    
    // Step 1: Verify profile exists
    const profile = await this.db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
    if (!profile) {
      throw new Error(`Profile ${profileId} not found in database`);
    }
    console.log(`✅ [LAUNCH] Profile ${profileId} found: ${profile.name}`);

    // Step 2: Check if already running
    if (this.activeProfiles.has(profileId)) {
      console.log(`ℹ️ [LAUNCH] Profile ${profileId} is already running`);
      return {
        success: true,
        profileId: profileId,
        alreadyRunning: true,
        sessionData: this.activeProfiles.get(profileId)
      };
    }

    // Step 3: Verify AdsPower connection
    console.log(`🔌 [LAUNCH] Checking AdsPower connection...`);
    const isConnected = await this.adsPowerService.checkConnection();
    console.log(`🔌 [LAUNCH] AdsPower connected: ${isConnected}, Demo mode: ${this.adsPowerService.demoMode}`);

    if (!isConnected && !this.adsPowerService.demoMode) {
      throw new Error('AdsPower is not connected. Please start AdsPower and enable Local API.');
    }

    // Step 4: Ensure AdsPower profile exists
    if (!profile.ads_power_id) {
      console.log(`🔄 [LAUNCH] No AdsPower ID for profile ${profileId}, creating...`);
      
      const createResult = await this.createAdsPowerProfile({
        name: profile.name,
        target_url: profile.target_url,
        device_type: profile.device_type,
        proxy_id: profile.proxy_id
      }, profileId);

      if (!createResult.success || !createResult.profile_id) {
        throw new Error(`Failed to create AdsPower profile: ${createResult.error || 'Unknown error'}`);
      }

      // Update database with new AdsPower ID
      await this.db.run(
        'UPDATE profiles SET ads_power_id = ? WHERE id = ?',
        [createResult.profile_id, profileId]
      );
      profile.ads_power_id = createResult.profile_id;
      console.log(`✅ [LAUNCH] Created AdsPower profile: ${createResult.profile_id}`);
    }

    // Step 5: Update status to launching
    console.log(`📝 [LAUNCH] Updating status to 'launching'...`);
    await this.updateProfileStatus(profileId, 'launching');

    // Step 6: Prepare launch options
    const launchOptions = {
      headless: options.headless || false,
      disable_password_filling: options.disable_password_filling || false,
      clear_cache_after_closing: options.clear_cache_after_closing || false,
      enable_password_saving: options.enable_password_saving || false,
      launch_args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
        ...(options.launch_args || [])
      ]
    };

    console.log(`🚀 [LAUNCH] Starting AdsPower profile ${profile.ads_power_id}...`);
    console.log(`🚀 [LAUNCH] Launch options:`, JSON.stringify(launchOptions, null, 2));

    // Step 7: Launch in AdsPower
    const result = await this.adsPowerService.startProfile(
      profile.ads_power_id,
      launchOptions
    );

    console.log(`🔄 [LAUNCH] AdsPower start result:`, JSON.stringify(result, null, 2));

    if (!result.success) {
      throw new Error(result.error || 'AdsPower startProfile returned success: false');
    }

    // Step 8: Store session data
    const sessionData = {
      profileId: profileId,
      adsPowerProfileId: profile.ads_power_id,
      wsEndpoint: result.ws_endpoint,
      seleniumEndpoint: result.selenium_endpoint,
      debugPort: result.debug_port,
      launchedAt: new Date().toISOString(),
      targetUrl: profile.target_url || options.target_url || 'https://www.google.com',
      lastActivity: new Date().toISOString()
    };

    this.activeProfiles.set(profileId, sessionData);
    console.log(`✅ [LAUNCH] Session data stored for profile ${profileId}`);

    // Step 9: Update status to running
    await this.updateProfileStatus(profileId, 'running');
    console.log(`✅ [LAUNCH] Profile ${profileId} status updated to 'running'`);

    // Step 10: Log success
    await this.logAction('info', 'Profile launched successfully', profileId, {
      ws_endpoint: result.ws_endpoint,
      selenium_endpoint: result.selenium_endpoint,
      debug_port: result.debug_port,
      ads_power_id: profile.ads_power_id
    });

    console.log(`✅ [LAUNCH] Profile ${profileId} launched successfully!`);
    console.log(`📊 [LAUNCH] WS Endpoint: ${result.ws_endpoint}`);
    console.log(`📊 [LAUNCH] Selenium Endpoint: ${result.selenium_endpoint}`);

    return {
      success: true,
      profileId: profileId,
      sessionData: sessionData
    };

  } catch (error) {
    console.error(`❌ [LAUNCH] ERROR launching profile ${profileId}:`, error);
    console.error(`❌ [LAUNCH] Error stack:`, error.stack);
    
    // Update status to error
    try {
      await this.updateProfileStatus(profileId, 'error');
    } catch (statusError) {
      console.error(`❌ [LAUNCH] Failed to update error status:`, statusError);
    }
    
    // Log the error
    await this.logAction('error', `Failed to launch profile: ${error.message}`, profileId, {
      error: error.toString(),
      stack: error.stack
    });
    
    // Return error instead of throwing
    return {
      success: false,
      profileId: profileId,
      error: error.message
    };
  }
}

  // Stop a running profile
  async stopProfile(profileId) {
    try {
      console.log(`🛑 Stopping profile ${profileId}`);
      
      const profile = await this.db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
      if (!profile) {
        throw new Error(`Profile ${profileId} not found`);
      }

      if (!profile.ads_power_id) {
        throw new Error(`Profile ${profileId} has no AdsPower profile ID`);
      }

      console.log(`🔄 Stopping AdsPower profile ${profile.ads_power_id}`);

      // Stop profile in AdsPower
      const result = await this.adsPowerService.stopProfile(profile.ads_power_id);

      console.log('Stop result:', result);

      if (result.success) {
        // Remove from active profiles
        this.activeProfiles.delete(profileId);

        // Update status
        await this.updateProfileStatus(profileId, 'stopped');

        await this.logAction('info', 'Profile stopped successfully', profileId);

        console.log(`✅ Profile ${profileId} stopped successfully`);

        return { success: true, profileId: profileId };
      } else {
        throw new Error(result.error || 'Failed to stop profile');
      }

    } catch (error) {
      console.error(`❌ Error stopping profile ${profileId}:`, error);
      await this.logAction('error', `Failed to stop profile: ${error.message}`, profileId);
      throw error;
    }
  }

  // Get active profile session data
  getActiveProfileSession(profileId) {
    return this.activeProfiles.get(profileId);
  }

  // Get all active profile sessions
  getAllActiveProfileSessions() {
    return Array.from(this.activeProfiles.values());
  }

  // Get all profiles with proxy information
  async getAllProfiles() {
    try {
      const profiles = await this.db.all(`
        SELECT p.*, pr.ip_address, pr.port, pr.username as proxy_username
        FROM profiles p
        LEFT JOIN proxies pr ON p.proxy_id = pr.id
        ORDER BY p.created_at DESC
      `);
      return profiles;
    } catch (error) {
      console.error('Error getting profiles:', error);
      throw error;
    }
  }

  // Get active profiles count
  async getActiveProfilesCount() {
    try {
      const result = await this.db.get(
        "SELECT COUNT(*) as count FROM profiles WHERE status IN ('launching', 'running', 'active')"
      );
      return result.count;
    } catch (error) {
      console.error('Error getting active profiles count:', error);
      return 0;
    }
  }

  // Update profile status
  async updateProfileStatus(profileId, status) {
    try {
      await this.db.run(
        'UPDATE profiles SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, profileId]
      );

      if (status === 'running') {
        await this.db.run(
          'UPDATE profiles SET last_launched = CURRENT_TIMESTAMP WHERE id = ?',
          [profileId]
        );
      }

      await this.logAction('info', `Profile status updated to ${status}`, profileId);
      return true;
    } catch (error) {
      console.error('Error updating profile status:', error);
      throw error;
    }
  }

  // Mark profile task as completed
  async markTaskCompleted(profileId) {
    try {
      await this.db.run(
        'UPDATE profiles SET task_completed = TRUE, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', profileId]
      );

      await this.logAction('info', 'Profile task completed', profileId);
      
      // Add to deletion queue if auto-delete is enabled
      const autoDelete = await this.getSetting('auto_delete_completed');
      if (autoDelete === 'true') {
        await this.scheduleProfileDeletion(profileId);
      }

      return true;
    } catch (error) {
      console.error('Error marking task completed:', error);
      throw error;
    }
  }

  // Delete a profile
  async deleteProfile(profileId) {
    try {
      const profile = await this.db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
      
      if (profile && profile.ads_power_id) {
        // Try to delete from AdsPower first
        try {
          await this.adsPowerService.deleteProfile(profile.ads_power_id);
          console.log(`✅ Deleted AdsPower profile ${profile.ads_power_id}`);
        } catch (error) {
          console.warn(`Failed to delete AdsPower profile ${profile.ads_power_id}:`, error.message);
        }
      }

      // Free up the proxy if assigned
      await this.db.run(
        'UPDATE proxies SET assigned_profile_id = NULL WHERE assigned_profile_id = ?',
        [profileId]
      );

      // Delete the profile from database
      await this.db.run('DELETE FROM profiles WHERE id = ?', [profileId]);
      
      // Remove from active profiles map
      this.activeProfiles.delete(profileId);

      await this.logAction('info', 'Profile deleted', profileId);
      return true;
    } catch (error) {
      console.error('Error deleting profile:', error);
      throw error;
    }
  }

  // Schedule profile for launch
  async scheduleProfileLaunch(profileId, options = {}) {
    try {
      await this.db.run(
        'INSERT INTO task_queue (profile_id, task_type, status, options) VALUES (?, ?, ?, ?)',
        [profileId, 'launch', 'pending', JSON.stringify(options)]
      );
      return true;
    } catch (error) {
      console.error('Error scheduling profile launch:', error);
      throw error;
    }
  }

  // Schedule profile for closure
  async scheduleProfileClosure(profileId) {
    try {
      await this.db.run(
        'INSERT INTO task_queue (profile_id, task_type, status) VALUES (?, ?, ?)',
        [profileId, 'close', 'pending']
      );
      return true;
    } catch (error) {
      console.error('Error scheduling profile closure:', error);
      throw error;
    }
  }

  // Schedule profile for deletion
  async scheduleProfileDeletion(profileId) {
    try {
      await this.db.run(
        'INSERT INTO task_queue (profile_id, task_type, status) VALUES (?, ?, ?)',
        [profileId, 'delete', 'pending']
      );
      return true;
    } catch (error) {
      console.error('Error scheduling profile deletion:', error);
      throw error;
    }
  }

  // Batch launch multiple profiles
  async launchMultipleProfiles(profileIds, options = {}) {
    const results = [];
    
    for (const profileId of profileIds) {
      try {
        // Check available slots
        const availableSlots = await this.getAvailableSlots();
        if (availableSlots <= 0) {
          await this.scheduleProfileLaunch(profileId, options);
          results.push({
            profileId,
            success: true,
            action: 'scheduled',
            message: 'Profile scheduled for launch (no available slots)'
          });
        } else {
          const result = await this.launchProfile(profileId, options);
          results.push({
            profileId,
            success: result.success,
            action: 'launched',
            sessionData: result.sessionData
          });
        }
      } catch (error) {
        results.push({
          profileId,
          success: false,
          action: 'failed',
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Get profile launch status
  async getProfileLaunchStatus(profileId) {
    try {
      const profile = await this.db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
      if (!profile) {
        return { status: 'not_found' };
      }

      const sessionData = this.activeProfiles.get(profileId);
      
      return {
        status: profile.status,
        isActive: !!sessionData,
        sessionData: sessionData,
        lastLaunched: profile.last_launched,
        adsPowerProfileId: profile.ads_power_id
      };
    } catch (error) {
      console.error('Error getting profile launch status:', error);
      throw error;
    }
  }

  // Check AdsPower connection status
  async checkAdsPowerConnection() {
    return await this.adsPowerService.checkConnection();
  }

  // Get AdsPower service status
  getAdsPowerStatus() {
    return {
      isConnected: this.adsPowerService.isConnected,
      demoMode: this.adsPowerService.demoMode,
      lastConnectionCheck: this.adsPowerService.lastConnectionCheck,
      baseURL: this.adsPowerService.baseURL
    };
  }

  // Enhanced diagnostic method for AdsPower connection
  async diagnoseAdsPowerConnection() {
    console.log('🔍 Diagnosing AdsPower connection...');
    
    const status = this.getAdsPowerStatus();
    const connectionTest = await this.checkAdsPowerConnection();
    
    console.log('AdsPower Status:', status);
    console.log('Connection Test:', connectionTest);
    
    return {
      ...status,
      connectionTest,
      recommendations: this.getConnectionRecommendations(status, connectionTest)
    };
  }

  // Get recommendations based on connection status
  getConnectionRecommendations(status, connectionTest) {
    const recommendations = [];
    
    if (!status.isConnected) {
      recommendations.push('1. Start AdsPower desktop application');
      recommendations.push('2. Enable Local API in AdsPower settings');
      recommendations.push('3. Verify AdsPower is running on port 50325');
      recommendations.push('4. Check if antivirus/firewall is blocking the connection');
    }
    
    if (status.demoMode) {
      recommendations.push('System is running in demo mode - profiles will be simulated');
      recommendations.push('Real profile operations require AdsPower to be running');
    }
    
    return recommendations;
  }

  // Get pending tasks from queue
  async getPendingTasks() {
    try {
      const tasks = await this.db.all(
        'SELECT * FROM task_queue WHERE status = ? ORDER BY priority DESC, created_at ASC',
        ['pending']
      );
      return tasks;
    } catch (error) {
      console.error('Error getting pending tasks:', error);
      return [];
    }
  }

  // Process task queue
  async processTaskQueue() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    try {
      const tasks = await this.getPendingTasks();
      
      for (const task of tasks) {
        await this.processTask(task);
      }
    } catch (error) {
      console.error('Error processing task queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // Process individual task
  async processTask(task) {
    try {
      await this.db.run(
        'UPDATE task_queue SET status = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['processing', task.id]
      );

      switch (task.task_type) {
        case 'delete':
          await this.deleteProfile(task.profile_id);
          break;
        case 'launch':
          const launchOptions = task.options ? JSON.parse(task.options) : {};
          await this.launchProfile(task.profile_id, launchOptions);
          break;
        case 'close':
          await this.stopProfile(task.profile_id);
          break;
        default:
          throw new Error(`Unknown task type: ${task.task_type}`);
      }

      await this.db.run(
        'UPDATE task_queue SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', task.id]
      );

    } catch (error) {
      await this.db.run(
        'UPDATE task_queue SET status = ?, error_message = ? WHERE id = ?',
        ['failed', error.message, task.id]
      );
      console.error(`Error processing task ${task.id}:`, error);
    }
  }

  // Get setting value
  async getSetting(key) {
    try {
      const setting = await this.db.get('SELECT value FROM settings WHERE key = ?', [key]);
      return setting ? setting.value : null;
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error);
      return null;
    }
  }

  // Log action
  async logAction(level, message, profileId = null, extraData = null) {
    try {
      await this.db.run(
        'INSERT INTO logs (level, message, profile_id, extra_data) VALUES (?, ?, ?, ?)',
        [level, message, profileId, extraData ? JSON.stringify(extraData) : null]
      );
    } catch (error) {
      console.error('Error logging action:', error);
    }
  }

  // Start profile lifecycle management
  startLifecycleManagement() {
    // Process task queue every 5 seconds
    setInterval(() => {
      this.processTaskQueue();
    }, 5000);

    console.log('Profile lifecycle management started');
  }

  // Get available profile slot count
  async getAvailableSlots() {
    try {
      const maxProfiles = parseInt(await this.getSetting('max_concurrent_profiles') || '2');
      const activeCount = await this.getActiveProfilesCount();
      return Math.max(0, maxProfiles - activeCount);
    } catch (error) {
      console.error('Error getting available slots:', error);
      return 0;
    }
  }

  // Sync profile status with AdsPower
  async syncProfileStatus(profileId) {
    try {
      const profile = await this.db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
      if (!profile || !profile.ads_power_id) {
        return false;
      }

      const adsPowerStatus = await this.adsPowerService.getProfileStatus(profile.ads_power_id);
      
      if (adsPowerStatus.success) {
        const newStatus = adsPowerStatus.status === 'Active' ? 'running' : 'stopped';
        
        if (profile.status !== newStatus) {
          await this.updateProfileStatus(profileId, newStatus);
          
          if (newStatus === 'stopped') {
            this.activeProfiles.delete(profileId);
          }
        }
      }

      return true;
    } catch (error) {
      console.error(`Error syncing profile ${profileId} status:`, error);
      return false;
    }
  }

  // Sync all profiles status
  async syncAllProfilesStatus() {
    try {
      const activeProfiles = await this.db.all(
        "SELECT id FROM profiles WHERE status IN ('launching', 'running')"
      );

      for (const profile of activeProfiles) {
        await this.syncProfileStatus(profile.id);
      }

      console.log(`Synced status for ${activeProfiles.length} profiles`);
    } catch (error) {
      console.error('Error syncing all profiles status:', error);
    }
  }

  // Get profile performance metrics
  async getProfileMetrics(profileId) {
    try {
      const logs = await this.db.all(
        'SELECT * FROM logs WHERE profile_id = ? ORDER BY created_at DESC LIMIT 100',
        [profileId]
      );

      const launches = logs.filter(log => log.message.includes('launched')).length;
      const errors = logs.filter(log => log.level === 'error').length;
      const lastActivity = logs.length > 0 ? logs[0].created_at : null;

      return {
        totalLaunches: launches,
        totalErrors: errors,
        errorRate: launches > 0 ? (errors / launches * 100).toFixed(2) : 0,
        lastActivity: lastActivity,
        recentLogs: logs.slice(0, 10)
      };
    } catch (error) {
      console.error(`Error getting metrics for profile ${profileId}:`, error);
      return null;
    }
  }

  // Cleanup old logs
  async cleanupOldLogs(daysToKeep = 30) {
    try {
      const result = await this.db.run(
        'DELETE FROM logs WHERE created_at < datetime("now", "-" || ? || " days")',
        [daysToKeep]
      );

      console.log(`Cleaned up ${result.changes} old log entries`);
    } catch (error) {
      console.error('Error cleaning up old logs:', error);
    }
  }

  // Emergency stop all profiles
  async emergencyStopAll() {
    try {
      const activeProfileIds = Array.from(this.activeProfiles.keys());
      const results = [];
      
      console.log('🚨 Emergency stop initiated for all profiles');
      try {
        for (const profileId of activeProfileIds) {
          try {
            await this.stopProfile(profileId);
            results.push({ profileId, success: true });
          } catch (error) {
            results.push({ profileId, success: false, error: error.message });
            console.error(`❌ Error stopping profile ${profileId}:`, error);
          }
        }

        console.log('✅ Emergency stop completed for all profiles');
      } catch (error) {
        console.error('Error during emergency stop:', error);
      } finally {
        return results;
      }
    } catch (error) {
      console.error('Error initiating emergency stop:', error);
      throw error;
    }
  }
}

module.exports = ProfileService;