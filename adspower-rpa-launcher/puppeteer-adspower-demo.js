// puppeteer-adspower-demo.js
// Demo: Connect Puppeteer to AdsPower browser and perform mouse movement and scrolling

const AdsPowerService = require('./src/backend/services/AdsPowerService');

async function puppeteerMouseAndScrollDemo(profileId) {
  const adsPowerService = new AdsPowerService();

  // 1. Get DevTools WebSocket endpoint for the running AdsPower profile
  const wsEndpoint = await adsPowerService.getDevToolsWsEndpoint(profileId);
  if (!wsEndpoint) {
    console.error('Could not get DevTools WebSocket endpoint for profile:', profileId);
    return;
  }

  // 2. Connect Puppeteer to the AdsPower browser
  const browser = await adsPowerService.connectPuppeteer(wsEndpoint);
  const pages = await browser.pages();
  const page = pages[0]; // Use the first tab

  // 3. Mouse movement demo
  await page.mouse.move(100, 100);
  await page.waitForTimeout(500);
  await page.mouse.move(400, 400);
  await page.waitForTimeout(500);

  // 4. Scrolling demo
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(500);

  // 5. (Optional) More actions...

  // 6. Do not close the browser, as AdsPower manages it
  // await browser.disconnect();
  console.log('✅ Puppeteer mouse and scroll demo complete.');
}

// Usage: node puppeteer-adspower-demo.js <profileId>
if (require.main === module) {
  const profileId = process.argv[2];
  if (!profileId) {
    console.error('Usage: node puppeteer-adspower-demo.js <profileId>');
    process.exit(1);
  }
  puppeteerMouseAndScrollDemo(profileId).catch(console.error);
}
