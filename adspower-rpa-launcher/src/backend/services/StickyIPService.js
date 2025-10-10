const fs = require('fs');
const path = require('path');
const axios = require('axios');

class StickyIPService {
  constructor(options = {}) {
    this.logFilePath = options.logFilePath || path.resolve(process.cwd(), 'sticky_ip_log.txt');
    this.pollIntervalMs = options.pollIntervalMs || 1000; // optimized stable frequency
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.currentIp = null;
    this.lastStableIp = null;
    this.listeners = new Set();
    this.timer = null;
    this.ipHistory = new Set();
    this._loadHistory();
  }

  _loadHistory() {
    try {
      if (fs.existsSync(this.logFilePath)) {
        const content = fs.readFileSync(this.logFilePath, 'utf-8');
        content.split(/\r?\n/).forEach(line => {
          const ip = (line || '').trim();
          if (ip) this.ipHistory.add(ip);
        });
      }
    } catch (e) {
      console.warn('⚠️ StickyIP: Failed to load history:', e.message);
    }
  }

  async _appendToLog(ip) {
    try {
      fs.appendFileSync(this.logFilePath, `${ip}\n`);
    } catch (e) {
      console.warn('⚠️ StickyIP: Failed to write to log:', e.message);
    }
  }

  hasIpBeenUsed(ip) {
    return this.ipHistory.has(ip);
  }

  async markIpUsed(ip) {
    if (!ip || this.ipHistory.has(ip)) return;
    this.ipHistory.add(ip);
    await this._appendToLog(ip);
  }

  async getCurrentIP() {
    // Try primary provider, then fallback to another
    try {
      const res = await axios.get('https://api.ipify.org?format=json', { timeout: 4000 });
      return res.data && res.data.ip ? res.data.ip : null;
    } catch (e1) {
      try {
        const res2 = await axios.get('https://ifconfig.me/ip', { timeout: 4000 });
        return typeof res2.data === 'string' ? res2.data.trim() : null;
      } catch (e2) {
        // network delay or temporary error; return last known IP if available
        console.warn('⚠️ StickyIP: IP detection error; using last known IP');
        return this.currentIp || null;
      }
    }
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _emitChange(oldIp, newIp) {
    for (const listener of this.listeners) {
      try { listener({ oldIp, newIp }); } catch (_) {}
    }
  }

  startMonitoring() {
    if (!this.enabled || this.timer) return;
    console.log('🧲 StickyIP: Monitoring started');
    this.timer = setInterval(async () => {
      try {
        const ip = await this.getCurrentIP();
        if (!ip) return;
        if (this.currentIp === null) {
          this.currentIp = ip;
          this.lastStableIp = ip;
          await this._appendToLog(ip);
          console.log(`🧲 StickyIP: Initial IP detected ${ip}`);
          return;
        }
        if (ip !== this.currentIp) {
          const old = this.currentIp;
          this.currentIp = ip;
          await this._appendToLog(ip);
          console.log(`🧲 StickyIP: IP change detected ${old} -> ${ip}`);
          this._emitChange(old, ip);
        }
      } catch (e) {
        // swallow errors to keep loop alive
      }
    }, this.pollIntervalMs);
  }

  stopMonitoring() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('🧲 StickyIP: Monitoring stopped');
    }
  }

  async ensureStableBeforeLaunch() {
    if (!this.enabled) return { proceed: true, ip: await this.getCurrentIP() };
    const baseline = await this.getCurrentIP();
    if (!baseline) return { proceed: false, reason: 'No IP detected' };
    // quick recheck to catch immediate changes
    await new Promise(r => setTimeout(r, Math.max(200, this.pollIntervalMs)));
    const recheck = await this.getCurrentIP();
    if (recheck !== baseline) {
      console.log('🧲 StickyIP: IP changed – browser launch aborted.');
      return { proceed: false, reason: 'IP changed', ip: recheck, baseline };
    }
    return { proceed: true, ip: baseline };
  }
}

module.exports = StickyIPService;


