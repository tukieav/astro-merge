// Record gameplay preview videos: landscape 1280x720 and portrait 720x1280, <20s
import { chromium } from 'playwright';

async function record(w, h, out) {
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' });
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    recordVideo: { dir: '/tmp/amvid', size: { width: w, height: h } },
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8524/index.html?debug=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__astroReady === true);
  await page.waitForTimeout(1200); // menu with animated solar system
  const b = await page.locator('#game').boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.66);
  await page.waitForTimeout(500);
  // scripted juicy session: drops + forced merges
  const gx = (x) => b.x + (x / 520) * b.width;
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(gx(120 + i * 70), b.y + b.height * 0.1);
    await page.waitForTimeout(320);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(650);
  }
  // cascade of merges
  await page.evaluate(() => { const a = window.__astro; a.spawn(2, 200, 300); a.spawn(2, 210, 380); });
  await page.waitForTimeout(1400);
  await page.evaluate(() => { const a = window.__astro; a.spawn(4, 260, 300); a.spawn(4, 270, 380); });
  await page.waitForTimeout(1400);
  await page.evaluate(() => { const a = window.__astro; a.spawn(6, 260, 250); a.spawn(6, 275, 350); });
  await page.waitForTimeout(1600);
  await page.evaluate(() => { const a = window.__astro; a.spawn(8, 260, 200); a.spawn(8, 275, 320); });
  await page.waitForTimeout(2000);
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(gx(160 + i * 90), b.y + b.height * 0.1);
    await page.waitForTimeout(300);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(800);
  const video = page.video();
  await ctx.close();
  const path = await video.path();
  await browser.close();
  console.log(out, '<-', path);
  return path;
}

const land = await record(1280, 720, 'landscape');
const port = await record(720, 1280, 'portrait');
console.log(JSON.stringify({ land, port }));
