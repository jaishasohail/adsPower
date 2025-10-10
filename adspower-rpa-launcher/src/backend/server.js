// System performance endpoint
const os = require('os');

const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('./database/database');
const profileRoutes = require('./api/profiles');
const proxyRoutes = require('./api/proxies');
const settingsRoutes = require('./api/settings');
const logsRoutes = require('./api/logs');
const ProfileService = require('./services/ProfileService');
const AdsPowerService = require('./services/AdsPowerService');
const MouseService = require('./services/MouseService');
const LifecycleManager = require('./services/LifecycleManager');
const StickyIPService = require('./services/StickyIPService');
const lifecycleRoutes = require('./api/lifecycle');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database
const db = new Database();

// Initialize services
const profileService = new ProfileService(db);
const adsPowerService = new AdsPowerService();
const mouseService = new MouseService();
const stickyIpService = new StickyIPService({ enabled: true, pollIntervalMs: 1000 });
const lifecycleManager = new LifecycleManager(profileService, adsPowerService, mouseService, db, stickyIpService);

// Make services available to routes
app.locals.profileService = profileService;
app.locals.adsPowerService = adsPowerService;
app.locals.mouseService = mouseService;
app.locals.lifecycleManager = lifecycleManager;
app.locals.db = db;
app.locals.stickyIpService = stickyIpService;

// API Routes
app.use('/api/profiles', profileRoutes);
app.use('/api/proxies', proxyRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/lifecycle', lifecycleRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Lifecycle manager control endpoints
app.post('/api/lifecycle/start', async (req, res) => {
  try {
    await lifecycleManager.start();
    res.json({ success: true, message: 'Lifecycle manager started' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/system/performance', (req, res) => {
  try {
    // CPU usage: average over all cores
    const cpus = os.cpus();
    let idleMs = 0, totalMs = 0;
    cpus.forEach(core => {
      for (const type in core.times) {
        totalMs += core.times[type];
      }
      idleMs += core.times.idle;
    });
    const cpuUsage = Math.round(100 - (100 * idleMs / totalMs));

    // Memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryUsage = Math.round((usedMem / totalMem) * 100);

    // Network status (simple: if at least one interface has an IPv4 address, consider 'good')
    const interfaces = os.networkInterfaces();
    let networkStatus = 'poor';
    for (const name in interfaces) {
      for (const iface of interfaces[name]) {
        if (!iface.internal && iface.family === 'IPv4') {
          networkStatus = 'good';
          break;
        }
      }
      if (networkStatus === 'good') break;
    }

    res.json({
      success: true,
      data: {
        cpuUsage,
        memoryUsage,
        networkStatus
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/lifecycle/stop', async (req, res) => {
  try {
    await lifecycleManager.stop();
    res.json({ success: true, message: 'Lifecycle manager stopped' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/lifecycle/stats', async (req, res) => {
  try {
    const stats = await lifecycleManager.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Cleanup function to ensure clean slate on startup
async function cleanupOnStartup() {
  try {
    console.log('🧹 Cleaning up existing profiles from previous sessions...');
    
    // Get all profiles
    const profiles = await db.all('SELECT * FROM profiles');
    
    if (profiles.length > 0) {
      console.log(`Found ${profiles.length} existing profiles, cleaning up...`);
      
      // Stop and delete each profile
      for (const profile of profiles) {
        try {
          // Try to stop in AdsPower if it has an ID
          if (profile.ads_power_id) {
            await adsPowerService.stopProfile(profile.ads_power_id);
            await adsPowerService.deleteProfile(profile.ads_power_id);
          }
        } catch (error) {
          // Ignore errors during cleanup
          console.log(`Note: Could not stop/delete AdsPower profile ${profile.ads_power_id}`);
        }
      }
      
      // Delete all profiles from database
      await db.run('DELETE FROM profiles');
      
      // Free all proxies
      await db.run('UPDATE proxies SET assigned_profile_id = NULL');
      
      // Clear task queue
      await db.run('DELETE FROM task_queue');
      
      console.log('✅ Cleanup completed - starting with clean slate');
    } else {
      console.log('✅ No existing profiles found - clean slate confirmed');
    }
    
    // Ensure lifecycle manager is stopped
    if (lifecycleManager.isRunning) {
      await lifecycleManager.stop();
      console.log('✅ Stopped any running lifecycle manager');
    }
    
  } catch (error) {
    console.error('⚠️ Error during startup cleanup:', error.message);
    // Continue anyway - don't block server startup
  }
}

// Start server
app.listen(PORT, async () => {
  console.log(`AdsPower RPA Launcher Backend running on port ${PORT}`);
  console.log(`API Health check: http://localhost:${PORT}/api/health`);
  
  // Perform startup cleanup
  await cleanupOnStartup();
  
  console.log('🚀 Server ready - waiting for user input to start profile lifecycle');
  console.log('💡 Use the dashboard to create profiles and start the automation');
});

module.exports = app;