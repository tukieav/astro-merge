// Marketing kit generator: 1920x1080 screenshots + covers (16:9, 1:1, 2:3)
// Covers = real gameplay screenshot as background + neon title.
import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' });

// ---------- 1920x1080 screenshots ----------
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('http://localhost:8524/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__astroReady === true);
await page.waitForTimeout(900);
await page.screenshot({ path: 'marketing/screenshot-menu.png' });

const b = await page.locator('#game').boundingBox();
await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.66);
await page.waitForTimeout(400);
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

// ---------- covers: gameplay bg + title ----------
const shot = fs.readFileSync('marketing/screenshot-gameplay.png').toString('base64');
async function cover(w, h, out, titleScale = 1) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<html><body style="margin:0"><canvas id="c" width="${w}" height="${h}"></canvas><script>
    const g = document.getElementById('c').getContext('2d');
    const img = new Image();
    img.onload = () => {
      // cover-fit crop centered on the action (game canvas is centered)
      const s = Math.max(${w} / img.width, ${h} / img.height) * 1.35;
      const dw = img.width * s, dh = img.height * s;
      g.drawImage(img, (${w} - dw) / 2, (${h} - dh) / 2 - dh * 0.02, dw, dh);
      // vignette
      const v = g.createRadialGradient(${w}/2, ${h}/2, Math.min(${w},${h})*0.3, ${w}/2, ${h}/2, Math.max(${w},${h})*0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(2,4,12,0.75)');
      g.fillStyle = v; g.fillRect(0,0,${w},${h});
      // bottom gradient for title
      const bg = g.createLinearGradient(0, ${h}*0.55, 0, ${h});
      bg.addColorStop(0,'rgba(2,4,12,0)'); bg.addColorStop(1,'rgba(2,4,12,0.8)');
      g.fillStyle = bg; g.fillRect(0, ${h}*0.55, ${w}, ${h}*0.45);
      // title
      const fs1 = Math.min(${w}*0.115, ${h}*0.16) * ${titleScale};
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#6a8dff'; g.shadowBlur = fs1*0.5;
      g.fillStyle = '#ffffff';
      g.font = '900 ' + fs1 + "px 'Segoe UI', sans-serif";
      g.fillText('ASTRO MERGE', ${w}/2, ${h}*0.82);
      g.shadowColor = '#ffd84a'; g.shadowBlur = fs1*0.25;
      g.fillStyle = '#ffd84a';
      g.font = '600 ' + (fs1*0.32) + "px 'Segoe UI', sans-serif";
      g.fillText('MERGE PLANETS \\u2022 BUILD THE SUN', ${w}/2, ${h}*0.82 + fs1*0.75);
      window.__done = true;
    };
    img.src = 'data:image/png;base64,${shot}';
  <\/script></body></html>`);
  await p.waitForFunction(() => window.__done === true);
  const el = await p.locator('#c');
  await el.screenshot({ path: out });
  await p.close();
  console.log('cover', out);
}
await cover(1920, 1080, 'marketing/cover-16x9.png');
await cover(800, 800, 'marketing/cover-1x1.png');
await cover(800, 1200, 'marketing/cover-2x3.png', 0.9);

await browser.close();
console.log('marketing kit done');
