// Marketing kit generator: gameplay screenshots plus clean, title-only covers.
import { chromium } from 'playwright';
const URL = process.env.ASTRO_MERGE_URL || 'http://localhost:8524/index.html';

const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' });

// ---------- 1920x1080 screenshots ----------
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(URL + '?debug=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__astroReady === true);
await page.waitForTimeout(900);
await page.screenshot({ path: 'marketing/screenshot-menu.png' });

const b = await page.locator('#game').boundingBox();
await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.66);
await page.waitForTimeout(400);
// The cover is a clean gameplay composition, not an onboarding capture.
await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.16);
await page.waitForTimeout(650);
await page.evaluate(() => {
  const a = window.__astro;
  a.addScore(1240);
  a.spawn(5, 130, 600); a.spawn(8, 330, 560); a.spawn(3, 240, 660);
  a.spawn(1, 90, 680); a.spawn(9, 260, 420); a.spawn(2, 430, 660);
  a.spawn(10, 260, 250); a.spawn(4, 60, 560); a.spawn(6, 440, 480);
});
await page.waitForTimeout(2400);
await page.screenshot({ path: 'marketing/screenshot-gameplay.png' });
// merge action shot
await page.evaluate(() => { window.__astro.spawn(4, 200, 500); window.__astro.spawn(4, 210, 560); });
await page.waitForTimeout(240);
await page.screenshot({ path: 'marketing/screenshot-action.png' });
await page.close();

// ---------- covers: procedural art has no HUD, cursor or secondary copy ----------
async function cover(w, h, out, query = '') {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.goto(`file://${process.cwd()}/marketing/cover.html?w=${w}&h=${h}${query}`, { waitUntil: 'load' });
  const el = await p.locator('#cover');
  await el.screenshot({ path: out });
  await p.close();
  console.log('cover', out);
}
await cover(1920, 1080, 'marketing/cover-16x9.png');
await cover(800, 450, 'marketing/cover-16x9-small.png');
await cover(800, 800, 'marketing/cover-1x1.png', '&sq=1');
await cover(800, 1200, 'marketing/cover-2x3.png', '&portrait=1');

await browser.close();
console.log('marketing kit done');
