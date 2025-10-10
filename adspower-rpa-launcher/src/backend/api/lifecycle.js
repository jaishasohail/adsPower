const express = require('express');
const router = express.Router();

// Start lifecycle manager
router.post('/start', async (req, res) => {
  try {
    const lifecycleManager = req.app.locals.lifecycleManager;
    
    if (!lifecycleManager) {
      return res.status(500).json({
        success: false,
        error: 'Lifecycle manager not initialized'
      });
    }

    // Get settings from request body
    const { maxConcurrentProfiles, targetUrl, deviceTypes } = req.body;

    // Update settings if provided
    if (maxConcurrentProfiles || targetUrl || deviceTypes) {
      lifecycleManager.updateSettings({
        ...(maxConcurrentProfiles && { maxConcurrentProfiles }),
        ...(targetUrl && { targetUrl }),
        ...(deviceTypes && { deviceTypes })
      });
    }

    const result = await lifecycleManager.start();
    
    res.json(result);
  } catch (error) {
    console.error('Error starting lifecycle:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop lifecycle manager
// LIFECYCLE ENDPOINTS - Stop lifecycle
router.post('/stop', async (req, res) => {
  try {
    const lifecycleManager = req.app.locals.lifecycleManager;
    
    if (!lifecycleManager) {
      return res.status(500).json({
        success: false,
        error: 'Lifecycle manager not initialized'
      });
    }

    console.log('🛑 ========================================');
    console.log('🛑 Received stop lifecycle request');
    console.log('🛑 ========================================');
    
    // Set a timeout to prevent hanging
    const timeoutMs = 120000; // 2 minutes max
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Stop operation timed out after 2 minutes')), timeoutMs);
    });
    
    // Race between stop operation and timeout
    const result = await Promise.race([
      lifecycleManager.stop(),
      timeoutPromise
    ]);
    
    console.log('✅ Stop lifecycle completed');
    console.log('📊 Result:', JSON.stringify(result, null, 2));
    console.log('🛑 ========================================\n');
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ ========================================');
    console.error('❌ Error stopping lifecycle:', error);
    console.error('❌ Stack:', error.stack);
    console.error('❌ ========================================\n');
    
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Check server logs for more information'
    });
  }
});

// Emergency stop - force stop everything
router.post('/emergency-stop', async (req, res) => {
  try {
    const lifecycleManager = req.app.locals.lifecycleManager;
    
    if (!lifecycleManager) {
      return res.status(500).json({
        success: false,
        error: 'Lifecycle manager not initialized'
      });
    }

    console.log('🚨 Received EMERGENCY STOP request');
    
    const result = await lifecycleManager.emergencyStop();
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error in emergency stop:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get lifecycle statistics
router.get('/stats', async (req, res) => {
  try {
    const lifecycleManager = req.app.locals.lifecycleManager;
    
    if (!lifecycleManager) {
      return res.status(500).json({
        success: false,
        error: 'Lifecycle manager not initialized'
      });
    }

    const stats = lifecycleManager.getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting lifecycle stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get lifecycle status
router.get('/status', async (req, res) => {
  try {
    const lifecycleManager = req.app.locals.lifecycleManager;
    
    if (!lifecycleManager) {
      return res.status(500).json({
        success: false,
        error: 'Lifecycle manager not initialized'
      });
    }

    res.json({
      success: true,
      data: {
        isRunning: lifecycleManager.isRunning,
        settings: lifecycleManager.settings,
        activeProfilesCount: lifecycleManager.activeProfiles.size
      }
    });
  } catch (error) {
    console.error('Error getting lifecycle status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update lifecycle settings
router.put('/settings', async (req, res) => {
  try {
    const lifecycleManager = req.app.locals.lifecycleManager;
    
    if (!lifecycleManager) {
      return res.status(500).json({
        success: false,
        error: 'Lifecycle manager not initialized'
      });
    }

    const updatedSettings = lifecycleManager.updateSettings(req.body);
    
    res.json({
      success: true,
      data: updatedSettings
    });
  } catch (error) {
    console.error('Error updating lifecycle settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;