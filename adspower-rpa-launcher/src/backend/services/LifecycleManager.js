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
    
    // Core settings with defaults
    this.settings = {
      maxConcurrentProfiles: 2,
      targetUrl: 'https://google.com',
      deviceTypes: ['PC', 'Mac', 'Mobile'],
      rpaTool: 'adspower',
      profileRotationDelay: 2000,
      taskDurationMin: 30000,
      taskDurationMax: 90000,
      autoDelete: true,
      instantRecycle: true,
      humanLikeActivity: true,
      proxyRotation: true
    };

    // Statistics tracking
    this.stats = {
      totalLaunched: 0,
      totalCompleted: 0,
      totalErrors: 0,
      activeCount: 0,
      cycleCount: 0,
      startTime: null
    };

    // Intervals for different processes
    this.intervals = {
      launcher: null,
      monitor: null,
      cleaner: null,
      recycler: null
    };
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

    // CRITICAL: Verify AdsPower connection before starting
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
    
    // Start all management processes
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

    // Clear all intervals
    Object.values(this.intervals).forEach(interval => {
      if (interval) clearInterval(interval);
    });

    // Stop all active profiles
    for (const [profileId, profile] of this.activeProfiles) {
      try {
        await this.stopAndDeleteProfile(profileId);
      } catch (error) {
        console.error(`Error stopping profile ${profileId}:`, error);
      }
    }

    await this.profileService.logAction('info', 'Lifecycle manager stopped');
    
    return { success: true, message: 'Lifecycle manager stopped', stats: this.stats };
  }

  startLauncher() {
    this.intervals.launcher = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        // Get active count from database for accuracy
        const dbActiveCount = await this.db.get(
          "SELECT COUNT(*) as count FROM profiles WHERE status IN ('launching', 'running', 'active')"
        );
        const activeCount = dbActiveCount?.count || 0;
        const slotsAvailable = this.settings.maxConcurrentProfiles - activeCount;
        
        if (slotsAvailable <= 0) {
          console.log(`⏸️ No slots available (Active: ${activeCount}/${this.settings.maxConcurrentProfiles})`);
          return;
        }

        console.log(`📊 Slots available: ${slotsAvailable} (Active: ${activeCount}/${this.settings.maxConcurrentProfiles})`);

        // Launch profiles to fill available slots (limit to 1 per cycle to avoid race conditions)
        const profilesToLaunch = Math.min(slotsAvailable, 1);
        for (let i = 0; i < profilesToLaunch; i++) {
          await this.launchNewProfile();
          await this.delay(this.settings.profileRotationDelay);
        }

      } catch (error) {
        console.error('❌ Launcher error:', error);
        this.stats.totalErrors++;
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
          
          // Check if profile task is complete
          if (elapsed >= profile.taskDuration) {
            console.log(`✅ Profile ${profileId} task completed (ran for ${Math.round(elapsed/1000)}s)`);
            await this.markProfileCompleted(profileId);
            continue;
          }
          
          // Check if profile is still running in AdsPower (skip in demo mode)
          if (profile.adsPowerProfileId && !this.adsPowerService.demoMode) {
            try {
              const status = await this.adsPowerService.checkProfileStatus(profile.adsPowerProfileId);
              if (!status.success || !status.is_active) {
                console.log(`⚠️ Profile ${profileId} no longer active in AdsPower`);
                await this.markProfileCompleted(profileId);
              }
            } catch (error) {
              console.warn(`⚠️ Could not check status for profile ${profileId}:`, error.message);
            }
          }

        } catch (error) {
          console.error(`Monitor error for profile ${profileId}:`, error);
        }
      }
    }, 10000);
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
    }, 3000);
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

  // FIXED: Launch new profile with proper error handling and status tracking
  async launchNewProfile() {
    let profileId = null;
    let profile = null;

    try {
      // Verify AdsPower connection before creating profile
      const isConnected = await this.adsPowerService.checkConnection();
      if (!isConnected && !this.adsPowerService.demoMode) {
        console.error('❌ AdsPower not connected - cannot launch profile');
        this.stats.totalErrors++;
        return null;
      }

      // Get next available proxy
      const proxy = await this.getNextAvailableProxy();
      
      // Rotate device type
      const deviceIndex = this.stats.totalLaunched % this.settings.deviceTypes.length;
      const deviceType = this.settings.deviceTypes[deviceIndex];
      
      // Generate unique profile name
      const profileName = `Auto-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      
      console.log(`🎯 Creating profile: ${profileName} (${deviceType}${proxy ? ' with proxy' : ''})`);

      // Create profile data
      const profileData = {
        name: profileName,
        device_type: deviceType,
        proxy_id: proxy?.id || null,
        target_url: this.settings.targetUrl
      };

      // Create profile (this sets status to 'launching')
      profile = await this.profileService.createProfile(profileData);
      
      if (!profile || !profile.id) {
        throw new Error('Failed to create profile - no profile ID returned');
      }

      profileId = profile.id;
      console.log(`✅ Profile ${profileId} created with AdsPower ID: ${profile.ads_power_id || 'pending'}`);

      // CRITICAL FIX: Wait a moment for database to commit
      await this.delay(500);

      // Verify profile was created with AdsPower ID
      if (!profile.ads_power_id) {
        console.error(`❌ Profile ${profileId} has no AdsPower ID - cannot launch`);
        
        // Try to create AdsPower profile manually
        console.log(`🔄 Attempting to create AdsPower profile manually...`);
        const adsPowerResult = await this.profileService.createAdsPowerProfile(profileData, profileId);
        
        if (adsPowerResult.success && adsPowerResult.profile_id) {
          await this.db.run(
            'UPDATE profiles SET ads_power_id = ? WHERE id = ?',
            [adsPowerResult.profile_id, profileId]
          );
          profile.ads_power_id = adsPowerResult.profile_id;
          console.log(`✅ Manually created AdsPower profile: ${adsPowerResult.profile_id}`);
        } else {
          throw new Error('Failed to create AdsPower profile');
        }
      }

      // Calculate task duration
      const taskDuration = Math.floor(
        Math.random() * (this.settings.taskDurationMax - this.settings.taskDurationMin) + 
        this.settings.taskDurationMin
      );

      console.log(`🚀 Launching profile ${profileId} (AdsPower ID: ${profile.ads_power_id})...`);

      // Launch the profile with explicit options
      const launchResult = await this.profileService.launchProfile(profileId, {
        headless: false,
        clear_cache_after_closing: true,
        disable_password_filling: false,
        enable_password_saving: false
      });

      if (!launchResult.success) {
        throw new Error(`Launch failed: ${launchResult.error || 'Unknown error'}`);
      }

      console.log(`✅ Profile ${profileId} launched successfully`);

      // Store active profile info
      this.activeProfiles.set(profileId, {
        profileId: profileId,
        name: profileName,
        deviceType: deviceType,
        proxyId: proxy?.id,
        adsPowerProfileId: profile.ads_power_id,
        launchedAt: Date.now(),
        taskDuration: taskDuration,
        targetUrl: this.settings.targetUrl
      });

      // Update database status to 'running'
      await this.db.run(
        'UPDATE profiles SET status = ? WHERE id = ?',
        ['running', profileId]
      );

      // Start human-like activity if enabled
      if (this.settings.humanLikeActivity && this.mouseService) {
        this.startHumanActivity(profileId, deviceType, taskDuration);
      }

      // Update proxy assignment
      if (proxy) {
        await this.db.run(
          'UPDATE proxies SET assigned_profile_id = ? WHERE id = ?',
          [profileId, proxy.id]
        );
      }

      this.stats.totalLaunched++;
      console.log(`✅ Profile ${profileId} fully operational (Duration: ${Math.round(taskDuration/1000)}s)`);
      
      return profile;

    } catch (error) {
      console.error('❌ Failed to launch profile:', error.message);
      this.stats.totalErrors++;
      
      // Clean up failed profile
      if (profileId) {
        try {
          await this.db.run(
            'UPDATE profiles SET status = ? WHERE id = ?',
            ['error', profileId]
          );
          
          // Remove from active profiles if somehow added
          this.activeProfiles.delete(profileId);
          
          // Optionally delete failed profile
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

  async startHumanActivity(profileId, deviceType, duration) {
    try {
      const patterns = ['natural', 'browsing', 'scrolling', 'reading', 'clicking'];
      const pattern = patterns[Math.floor(Math.random() * patterns.length)];
      const intensity = deviceType === 'Mobile' ? 'low' : 'medium';
      
      if (this.mouseService) {
        await this.mouseService.simulateMouseMovement(profileId, {
          pattern: pattern,
          duration: duration - 5000,
          intensity: intensity
        });

        if (Math.random() > 0.5) {
          await this.mouseService.simulateScrolling(profileId, {
            direction: Math.random() > 0.5 ? 'down' : 'up',
            distance: Math.floor(Math.random() * 1000) + 200
          });
        }

        if (Math.random() > 0.7) {
          await this.mouseService.simulateClick(profileId, {
            x: Math.floor(Math.random() * 1000) + 100,
            y: Math.floor(Math.random() * 600) + 100
          });
        }
      }

      console.log(`🖱️ Human activity started for profile ${profileId} (${pattern}, ${intensity})`);

    } catch (error) {
      console.error(`Human activity error for profile ${profileId}:`, error);
    }
  }

  async markProfileCompleted(profileId) {
    try {
      const profile = this.activeProfiles.get(profileId);
      if (!profile) return;

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

      if (profile?.adsPowerProfileId) {
        try {
          await this.adsPowerService.stopProfile(profile.adsPowerProfileId);
          console.log(`✅ Stopped AdsPower profile ${profile.adsPowerProfileId}`);
        } catch (error) {
          console.warn(`⚠️ Could not stop AdsPower profile ${profile.adsPowerProfileId}:`, error.message);
        }
      }

      if (profile?.proxyId) {
        await this.db.run(
          'UPDATE proxies SET assigned_profile_id = NULL WHERE id = ?',
          [profile.proxyId]
        );
      }

      if (this.settings.autoDelete) {
        await this.profileService.deleteProfile(profileId);
      } else {
        await this.profileService.updateProfileStatus(profileId, 'stopped');
      }

      this.activeProfiles.delete(profileId);
      this.completedProfiles.delete(profileId);

    } catch (error) {
      console.error(`Error stopping/deleting profile ${profileId}:`, error);
      throw error;
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
    await this.stop();
    
    for (const [profileId, profile] of this.activeProfiles) {
      if (profile.adsPowerProfileId) {
        try {
          await this.adsPowerService.stopProfile(profile.adsPowerProfileId);
        } catch (error) {
          console.error(`Failed to emergency stop ${profileId}:`, error);
        }
      }
    }
    
    return { success: true, message: 'Emergency stop completed' };
  }
}

module.exports = LifecycleManager;