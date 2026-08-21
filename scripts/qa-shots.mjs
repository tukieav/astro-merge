import { chromium } from 'playwright';
const URL = process.env.ASTRO_MERGE_URL || 'http://localhost:8524/index.html';
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 600, height: 880 } });
await page.goto(URL + '?debug=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__astroReady === true);
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/qa-menu.png' });
// start game, drop some planets
const b = await page.locator('#game').boundingBox();
await page.mouse.click(b.x + b.width/2, b.y + b.height*0.66);
await page.waitForTimeout(400);
// spawn a nice variety for gameplay shot
await page.evaluate(() => {
  const a = window.__astro;
  a.spawn(5, 130, 600); a.spawn(8, 330, 560); a.spawn(3, 240, 660);
  a.spawn(1, 90, 680); a.spawn(9, 260, 420); a.spawn(2, 430, 660);
  a.spawn(10, 260, 250);
});
await page.waitForTimeout(2200);
await page.screenshot({ path: '/tmp/qa-play.png' });
// merge moment: spawn a same-tier pair and catch mid-FX
await page.evaluate(() => { window.__astro.spawn(4, 200, 500); window.__astro.spawn(4, 210, 560); });
await page.waitForTimeout(260);
await page.screenshot({ path: '/tmp/qa-merge.png' });
await browser.close();
console.log('done');
