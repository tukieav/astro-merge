// E2E smoke test for Astro Merge (Full Launch). Run: node scripts/e2e.mjs [url]
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const suppliedURL = process.argv[2];
let server;
async function dynamicURL() {
  if (suppliedURL) return suppliedURL;
  const root = path.resolve('astro-merge');
  server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
    fs.readFile(file, (error, body) => {
      if (error) return response.writeHead(404).end();
      response.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
      response.end(body);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return `http://127.0.0.1:${server.address().port}/index.html`;
}
const errors = [];
let failed = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
  if (!ok) failed++;
}

const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' });
const testURL = await dynamicURL();
const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const t0 = Date.now();
await page.goto(testURL + '?debug=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__astroReady === true, null, { timeout: 10000 });
check('loads to ready <5s', Date.now() - t0 < 5000, `${Date.now() - t0}ms`);
await page.waitForTimeout(400); // let a few frames render

// canvas has bright pixels
const bright = await page.evaluate(() => {
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 200) n++;
  return n;
});
check('canvas renders (bright pixels)', bright > 20, `${bright} samples`);

// start game with click
const box = await page.locator('#game').boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.68);
await page.waitForFunction(() => window.__astro.getState().state === 'playing', null, { timeout: 3000 });
check('click PLAY starts game', true);

// keyboard: move + drop several planets
for (let i = 0; i < 6; i++) {
  await page.keyboard.down(i % 2 ? 'ArrowLeft' : 'ArrowRight');
  await page.waitForTimeout(120);
  await page.keyboard.up(i % 2 ? 'ArrowLeft' : 'ArrowRight');
  await page.keyboard.down('Space');
  await page.waitForTimeout(120);
  await page.keyboard.up('Space');
  await page.waitForTimeout(600);
}
let st = await page.evaluate(() => window.__astro.getState());
check('planets dropped via keyboard', st.planets >= 3, `planets=${st.planets}`);

// force merges: spawn same-tier pairs
await page.evaluate(() => { window.__astro.spawn(0, 200, 150); window.__astro.spawn(0, 205, 250); });
await page.waitForTimeout(1500);
st = await page.evaluate(() => window.__astro.getState());
check('merge grants stardust', st.stardust > 0 && st.totalMerges > 0, `stardust=${st.stardust} merges=${st.totalMerges}`);

// Pair dedupe and max-tier rule: one pair yields exactly one successor; Suns
// remain separate rather than overflowing a non-existent tier.
await page.evaluate(() => {
  window.__astro.restart();
  window.__astro.spawn(0, 210, 300); window.__astro.spawn(0, 220, 300);
  window.__astro.advance(2);
});
st = await page.evaluate(() => window.__astro.getState());
check('merge pair is consumed once', (st.tiers[1] || 0) === 1, `moons=${st.tiers[1] || 0}`);
await page.evaluate(() => {
  window.__astro.restart();
  window.__astro.spawn(10, 220, 300); window.__astro.spawn(10, 250, 300);
  window.__astro.advance(2);
});
st = await page.evaluate(() => window.__astro.getState());
check('max-tier Suns do not merge', (st.tiers[10] || 0) === 2, `suns=${st.tiers[10] || 0}`);

// Paused lifecycle must freeze simulation and resume exactly once.
const beforePause = await page.evaluate(() => { window.__astro.setPaused(true); return window.__astro.getState().simTime; });
await page.waitForTimeout(220);
const duringPause = await page.evaluate(() => window.__astro.getState().simTime);
await page.evaluate(() => window.__astro.setPaused(false));
await page.waitForTimeout(120);
const afterPause = await page.evaluate(() => window.__astro.getState().simTime);
check('pause freezes and resume advances simulation', duringPause === beforePause && afterPause > duringPause, `${beforePause} -> ${duringPause} -> ${afterPause}`);

// shop: grant currency, buy, equip skin
await page.evaluate(() => window.__astro.addStardust(1000));
const bought = await page.evaluate(() => window.__astro.buy('neon'));
check('shop purchase works', bought === true);
const equipped = await page.evaluate(() => window.__astro.setSkin('neon'));
check('skin equips', equipped === true);
st = await page.evaluate(() => window.__astro.getState());
check('unlock persisted in state', st.unlocks.neon === true && st.skin === 'neon');

// buy powerups and use them
await page.evaluate(() => { window.__astro.buy('undo'); window.__astro.buy('bomb'); window.__astro.buy('next2'); });

// overlays render
for (const o of ['shop', 'missions', 'dex']) {
  await page.evaluate(ov => window.__astro.openOverlay(ov), o);
  await page.waitForTimeout(250);
  const px = await page.evaluate(() => {
    const c = document.getElementById('game');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 200) n++;
    return n;
  });
  check(`overlay ${o} renders`, px > 10, `${px} samples`);
  await page.evaluate(() => window.__astro.closeOverlay());
}

// game over -> instant restart (new run gets powerups)
await page.evaluate(() => window.__astro.forceGameOver());
await page.waitForTimeout(800);
st = await page.evaluate(() => window.__astro.getState());
check('game over reached', st.state === 'gameover');
check('run recorded', st.totalRuns >= 1, `runs=${st.totalRuns}`);
// click PLAY AGAIN (no real ads locally -> test ad or instant resolve)
await page.waitForTimeout(300);
const pressed = await page.evaluate(() => window.__astro.pressButton('PLAY AGAIN'));
check('PLAY AGAIN button present', pressed === true);
await page.waitForFunction(() => window.__astro.getState().state === 'playing', null, { timeout: 20000 });
st = await page.evaluate(() => window.__astro.getState());
check('instant restart works', st.state === 'playing', `state=${st.state}`);
check('powerups active in new run', st.undoLeft === 1 && st.bombLeft === 1, `undo=${st.undoLeft} bomb=${st.bombLeft}`);

// persistence across reload
const sdBefore = st.stardust;
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__astroReady === true, null, { timeout: 10000 });
st = await page.evaluate(() => window.__astro.getState());
check('stardust persists across reload', st.stardust >= sdBefore - 5 && st.stardust > 0, `before=${sdBefore} after=${st.stardust}`);
check('unlocks persist across reload', st.unlocks.neon === true && st.unlocks.undo === true);
check('daily streak set', st.streak >= 1, `streak=${st.streak}`);

// Corrupt local persistence must fall back to the versioned safe schema.
await page.evaluate(() => localStorage.setItem('astromerge.meta', '{broken json'));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__astroReady === true, null, { timeout: 10000 });
st = await page.evaluate(() => window.__astro.getState());
check('malformed save falls back safely', typeof st.unlocks === 'object' && typeof st.stardust === 'number');

// mobile viewport sanity
await page.setViewportSize({ width: 360, height: 740 });
await page.waitForTimeout(400);
const mob = await page.evaluate(() => {
  const c = document.getElementById('game');
  return { w: c.width, fits: c.width <= 360 * (window.devicePixelRatio || 1) + 2 };
});
check('mobile 360px viewport fits', mob.fits, `canvas w=${mob.w}`);

check('zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
if (server) await new Promise(resolve => server.close(resolve));
console.log(failed === 0 ? 'ALL TESTS PASSED' : `${failed} TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
