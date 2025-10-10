const AdsPowerService = require('./AdsPowerService');
const puppeteer = require('puppeteer-core');

class MouseService {
  // Connect to AdsPower browser via Puppeteer WebSocket
  async connectToBrowser(wsEndpoint) {
    try {
      const browser = await puppeteer.connect({ 
        browserWSEndpoint: wsEndpoint,
        defaultViewport: null
      });
      
      // Wait a bit for pages to load
      await this.sleep(2000);
      
      const pages = await browser.pages();
      console.log(`📄 Found ${pages.length} pages in browser`);
      
      // Try to find the page with content (not blank)
      let page = null;
      for (const p of pages) {
        const url = p.url();
        console.log(`   - Page URL: ${url}`);
        // Skip blank pages, chrome:// pages, etc.
        if (url && !url.startsWith('chrome://') && url !== 'about:blank' && url.startsWith('http')) {
          page = p;
          console.log(`   ✅ Using this page for mouse control`);
          break;
        }
      }
      
      // Fallback to first page if no suitable page found
      if (!page) {
        page = pages[0] || await browser.newPage();
        console.log(`   ⚠️ Using fallback page: ${page.url()}`);
      }
      
      // Bring page to front
      await page.bringToFront();
      
      return { browser, page };
    } catch (error) {
      console.error('Failed to connect to Puppeteer browser:', error.message);
      return null;
    }
  }

  constructor(adsPowerServiceInstance = null) {
    this.isMoving = false;
    this.currentPattern = 'natural';
    this.simulationData = {
      movements: [],
      lastActivity: null
    };
    this.activeSimulations = new Map();
    this.adsPowerService = adsPowerServiceInstance || new AdsPowerService();
    
    // Store Puppeteer connections per profile
    this.puppeteerConnections = new Map();
    
    // Enhanced human profiles with more variation
    this.humanProfiles = {
      cautious: { 
        speedMultiplier: 0.5, 
        pauseFrequency: 0.5, 
        scrollSpeed: 'slow',
        jitterAmount: 'high',
        mistakeRate: 0.1
      },
      normal: { 
        speedMultiplier: 1.0, 
        pauseFrequency: 0.25, 
        scrollSpeed: 'medium',
        jitterAmount: 'medium',
        mistakeRate: 0.05
      },
      fast: { 
        speedMultiplier: 1.8, 
        pauseFrequency: 0.1, 
        scrollSpeed: 'fast',
        jitterAmount: 'low',
        mistakeRate: 0.02
      },
      erratic: { 
        speedMultiplier: 2.2, 
        pauseFrequency: 0.05, 
        scrollSpeed: 'fast',
        jitterAmount: 'high',
        mistakeRate: 0.15
      }
    };
  }

