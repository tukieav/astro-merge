// Desktop/mobile presentation gate for Astro Merge.
// Run after `npm run build`: node tools/e2e-desktop.cjs [url]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.argv[2] || 'http://localhost:8524/index.html';
const targets = [
  { name: '1280x720', width: 1280, height: 720, shots: true },
  { name: '1920x1080', width: 1920, height: 1080, shots: true },
  { name: '390x844', width: 390, height: 844, shots: false },
];
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
}

fs.mkdirSync(path.join('qa', 'desktop'), { recursive: true });
;(async () => {
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' });

for (const target of targets) {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: target.width, height: target.height }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`${URL}?debug=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__astroReady === true, null, { timeout: 10000 });
  await page.waitForTimeout(700);

  const metrics = await page.evaluate(() => {
    const c = document.querySelector('#game');
    const r = c.getBoundingClientRect();
    const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const sampleEdge = (axis, at) => {
      let alive = 0, n = 0;
      for (let i = 0; i < 96; i++) {
        const x = axis === 'x' ? at : Math.floor((i + 0.5) * c.width / 96);
        const y = axis === 'y' ? at : Math.floor((i + 0.5) * c.height / 96);
        const k = (y * c.width + x) * 4;
        if (px[k] + px[k + 1] + px[k + 2] > 30) alive++;
        n++;
      }
      return alive / n;
    };
    return {
      coverW: r.width / innerWidth,
      coverH: r.height / innerHeight,
      edges: [sampleEdge('x', 1), sampleEdge('x', c.width - 2), sampleEdge('y', 1), sampleEdge('y', c.height - 2)],
      size: `${c.width}x${c.height}`,
    };
  });
  check(`${target.name} canvas covers viewport`, metrics.coverW >= 0.98 && metrics.coverH >= 0.98, `${metrics.size}; ${metrics.coverW.toFixed(3)}×${metrics.coverH.toFixed(3)}`);
  check(`${target.name} edge pixels are alive`, metrics.edges.every(n => n > 0.65), metrics.edges.map(n => n.toFixed(2)).join(', '));
  if (target.shots) await page.screenshot({ path: path.join('qa', 'desktop', `${target.name}-menu.png`) });

  // The play target lies inside the central chamber at every viewport.
  await page.mouse.click(target.width / 2, target.height * 0.67);
  await page.waitForFunction(() => window.__astro.getState().state === 'playing', null, { timeout: 3000 });
  const game = await page.evaluate(() => ({ state: window.__astro.getState().state, buttons: window.__astro.buttons() }));
  check(`${target.name} gameplay starts`, game.state === 'playing');
  if (target.width > 600) {
    check(`${target.name} desktop controls available`, ['SHOP', 'GOALS', 'DEX'].every(x => game.buttons.includes(x)), game.buttons.join(', '));
    const opened = await page.evaluate(() => window.__astro.pressButton('SHOP'));
    await page.waitForTimeout(100);
    const overlay = await page.evaluate(() => window.__astro.getState().overlay);
    check(`${target.name} SHOP usable`, opened && overlay === 'shop');
    await page.evaluate(() => window.__astro.closeOverlay());
  }
  if (target.shots) {
    await page.evaluate(() => { window.__astro.spawn(3, 190, 620); window.__astro.spawn(3, 210, 620); });
    await page.waitForTimeout(550);
    await page.screenshot({ path: path.join('qa', 'desktop', `${target.name}-gameplay.png`) });
  }
  check(`${target.name} zero errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

await browser.close();
console.log(failed ? `${failed} PRESENTATION GATES FAILED` : 'ALL PRESENTATION GATES PASSED');
process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
