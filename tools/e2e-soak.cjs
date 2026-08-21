// 120-second accelerated mixed-play soak. Uses an ephemeral server by default.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve('astro-merge');
let server;
async function serve() {
  server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (error, body) => {
      if (error) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
      res.end(body);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return `http://127.0.0.1:${server.address().port}/index.html`;
}

(async () => {
  const errors = [];
  const url = process.argv[2] || await serve();
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(url + '?debug=1', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__astroReady === true);
    await page.mouse.click(640, 480);
    await page.waitForFunction(() => window.__astro.getState().state === 'playing');
    for (let cycle = 0; cycle < 6; cycle++) {
      await page.evaluate((n) => {
        const a = window.__astro;
        for (let i = 0; i < 14; i++) a.spawn(i % 5, 55 + (i * 31) % 410, 280 + (i % 4) * 62);
        a.advance(20); // 6 × 20 seconds = 120 seconds accelerated simulation
        a.openOverlay(n % 2 ? 'missions' : 'shop');
        a.closeOverlay();
        a.restart(); // repeated restart must not create listeners/timers
      }, cycle);
      await page.waitForTimeout(40);
    }
    const state = await page.evaluate(() => window.__astro.getState());
    const c = state.counts;
    if (errors.length) throw new Error('browser errors: ' + errors.join(' | '));
    if (state.simTime < 120000) throw new Error('did not advance 120 simulated seconds');
    if (c.planets > 80 || c.particles > 360 || c.rings > 24 || c.sparkles > 160 || c.texts > 12 || c.telegraphs > 12 || c.queuedMerges > 12) throw new Error('unbounded debug counts: ' + JSON.stringify(c));
    if (c.listeners !== 13 || c.timers !== 0) throw new Error('listener/timer regression: ' + JSON.stringify(c));
    console.log('PASS 120s accelerated soak', { simTime: state.simTime, counts: c });
  } finally {
    await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error('FAIL soak', error); process.exitCode = 1; });

