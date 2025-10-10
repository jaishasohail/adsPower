class LifecycleManager {
  constructor(profileService, adsPowerService, mouseService, db) {
    this.profileService = profileService;
    this.adsPowerService = adsPowerService;
    this.mouseService = mouseService;
    this.db = db;
    this.isRunning = false;
    this.activeProfiles = new Map();
    this.profileQueue = [];
    this.completedProfiles = new Set();
    
    this.settings = {
      maxConcurrentProfiles: 2,
      targetUrl: 'https://google.com',
      deviceTypes: ['PC', 'Mac', 'Mobile'],
      rpaTool: 'adspower',
      profileRotationDelay: 2000,
      taskDurationMin: 60000, // CHANGED: From 30000ms (30s) to 60000ms (60s)
      taskDurationMax: 120000, // CHANGED: From 90000ms (90s) to 120000ms (120s)
      autoDelete: true,
      instantRecycle: true,
      humanLikeActivity: true,
      proxyRotation: true
    };

    this.stats = {
      totalLaunched: 0,
      totalCompleted: 0,
      totalErrors: 0,
      activeCount: 0,
      cycleCount: 0,
      startTime: null,
      manualClosures: 0
    };

    this.intervals = {
      launcher: null,
      monitor: null,
      cleaner: null,
      recycler: null
    };
    this.launchLock = false;
    this.slotCheckInterval = null;
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    console.log('📊 Settings updated:', this.settings);
    return this.settings;
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️ Lifecycle manager already running');
      return { success: false, message: 'Already running' };
    }

    console.log('🔗 Verifying AdsPower connection...');
    const isConnected = await this.adsPowerService.checkConnection();
    
    if (!isConnected && !this.adsPowerService.demoMode) {
      console.error('❌ AdsPower is not connected and not in demo mode');
      return { 
        success: false, 
        message: 'AdsPower is not connected. Please start AdsPower and enable Local API.',
        recommendations: [
          '1. Launch AdsPower desktop application',
          '2. Go to Settings > Local API',
          '3. Enable Local API on port 50325',
          '4. Try again'
        ]
      };
    }

    this.isRunning = true;
    this.stats.startTime = new Date();
    console.log('🚀 Starting Infinite Loop Lifecycle Manager...');
    console.log(`📊 Max concurrent profiles: ${this.settings.maxConcurrentProfiles}`);
    console.log(`🎯 Target URL: ${this.settings.targetUrl}`);
    console.log(`🔌 AdsPower Status: ${isConnected ? 'Connected' : 'Demo Mode'}`);
    
    this.startLauncher();
    this.startMonitor();
    this.startRecycler();
    this.startCleaner();
    
    await this.profileService.logAction('info', 'Lifecycle manager started with infinite loop mode');
    
    return { success: true, message: 'Lifecycle manager started' };
  }

  async stop() {
  if (!this.isRunning) {
    return { success: false, message: 'Not running' };
  }

  this.isRunning = false;
  console.log('🛑 Stopping Lifecycle Manager...');

  // Stop all intervals first
  Object.values(this.intervals).forEach(interval => {
    if (interval) clearInterval(interval);
  });

  console.log(`🛑 Stopping ${this.activeProfiles.size} active profiles...`);
  const stopResults = [];
  
  for (const [profileId, profile] of this.activeProfiles) {
    try {
      console.log(`🛑 Stopping profile ${profileId} (AdsPower: ${profile.adsPowerProfileId})...`);
      
      // Stop mouse simulation
      if (this.mouseService && profile.adsPowerProfileId) {
        this.mouseService.stopSimulation(profile.adsPowerProfileId);
      }
      
      // Stop and delete the profile with proper sequencing
      await this.stopAndDeleteProfile(profileId);
      stopResults.push({ profileId, success: true });
      
      // Add small delay between profiles to avoid rate limiting
      await this.delay(500);
      
    } catch (error) {
      console.error(`❌ Error stopping profile ${profileId}:`, error);
      stopResults.push({ profileId, success: false, error: error.message });
    }
  }

  this.activeProfiles.clear();
  this.completedProfiles.clear();

  await this.profileService.logAction('info', 'Lifecycle manager stopped', null, {
    profilesStopped: stopResults.length,
    stats: this.stats
  });
  
  console.log('✅ Lifecycle manager stopped successfully');
  
  return { 
    success: true, 
    message: 'Lifecycle manager stopped', 
    stats: this.stats,
    profilesStopped: stopResults
  };
}

  startLauncher() {
    this.intervals.launcher = setInterval(async () => {
      if (!this.isRunning || this.launchLock) return;

      try {
        this.launchLock = true;

        const dbActiveCount = await this.db.get(
          "SELECT COUNT(*) as count FROM profiles WHERE status IN ('launching', 'running', 'active')"
        );
        const activeCount = dbActiveCount?.count || 0;
        
        const mapSize = this.activeProfiles.size;
        if (mapSize !== activeCount) {
          console.warn(`⚠️ Mismatch: Map has ${mapSize}, DB has ${activeCount} active profiles`);
        }

        const slotsAvailable = this.settings.maxConcurrentProfiles - activeCount;
        
        if (slotsAvailable <= 0) {
          console.log(`⏸️ No slots available (Active: ${activeCount}/${this.settings.maxConcurrentProfiles})`);
          return;
        }

        console.log(`📊 Launching 1 profile (Active: ${activeCount}/${this.settings.maxConcurrentProfiles})`);

        await this.launchNewProfile();
        
        await this.delay(2000);

      } catch (error) {
        console.error('❌ Launcher error:', error);
        this.stats.totalErrors++;
      } finally {
        this.launchLock = false;
      }
    }, 5000);
  }

  startMonitor() {
    this.intervals.monitor = setInterval(async () => {
      if (!this.isRunning) return;

      for (const [profileId, profile] of this.activeProfiles) {
        try {
          const now = Date.now();
          const elapsed = now - profile.launchedAt;
          
          if (elapsed >= profile.taskDuration) {
            console.log(`✅ Profile ${profileId} task completed (ran for ${Math.round(elapsed/1000)}s)`);
            await this.markProfileCompleted(profileId);
            continue;
          }
          
          if (profile.adsPowerProfileId && !this.adsPowerService.demoMode) {
            try {
              const status = await this.adsPowerService.checkProfileStatus(profile.adsPowerProfileId);
              
              if (!status.success || !status.is_active) {
                const wasManualClosure = elapsed < profile.taskDuration;
                
                if (wasManualClosure) {
                  console.log(`⚠️ Profile ${profileId} browser was manually closed! (${Math.round(elapsed/1000)}s of ${Math.round(profile.taskDuration/1000)}s)`);
                  this.stats.manualClosures++;
                  
                  if (this.mouseService) {
                    this.mouseService.stopSimulation(profile.adsPowerProfileId);
                  }
                  
                  await this.markProfileCompleted(profileId);
                } else {
                  console.log(`✅ Profile ${profileId} completed normally`);
                  await this.markProfileCompleted(profileId);
                }
              }
            } catch (error) {
              console.warn(`⚠️ Could not check status for profile ${profileId}:`, error.message);
            }
          }

        } catch (error) {
          console.error(`Monitor error for profile ${profileId}:`, error);
        }
      }
    }, 5000);
  }

  startRecycler() {
    this.intervals.recycler = setInterval(async () => {
      if (!this.isRunning || !this.settings.instantRecycle) return;

      for (const profileId of this.completedProfiles) {
        try {
          await this.stopAndDeleteProfile(profileId);
          this.completedProfiles.delete(profileId);
          this.stats.totalCompleted++;
          console.log(`♻️ Recycled profile ${profileId} - slot now available`);
        } catch (error) {
          console.error(`Recycler error for profile ${profileId}:`, error);
          this.completedProfiles.delete(profileId);
        }
      }
    }, 2000);
  }

  startCleaner() {
    this.intervals.cleaner = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.db.run(
          'DELETE FROM logs WHERE created_at < datetime("now", "-1 day")'
        );

        await this.db.run(
          'DELETE FROM task_queue WHERE status = "completed" AND completed_at < datetime("now", "-1 hour")'
        );

        this.stats.activeCount = this.activeProfiles.size;
        this.stats.cycleCount++;

      } catch (error) {
        console.error('Cleaner error:', error);
      }
    }, 120000);
  }

  async launchNewProfile() {
    let profileId = null;

    try {
      const isConnected = await this.adsPowerService.checkConnection();
      if (!isConnected && !this.adsPowerService.demoMode) {
        console.error('❌ AdsPower not connected');
        this.stats.totalErrors++;
        return null;
      }

      const proxy = await this.getNextAvailableProxy();
      
      const deviceIndex = this.stats.totalLaunched % this.settings.deviceTypes.length;
      const deviceType = this.settings.deviceTypes[deviceIndex];
      
      const profileName = `Auto-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      
      console.log(`🎯 Creating profile: ${profileName} (${deviceType})`);

      const profileData = {
        name: profileName,
        device_type: deviceType,
        proxy_id: proxy?.id || null,
        target_url: this.settings.targetUrl
      };

      const profile = await this.profileService.createProfile(profileData);
      
      if (!profile || !profile.id) {
        throw new Error('Failed to create profile');
      }

      profileId = profile.id;

      await this.delay(1500);

      const dbProfile = await this.db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
      if (!dbProfile.ads_power_id) {
        throw new Error('Profile missing AdsPower ID after creation');
      }

      console.log(`✅ Profile ${profileId} created with AdsPower ID: ${dbProfile.ads_power_id}`);

      const taskDuration = Math.floor(
        Math.random() * (this.settings.taskDurationMax - this.settings.taskDurationMin) + 
        this.settings.taskDurationMin
      );

      console.log(`🚀 Launching profile ${profileId}...`);

      const launchResult = await this.profileService.launchProfile(profileId, {
        headless: false
      });

      if (!launchResult.success) {
        throw new Error(`Launch failed: ${launchResult.error}`);
      }

      console.log(`✅ Profile ${profileId} launched successfully`);

      // DEBUG: Log the entire launch result structure
      console.log('🔍 DEBUG - Launch result structure:', JSON.stringify(launchResult, null, 2));

      // CRITICAL FIX: Extract wsEndpoint from nested structure
      let wsEndpoint = null;
      
      // Try sessionData.wsEndpoint first (it's an object with puppeteer/selenium)
      if (launchResult.sessionData?.wsEndpoint) {
        const wsObj = launchResult.sessionData.wsEndpoint;
        if (typeof wsObj === 'string') {
          wsEndpoint = wsObj;
        } else if (typeof wsObj === 'object') {
          // Use puppeteer endpoint for Puppeteer connection
          wsEndpoint = wsObj.puppeteer || wsObj.selenium || null;
        }
      }
      
      // Fallback to other possible locations
      if (!wsEndpoint) {
        wsEndpoint = launchResult.sessionData?.ws_endpoint || 
                    launchResult.sessionData?.ws || 
                    launchResult.ws_endpoint ||
                    launchResult.ws;
                    
        // If it's still an object, extract puppeteer property
        if (wsEndpoint && typeof wsEndpoint === 'object') {
          wsEndpoint = wsEndpoint.puppeteer || wsEndpoint.selenium || null;
        }
      }

      // FALLBACK: If still no endpoint, get it directly from AdsPower
      if (!wsEndpoint) {
        console.warn(`⚠️ No WebSocket endpoint in launch result, fetching directly from AdsPower...`);
        
        try {
          const statusResult = await this.adsPowerService.checkProfileStatus(dbProfile.ads_power_id);
          console.log('🔍 DEBUG - AdsPower status result:', JSON.stringify(statusResult, null, 2));
          
          if (statusResult.success && statusResult.data) {
            wsEndpoint = statusResult.data.ws || 
                        statusResult.data.webdriver ||
                        statusResult.data.ws_endpoint;
            
            // Handle if ws is an object with puppeteer property
            if (wsEndpoint && typeof wsEndpoint === 'object') {
              wsEndpoint = wsEndpoint.puppeteer || wsEndpoint.selenium || null;
            }
          }
        } catch (fallbackError) {
          console.error('❌ Fallback fetch failed:', fallbackError.message);
        }
      }

      if (!wsEndpoint) {
        console.error(`❌ Could not obtain WebSocket endpoint for profile ${profileId}`);
        console.error('🔍 This means mouse movements will not work for this profile');
      } else {
        console.log(`🔗 WebSocket endpoint for profile ${profileId}: ${wsEndpoint}`);
      }

      // Store active profile info with WebSocket endpoint
      this.activeProfiles.set(profileId, {
        profileId: profileId,
        name: profileName,
        deviceType: deviceType,
        proxyId: proxy?.id,
        adsPowerProfileId: dbProfile.ads_power_id,
        wsEndpoint: wsEndpoint,
        launchedAt: Date.now(),
        taskDuration: taskDuration,
        targetUrl: this.settings.targetUrl
      });

      // Start mouse activity with the wsEndpoint
      if (this.settings.humanLikeActivity && this.mouseService && wsEndpoint) {
        console.log(`⏳ Waiting 15 seconds for browser to FULLY load before starting mouse activity...`);
        setTimeout(async () => {
          try {
            console.log(`🖱️ Now starting mouse activity for profile ${profileId} (AdsPower ID: ${dbProfile.ads_power_id})`);
            console.log(`🔗 Using WebSocket endpoint: ${wsEndpoint}`);
            
            await this.startEnhancedHumanActivity(
              dbProfile.ads_power_id,
              deviceType, 
              taskDuration,
              wsEndpoint
            );
          } catch (error) {
            console.error(`❌ Failed to start mouse activity for profile ${profileId}:`, error);
          }
        }, 15000); // CHANGED: From 10000ms to 15000ms for better reliability
      } else if (this.settings.humanLikeActivity && !wsEndpoint) {
        console.warn(`⚠️ Skipping mouse activity for profile ${profileId} - no WebSocket endpoint available`);
      }

      this.stats.totalLaunched++;
      console.log(`✅ Profile ${profileId} operational (Duration: ${Math.round(taskDuration/1000)}s)`);
      
      return profile;

    } catch (error) {
      console.error('❌ Failed to launch profile:', error.message);
      this.stats.totalErrors++;
      
      if (profileId) {
        try {
          await this.db.run(
            'UPDATE profiles SET status = ? WHERE id = ?',
            ['error', profileId]
          );
          this.activeProfiles.delete(profileId);
          
          if (this.settings.autoDelete) {
            await this.profileService.deleteProfile(profileId);
          }
        } catch (cleanupError) {
          console.error('Error cleaning up failed profile:', cleanupError);
        }
      }
      
      return null;
    }
  }

  async startEnhancedHumanActivity(adsPowerProfileId, deviceType, duration, wsEndpoint) {
    try {
      // Validate wsEndpoint
      if (!wsEndpoint) {
        console.error(`❌ No wsEndpoint provided for AdsPower profile ${adsPowerProfileId}`);
        return;
      }

      const intensities = ['low', 'medium', 'high'];
      const randomIntensity = intensities[Math.floor(Math.random() * intensities.length)];
      
      console.log(`🖱️ Starting ${randomIntensity} intensity human behavior for AdsPower profile ${adsPowerProfileId}`);
      console.log(`🔗 WebSocket: ${wsEndpoint}`);
      
      if (this.mouseService) {
        const result = await this.mouseService.startComprehensiveHumanBehavior(adsPowerProfileId, {
          duration: duration - 5000,
          deviceType: deviceType,
          intensity: randomIntensity,
          wsEndpoint: wsEndpoint
        });
        
        if (result.success) {
          console.log(`✅ Human behavior simulation started for AdsPower profile ${adsPowerProfileId}`);
          console.log(`   - Behavior Profile: ${result.behaviorProfile}`);
          console.log(`   - Duration: ${Math.round(result.duration/1000)}s`);
        } else {
          console.warn(`⚠️ Failed to start human behavior: ${result.error}`);
        }
      }
    } catch (error) {
      console.error(`Human activity error for AdsPower profile ${adsPowerProfileId}:`, error);
    }
  }

  async markProfileCompleted(profileId) {
    try {
      const profile = this.activeProfiles.get(profileId);
      if (!profile) return;

      if (this.mouseService && profile.adsPowerProfileId) {
        this.mouseService.stopSimulation(profile.adsPowerProfileId);
        console.log(`🛑 Stopped mouse simulation for AdsPower profile ${profile.adsPowerProfileId}`);
      }

      this.completedProfiles.add(profileId);
      this.activeProfiles.delete(profileId);

      await this.profileService.updateProfileStatus(profileId, 'completed');

      console.log(`📝 Profile ${profileId} marked for recycling`);

    } catch (error) {
      console.error(`Error marking profile ${profileId} completed:`, error);
    }
  }

  async stopAndDeleteProfile(profileId) {
  try {
    const profile = this.activeProfiles.get(profileId) || 
                   Array.from(this.activeProfiles.values()).find(p => p.profileId === profileId);

    console.log(`🔄 [LIFECYCLE] Stopping and deleting profile ${profileId}...`);

    // Stop mouse simulation
    if (this.mouseService && profile?.adsPowerProfileId) {
      this.mouseService.stopSimulation(profile.adsPowerProfileId);
      console.log(`🖱️ [LIFECYCLE] Stopped mouse simulation for ${profile.adsPowerProfileId}`);
    }

    // Remove from active profiles immediately to free up slot
    this.activeProfiles.delete(profileId);
    this.completedProfiles.delete(profileId);

    // Free up proxy immediately
    if (profile?.proxyId) {
      await this.db.run(
        'UPDATE proxies SET assigned_profile_id = NULL WHERE id = ?',
        [profile.proxyId]
      );
    }

    // Now handle AdsPower cleanup (use force delete)
    if (profile?.adsPowerProfileId) {
      try {
        console.log(`🔨 [LIFECYCLE] Force deleting AdsPower profile ${profile.adsPowerProfileId}...`);
        const result = await this.adsPowerService.forceDeleteProfile(profile.adsPowerProfileId, 3);
        
        if (result.success) {
          console.log(`✅ [LIFECYCLE] Successfully deleted AdsPower profile ${profile.adsPowerProfileId}`);
        } else {
          console.warn(`⚠️ [LIFECYCLE] Could not delete AdsPower profile ${profile.adsPowerProfileId}:`, result.error);
        }
      } catch (error) {
        console.warn(`⚠️ [LIFECYCLE] Error during force delete:`, error.message);
      }
    }

    // Delete from database
    if (this.settings.autoDelete) {
      console.log(`🗑️ [LIFECYCLE] Deleting profile ${profileId} from database...`);
      await this.profileService.deleteProfile(profileId);
      console.log(`✅ [LIFECYCLE] Profile ${profileId} deleted from database`);
    } else {
      await this.profileService.updateProfileStatus(profileId, 'stopped');
    }

  } catch (error) {
    console.error(`❌ [LIFECYCLE] Error stopping/deleting profile ${profileId}:`, error);
    // Don't throw - we want to continue with other profiles
  }
}

  async getNextAvailableProxy() {
    if (!this.settings.proxyRotation) return null;

    try {
      const proxies = await this.db.all(
        `SELECT * FROM proxies 
         WHERE is_active = 1 AND assigned_profile_id IS NULL 
         ORDER BY last_used ASC, created_at ASC 
         LIMIT 1`
      );

      if (proxies.length > 0) {
        await this.db.run(
          'UPDATE proxies SET last_used = CURRENT_TIMESTAMP WHERE id = ?',
          [proxies[0].id]
        );
        return proxies[0];
      }

      return null;
    } catch (error) {
      console.error('Error getting proxy:', error);
      return null;
    }
  }

  getStats() {
    const runtime = this.stats.startTime ? 
      Math.round((Date.now() - this.stats.startTime.getTime()) / 1000) : 0;

    return {
      isRunning: this.isRunning,
      settings: this.settings,
      stats: {
        ...this.stats,
        runtime: runtime,
        runtimeFormatted: this.formatRuntime(runtime),
        profilesPerMinute: runtime > 0 ? (this.stats.totalLaunched / (runtime / 60)).toFixed(2) : 0,
        successRate: this.stats.totalLaunched > 0 ? 
          ((this.stats.totalCompleted / this.stats.totalLaunched) * 100).toFixed(2) : 0
      },
      activeProfiles: Array.from(this.activeProfiles.values()).map(p => ({
        ...p,
        runningTime: Math.round((Date.now() - p.launchedAt) / 1000),
        remainingTime: Math.round((p.taskDuration - (Date.now() - p.launchedAt)) / 1000)
      }))
    };
  }

  formatRuntime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async emergencyStop() {
    console.log('🚨 EMERGENCY STOP INITIATED');
    return await this.stop();
  }
}

module.exports = LifecycleManager;