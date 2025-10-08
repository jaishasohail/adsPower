const express = require('express');
const router = express.Router();

// Get logs with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      level, 
      profile_id, 
      start_date, 
      end_date 
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = '';
    let params = [];

    // Build WHERE clause based on filters
    const conditions = [];
    
    if (level) {
      conditions.push('level = ?');
      params.push(level);
    }
    
    if (profile_id) {
      conditions.push('profile_id = ?');
      params.push(profile_id);
    }
    
    if (start_date) {
      conditions.push('timestamp >= ?');
      params.push(start_date);
    }
    
    if (end_date) {
      conditions.push('timestamp <= ?');
      params.push(end_date);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // Get logs with profile information
    const logs = await req.app.locals.db.all(`
      SELECT l.*, p.name as profile_name 
      FROM logs l
      LEFT JOIN profiles p ON l.profile_id = p.id
      ${whereClause}
      ORDER BY l.timestamp DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    // Get total count for pagination
    const totalResult = await req.app.locals.db.get(`
      SELECT COUNT(*) as total FROM logs l ${whereClause}
    `, params);

    const total = totalResult.total;
    const totalPages = Math.ceil(total / limit);

    res.json({ 
      success: true, 
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
          hasMore: page < totalPages
        }
      }
    });

  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add new log entry
router.post('/', async (req, res) => {
  try {
    const { level, message, profile_id, extra_data } = req.body;

    // Validate required fields
    if (!level || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Level and message are required' 
      });
    }

    // Validate log level
    const validLevels = ['error', 'warn', 'info', 'debug'];
    if (!validLevels.includes(level)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid log level. Must be one of: ' + validLevels.join(', ')
      });
    }

    const result = await req.app.locals.db.run(
      'INSERT INTO logs (level, message, profile_id, extra_data) VALUES (?, ?, ?, ?)',
      [level, message, profile_id, extra_data ? JSON.stringify(extra_data) : null]
    );

    const log = {
      id: result.id,
      level,
      message,
      profile_id,
      extra_data,
      timestamp: new Date().toISOString()
    };

    res.json({ success: true, data: log });
  } catch (error) {
    console.error('Error adding log:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get logs by profile
router.get('/profile/:profileId', async (req, res) => {
  try {
    const profileId = req.params.profileId;
    const { limit = 100 } = req.query;

    const logs = await req.app.locals.db.all(`
      SELECT l.*, p.name as profile_name 
      FROM logs l
      LEFT JOIN profiles p ON l.profile_id = p.id
      WHERE l.profile_id = ?
      ORDER BY l.timestamp DESC
      LIMIT ?
    `, [profileId, limit]);

    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Error getting profile logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get log statistics
router.get('/stats', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Get log counts by level
    const levelStats = await req.app.locals.db.all(`
      SELECT level, COUNT(*) as count 
      FROM logs 
      WHERE timestamp >= ?
      GROUP BY level
      ORDER BY count DESC
    `, [since]);

    // Get log counts by hour
    const hourlyStats = await req.app.locals.db.all(`
      SELECT 
        strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
        COUNT(*) as count,
        level
      FROM logs 
      WHERE timestamp >= ?
      GROUP BY hour, level
      ORDER BY hour DESC
    `, [since]);

    // Get top profiles by log activity
    const profileStats = await req.app.locals.db.all(`
      SELECT 
        p.name as profile_name,
        p.id as profile_id,
        COUNT(*) as log_count
      FROM logs l
      JOIN profiles p ON l.profile_id = p.id
      WHERE l.timestamp >= ?
      GROUP BY l.profile_id, p.name
      ORDER BY log_count DESC
      LIMIT 10
    `, [since]);

    // Get recent errors
    const recentErrors = await req.app.locals.db.all(`
      SELECT l.*, p.name as profile_name
      FROM logs l
      LEFT JOIN profiles p ON l.profile_id = p.id
      WHERE l.level = 'error' AND l.timestamp >= ?
      ORDER BY l.timestamp DESC
      LIMIT 10
    `, [since]);

    const stats = {
      period: `Last ${hours} hours`,
      since,
      level_distribution: levelStats,
      hourly_activity: hourlyStats,
      top_profiles: profileStats,
      recent_errors: recentErrors
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error getting log statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear old logs
router.delete('/cleanup', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const result = await req.app.locals.db.run(
      'DELETE FROM logs WHERE timestamp < ?',
      [cutoffDate]
    );

    res.json({ 
      success: true, 
      data: {
        deleted_count: result.changes,
        cutoff_date: cutoffDate,
        message: `Deleted logs older than ${days} days`
      }
    });
  } catch (error) {
    console.error('Error cleaning up logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export logs as JSON
router.get('/export', async (req, res) => {
  try {
    const { 
      start_date, 
      end_date, 
      level, 
      profile_id 
    } = req.query;

    let whereClause = '';
    let params = [];

    // Build WHERE clause based on filters
    const conditions = [];
    
    if (level) {
      conditions.push('l.level = ?');
      params.push(level);
    }
    
    if (profile_id) {
      conditions.push('l.profile_id = ?');
      params.push(profile_id);
    }
    
    if (start_date) {
      conditions.push('l.timestamp >= ?');
      params.push(start_date);
    }
    
    if (end_date) {
      conditions.push('l.timestamp <= ?');
      params.push(end_date);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    const logs = await req.app.locals.db.all(`
      SELECT l.*, p.name as profile_name 
      FROM logs l
      LEFT JOIN profiles p ON l.profile_id = p.id
      ${whereClause}
      ORDER BY l.timestamp DESC
    `, params);

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="adspower-logs-${new Date().toISOString().split('T')[0]}.json"`);
    
    res.json({
      export_info: {
        timestamp: new Date().toISOString(),
        total_logs: logs.length,
        filters: { start_date, end_date, level, profile_id }
      },
      logs
    });

  } catch (error) {
    console.error('Error exporting logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get live log stream (for real-time monitoring)
router.get('/stream', async (req, res) => {
  try {
    // Set headers for Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    // Set up periodic log checking (in a real app, you'd use database triggers or WebSockets)
    let lastLogId = 0;
    
    const checkForNewLogs = async () => {
      try {
        const newLogs = await req.app.locals.db.all(`
          SELECT l.*, p.name as profile_name 
          FROM logs l
          LEFT JOIN profiles p ON l.profile_id = p.id
          WHERE l.id > ?
          ORDER BY l.timestamp ASC
          LIMIT 10
        `, [lastLogId]);

        if (newLogs.length > 0) {
          lastLogId = newLogs[newLogs.length - 1].id;
          
          for (const log of newLogs) {
            res.write(`data: ${JSON.stringify({ type: 'log', data: log })}\n\n`);
          }
        }
      } catch (error) {
        console.error('Error checking for new logs:', error);
      }
    };

    // Check for new logs every 2 seconds
    const interval = setInterval(checkForNewLogs, 2000);

    // Clean up when client disconnects
    req.on('close', () => {
      clearInterval(interval);
    });

  } catch (error) {
    console.error('Error setting up log stream:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;