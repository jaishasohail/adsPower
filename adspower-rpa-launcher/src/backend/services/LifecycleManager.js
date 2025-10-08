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
      profileRotationDelay: 2000, // 2 seconds between profile operations
      taskDurationMin: 30000, // 30 seconds minimum
      taskDurationMax: 90000, // 90 seconds maximum
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

  // Update settings from dashboard
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    console.log('📊 Settings updated:', this.settings);
    return this.settings;
  }

  // Start the infinite loop lifecycle
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Lifecycle manager already running');
      return { success: false, message: 'Already running' };
    }

    this.isRunning = true;
    this.stats.startTime = new Date();
    console.log('🚀 Starting Infinite Loop Lifecycle Manager...');
    console.log(`📊 Max concurrent profiles: ${this.settings.maxConcurrentProfiles}`);
    console.log(`🎯 Target URL: ${this.settings.targetUrl}`);
    
    // Start all management processes
    this.startLauncher();
    this.startMonitor();
    this.startRecycler();
    this.startCleaner();
    
    await this.profileService.logAction('info', 'Lifecycle manager started with infinite loop mode');
    
    return { success: true, message: 'Lifecycle manager started' };
  }

  // Stop the lifecycle
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

  // LAUNCHER: Creates and launches profiles up to max limit
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
          // Small delay between launches to avoid overwhelming AdsPower
          await this.delay(this.settings.profileRotationDelay);
        }

      } catch (error) {
        console.error('❌ Launcher error:', error);
        this.stats.totalErrors++;
      }
    }, 5000); // Check every 5 seconds (reduced from 2 seconds for performance)
  }

  // MONITOR: Checks profile status and manages task completion
  startMonitor() {
    this.intervals.monitor = setInterval(async () => {
      if (!this.isRunning) return;

      for (const [profileId, profile] of this.activeProfiles) {
        try {
          const now = Date.now();
          const elapsed = now - profile.launchedAt;
          
          // Check if profile task is complete (based on duration)
          if (elapsed >= profile.taskDuration) {
            console.log(`✅ Profile ${profileId} task completed (ran for ${Math.round(elapsed/1000)}s)`);
            await this.markProfileCompleted(profileId);
          }
          
          // Check if profile is still actually running in AdsPower (only if not in demo mode)
          if (profile.adsPowerProfileId && !this.adsPowerService.demoMode) {
            const status = await this.adsPowerService.checkProfileStatus(profile.adsPowerProfileId);
            if (!status.success || !status.is_active) {
              console.log(`⚠️ Profile ${profileId} no longer active in AdsPower`);
              await this.markProfileCompleted(profileId);
            }
          }

        } catch (error) {
          console.error(`Monitor error for profile ${profileId}:`, error);
        }
      }
    }, 10000); // Check every 10 seconds (reduced from 5 seconds for performance)
  }

  // RECYCLER: Instantly recycles completed profile slots
  startRecycler() {
    this.intervals.recycler = setInterval(async () => {
      if (!this.isRunning || !this.settings.instantRecycle) return;

      // Process completed profiles for immediate recycling
      for (const profileId of this.completedProfiles) {
        try {
          await this.stopAndDeleteProfile(profileId);
          this.completedProfiles.delete(profileId);
          this.stats.totalCompleted++;
          console.log(`♻️ Recycled profile ${profileId} - slot now available`);
        } catch (error) {
          console.error(`Recycler error for profile ${profileId}:`, error);
          // Remove from completed set even on error to avoid infinite retry
          this.completedProfiles.delete(profileId);
        }
      }
    }, 3000); // Check every 3 seconds (reduced from 1 second for performance)
  }

  // CLEANER: Removes old completed profiles and frees resources
  startCleaner() {
    this.intervals.cleaner = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        // Clean up database logs older than 24 hours
        await this.db.run(
          'DELETE FROM logs WHERE created_at < datetime("now", "-1 day")'
        );

        // Clean up completed tasks from queue
        await this.db.run(
          'DELETE FROM task_queue WHERE status = "completed" AND completed_at < datetime("now", "-1 hour")'
        );

        // Update statistics
        this.stats.activeCount = this.activeProfiles.size;
        this.stats.cycleCount++;

      } catch (error) {
        console.error('Cleaner error:', error);
      }
    }, 120000); // Run every 2 minutes (reduced from 1 minute for performance)
  }

  // Launch a new profile with all configurations
  async launchNewProfile() {
    try {
      // Get next available proxy
      const proxy = await this.getNextAvailableProxy();
      
      // Rotate device type
      const deviceIndex = this.stats.totalLaunched % this.settings.deviceTypes.length;
      const deviceType = this.settings.deviceTypes[deviceIndex];
      
      // Generate unique profile name
      const profileName = `Auto-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      
      // Create profile data
      const profileData = {
        name: profileName,
        device_type: deviceType,
        proxy_id: proxy?.id || null,
        target_url: this.settings.targetUrl
      };

      console.log(`🎯 Creating profile: ${profileName} (${deviceType}${proxy ? ' with proxy' : ''})`);

      // Create profile in database and AdsPower
      const profile = await this.profileService.createProfile(profileData);
      
      if (!profile || !profile.id) {
        throw new Error('Failed to create profile');
      }

      console.log(`✅ Profile ${profile.id} created, now launching...`);

      // Launch the profile immediately after creation
      const launchResult = await this.profileService.launchProfile(profile.id, {
        headless: false,
        clear_cache_after_closing: true
      });

      if (!launchResult.success) {
        throw new Error(`Failed to launch profile: ${launchResult.error || 'Unknown error'}`);
      }

      // Calculate task duration (random between min and max)
      const taskDuration = Math.floor(
        Math.random() * (this.settings.taskDurationMax - this.settings.taskDurationMin) + 
        this.settings.taskDurationMin
      );

      // Store active profile info
      this.activeProfiles.set(profile.id, {
        profileId: profile.id,
        name: profileName,
        deviceType: deviceType,
        proxyId: proxy?.id,
        adsPowerProfileId: profile.ads_power_id,
        launchedAt: Date.now(),
        taskDuration: taskDuration,
        targetUrl: this.settings.targetUrl
      });

      // Start human-like activity if enabled
      if (this.settings.humanLikeActivity && this.mouseService) {
        this.startHumanActivity(profile.id, deviceType, taskDuration);
      }

      // Update proxy assignment
      if (proxy) {
        await this.db.run(
          'UPDATE proxies SET assigned_profile_id = ? WHERE id = ?',
          [profile.id, proxy.id]
        );
      }

      this.stats.totalLaunched++;
      console.log(`✅ Profile ${profile.id} launched successfully (Duration: ${Math.round(taskDuration/1000)}s)`);
      
      return profile;

    } catch (error) {
      console.error('❌ Failed to launch profile:', error);
      this.stats.totalErrors++;
      throw error;
    }
  }

  // Simulate human-like activity
  async startHumanActivity(profileId, deviceType, duration) {
    try {
      // Random activity patterns
      const patterns = ['natural', 'browsing', 'scrolling', 'reading', 'clicking'];
      const pattern = patterns[Math.floor(Math.random() * patterns.length)];
      
      // Adjust intensity based on device type
      const intensity = deviceType === 'Mobile' ? 'low' : 'medium';
      
      // Start mouse movement simulation
      if (this.mouseService) {
        await this.mouseService.simulateMouseMovement(profileId, {
          pattern: pattern,
          duration: duration - 5000, // Stop 5 seconds before task ends
          intensity: intensity
        });

        // Random scrolling
        if (Math.random() > 0.5) {
          await this.mouseService.simulateScrolling(profileId, {
            direction: Math.random() > 0.5 ? 'down' : 'up',
            distance: Math.floor(Math.random() * 1000) + 200
          });
        }

        // Random clicks
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

  // Mark profile as completed and ready for recycling
  async markProfileCompleted(profileId) {
    try {
      const profile = this.activeProfiles.get(profileId);
      if (!profile) return;

      // Move to completed set
      this.completedProfiles.add(profileId);
      this.activeProfiles.delete(profileId);

      // Update database status
      await this.profileService.updateProfileStatus(profileId, 'completed');

      console.log(`📝 Profile ${profileId} marked for recycling`);

    } catch (error) {
      console.error(`Error marking profile ${profileId} completed:`, error);
    }
  }

  // Stop and delete a profile completely
  async stopAndDeleteProfile(profileId) {
    try {
      const profile = this.activeProfiles.get(profileId) || 
                     Array.from(this.activeProfiles.values()).find(p => p.profileId === profileId);

      // Stop in AdsPower if running
      if (profile?.adsPowerProfileId) {
        await this.adsPowerService.stopProfile(profile.adsPowerProfileId);
      }

      // Free the proxy
      if (profile?.proxyId) {
        await this.db.run(
          'UPDATE proxies SET assigned_profile_id = NULL WHERE id = ?',
          [profile.proxyId]
        );
      }

      // Delete from database (this also deletes from AdsPower)
      if (this.settings.autoDelete) {
        await this.profileService.deleteProfile(profileId);
      } else {
        await this.profileService.updateProfileStatus(profileId, 'stopped');
      }

      // Remove from tracking
      this.activeProfiles.delete(profileId);
      this.completedProfiles.delete(profileId);

    } catch (error) {
      console.error(`Error stopping/deleting profile ${profileId}:`, error);
      throw error;
    }
  }

  // Get next available proxy with rotation
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
        // Update last used timestamp
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

  // Get current statistics
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

  // Format runtime to readable string
  formatRuntime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  }

  // Utility delay function
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Emergency stop all
  async emergencyStop() {
    console.log('🚨 EMERGENCY STOP INITIATED');
    await this.stop();
    
    // Force stop all profiles in AdsPower
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