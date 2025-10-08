const express = require('express');
const router = express.Router();

// Get all settings
router.get('/', async (req, res) => {
  try {
    const settings = await req.app.locals.db.all('SELECT * FROM settings ORDER BY key');
    
    // Convert to key-value object
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });

    res.json({ success: true, data: settingsObj });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific setting
router.get('/:key', async (req, res) => {
  try {
    const key = req.params.key;
    const setting = await req.app.locals.db.get('SELECT * FROM settings WHERE key = ?', [key]);
    
    if (!setting) {
      return res.status(404).json({ success: false, error: 'Setting not found' });
    }

    res.json({ success: true, data: { key: setting.key, value: setting.value } });
  } catch (error) {
    console.error('Error getting setting:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update setting
router.put('/:key', async (req, res) => {
  try {
    const key = req.params.key;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ success: false, error: 'Value is required' });
    }

    // Update or insert setting
    await req.app.locals.db.run(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value]
    );

    // Update AdsPower service base URL if changed
    if (key === 'adspower_api_url') {
      req.app.locals.adsPowerService.updateBaseURL(value);
    }

    res.json({ success: true, data: { key, value } });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update multiple settings
router.post('/bulk', async (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'Settings object is required' });
    }

    const results = [];

    for (const [key, value] of Object.entries(settings)) {
      try {
        await req.app.locals.db.run(
          'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, value]
        );

        results.push({ key, value, status: 'updated' });

        // Handle special settings
        if (key === 'adspower_api_url') {
          req.app.locals.adsPowerService.updateBaseURL(value);
        }

      } catch (error) {
        results.push({ key, value, status: 'error', error: error.message });
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reset settings to defaults
router.post('/reset', async (req, res) => {
  try {
    const defaultSettings = [
      { key: 'max_concurrent_profiles', value: '40' },
      { key: 'default_device_type', value: 'PC' },
      { key: 'target_url', value: 'https://example.com' },
      { key: 'mouse_movement_enabled', value: 'true' },
      { key: 'auto_delete_completed', value: 'true' },
      { key: 'profile_timeout_minutes', value: '30' },
      { key: 'adspower_api_url', value: 'http://local.adspower.net:50325' }
    ];

    // Clear existing settings
    await req.app.locals.db.run('DELETE FROM settings');

    // Insert default settings
    for (const setting of defaultSettings) {
      await req.app.locals.db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?)',
        [setting.key, setting.value]
      );
    }

    // Update AdsPower service with default URL
    req.app.locals.adsPowerService.updateBaseURL('http://local.adspower.net:50325');

    res.json({ success: true, message: 'Settings reset to defaults' });
  } catch (error) {
    console.error('Error resetting settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test AdsPower connection
router.post('/test-adspower', async (req, res) => {
  try {
    const adsPowerService = req.app.locals.adsPowerService;
    const testResult = await adsPowerService.testConnection();
    
    res.json({ 
      success: testResult.success, 
      data: { 
        connected: testResult.success,
        message: testResult.message,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error testing AdsPower connection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get system information
router.get('/system/info', async (req, res) => {
  try {
    const os = require('os');
    
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      memory: {
        total: Math.round(os.totalmem() / 1024 / 1024 / 1024), // GB
        free: Math.round(os.freemem() / 1024 / 1024 / 1024)    // GB
      },
      cpu: {
        count: os.cpus().length,
        model: os.cpus()[0]?.model || 'Unknown'
      },
      uptime: Math.round(os.uptime()),
      hostname: os.hostname()
    };

    res.json({ success: true, data: systemInfo });
  } catch (error) {
    console.error('Error getting system info:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get application status
router.get('/system/status', async (req, res) => {
  try {
    const profileService = req.app.locals.profileService;
    
    // Get profile counts
    const totalProfiles = await req.app.locals.db.get('SELECT COUNT(*) as count FROM profiles');
    const activeProfiles = await req.app.locals.db.get("SELECT COUNT(*) as count FROM profiles WHERE status IN ('launching', 'running', 'active')");
    const completedProfiles = await req.app.locals.db.get("SELECT COUNT(*) as count FROM profiles WHERE status = 'completed'");
    
    // Get proxy counts
    const totalProxies = await req.app.locals.db.get('SELECT COUNT(*) as count FROM proxies');
    const activeProxies = await req.app.locals.db.get('SELECT COUNT(*) as count FROM proxies WHERE is_active = 1');
    const assignedProxies = await req.app.locals.db.get('SELECT COUNT(*) as count FROM proxies WHERE assigned_profile_id IS NOT NULL');
    
    // Get recent logs
    const recentLogs = await req.app.locals.db.all(
      'SELECT * FROM logs ORDER BY timestamp DESC LIMIT 10'
    );

    // Get pending tasks
    const pendingTasks = await req.app.locals.db.get('SELECT COUNT(*) as count FROM task_queue WHERE status = ?', ['pending']);

    // Get AdsPower connection status
    const adsPowerService = req.app.locals.adsPowerService;
    const connectionStatus = adsPowerService.getConnectionStatus();

    const status = {
      profiles: {
        total: totalProfiles.count,
        active: activeProfiles.count,
        completed: completedProfiles.count
      },
      proxies: {
        total: totalProxies.count,
        active: activeProxies.count,
        assigned: assignedProxies.count,
        available: activeProxies.count - assignedProxies.count
      },
      tasks: {
        pending: pendingTasks.count
      },
      adspower: {
        isConnected: connectionStatus.isConnected,
        demoMode: connectionStatus.demoMode,
        lastCheck: connectionStatus.lastCheck,
        baseURL: connectionStatus.baseURL
      },
      recent_logs: recentLogs,
      timestamp: new Date().toISOString()
    };

    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error getting application status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test AdsPower connection
router.get('/test-adspower', async (req, res) => {
  try {
    const adsPowerService = req.app.locals.adsPowerService;
    const result = await adsPowerService.testConnection();
    
    res.json({ 
      success: true, 
      data: result 
    });
  } catch (error) {
    console.error('Error testing AdsPower connection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;