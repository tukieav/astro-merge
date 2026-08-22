// Record fresh gameplay, then prepend the matching submission cover. Published
// clips are 19 seconds, silent and start with the exact cover frame for 0.7s.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const URL = process.env.ASTRO_MERGE_URL || 'http://localhost:8524/index.html';

async function record(w, h, out) {
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' });
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    recordVideo: { dir: '/tmp/amvid', size: { width: w, height: h } },
  });
  const page = await ctx.newPage();
  await page.goto(URL + '?debug=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__astroReady === true);
  const b = await page.locator('#game').boundingBox();
  await page.evaluate(() => window.__astro.pressButton('PLAY'));
  await page.waitForFunction(() => window.__astro.getState().state === 'playing');
  // Clear the one-time onboarding from the recording before the publish trim.
  await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.15);
  await page.waitForTimeout(900);
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
  // Keep an active board on screen long enough for a 19-second publish cut.
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(gx(100 + i * 78), b.y + b.height * 0.12);
    await page.waitForTimeout(280);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(720);
  }
  await page.waitForTimeout(1100);
  const video = page.video();
  await ctx.close();
  const path = await video.path();
  await browser.close();
  console.log(out, '<-', path);
  return path;
}

const requested = process.argv[2] || 'both';
const result = {};
function publish(raw, cover, width, height, out) {
  // The raw context begins before page navigation. Skip that boot interval,
  // then concatenate cover -> uninterrupted gameplay without an audio track.
  execFileSync('ffmpeg', [
    '-y', '-loop', '1', '-framerate', '60', '-t', '0.7', '-i', cover,
    '-ss', '1.6', '-i', raw,
    '-filter_complex', `[0:v]scale=${width}:${height}:flags=lanczos,fps=60,format=yuv420p[cover];[1:v]scale=${width}:${height}:flags=lanczos,fps=60,format=yuv420p[game];[cover][game]concat=n=2:v=1:a=0[v]`,
    '-map', '[v]', '-t', '19', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', '-pix_fmt', 'yuv420p', out,
  ], { stdio: 'inherit' });
}
if (requested === 'both' || requested === 'landscape') {
  result.land = await record(1920, 1080, 'landscape');
  publish(result.land, 'marketing/cover-16x9.png', 1920, 1080, 'marketing/video-landscape.mp4');
}
if (requested === 'both' || requested === 'portrait') {
  result.port = await record(720, 1080, 'portrait');
  publish(result.port, 'marketing/cover-2x3.png', 720, 1080, 'marketing/video-portrait.mp4');
}
console.log(JSON.stringify(result));
