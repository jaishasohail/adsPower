const express = require('express');
const router = express.Router();

// Get all proxies
router.get('/', async (req, res) => {
  try {
    const proxies = await req.app.locals.db.all(`
      SELECT p.*, pr.name as assigned_profile_name 
      FROM proxies p
      LEFT JOIN profiles pr ON p.assigned_profile_id = pr.id
      ORDER BY p.created_at DESC
    `);
    res.json({ success: true, data: proxies });
  } catch (error) {
    console.error('Error getting proxies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add new proxy
router.post('/', async (req, res) => {
  try {
    const { ip_address, port, username, password, type = 'HTTP' } = req.body;

    // Validate required fields
    if (!ip_address || !port) {
      return res.status(400).json({ 
        success: false, 
        error: 'IP address and port are required' 
      });
    }

    // Check if proxy already exists
    const existingProxy = await req.app.locals.db.get(
      'SELECT id FROM proxies WHERE ip_address = ? AND port = ?',
      [ip_address, port]
    );

    if (existingProxy) {
      return res.status(400).json({ 
        success: false, 
        error: 'Proxy with this IP and port already exists' 
      });
    }

    const result = await req.app.locals.db.run(
      'INSERT INTO proxies (ip_address, port, username, password, type) VALUES (?, ?, ?, ?, ?)',
      [ip_address, port, username, password, type]
    );

    const proxy = {
      id: result.id,
      ip_address,
      port,
      username,
      password,
      type,
      is_active: true,
      assigned_profile_id: null
    };

    res.json({ success: true, data: proxy });
  } catch (error) {
    console.error('Error adding proxy:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk import proxies
router.post('/bulk', async (req, res) => {
  try {
    const { proxies } = req.body;

    if (!Array.isArray(proxies) || proxies.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Proxies array is required and must not be empty' 
      });
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < proxies.length; i++) {
      const proxy = proxies[i];
      const { ip_address, port, username, password, type = 'HTTP' } = proxy;

      try {
        // Validate required fields
        if (!ip_address || !port) {
          errors.push(`Proxy ${i + 1}: IP address and port are required`);
          continue;
        }

        // Check if proxy already exists
        const existingProxy = await req.app.locals.db.get(
          'SELECT id FROM proxies WHERE ip_address = ? AND port = ?',
          [ip_address, port]
        );

        if (existingProxy) {
          errors.push(`Proxy ${i + 1}: Already exists (${ip_address}:${port})`);
          continue;
        }

        const result = await req.app.locals.db.run(
          'INSERT INTO proxies (ip_address, port, username, password, type) VALUES (?, ?, ?, ?, ?)',
          [ip_address, port, username, password, type]
        );

        results.push({
          id: result.id,
          ip_address,
          port,
          username,
          type,
          is_active: true
        });

      } catch (error) {
        errors.push(`Proxy ${i + 1}: ${error.message}`);
      }
    }

    res.json({ 
      success: true, 
      data: {
        imported: results.length,
        total: proxies.length,
        proxies: results,
        errors: errors
      }
    });

  } catch (error) {
    console.error('Error bulk importing proxies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update proxy
router.put('/:id', async (req, res) => {
  try {
    const proxyId = req.params.id;
    const { ip_address, port, username, password, type, is_active } = req.body;

    // Check if proxy exists
    const existingProxy = await req.app.locals.db.get('SELECT * FROM proxies WHERE id = ?', [proxyId]);
    if (!existingProxy) {
      return res.status(404).json({ success: false, error: 'Proxy not found' });
    }

    // Validate required fields
    if (!ip_address || !port) {
      return res.status(400).json({ 
        success: false, 
        error: 'IP address and port are required' 
      });
    }

    await req.app.locals.db.run(
      'UPDATE proxies SET ip_address = ?, port = ?, username = ?, password = ?, type = ?, is_active = ? WHERE id = ?',
      [ip_address, port, username, password, type, is_active, proxyId]
    );

    const updatedProxy = await req.app.locals.db.get('SELECT * FROM proxies WHERE id = ?', [proxyId]);
    res.json({ success: true, data: updatedProxy });

  } catch (error) {
    console.error('Error updating proxy:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete proxy
router.delete('/:id', async (req, res) => {
  try {
    const proxyId = req.params.id;

    // Check if proxy exists
    const existingProxy = await req.app.locals.db.get('SELECT * FROM proxies WHERE id = ?', [proxyId]);
    if (!existingProxy) {
      return res.status(404).json({ success: false, error: 'Proxy not found' });
    }

    // Check if proxy is assigned to any profile
    if (existingProxy.assigned_profile_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete proxy that is assigned to a profile' 
      });
    }

    await req.app.locals.db.run('DELETE FROM proxies WHERE id = ?', [proxyId]);
    res.json({ success: true, message: 'Proxy deleted successfully' });

  } catch (error) {
    console.error('Error deleting proxy:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get available (unassigned) proxies
router.get('/available', async (req, res) => {
  try {
    const proxies = await req.app.locals.db.all(
      'SELECT * FROM proxies WHERE is_active = 1 AND assigned_profile_id IS NULL ORDER BY created_at ASC'
    );
    res.json({ success: true, data: proxies });
  } catch (error) {
    console.error('Error getting available proxies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test proxy connection
router.post('/:id/test', async (req, res) => {
  try {
    const proxyId = req.params.id;

    // Get proxy information
    const proxy = await req.app.locals.db.get('SELECT * FROM proxies WHERE id = ?', [proxyId]);
    if (!proxy) {
      return res.status(404).json({ success: false, error: 'Proxy not found' });
    }

    // Simple test - in production you'd want to actually test the connection
    // For now, just return a mock result
    const testResult = {
      success: true,
      ip_address: proxy.ip_address,
      port: proxy.port,
      response_time: Math.floor(Math.random() * 500) + 100, // Mock response time
      status: 'Connected'
    };

    res.json({ success: true, data: testResult });

  } catch (error) {
    console.error('Error testing proxy:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Assign proxy to profile
router.post('/:id/assign/:profileId', async (req, res) => {
  try {
    const proxyId = req.params.id;
    const profileId = req.params.profileId;

    // Check if proxy exists and is available
    const proxy = await req.app.locals.db.get('SELECT * FROM proxies WHERE id = ? AND is_active = 1', [proxyId]);
    if (!proxy) {
      return res.status(404).json({ success: false, error: 'Proxy not found or inactive' });
    }

    if (proxy.assigned_profile_id) {
      return res.status(400).json({ success: false, error: 'Proxy is already assigned to another profile' });
    }

    // Check if profile exists
    const profile = await req.app.locals.db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    // Assign proxy to profile
    await req.app.locals.db.run(
      'UPDATE proxies SET assigned_profile_id = ? WHERE id = ?',
      [profileId, proxyId]
    );

    // Update profile with proxy
    await req.app.locals.db.run(
      'UPDATE profiles SET proxy_id = ? WHERE id = ?',
      [proxyId, profileId]
    );

    res.json({ success: true, message: 'Proxy assigned to profile successfully' });

  } catch (error) {
    console.error('Error assigning proxy:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Unassign proxy from profile
router.post('/:id/unassign', async (req, res) => {
  try {
    const proxyId = req.params.id;

    // Get proxy information
    const proxy = await req.app.locals.db.get('SELECT * FROM proxies WHERE id = ?', [proxyId]);
    if (!proxy) {
      return res.status(404).json({ success: false, error: 'Proxy not found' });
    }

    if (!proxy.assigned_profile_id) {
      return res.status(400).json({ success: false, error: 'Proxy is not assigned to any profile' });
    }

    // Unassign proxy
    await req.app.locals.db.run(
      'UPDATE proxies SET assigned_profile_id = NULL WHERE id = ?',
      [proxyId]
    );

    // Update profile to remove proxy
    await req.app.locals.db.run(
      'UPDATE profiles SET proxy_id = NULL WHERE id = ?',
      [proxy.assigned_profile_id]
    );

    res.json({ success: true, message: 'Proxy unassigned successfully' });

  } catch (error) {
    console.error('Error unassigning proxy:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;