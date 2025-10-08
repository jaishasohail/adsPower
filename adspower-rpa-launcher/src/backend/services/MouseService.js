
const AdsPowerService = require('./AdsPowerService');

class MouseService {
  constructor(adsPowerServiceInstance = null) {
    this.isMoving = false;
    this.currentPattern = 'natural';
    this.simulationData = {
      movements: [],
      lastActivity: null
    };
    // Accept AdsPowerService instance for real browser control
    this.adsPowerService = adsPowerServiceInstance || new AdsPowerService();
  }

  // Simulate human-like mouse movements (real browser movement via AdsPower)
  async simulateMouseMovement(profileId, options = {}) {
    const {
      pattern = 'natural',
      duration = 2000,
      intensity = 'medium'
    } = options;

    if (this.isMoving) {
      return { success: false, error: 'Mouse simulation already in progress' };
    }

    this.isMoving = true;
    this.currentPattern = pattern;

    try {
      // Generate movement data based on pattern
      const movements = this.generateMovementPath(pattern, intensity);
      const delayBetweenMoves = duration / movements.length;

      for (let i = 0; i < movements.length; i++) {
        if (!this.isMoving) break;
        const movement = movements[i];

        // Real mouse movement in browser via JS injection
        const script = `window.dispatchEvent(new MouseEvent('mousemove', {clientX: ${movement.x}, clientY: ${movement.y}, bubbles: true}));`;
        await this.adsPowerService.executeScript(profileId, script);

        // Log the simulated movement
        console.log(`Simulated mouse move to: ${movement.x}, ${movement.y}`);
        this.simulationData.movements.push({
          timestamp: new Date(),
          x: movement.x,
          y: movement.y,
          pattern: pattern
        });

        // Simulate human delay
        await this.sleep(delayBetweenMoves + Math.random() * 100);
      }

      this.isMoving = false;
      this.simulationData.lastActivity = new Date();

      return {
        success: true,
        movementCount: movements.length,
        pattern: pattern,
        duration: duration,
        profileId: profileId
      };

    } catch (error) {
      this.isMoving = false;
      console.error('Error in mouse simulation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate movement paths based on different patterns
  generateMovementPath(pattern, intensity = 'medium') {
    const movements = [];
    const screenWidth = 1920;
    const screenHeight = 1080;

    // Adjust movement count based on intensity
    const baseMovements = intensity === 'low' ? 5 : intensity === 'high' ? 20 : 10;

    switch (pattern) {
      case 'natural':
        // Natural human-like movements
        for (let i = 0; i < baseMovements; i++) {
          movements.push({
            x: Math.floor(Math.random() * screenWidth),
            y: Math.floor(Math.random() * screenHeight)
          });
        }
        break;

      case 'browsing':
        // Simulate browsing behavior
        movements.push(
          { x: 200, y: 150 }, // URL bar
          { x: 600, y: 300 }, // Page content
          { x: 400, y: 500 }, // Scroll area
          { x: 800, y: 200 }, // Side content
          { x: 300, y: 600 }  // Footer area
        );
        break;

      case 'scrolling':
        // Vertical scrolling pattern
        for (let i = 0; i < 8; i++) {
          movements.push({
            x: 960 + Math.floor(Math.random() * 100) - 50, // Center area with variation
            y: 100 + (i * 120) + Math.floor(Math.random() * 40)
          });
        }
        break;

      case 'reading':
        // Reading pattern (left to right, top to bottom)
        let y = 200;
        for (let line = 0; line < 6; line++) {
          for (let pos = 0; pos < 3; pos++) {
            movements.push({
              x: 100 + (pos * 300) + Math.floor(Math.random() * 50),
              y: y + Math.floor(Math.random() * 20)
            });
          }
          y += 80;
        }
        break;

      default:
        // Random movements
        for (let i = 0; i < 5; i++) {
          movements.push({
            x: Math.floor(Math.random() * screenWidth),
            y: Math.floor(Math.random() * screenHeight)
          });
        }
    }

    return movements;
  }

  // Simulate scrolling behavior (real browser scroll via AdsPower)
  async simulateScrolling(profileId, options = {}) {
    const {
      direction = 'down',
      distance = 500,
      speed = 'medium'
    } = options;

    try {
      const scrollSteps = Math.floor(Math.abs(distance) / 100);
      const scrollAmount = direction === 'down' ? 100 : -100;

      for (let i = 0; i < scrollSteps; i++) {
        // Real scroll in browser via JS injection
        const script = `window.scrollBy(0, ${scrollAmount});`;
        await this.adsPowerService.executeScript(profileId, script);

        console.log(`Simulated scroll ${direction}: step ${i + 1}/${scrollSteps}`);
        // Vary scroll speed to simulate human behavior
        const delay = speed === 'fast' ? 50 : speed === 'slow' ? 300 : 150;
        await this.sleep(delay + Math.random() * 100);
      }

      return {
        success: true,
        direction: direction,
        distance: distance,
        steps: scrollSteps,
        profileId: profileId
      };

    } catch (error) {
      console.error('Error simulating scrolling:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Simulate typing behavior
  async simulateTyping(profileId, text, options = {}) {
    const {
      speed = 'human'
    } = options;

    try {
      console.log(`Simulating typing: "${text}"`);
      
      // Type with human-like delays
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        console.log(`Typed: ${char}`);
        
        // Human typing speed varies
        const delay = speed === 'fast' ? 50 : speed === 'slow' ? 200 : 100;
        await this.sleep(delay + Math.random() * 50);
      }

      return {
        success: true,
        text: text,
        speed: speed,
        profileId: profileId
      };

    } catch (error) {
      console.error('Error simulating typing:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Simulate click behavior
  async simulateClick(profileId, options = {}) {
    const {
      x = Math.floor(Math.random() * 1920),
      y = Math.floor(Math.random() * 1080),
      button = 'left'
    } = options;

    try {
      console.log(`Simulated ${button} click at: ${x}, ${y}`);
      
      // Add to movement data
      this.simulationData.movements.push({
        timestamp: new Date(),
        x: x,
        y: y,
        action: 'click',
        button: button
      });

      // Small delay to simulate click duration
      await this.sleep(50 + Math.random() * 100);

      return {
        success: true,
        position: { x, y },
        button: button,
        profileId: profileId
      };

    } catch (error) {
      console.error('Error simulating click:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Stop current movement
  stopMovement() {
    this.isMoving = false;
    return { success: true, message: 'Movement simulation stopped' };
  }

  // Get movement statistics
  getMovementStats() {
    return {
      isMoving: this.isMoving,
      currentPattern: this.currentPattern,
      totalMovements: this.simulationData.movements.length,
      lastActivity: this.simulationData.lastActivity,
      availablePatterns: ['natural', 'browsing', 'scrolling', 'reading']
    };
  }

  // Set movement pattern
  setMovementPattern(pattern) {
    const validPatterns = ['natural', 'browsing', 'scrolling', 'reading'];
    if (validPatterns.includes(pattern)) {
      this.currentPattern = pattern;
      return { success: true, pattern: pattern };
    }
    return { success: false, error: 'Invalid pattern' };
  }

  // Get recent movements for analysis
  getRecentMovements(limit = 50) {
    return {
      success: true,
      movements: this.simulationData.movements.slice(-limit),
      totalCount: this.simulationData.movements.length
    };
  }

  // Clear movement history
  clearMovementHistory() {
    this.simulationData.movements = [];
    this.simulationData.lastActivity = null;
    return { success: true, message: 'Movement history cleared' };
  }

  // Utility function for delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Clean up resources (for compatibility)
  async cleanup(profileId) {
    console.log(`Cleaned up mouse simulation for profile: ${profileId}`);
    return { success: true, profileId: profileId };
  }
}

module.exports = MouseService;