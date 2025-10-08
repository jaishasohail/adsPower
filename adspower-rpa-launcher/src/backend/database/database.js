const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    const dbPath = path.join(__dirname, 'adspower_launcher.db');
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('Connected to SQLite database');
        this.initializeTables();
      }
    });
  }

  initializeTables() {
    // Profiles table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ads_power_id TEXT UNIQUE,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'inactive',
        device_type TEXT DEFAULT 'PC',
        proxy_id INTEGER,
        target_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_launched DATETIME,
        task_completed BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (proxy_id) REFERENCES proxies (id)
      )
    `, (err) => {
      if (err) console.error('Error creating profiles table:', err);
    });

    // Proxies table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS proxies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT NOT NULL,
        port INTEGER NOT NULL,
        username TEXT,
        password TEXT,
        type TEXT DEFAULT 'HTTP',
        is_active BOOLEAN DEFAULT TRUE,
        assigned_profile_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME,
        FOREIGN KEY (assigned_profile_id) REFERENCES profiles (id)
      )
    `, (err) => {
      if (err) console.error('Error creating proxies table:', err);
    });

    // Settings table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating settings table:', err);
      else this.initializeDefaultSettings();
    });

    // Logs table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        profile_id INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        extra_data TEXT,
        FOREIGN KEY (profile_id) REFERENCES profiles (id)
      )
    `, (err) => {
      if (err) console.error('Error creating logs table:', err);
    });

    // Task queue table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS task_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        task_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        priority INTEGER DEFAULT 1,
        options TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        error_message TEXT,
        FOREIGN KEY (profile_id) REFERENCES profiles (id)
      )
    `, (err) => {
      if (err) console.error('Error creating task_queue table:', err);
      else this.addMissingColumns();
    });
  }

  // Add missing columns to existing tables
  addMissingColumns() {
    // Check and add options column to task_queue if it doesn't exist
    this.db.all("PRAGMA table_info(task_queue)", (err, columns) => {
      if (err) {
        console.error('Error checking task_queue columns:', err);
        return;
      }
      
      const hasOptionsColumn = columns.some(col => col.name === 'options');
      if (!hasOptionsColumn) {
        this.db.run("ALTER TABLE task_queue ADD COLUMN options TEXT", (err) => {
          if (err) {
            console.error('Error adding options column:', err);
          } else {
            console.log('Added options column to task_queue table');
          }
        });
      }
    });

    // Check and add last_used column to proxies if it doesn't exist
    this.db.all("PRAGMA table_info(proxies)", (err, columns) => {
      if (err) {
        console.error('Error checking proxies columns:', err);
        return;
      }
      
      const hasLastUsedColumn = columns.some(col => col.name === 'last_used');
      if (!hasLastUsedColumn) {
        this.db.run("ALTER TABLE proxies ADD COLUMN last_used DATETIME", (err) => {
          if (err) {
            console.error('Error adding last_used column:', err);
          } else {
            console.log('Added last_used column to proxies table');
          }
        });
      }
    });
  }

  initializeDefaultSettings() {
    const defaultSettings = [
      { key: 'max_concurrent_profiles', value: '2' },
      { key: 'default_device_type', value: 'PC' },
      { key: 'target_url', value: 'https://example.com' },
      { key: 'mouse_movement_enabled', value: 'true' },
      { key: 'auto_delete_completed', value: 'true' },
      { key: 'profile_timeout_minutes', value: '30' },
      { key: 'adspower_api_url', value: 'http://local.adspower.net:50325' }
    ];

    defaultSettings.forEach(setting => {
      this.db.run(
        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
        [setting.key, setting.value],
        (err) => {
          if (err) console.error(`Error inserting setting ${setting.key}:`, err);
        }
      );
    });
  }

  // Generic query methods
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

module.exports = Database;