  async startComprehensiveHumanBehavior(adsPowerProfileId, options = {}) {
    const {
      duration = 60000,
      deviceType = 'PC',
      intensity = 'medium',
      wsEndpoint
    } = options;

    if (this.activeSimulations.has(adsPowerProfileId)) {
      console.log(`⚠️ Simulation already running for AdsPower profile ${adsPowerProfileId}`);
      return { success: false, error: 'Simulation already active' };
    }

    try {
      const profiles = Object.keys(this.humanProfiles);
      const randomProfile = profiles[Math.floor(Math.random() * profiles.length)];
      const behaviorProfile = this.humanProfiles[randomProfile];

      console.log(`🎭 Starting human behavior for AdsPower profile ${adsPowerProfileId} (${randomProfile} profile)`);

      // CRITICAL: Connect to Puppeteer at the start
      let puppeteerContext = null;
      if (wsEndpoint) {
        puppeteerContext = await this.connectToBrowser(wsEndpoint);
        if (!puppeteerContext) {
          console.warn('⚠️ Could not connect to Puppeteer browser. Mouse movements will not be visible.');
          return { success: false, error: 'Failed to connect to browser via Puppeteer' };
        }
        this.puppeteerConnections.set(adsPowerProfileId, puppeteerContext);
        console.log(`✅ Puppeteer connected for profile ${adsPowerProfileId}`);
      } else {
        console.warn('⚠️ No wsEndpoint provided. Mouse movements will not be visible.');
        return { success: false, error: 'wsEndpoint required for mouse movements' };
      }

      const simulation = {
        adsPowerProfileId,
        startTime: Date.now(),
        duration,
        behaviorProfile: randomProfile,
        isActive: true,
        activities: []
      };

      this.activeSimulations.set(adsPowerProfileId, simulation);

      // Run behavior loop in background
      this.runBehaviorLoop(adsPowerProfileId, simulation, behaviorProfile, deviceType, intensity, options);

      return {
        success: true,
        profileId: adsPowerProfileId,
        behaviorProfile: randomProfile,
        duration,
        message: 'Human behavior simulation started with Puppeteer'
      };

    } catch (error) {
      console.error(`Error starting human behavior for ${adsPowerProfileId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async runBehaviorLoop(adsPowerProfileId, simulation, behaviorProfile, deviceType, intensity, options = {}) {
    try {
      // Variable wait time before starting activities (browser load time)
      const initialWait = Math.floor(Math.random() * 3000) + 2000;
      console.log(`⏳ Waiting ${initialWait}ms before starting activities...`);
      await this.sleep(initialWait);

      while (simulation.isActive && (Date.now() - simulation.startTime) < simulation.duration) {

        // More realistic activity distribution
        const activities = [
          { name: 'mouse_movement', weight: 35 },
          { name: 'scrolling', weight: 30 },
          { name: 'reading_pause', weight: 20 },
          { name: 'click', weight: 8 },
          { name: 'hover', weight: 7 }
        ];

        const activity = this.weightedRandomChoice(activities);

        console.log(`🎯 AdsPower Profile ${adsPowerProfileId}: Performing ${activity}`);
        simulation.activities.push({ activity, timestamp: Date.now() });

        try {
          switch (activity) {
            case 'mouse_movement':
              await this.performMouseMovement(adsPowerProfileId, behaviorProfile, deviceType);
              break;
            case 'scrolling':
              await this.performScrolling(adsPowerProfileId, behaviorProfile);
              break;
            case 'reading_pause':
              await this.performReadingPause(behaviorProfile);
              break;
            case 'click':
              await this.performClick(adsPowerProfileId, behaviorProfile);
              break;
            case 'hover':
              await this.performHover(adsPowerProfileId, behaviorProfile);
              break;
          }
        } catch (activityError) {
          console.warn(`⚠️ Activity error for ${adsPowerProfileId}:`, activityError.message);
        }

        // More varied pause durations
        const pauseDuration = this.getRandomPause(behaviorProfile);
        await this.sleep(pauseDuration);

        // More realistic long pauses (thinking/reading)
        if (Math.random() < behaviorProfile.pauseFrequency) {
          const longPause = Math.floor(Math.random() * 4000) + 2000;
          console.log(`⏸️ AdsPower Profile ${adsPowerProfileId}: Taking ${Math.round(longPause/1000)}s pause (reading/thinking)`);
          await this.sleep(longPause);
        }
      }

      console.log(`✅ Human behavior simulation completed for AdsPower profile ${adsPowerProfileId}`);
      this.activeSimulations.delete(adsPowerProfileId);

    } catch (error) {
      console.error(`Error in behavior loop for ${adsPowerProfileId}:`, error);
      this.activeSimulations.delete(adsPowerProfileId);
    }
  }

  async performMouseMovement(adsPowerProfileId, behaviorProfile, deviceType) {
    try {
      const puppeteerContext = this.puppeteerConnections.get(adsPowerProfileId);
      if (!puppeteerContext || !puppeteerContext.page) {
        console.warn('⚠️ No Puppeteer connection for mouse movement');
        return;
      }
      const page = puppeteerContext.page;
      if (page.isClosed()) {
        console.warn('⚠️ Page is closed, skipping mouse movement');
        return;
      }
      // Get viewport size
      const viewport = await page.evaluate(() => {
        return {
          width: window.innerWidth,
          height: window.innerHeight
        };
      });
      const screenWidth = viewport.width;
      const screenHeight = viewport.height;

      // Advanced: Move around elements (image, h2, p, ads)
      const elementSelectors = ['img', 'h2', 'p', '[class*=ad], [id*=ad], .ads, .ad'];
      let elements = await page.evaluate((selectors) => {
        let found = [];
        selectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 30 && rect.height > 15) {
              found.push({ x: rect.left + rect.width/2, y: rect.top + rect.height/2, width: rect.width, height: rect.height });
            }
          });
        });
        return found;
      }, elementSelectors);

      // Fallback: If no elements, just random points
      if (!elements || elements.length === 0) {
        elements = [
          { x: screenWidth/2, y: screenHeight/2, width: 200, height: 100 }
        ];
      }

      // Pick a random element to move around
      const el = elements[Math.floor(Math.random() * elements.length)];
      // Move in a loop around the element (ellipse path)
      const centerX = el.x;
      const centerY = el.y;
      const a = el.width/2 + 30 + Math.random()*30; // ellipse radii
      const b = el.height/2 + 20 + Math.random()*20;
      const steps = 24 + Math.floor(Math.random()*12);
      const startAngle = Math.random() * 2 * Math.PI;
      for (let i = 0; i < steps; i++) {
        if (page.isClosed()) return;
        // Vary speed: sometimes slow, sometimes fast
        let speedMultiplier = behaviorProfile.speedMultiplier;
        if (Math.random() < 0.3) speedMultiplier *= 0.5 + Math.random();
        if (Math.random() < 0.2) speedMultiplier *= 1.5 + Math.random();
        const angle = startAngle + (2 * Math.PI * i / steps);
        let x = centerX + a * Math.cos(angle);
        let y = centerY + b * Math.sin(angle);
        // Add jitter
        const jitter = this.getJitter(behaviorProfile.jitterAmount);
        x = Math.max(0, Math.min(screenWidth, x + jitter.x));
        y = Math.max(0, Math.min(screenHeight, y + jitter.y));
        try {
          await page.mouse.move(x, y);
        } catch (error) {
          if (error.message.includes('Target closed') || error.message.includes('Session closed')) return;
          throw error;
        }
        let delay = this.getVariableSpeed(speedMultiplier);
        if (Math.random() < 0.1) delay += Math.floor(Math.random()*100)+50;
        await this.sleep(delay);
      }

      // Sometimes pause to "read" paragraph
      if (Math.random() < 0.5 && elements.length > 2) {
        const p = elements.find(e => e.width > 100 && e.height > 20);
        if (p) {
          await page.mouse.move(p.x, p.y);
          const pause = 1200 + Math.random()*2000;
          console.log('📖 Pausing to read paragraph');
          await this.sleep(pause);
        }
      }

      // Sometimes move to ad area
      if (Math.random() < 0.4 && elements.length > 3) {
        const ad = elements.find(e => e.width > 60 && e.height > 20);
        if (ad) {
          await page.mouse.move(ad.x, ad.y);
          await this.sleep(400 + Math.random()*800);
        }
      }

      // Sometimes move to heading
      if (Math.random() < 0.3 && elements.length > 1) {
        const h = elements[1];
        await page.mouse.move(h.x, h.y);
        await this.sleep(300 + Math.random()*600);
      }

      // Sometimes move randomly
      if (Math.random() < 0.3) {
        const rx = Math.random() * screenWidth;
        const ry = Math.random() * screenHeight;
        await page.mouse.move(rx, ry);
        await this.sleep(200 + Math.random()*400);
      }

      console.log(`✅ Advanced mouse movement completed`);
    } catch (error) {
      if (!error.message.includes('Target closed') && !error.message.includes('Session closed')) {
        console.error(`Mouse movement error for ${adsPowerProfileId}:`, error.message);
      }
    }
  }

  async performScrolling(adsPowerProfileId, behaviorProfile) {
    try {
      const puppeteerContext = this.puppeteerConnections.get(adsPowerProfileId);
      if (!puppeteerContext || !puppeteerContext.page) {
        console.warn('⚠️ No Puppeteer connection for scrolling');
        return;
      }
      const page = puppeteerContext.page;
      if (page.isClosed()) {
        console.warn('⚠️ Page is closed, skipping scrolling');
        return;
      }
      // Pick scroll type: 0=wheel, 1=drag, 2=scrollbar, 3=mobile swipe
      let scrollType = Math.floor(Math.random()*3);
      if (Math.random() < 0.15 && (await page.evaluate(() => /Mobi|Android/i.test(navigator.userAgent)))) {
        scrollType = 3; // mobile swipe
      }
      const direction = Math.random() > 0.75 ? 'up' : 'down';
      const totalDistance = Math.floor(Math.random() * 1200) + 300;
      let scrollAmounts = [];
      let remaining = totalDistance;
      while (remaining > 0) {
        let amount;
        if (Math.random() < 0.2) {
          amount = Math.min(remaining, Math.floor(Math.random() * 300) + 200);
        } else {
          amount = Math.min(remaining, Math.floor(Math.random() * 120) + 40);
        }
        scrollAmounts.push(amount);
        remaining -= amount;
      }
      console.log(`📜 Scrolling (${['wheel','drag','scrollbar','mobile'][scrollType]}) ${direction} ${totalDistance}px in ${scrollAmounts.length} steps`);
      if (scrollType === 0) {
        // Mouse wheel: cursor stays in place
        const viewport = await page.evaluate(() => ({width: window.innerWidth, height: window.innerHeight}));
        const x = Math.floor(viewport.width/2 + (Math.random()-0.5)*100);
        const y = Math.floor(viewport.height/2 + (Math.random()-0.5)*100);
        await page.mouse.move(x, y);
        for (let i = 0; i < scrollAmounts.length; i++) {
          if (page.isClosed()) return;
          const amount = scrollAmounts[i] * (direction === 'up' ? -1 : 1);
          try { await page.mouse.wheel({ deltaY: amount }); } catch (error) { if (error.message.includes('Target closed') || error.message.includes('Session closed')) return; throw error; }
          let delay = this.getScrollDelay(behaviorProfile.scrollSpeed);
          if (Math.random() < 0.3) delay += Math.floor(Math.random() * 800) + 300;
          await this.sleep(delay);
        }
      } else if (scrollType === 1) {
        // Click and drag: cursor moves with scroll
        const viewport = await page.evaluate(() => ({width: window.innerWidth, height: window.innerHeight}));
        let x = Math.floor(viewport.width/2 + (Math.random()-0.5)*100);
        let y = Math.floor(viewport.height/2 + (Math.random()-0.5)*100);
        await page.mouse.move(x, y);
        await page.mouse.down();
        for (let i = 0; i < scrollAmounts.length; i++) {
          if (page.isClosed()) { await page.mouse.up(); return; }
          const amount = scrollAmounts[i] * (direction === 'up' ? -1 : 1);
          y += amount/6 + (Math.random()-0.5)*10;
          y = Math.max(0, Math.min(viewport.height-5, y));
          await page.mouse.move(x, y);
          await page.evaluate((dy) => window.scrollBy(0, dy), amount);
          let delay = this.getScrollDelay(behaviorProfile.scrollSpeed);
          if (Math.random() < 0.3) delay += Math.floor(Math.random() * 800) + 300;
          await this.sleep(delay);
        }
        await page.mouse.up();
      } else if (scrollType === 2) {
        // Scrollbar: move mouse to right edge, drag up/down
        const viewport = await page.evaluate(() => ({width: window.innerWidth, height: window.innerHeight}));
        let x = viewport.width - 8 - Math.floor(Math.random()*6);
        let y = Math.floor(viewport.height/3 + Math.random()*viewport.height/3);
        await page.mouse.move(x, y);
        await page.mouse.down();
        for (let i = 0; i < scrollAmounts.length; i++) {
          if (page.isClosed()) { await page.mouse.up(); return; }
          const amount = scrollAmounts[i] * (direction === 'up' ? -1 : 1);
          y += amount/8 + (Math.random()-0.5)*8;
          y = Math.max(0, Math.min(viewport.height-5, y));
          await page.mouse.move(x, y);
          await page.evaluate((dy) => window.scrollBy(0, dy), amount);
          let delay = this.getScrollDelay(behaviorProfile.scrollSpeed);
          if (Math.random() < 0.3) delay += Math.floor(Math.random() * 800) + 300;
          await this.sleep(delay);
        }
        await page.mouse.up();
      } else if (scrollType === 3) {
        // Mobile swipe: use touch events
        const viewport = await page.evaluate(() => ({width: window.innerWidth, height: window.innerHeight}));
        let x = Math.floor(viewport.width/2 + (Math.random()-0.5)*60);
        let y = Math.floor(viewport.height/2 + (Math.random()-0.5)*60);
        for (let i = 0; i < scrollAmounts.length; i++) {
          if (page.isClosed()) return;
          const amount = scrollAmounts[i] * (direction === 'up' ? -1 : 1);
          const y2 = Math.max(0, Math.min(viewport.height-5, y + amount/5 + (Math.random()-0.5)*10));
          await page.touchscreen.tap(x, y);
          await page.evaluate((y1, y2) => {
            const touchObj = new Touch({ identifier: 0, target: document.body, clientX: y1, clientY: y2 });
            const touchstart = new TouchEvent('touchstart', { touches: [touchObj] });
            const touchmove = new TouchEvent('touchmove', { touches: [touchObj] });
            const touchend = new TouchEvent('touchend', { touches: [] });
            document.body.dispatchEvent(touchstart);
            document.body.dispatchEvent(touchmove);
            document.body.dispatchEvent(touchend);
            window.scrollBy(0, y2-y1);
          }, y, y2);
          y = y2;
          let delay = this.getScrollDelay(behaviorProfile.scrollSpeed);
          if (Math.random() < 0.3) delay += Math.floor(Math.random() * 800) + 300;
          await this.sleep(delay);
        }
      }
      console.log(`✅ Advanced scrolling completed`);
    } catch (error) {
      if (!error.message.includes('Target closed') && !error.message.includes('Session closed')) {
        console.error(`Scrolling error for ${adsPowerProfileId}:`, error.message);
      }
    }
  }

  async performReadingPause(behaviorProfile) {
    const basePause = 1500;
    const variablePause = Math.floor(Math.random() * 5000);
    const speedAdjustment = 1 / behaviorProfile.speedMultiplier;
    const totalPause = Math.floor((basePause + variablePause) * speedAdjustment);
    
    console.log(`📖 Reading pause: ${Math.round(totalPause/1000)}s`);
    await this.sleep(totalPause);
  }

  async performClick(adsPowerProfileId, behaviorProfile) {
    try {
      const puppeteerContext = this.puppeteerConnections.get(adsPowerProfileId);
      if (!puppeteerContext || !puppeteerContext.page) {
        console.warn('⚠️ No Puppeteer connection for clicking');
        return;
      }

      const page = puppeteerContext.page;
      
      const viewport = await page.evaluate(() => {
        return {
          width: window.innerWidth,
          height: window.innerHeight
        };
      });

      const clickTypes = [
        { type: 'center', x: () => Math.floor(Math.random() * (viewport.width * 0.4)) + viewport.width * 0.3, y: () => Math.floor(Math.random() * (viewport.height * 0.4)) + viewport.height * 0.3 },
        { type: 'left', x: () => Math.floor(Math.random() * (viewport.width * 0.3)) + 100, y: () => Math.floor(Math.random() * (viewport.height * 0.6)) + 100 },
        { type: 'top', x: () => Math.floor(Math.random() * (viewport.width * 0.5)) + viewport.width * 0.25, y: () => Math.floor(Math.random() * 200) + 50 }
      ];

      const clickType = clickTypes[Math.floor(Math.random() * clickTypes.length)];
      let x = clickType.x();
      let y = clickType.y();

      // Simulate "mistakes" - click slightly off target sometimes
      if (Math.random() < behaviorProfile.mistakeRate) {
        const missDistance = Math.floor(Math.random() * 30) + 10;
        x += Math.random() < 0.5 ? missDistance : -missDistance;
        y += Math.random() < 0.5 ? missDistance : -missDistance;
        console.log(`🎯 Simulating imperfect click (human error)`);
      }

      // CRITICAL FIX: Use Puppeteer's real mouse click
      await page.mouse.move(x, y);
      await this.sleep(100 + Math.floor(Math.random() * 100)); // Human delay before click
      await page.mouse.down();
      await this.sleep(50 + Math.floor(Math.random() * 50)); // Mouse down duration
      await page.mouse.up();
      
      console.log(`🖱️ Clicked at (${Math.round(x)}, ${Math.round(y)}) - ${clickType.type}`);
      
      // Variable delay after click
      const afterClickDelay = Math.floor(Math.random() * 500) + 200;
      await this.sleep(afterClickDelay);

    } catch (error) {
      console.error(`Click error for ${adsPowerProfileId}:`, error.message);
    }
  }

  async performHover(adsPowerProfileId, behaviorProfile) {
    try {
      const puppeteerContext = this.puppeteerConnections.get(adsPowerProfileId);
      if (!puppeteerContext || !puppeteerContext.page) {
        console.warn('⚠️ No Puppeteer connection for hovering');
        return;
      }

      const page = puppeteerContext.page;
      
      const viewport = await page.evaluate(() => {
        return {
          width: window.innerWidth,
          height: window.innerHeight
        };
      });

      const centerX = Math.floor(Math.random() * (viewport.width * 0.6)) + viewport.width * 0.2;
      const centerY = Math.floor(Math.random() * (viewport.height * 0.6)) + viewport.height * 0.2;
      const hoverDuration = Math.floor(Math.random() * 3000) + 1500;
      const startTime = Date.now();

      console.log(`🎯 Hovering near (${Math.round(centerX)}, ${Math.round(centerY)})`);

      while (Date.now() - startTime < hoverDuration) {
        // More natural hover movement pattern
        const offsetX = Math.floor(Math.random() * 60) - 30;
        const offsetY = Math.floor(Math.random() * 60) - 30;
        const x = centerX + offsetX;
        const y = centerY + offsetY;

        // CRITICAL FIX: Use Puppeteer's real mouse movement
        await page.mouse.move(x, y);
        
        // Variable hover speed
        const delay = Math.floor(Math.random() * 200) + 80;
        await this.sleep(delay);
      }

      console.log(`✅ Hover completed`);

    } catch (error) {
      console.error(`Hover error for ${adsPowerProfileId}:`, error.message);
    }
  }

  generateBezierPath(x1, y1, x2, y2, steps) {
    const path = [];
    
    const curvature = 0.2 + Math.random() * 0.3;
    const cx1 = x1 + (x2 - x1) * curvature + (Math.random() * 300 - 150);
    const cy1 = y1 + (y2 - y1) * curvature + (Math.random() * 300 - 150);
    const cx2 = x1 + (x2 - x1) * (1 - curvature) + (Math.random() * 300 - 150);
    const cy2 = y1 + (y2 - y1) * (1 - curvature) + (Math.random() * 300 - 150);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      
      const x = Math.pow(1 - t, 3) * x1 +
                3 * Math.pow(1 - t, 2) * t * cx1 +
                3 * (1 - t) * Math.pow(t, 2) * cx2 +
                Math.pow(t, 3) * x2;
                
      const y = Math.pow(1 - t, 3) * y1 +
                3 * Math.pow(1 - t, 2) * t * cy1 +
                3 * (1 - t) * Math.pow(t, 2) * cy2 +
                Math.pow(t, 3) * y2;

      path.push({ 
        x: Math.round(x), 
        y: Math.round(y) 
      });
    }

    return path;
  }

  getJitter(jitterAmount) {
    const amounts = {
      low: 2,
      medium: 4,
      high: 7
    };
    
    const max = amounts[jitterAmount] || amounts.medium;
    
    return {
      x: Math.floor(Math.random() * (max * 2)) - max,
      y: Math.floor(Math.random() * (max * 2)) - max
    };
  }

  getVariableSpeed(speedMultiplier) {
    // CRITICAL FIX: Much slower speeds so movements are visible
    const baseDelay = 50; // CHANGED: From 12ms to 50ms for visibility
    const randomFactor = 0.8 + (Math.random() * 0.4); // 0.8-1.2 range
    const delay = Math.floor(baseDelay * randomFactor / speedMultiplier);
    return Math.max(20, delay); // CHANGED: Minimum 20ms instead of 3ms
  }

  getScrollDelay(scrollSpeed) {
    const delays = {
      slow: { min: 250, max: 500 },
      medium: { min: 120, max: 300 },
      fast: { min: 60, max: 180 }
    };

    const range = delays[scrollSpeed] || delays.medium;
    return Math.floor(Math.random() * (range.max - range.min)) + range.min;
  }

  getRandomPause(behaviorProfile) {
    const basePause = 200;
    const variablePause = Math.floor(Math.random() * 800);
    return Math.floor((basePause + variablePause) / behaviorProfile.speedMultiplier);
  }

  weightedRandomChoice(items) {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of items) {
      random -= item.weight;
      if (random <= 0) {
        return item.name;
      }
    }
    
    return items[0].name;
  }

  stopSimulation(adsPowerProfileId) {
    const simulation = this.activeSimulations.get(adsPowerProfileId);
    if (simulation) {
      simulation.isActive = false;
      this.activeSimulations.delete(adsPowerProfileId);
      
      // Close Puppeteer connection
      const puppeteerContext = this.puppeteerConnections.get(adsPowerProfileId);
      if (puppeteerContext && puppeteerContext.browser) {
        puppeteerContext.browser.disconnect();
        this.puppeteerConnections.delete(adsPowerProfileId);
      }
      
      console.log(`🛑 Stopped simulation for AdsPower profile ${adsPowerProfileId}`);
      return { success: true, message: 'Simulation stopped' };
    }
    return { success: false, error: 'No active simulation found' };
  }

  getSimulationStats(adsPowerProfileId) {
    const simulation = this.activeSimulations.get(adsPowerProfileId);
    if (!simulation) {
      return { success: false, error: 'No active simulation' };
    }

    const elapsed = Date.now() - simulation.startTime;
    const remaining = Math.max(0, simulation.duration - elapsed);

    return {
      success: true,
      profileId: adsPowerProfileId,
      behaviorProfile: simulation.behaviorProfile,
      elapsed: Math.round(elapsed / 1000),
      remaining: Math.round(remaining / 1000),
      totalDuration: Math.round(simulation.duration / 1000),
      activitiesPerformed: simulation.activities.length,
      isActive: simulation.isActive
    };
  }

  getAllActiveSimulations() {
    return Array.from(this.activeSimulations.entries()).map(([adsPowerProfileId, sim]) => ({
      adsPowerProfileId,
      behaviorProfile: sim.behaviorProfile,
      elapsed: Math.round((Date.now() - sim.startTime) / 1000),
      activitiesCount: sim.activities.length
    }));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup(adsPowerProfileId) {
    this.stopSimulation(adsPowerProfileId);
    console.log(`✅ Cleaned up mouse simulation for AdsPower profile: ${adsPowerProfileId}`);
    return { success: true, profileId: adsPowerProfileId };
  }

  // Legacy methods (kept for backward compatibility)
  async simulateMouseMovement(adsPowerProfileId, options = {}) {
    return this.performMouseMovement(adsPowerProfileId, this.humanProfiles.normal, 'PC');
  }

  async simulateScrolling(adsPowerProfileId, options = {}) {
    return this.performScrolling(adsPowerProfileId, this.humanProfiles.normal);
  }

  async simulateClick(adsPowerProfileId, options = {}) {
    return this.performClick(adsPowerProfileId, this.humanProfiles.normal);
  }
}

module.exports = MouseService;