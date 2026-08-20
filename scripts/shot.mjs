import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 600, height: 880 } });
await page.goto(process.argv[2] || 'http://localhost:8511/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__astroReady === true);
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/am-menu.png' });
await page.evaluate(() => window.__astro.openOverlay('shop'));
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/am-shop.png' });
await page.evaluate(() => window.__astro.closeOverlay());
const b = await page.locator('#game').boundingBox();
await page.mouse.click(b.x + b.width/2, b.y + b.height*0.62);
await page.waitForTimeout(300);
for (let i=0;i<4;i++){ await page.keyboard.down('Space'); await page.waitForTimeout(120); await page.keyboard.up('Space'); await page.waitForTimeout(500); }
await page.screenshot({ path: '/tmp/am-play.png' });
await browser.close();
console.log('shots done');
