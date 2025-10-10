class LifecycleManager {
  constructor(profileService, adsPowerService, mouseService, db, stickyIpService) {
    this.profileService = profileService;
    this.adsPowerService = adsPowerService;
    this.mouseService = mouseService;
    this.stickyIpService = stickyIpService;
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
      proxyRotation: true,
      stickyIpEnabled: true
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
    
    // if (this.settings.stickyIpEnabled && this.stickyIpService) {
    //   this.stickyIpService.startMonitoring();
    //   // React to IP changes: close all active browsers immediately
    //   this.stickyIpService.onChange(async ({ oldIp, newIp }) => {
    //     try {
    //       console.log(`🧲 StickyIP: Change detected ${oldIp} -> ${newIp}. Closing active browsers...`);
    //       for (const [pid, p] of this.activeProfiles) {
    //         try {
    //           await this.stopAndDeleteProfile(pid);
    //         } catch (e) {
    //           console.warn(`⚠️ StickyIP: Failed closing profile ${pid}:`, e.message);
    //         }
    //       }
    //       console.log('🧲 StickyIP: Browser closed due to IP change.');
    //     } catch (e) {}
    //   });
    // }

    this.startLauncher();
    this.startMonitor();
    this.startRecycler();
    this.startCleaner();
    
    await this.profileService.logAction('info', 'Lifecycle manager started with infinite loop mode');
    
    return { success: true, message: 'Lifecycle manager started' };
  }

  async stop() {
  if (!this.isRunning) {
    console.log('⚠️ Lifecycle manager is not running');
    return { success: false, message: 'Not running' };
  }

  console.log('🛑 ====================================');
  console.log('🛑 STOPPING LIFECYCLE MANAGER');
  console.log('🛑 ====================================');
  
  this.isRunning = false;

  // Step 1: Stop all intervals FIRST to prevent new profiles from launching
  console.log('🛑 Step 1: Stopping all intervals...');
  Object.keys(this.intervals).forEach(key => {
    if (this.intervals[key]) {
      clearInterval(this.intervals[key]);
      console.log(`   ✓ Stopped ${key} interval`);
      this.intervals[key] = null;
    }
  });

  // Step 2: Get all active profile IDs
  const activeProfileIds = Array.from(this.activeProfiles.keys());
  console.log(`🛑 Step 2: Found ${activeProfileIds.length} active profiles to stop`);

  if (activeProfileIds.length === 0) {
    console.log('✅ No active profiles to stop');
    await this.profileService.logAction('info', 'Lifecycle manager stopped (no active profiles)');
    return { 
      success: true, 
      message: 'Lifecycle manager stopped', 
      stats: this.stats,
      profilesStopped: []
    };
  }

  // Step 3: Stop all profiles with detailed tracking
  console.log('🛑 Step 3: Stopping and deleting all profiles...');
  const stopResults = [];
  
  for (let i = 0; i < activeProfileIds.length; i++) {
    const profileId = activeProfileIds[i];
    const profile = this.activeProfiles.get(profileId);
    
    console.log(`🛑 [${i + 1}/${activeProfileIds.length}] Processing profile ${profileId}...`);
    
    try {
      // Stop mouse simulation first
      if (this.mouseService && profile?.adsPowerProfileId) {
        console.log(`   🖱️ Stopping mouse for AdsPower ID: ${profile.adsPowerProfileId}`);
        this.mouseService.stopSimulation(profile.adsPowerProfileId);
      }
      
      // Stop and delete the profile
      console.log(`   🛑 Stopping profile ${profileId}...`);
      await this.stopAndDeleteProfile(profileId);
      
      stopResults.push({ 
        profileId, 
        success: true,
        name: profile?.name || 'Unknown'
      });
      
      console.log(`   ✅ Profile ${profileId} stopped successfully`);
      
      // Small delay between profiles to avoid overwhelming AdsPower API
      if (i < activeProfileIds.length - 1) {
        console.log(`   ⏳ Waiting 1 second before next profile...`);
        await this.delay(1000);
      }
      
    } catch (error) {
      console.error(`   ❌ Error stopping profile ${profileId}:`, error.message);
      stopResults.push({ 
        profileId, 
        success: false, 
        error: error.message,
        name: profile?.name || 'Unknown'
      });
      
      // Continue with other profiles even if one fails
    }
  }

  // Step 4: Clear all collections
  console.log('🛑 Step 4: Clearing collections...');
  this.activeProfiles.clear();
  this.completedProfiles.clear();
  this.profileQueue = [];
  console.log('   ✓ Collections cleared');

  // Step 5: Log the action
  await this.profileService.logAction('info', 'Lifecycle manager stopped', null, {
    profilesStopped: stopResults.length,
    successful: stopResults.filter(r => r.success).length,
    failed: stopResults.filter(r => !r.success).length,
    stats: this.stats
  });
  
  // Step 6: Summary
  const successful = stopResults.filter(r => r.success).length;
  const failed = stopResults.filter(r => !r.success).length;
  
  console.log('🛑 ====================================');
  console.log('✅ LIFECYCLE MANAGER STOPPED');
  console.log(`   Total profiles: ${stopResults.length}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}`);
  console.log('🛑 ====================================');
  
  return { 
    success: true, 
    message: 'Lifecycle manager stopped', 
    stats: this.stats,
    profilesStopped: stopResults,
    summary: {
      total: stopResults.length,
      successful,
      failed
    }
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
      // Sticky IP pre-launch gating
      // if (this.settings.stickyIpEnabled && this.stickyIpService) {
      //   const gate = await this.stickyIpService.ensureStableBeforeLaunch();
      //   if (!gate.proceed) {
      //     console.log('🧲 StickyIP: IP changed – browser launch aborted.');
      //     return null;
      //   }
      //   if (this.stickyIpService.hasIpBeenUsed(gate.ip)) {
      //     console.log(`🧲 StickyIP: IP ${gate.ip} already used in previous session, skipping.`);
      //     return null;
      //   }
      // }

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

      // Mark IP as used for sticky IP logic
      if (this.settings.stickyIpEnabled && this.stickyIpService) {
        try {
          const ip = await this.stickyIpService.getCurrentIP();
          if (ip) await this.stickyIpService.markIpUsed(ip);
        } catch (e) {}
      }
      
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
  const profile = this.activeProfiles.get(profileId) || 
                 Array.from(this.activeProfiles.values()).find(p => p.profileId === profileId);

  console.log(`🔄 [LIFECYCLE] ========================================`);
  console.log(`🔄 [LIFECYCLE] Stopping and deleting profile ${profileId}`);
  if (profile) {
    console.log(`🔄 [LIFECYCLE] Name: ${profile.name}`);
    console.log(`🔄 [LIFECYCLE] AdsPower ID: ${profile.adsPowerProfileId}`);
  }
  console.log(`🔄 [LIFECYCLE] ========================================`);

  try {
    // Step 1: Stop mouse simulation immediately
    if (this.mouseService && profile?.adsPowerProfileId) {
      try {
        console.log(`🖱️ [LIFECYCLE] Step 1: Stopping mouse simulation...`);
        this.mouseService.stopSimulation(profile.adsPowerProfileId);
        console.log(`✅ [LIFECYCLE] Mouse simulation stopped`);
      } catch (mouseError) {
        console.warn(`⚠️ [LIFECYCLE] Mouse stop error (non-critical):`, mouseError.message);
      }
    }

    // Step 2: Remove from active profiles to free up slot immediately
    console.log(`🗑️ [LIFECYCLE] Step 2: Removing from active profiles...`);
    this.activeProfiles.delete(profileId);
    this.completedProfiles.delete(profileId);
    console.log(`✅ [LIFECYCLE] Removed from active profiles`);

    // Step 3: Free up proxy
    if (profile?.proxyId) {
      try {
        console.log(`🔓 [LIFECYCLE] Step 3: Freeing proxy ${profile.proxyId}...`);
        await this.db.run(
          'UPDATE proxies SET assigned_profile_id = NULL WHERE id = ?',
          [profile.proxyId]
        );
        console.log(`✅ [LIFECYCLE] Proxy freed`);
      } catch (proxyError) {
        console.warn(`⚠️ [LIFECYCLE] Proxy free error (non-critical):`, proxyError.message);
      }
    }

    // Step 4: Stop and delete AdsPower profile
    if (profile?.adsPowerProfileId) {
      try {
        console.log(`🛑 [LIFECYCLE] Step 4: Stopping AdsPower browser...`);
        const stopResult = await this.adsPowerService.stopProfile(profile.adsPowerProfileId);
        
        if (stopResult.success) {
          console.log(`✅ [LIFECYCLE] Browser stopped successfully`);
        } else {
          console.log(`ℹ️ [LIFECYCLE] Stop returned: ${stopResult.error || 'unknown'}`);
        }

        // Wait for browser to fully close
        console.log(`⏳ [LIFECYCLE] Waiting 2 seconds for browser to close...`);
        await this.delay(2000);

        // Force delete with retries
        console.log(`🔨 [LIFECYCLE] Step 5: Force deleting AdsPower profile...`);
        const deleteResult = await this.adsPowerService.forceDeleteProfile(
          profile.adsPowerProfileId, 
          3 // max attempts
        );
        
        if (deleteResult.success) {
          console.log(`✅ [LIFECYCLE] AdsPower profile deleted`);
        } else {
          console.warn(`⚠️ [LIFECYCLE] Delete warning: ${deleteResult.error}`);
          console.warn(`⚠️ [LIFECYCLE] Profile may need manual cleanup in AdsPower`);
        }

      } catch (adsError) {
        console.error(`❌ [LIFECYCLE] AdsPower error:`, adsError.message);
        // Continue with database cleanup even if AdsPower fails
      }
    }

    // Step 6: Delete from database
    if (this.settings.autoDelete) {
      try {
        console.log(`🗑️ [LIFECYCLE] Step 6: Deleting from database...`);
        await this.profileService.deleteProfile(profileId);
        console.log(`✅ [LIFECYCLE] Deleted from database`);
      } catch (dbError) {
        console.error(`❌ [LIFECYCLE] Database delete error:`, dbError.message);
        // Try to at least update status
        try {
          await this.profileService.updateProfileStatus(profileId, 'error');
        } catch (statusError) {
          console.error(`❌ [LIFECYCLE] Status update also failed:`, statusError.message);
        }
      }
    } else {
      try {
        console.log(`📝 [LIFECYCLE] Step 6: Updating status to stopped...`);
        await this.profileService.updateProfileStatus(profileId, 'stopped');
        console.log(`✅ [LIFECYCLE] Status updated`);
      } catch (statusError) {
        console.error(`❌ [LIFECYCLE] Status update error:`, statusError.message);
      }
    }

    console.log(`✅ [LIFECYCLE] Profile ${profileId} cleanup completed`);
    console.log(`🔄 [LIFECYCLE] ========================================\n`);

  } catch (error) {
    console.error(`❌ [LIFECYCLE] Critical error stopping/deleting profile ${profileId}:`, error);
    console.error(`❌ [LIFECYCLE] Stack trace:`, error.stack);
    console.log(`🔄 [LIFECYCLE] ========================================\n`);
    // Don't throw - we want to continue with other profiles
    // Just log the error and move on
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