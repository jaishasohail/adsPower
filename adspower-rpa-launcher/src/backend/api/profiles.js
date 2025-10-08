const express = require('express');
const router = express.Router();

// Get all profiles
router.get('/', async (req, res) => {
  try {
    const profileService = req.app.locals.profileService;
    const profiles = await profileService.getAllProfiles();
    res.json({ success: true, data: profiles });
  } catch (error) {
    console.error('Error getting profiles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new profile
router.post('/', async (req, res) => {
  try {
    const profileService = req.app.locals.profileService;
    
    const { name, device_type, proxy_id, target_url } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ success: false, error: 'Profile name is required' });
    }

    // Check available slots
    const availableSlots = await profileService.getAvailableSlots();
    if (availableSlots <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No available profile slots. Maximum concurrent profiles reached.' 
      });
    }

    // Use the integrated ProfileService create method
    const profile = await profileService.createProfile({
      name,
      device_type,
      proxy_id,
      target_url
    });

    // Mark proxy as assigned if used
    if (proxy_id) {
      await req.app.locals.db.run(
        'UPDATE proxies SET assigned_profile_id = ? WHERE id = ?',
        [profile.id, proxy_id]
      );
    }

    res.json({ 
      success: true, 
      data: profile
    });

  } catch (error) {
    console.error('Error creating profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Launch profile
router.post('/:id/launch', async (req, res) => {
  try {
    const profileService = req.app.locals.profileService;
    const mouseService = req.app.locals.mouseService;
    
    const profileId = parseInt(req.params.id);
    const launchOptions = req.body || {};

    // Use the integrated ProfileService launch method
    const result = await profileService.launchProfile(profileId, {
      headless: launchOptions.headless || false,
      disable_password_filling: launchOptions.disable_password_filling || false,
      clear_cache_after_closing: launchOptions.clear_cache_after_closing || true,
      enable_password_saving: launchOptions.enable_password_saving || false,
      launch_args: launchOptions.launch_args || []
    });

    if (result.success) {
      // Get profile info for device type
      const profile = await req.app.locals.db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
      
      // Apply device-specific mouse behavior
      if (mouseService && profile) {
        mouseService.applyDeviceProfile(profile.device_type);
        
        // Start mouse activity simulation for this profile
        setTimeout(() => {
          mouseService.simulateProfileActivity(60000, 'medium'); // 1 minute of activity
        }, 2000);
      }

      res.json({ 
        success: true, 
        data: {
          profileId: result.profileId,
          sessionData: result.sessionData,
          message: 'Profile launched successfully'
        }
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to launch profile'
      });
    }

  } catch (error) {
    console.error('Error launching profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop profile
router.post('/:id/stop', async (req, res) => {
  try {
    const profileService = req.app.locals.profileService;
    const profileId = parseInt(req.params.id);

    // Validate profile ID
    if (isNaN(profileId) || profileId <= 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid profile ID: ${req.params.id}. Profile ID must be a positive number.`
      });
    }

    // Use the integrated ProfileService stop method
    const result = await profileService.stopProfile(profileId);

    if (result.success) {
      // Mark task as completed
      await profileService.markTaskCompleted(profileId);

      res.json({
        success: true,
        data: {
          profileId: result.profileId,
          status: 'stopped',
          message: 'Profile stopped successfully'
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to stop profile'
      });
    }

  } catch (error) {
    console.error('Error stopping profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete profile
router.delete('/:id', async (req, res) => {
  try {
    const profileService = req.app.locals.profileService;
    const adsPowerService = req.app.locals.adsPowerService;
    
    const profileId = req.params.id;

    // Get profile information
    const profile = await req.app.locals.db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    // Delete from AdsPower if it has an ID
    if (profile.ads_power_id) {
      await adsPowerService.deleteProfile(profile.ads_power_id);
    }

    // Delete from local database
    await profileService.deleteProfile(profileId);

    res.json({ success: true, message: 'Profile deleted successfully' });

  } catch (error) {
    console.error('Error deleting profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get available slots
router.get('/slots/available', async (req, res) => {
  try {
    const profileService = req.app.locals.profileService;
    const availableSlots = await profileService.getAvailableSlots();
    const activeCount = await profileService.getActiveProfilesCount();
    const maxProfiles = parseInt(await profileService.getSetting('max_concurrent_profiles') || '40');

    res.json({ 
      success: true, 
      data: {
        available_slots: availableSlots,
        active_profiles: activeCount,
        max_profiles: maxProfiles
      }
    });
  } catch (error) {
    console.error('Error getting available slots:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get profile launch status
router.get('/:id/status', async (req, res) => {
  try {
    const profileService = req.app.locals.profileService;
    const profileId = parseInt(req.params.id);

    const status = await profileService.getProfileLaunchStatus(profileId);
    res.json({ success: true, data: status });

  } catch (error) {
    console.error('Error getting profile status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get active profile sessions
router.get('/active/sessions', async (req, res) => {
  try {
    const profileService = req.app.locals.profileService;
    const sessions = profileService.getAllActiveProfileSessions();
    res.json({ success: true, data: sessions });

  } catch (error) {
    console.error('Error getting active sessions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Batch launch profiles
router.post('/batch/launch', async (req, res) => {
  try {
    const profileService = req.app.locals.profileService;
    const { profileIds, options = {} } = req.body;

    if (!Array.isArray(profileIds) || profileIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'profileIds must be a non-empty array' 
      });
    }

    const results = await profileService.launchMultipleProfiles(profileIds, options);
    res.json({ success: true, data: results });

  } catch (error) {
    console.error('Error batch launching profiles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Schedule profile launch
router.post('/:id/schedule/launch', async (req, res) => {
  try {
    const profileService = req.app.locals.profileService;
    const profileId = parseInt(req.params.id);
    const options = req.body || {};

    await profileService.scheduleProfileLaunch(profileId, options);
    res.json({ 
      success: true, 
      data: { 
        profileId, 
        message: 'Profile scheduled for launch' 
      } 
    });

  } catch (error) {
    console.error('Error scheduling profile launch:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check AdsPower connection status
router.get('/adspower/status', async (req, res) => {
  try {
    const profileService = req.app.locals.profileService;
    const status = profileService.getAdsPowerStatus();
    const isConnected = await profileService.checkAdsPowerConnection();
    
    res.json({ 
      success: true, 
      data: { 
        ...status, 
        isConnected 
      } 
    });

  } catch (error) {
    console.error('Error checking AdsPower status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Diagnose AdsPower connection
router.get('/adspower/diagnose', async (req, res) => {
  try {
    const profileService = req.app.locals.profileService;
    const diagnosis = await profileService.diagnoseAdsPowerConnection();
    
    res.json({ 
      success: true, 
      data: diagnosis
    });

  } catch (error) {
    console.error('Error diagnosing AdsPower connection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Batch create profiles and start lifecycle
router.post('/batch', async (req, res) => {
  try {
    const profileService = req.app.locals.profileService;
    const lifecycleManager = req.app.locals.lifecycleManager;
    const db = req.app.locals.db;
    
    const { profile, count } = req.body;

    // Validate required fields
    if (!profile || !profile.name) {
      return res.status(400).json({ success: false, error: 'Profile data with name is required' });
    }

    if (!count || count < 1) {
      return res.status(400).json({ success: false, error: 'Count must be at least 1' });
    }

    // Update lifecycle manager settings with user input
    await lifecycleManager.updateSettings({
      maxConcurrentProfiles: count,
      targetUrl: profile.target_url || 'https://google.com',
      deviceTypes: [profile.device_type || 'PC'],
      autoDelete: true,
      instantRecycle: true
    });

    // Update max_concurrent_profiles setting in database
    await db.run(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['max_concurrent_profiles', count.toString()]
    );

    // Start the lifecycle manager (it will create and launch profiles automatically)
    const startResult = await lifecycleManager.start();

    res.json({ 
      success: true, 
      data: {
        message: `Lifecycle manager started with ${count} profile slots`,
        settings: lifecycleManager.settings,
        startResult
      }
    });

  } catch (error) {
    console.error('Error in batch profile creation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;