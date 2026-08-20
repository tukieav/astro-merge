// ============================================================
// art.js — procedural art pass: baked planet sprites (spherical
// shading + per-tier textures), nebula background with parallax
// starfield, glass container, neon-glass UI helpers.
// Zero asset files: everything rendered to offscreen canvases once.
// ============================================================

let TIERS = null;
let GAME_W = 520, GAME_H = 760;
const SS = 2; // supersample for crisp sprites

export function initArt(tiers, w, h) {
  TIERS = tiers; GAME_W = w; GAME_H = h;
  buildNebula();
  buildStars();
}

// ---------- deterministic pseudo-random (stable textures) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex, f) {
  // f > 0 lighten, f < 0 darken
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ============================================================
// PLANET SPRITES (cached per tier+colors)
// ============================================================
const spriteCache = new Map();

export function getPlanetSprite(tier, c1, c2) {
  const key = tier + '|' + c1 + '|' + c2;
  let s = spriteCache.get(key);
  if (!s) { s = bakePlanet(tier, c1, c2); spriteCache.set(key, s); }
  return s;
}

function bakePlanet(tier, c1, c2) {
  const t = TIERS[tier];
  const r = t.r * SS;
  // padding: rings need extra, glow needs extra
  const pad = t.ring ? r * 0.85 : (t.glow ? r * 0.9 : r * 0.3);
  const size = Math.ceil((r + pad) * 2);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const rnd = mulberry32(1234 + tier * 999);
  c.save();
  c.translate(cx, cy);

  // --- outer glow for the Sun (baked) ---
  if (t.glow) {
    const gl = c.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.85);
    gl.addColorStop(0, 'rgba(255,210,80,0.75)');
    gl.addColorStop(0.55, 'rgba(255,140,20,0.28)');
    gl.addColorStop(1, 'rgba(255,90,0,0)');
    c.fillStyle = gl;
    c.beginPath(); c.arc(0, 0, r * 1.85, 0, Math.PI * 2); c.fill();
  }

  // --- Saturn: back half of rings (behind sphere) ---
  if (t.ring) drawRings(c, r, true);

  // --- base sphere: multi-stop radial gradient with hot spot ---
  const hx = -r * 0.42, hy = -r * 0.42;
  const grad = c.createRadialGradient(hx, hy, r * 0.05, hx * 0.3, hy * 0.3, r * 1.55);
  grad.addColorStop(0, shade(c1, 0.55));
  grad.addColorStop(0.18, shade(c1, 0.18));
  grad.addColorStop(0.5, c1);
  grad.addColorStop(0.82, c2);
  grad.addColorStop(1, shade(c2, -0.55));
  c.fillStyle = grad;
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();

  // --- per-tier surface texture (clipped to sphere) ---
  c.save();
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.clip();
  drawSurface(c, tier, r, c1, c2, rnd);
  // --- terminator / limb darkening overlay ---
  const limb = c.createRadialGradient(hx * 0.7, hy * 0.7, r * 0.35, 0, 0, r * 1.02);
  limb.addColorStop(0, 'rgba(0,0,0,0)');
  limb.addColorStop(0.72, 'rgba(4,6,20,0.05)');
  limb.addColorStop(1, t.glow ? 'rgba(120,30,0,0.25)' : 'rgba(4,6,20,0.55)');
  c.fillStyle = limb;
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
  // --- hot spot specular ---
  const spec = c.createRadialGradient(hx, hy, 0, hx, hy, r * 0.75);
  spec.addColorStop(0, 'rgba(255,255,255,0.38)');
  spec.addColorStop(0.35, 'rgba(255,255,255,0.10)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = spec;
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
  c.restore();

  // --- rim light (starlit edge, top-left) ---
  c.save();
  c.lineWidth = Math.max(2, r * 0.045);
  const rim = c.createLinearGradient(-r, -r, r * 0.6, r * 0.6);
  rim.addColorStop(0, 'rgba(190,225,255,0.85)');
  rim.addColorStop(0.45, 'rgba(190,225,255,0.12)');
  rim.addColorStop(1, 'rgba(190,225,255,0)');
  c.strokeStyle = rim;
  c.beginPath(); c.arc(0, 0, r - c.lineWidth / 2, 0, Math.PI * 2); c.stroke();
  c.restore();

  // --- Saturn: front half of rings (over sphere) ---
  if (t.ring) drawRings(c, r, false);

  // --- Earth: thin atmosphere halo ---
  if (tier === 5) {
    const at = c.createRadialGradient(0, 0, r * 0.92, 0, 0, r * 1.18);
    at.addColorStop(0, 'rgba(90,170,255,0)');
    at.addColorStop(0.75, 'rgba(90,170,255,0.28)');
    at.addColorStop(1, 'rgba(90,170,255,0)');
    c.fillStyle = at;
    c.beginPath(); c.arc(0, 0, r * 1.18, 0, Math.PI * 2); c.fill();
  }

  c.restore();
  return { canvas: cv, half: size / 2, scale: 1 / SS };
}

function drawRings(c, r, back) {
  c.save();
  c.rotate(-0.32);
  if (back) { // only draw upper half (behind planet)
    c.beginPath(); c.rect(-r * 2, -r * 2, r * 4, r * 2); c.clip();
  } else {    // only lower half (in front)
    c.beginPath(); c.rect(-r * 2, 0, r * 4, r * 2); c.clip();
  }
  const bands = [
    [1.30, 1.42, 'rgba(212,190,150,0.28)'],
    [1.42, 1.58, 'rgba(232,210,165,0.80)'],
    [1.58, 1.63, 'rgba(150,125,85,0.25)'],
    [1.63, 1.78, 'rgba(222,198,150,0.55)'],
    [1.78, 1.84, 'rgba(190,165,120,0.30)'],
  ];
  for (const [a, b, col] of bands) {
    const mid = (a + b) / 2, wdt = (b - a) * r;
    c.strokeStyle = col;
    c.lineWidth = wdt;
    c.beginPath();
    c.ellipse(0, 0, r * mid, r * mid * 0.30, 0, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

function drawSurface(c, tier, r, c1, c2, rnd) {
  const crater = (n, sMin, sMax, dark) => {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * r * 0.82;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      const cr = r * (sMin + rnd() * (sMax - sMin));
      // crater pit
      c.fillStyle = `rgba(10,8,20,${dark})`;
      c.beginPath(); c.arc(x, y, cr, 0, Math.PI * 2); c.fill();
      // inner shadow + lit rim (light from top-left)
      c.strokeStyle = 'rgba(255,255,255,0.16)';
      c.lineWidth = cr * 0.28;
      c.beginPath(); c.arc(x + cr * 0.16, y + cr * 0.16, cr * 0.82, Math.PI * 0.6, Math.PI * 1.7); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.20)';
      c.beginPath(); c.arc(x - cr * 0.10, y - cr * 0.10, cr * 0.85, -Math.PI * 0.4, Math.PI * 0.55); c.stroke();
    }
  };
  const blotch = (n, col, sMin, sMax) => {
    c.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * r * 0.8;
      c.beginPath();
      c.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * (sMin + rnd() * (sMax - sMin)),
        r * (sMin + rnd() * (sMax - sMin)) * 0.7, rnd() * Math.PI, 0, Math.PI * 2);
      c.fill();
    }
  };
  const bands = (list) => {
    for (const [yy, hh, col] of list) {
      c.fillStyle = col;
      c.beginPath();
      // wavy horizontal band across the sphere
      const y0 = yy * r;
      c.moveTo(-r, y0);
      for (let x = -r; x <= r; x += r / 10) {
        c.lineTo(x, y0 + Math.sin(x / r * 4 + yy * 7) * r * 0.035);
      }
      for (let x = r; x >= -r; x -= r / 10) {
        c.lineTo(x, y0 + hh * r + Math.sin(x / r * 3.2 + yy * 5) * r * 0.045);
      }
      c.closePath(); c.fill();
    }
  };

  switch (tier) {
    case 0: // Pluto — mottled ice, heart-ish light patch, craters
      blotch(8, 'rgba(255,245,230,0.10)', 0.12, 0.3);
      blotch(6, 'rgba(60,40,30,0.14)', 0.1, 0.26);
      crater(5, 0.05, 0.11, 0.18);
      break;
    case 1: // Moon — heavy cratering + maria
      blotch(5, 'rgba(70,70,95,0.22)', 0.15, 0.34);
      crater(11, 0.04, 0.14, 0.22);
      break;
    case 2: // Mercury — dense small craters, scorched side
      crater(13, 0.03, 0.10, 0.20);
      blotch(4, 'rgba(255,180,90,0.10)', 0.1, 0.3);
      break;
    case 3: // Mars — dark maria, dust storms, polar cap
      blotch(7, 'rgba(90,25,10,0.28)', 0.12, 0.3);
      blotch(4, 'rgba(255,190,140,0.12)', 0.1, 0.25);
      crater(4, 0.04, 0.08, 0.15);
      // polar ice cap
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.beginPath(); c.ellipse(0, -r * 0.88, r * 0.34, r * 0.16, 0, 0, Math.PI * 2); c.fill();
      break;
    case 4: // Venus — thick swirling cream clouds
      for (let i = 0; i < 7; i++) {
        c.strokeStyle = `rgba(255,238,190,${0.10 + rnd() * 0.14})`;
        c.lineWidth = r * (0.06 + rnd() * 0.10);
        c.beginPath();
        const y0 = (rnd() * 2 - 1) * r * 0.75;
        c.moveTo(-r, y0);
        c.bezierCurveTo(-r * 0.3, y0 + (rnd() - 0.5) * r * 0.5, r * 0.3, y0 + (rnd() - 0.5) * r * 0.5, r, y0 + (rnd() - 0.5) * r * 0.4);
        c.stroke();
      }
      break;
    case 5: // Earth — continents, shallow seas, cloud wisps
      blotch(3, 'rgba(30,105,180,0.5)', 0.2, 0.4); // deep ocean var
      c.fillStyle = 'rgba(52,150,68,0.95)';
      for (const [bx, by, bw, bh, ba] of [[-0.3, -0.2, 0.34, 0.24, 0.5], [0.32, 0.28, 0.24, 0.17, -0.4], [0.05, -0.5, 0.2, 0.12, 0.1], [-0.45, 0.4, 0.16, 0.11, 0.9]]) {
        c.beginPath(); c.ellipse(bx * r, by * r, bw * r, bh * r, ba, 0, Math.PI * 2); c.fill();
      }
      blotch(3, 'rgba(120,190,90,0.35)', 0.06, 0.14); // land highlights
      for (let i = 0; i < 3; i++) { // soft cloud wisps
        const a = rnd() * Math.PI * 2, d = rnd() * r * 0.7;
        const cxp = Math.cos(a) * d, cyp = Math.sin(a) * d;
        const cl = c.createRadialGradient(cxp, cyp, 0, cxp, cyp, r * 0.26);
        cl.addColorStop(0, 'rgba(255,255,255,0.30)');
        cl.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = cl;
        c.beginPath(); c.ellipse(cxp, cyp, r * 0.28, r * 0.10, rnd() * Math.PI, 0, Math.PI * 2); c.fill();
      }
      break;
    case 6: // Neptune — deep blue bands, dark storm, white wisps
      bands([[-0.55, 0.18, 'rgba(20,25,140,0.30)'], [-0.1, 0.22, 'rgba(150,180,255,0.14)'], [0.3, 0.2, 'rgba(15,20,120,0.35)']]);
      c.fillStyle = 'rgba(10,12,80,0.65)';
      c.beginPath(); c.ellipse(-r * 0.25, -r * 0.1, r * 0.22, r * 0.13, 0.2, 0, Math.PI * 2); c.fill();
      for (let i = 0; i < 3; i++) {
        c.fillStyle = 'rgba(240,248,255,0.35)';
        c.beginPath(); c.ellipse((rnd() * 1.4 - 0.7) * r, (rnd() * 1.4 - 0.7) * r, r * 0.18, r * 0.03, 0.1, 0, Math.PI * 2); c.fill();
      }
      break;
    case 7: // Uranus — smooth pale cyan, subtle tilted bands
      c.save(); c.rotate(1.1);
      bands([[-0.5, 0.2, 'rgba(255,255,255,0.10)'], [0.0, 0.18, 'rgba(20,110,110,0.18)'], [0.42, 0.16, 'rgba(255,255,255,0.08)']]);
      c.restore();
      break;
    case 8: // Saturn — soft cream bands
      bands([[-0.62, 0.16, 'rgba(200,160,100,0.25)'], [-0.3, 0.14, 'rgba(255,240,200,0.22)'],
      [-0.02, 0.2, 'rgba(190,150,95,0.28)'], [0.3, 0.14, 'rgba(255,242,205,0.20)'], [0.55, 0.14, 'rgba(170,135,85,0.25)']]);
      break;
    case 9: // Jupiter — turbulent bands + Great Red Spot
      bands([[-0.72, 0.14, 'rgba(150,90,45,0.40)'], [-0.5, 0.14, 'rgba(255,235,205,0.30)'],
      [-0.28, 0.16, 'rgba(160,95,50,0.45)'], [-0.04, 0.14, 'rgba(255,240,210,0.32)'],
      [0.16, 0.16, 'rgba(145,85,45,0.42)'], [0.4, 0.13, 'rgba(255,236,205,0.28)'], [0.6, 0.14, 'rgba(130,75,40,0.40)']]);
      // Great Red Spot with swirl
      {
        const sx = r * 0.34, sy = r * 0.26;
        c.save();
        c.translate(sx, sy); c.rotate(0.25);
        const spot = c.createRadialGradient(-r * 0.03, -r * 0.02, 0, 0, 0, r * 0.21);
        spot.addColorStop(0, 'rgba(235,120,80,0.95)');
        spot.addColorStop(0.55, 'rgba(195,60,32,0.9)');
        spot.addColorStop(1, 'rgba(150,45,25,0)');
        c.fillStyle = spot;
        c.beginPath(); c.ellipse(0, 0, r * 0.21, r * 0.13, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(255,190,160,0.35)';
        c.lineWidth = r * 0.018;
        c.beginPath(); c.ellipse(0, 0, r * 0.13, r * 0.075, 0, 0.6, Math.PI * 1.8); c.stroke();
        c.restore();
      }
      break;
    case 10: // Sun — granulation + bright cells
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2, d = rnd() * r * 0.9;
        c.fillStyle = `rgba(255,${200 + (rnd() * 55) | 0},${60 + (rnd() * 80) | 0},${0.10 + rnd() * 0.14})`;
        c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.06 + rnd() * 0.13), 0, Math.PI * 2); c.fill();
      }
      blotch(4, 'rgba(200,60,0,0.18)', 0.05, 0.12); // sunspots
      break;
  }
}

// Live animated corona flames for the Sun (drawn on top of sprite)
export function drawSunCorona(g, x, y, r, now) {
  g.save();
  g.translate(x, y);
  g.globalCompositeOperation = 'lighter';
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + now / 6000;
    const len = r * (0.16 + 0.12 * Math.abs(Math.sin(now / 500 + i * 2.1)));
    const bx = Math.cos(a) * r * 0.97, by = Math.sin(a) * r * 0.97;
    const tx = Math.cos(a) * (r + len), ty = Math.sin(a) * (r + len);
    const grad = g.createLinearGradient(bx, by, tx, ty);
    grad.addColorStop(0, 'rgba(255,200,60,0.55)');
    grad.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = grad;
    const pw = r * 0.16;
    g.beginPath();
    g.moveTo(bx + Math.cos(a + Math.PI / 2) * pw, by + Math.sin(a + Math.PI / 2) * pw);
    g.quadraticCurveTo(tx * 1.02, ty * 1.02, bx - Math.cos(a + Math.PI / 2) * pw, by - Math.sin(a + Math.PI / 2) * pw);
    g.closePath(); g.fill();
  }
  g.restore();
}

// ============================================================
// BACKGROUND — nebula + 3-layer parallax stars + shooting stars
// ============================================================
let nebulaCanvas = null;
let starLayers = [];
let shooting = null;
let nextShootAt = 0;

function buildNebula() {
  nebulaCanvas = document.createElement('canvas');
  nebulaCanvas.width = GAME_W; nebulaCanvas.height = GAME_H;
  const c = nebulaCanvas.getContext('2d');
  const rnd = mulberry32(777);
  // deep space vertical gradient
  const bg = c.createLinearGradient(0, 0, 0, GAME_H);
  bg.addColorStop(0, '#05070f');
  bg.addColorStop(0.45, '#0a0e24');
  bg.addColorStop(1, '#101736');
  c.fillStyle = bg;
  c.fillRect(0, 0, GAME_W, GAME_H);
  // nebula clouds: violet, teal, magenta
  const clouds = [
    { cx: GAME_W * 0.22, cy: GAME_H * 0.24, col: [110, 70, 235], n: 26, sp: 150 },
    { cx: GAME_W * 0.82, cy: GAME_H * 0.62, col: [20, 165, 150], n: 22, sp: 130 },
    { cx: GAME_W * 0.55, cy: GAME_H * 0.88, col: [225, 75, 150], n: 18, sp: 120 },
  ];
  c.globalCompositeOperation = 'lighter';
  for (const cl of clouds) {
    for (let i = 0; i < cl.n; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * cl.sp;
      const x = cl.cx + Math.cos(a) * d * 1.4, y = cl.cy + Math.sin(a) * d;
      const rr = 25 + rnd() * 70;
      const grad = c.createRadialGradient(x, y, 0, x, y, rr);
      grad.addColorStop(0, `rgba(${cl.col[0]},${cl.col[1]},${cl.col[2]},${0.045 + rnd() * 0.05})`);
      grad.addColorStop(0.6, `rgba(${cl.col[0]},${cl.col[1]},${cl.col[2]},${0.02 + rnd() * 0.03})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = grad;
      c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill();
    }
    // a few bright knots in each nebula
    for (let i = 0; i < 4; i++) {
      const x = cl.cx + (rnd() - 0.5) * cl.sp, y = cl.cy + (rnd() - 0.5) * cl.sp;
      const grad = c.createRadialGradient(x, y, 0, x, y, 10);
      grad.addColorStop(0, 'rgba(255,255,255,0.20)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grad;
      c.beginPath(); c.arc(x, y, 10, 0, Math.PI * 2); c.fill();
    }
  }
  c.globalCompositeOperation = 'source-over';
  // fine dust
  for (let i = 0; i < 260; i++) {
    c.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.05})`;
    c.fillRect(rnd() * GAME_W, rnd() * GAME_H, 1, 1);
  }
}

function buildStars() {
  const rnd = mulberry32(4242);
  starLayers = [
    { speed: 2.0, stars: [], rMin: 0.3, rMax: 0.9, alpha: 0.5 },   // far
    { speed: 4.5, stars: [], rMin: 0.6, rMax: 1.4, alpha: 0.75 },  // mid
    { speed: 8.5, stars: [], rMin: 1.0, rMax: 2.1, alpha: 1.0 },   // near
  ];
  const counts = [70, 45, 24];
  starLayers.forEach((L, li) => {
    for (let i = 0; i < counts[li]; i++) {
      L.stars.push({
        x: rnd() * GAME_W, y: rnd() * GAME_H,
        r: L.rMin + rnd() * (L.rMax - L.rMin),
        tw: rnd() * Math.PI * 2,
        hue: rnd() < 0.12 ? (rnd() < 0.5 ? '200,220,255' : '255,230,190') : '255,255,255',
      });
    }
  });
}

export function drawBackground(g, now) {
  g.drawImage(nebulaCanvas, 0, 0);
  // parallax star layers, slow vertical drift + twinkle
  for (const L of starLayers) {
    const dy = (now / 1000 * L.speed) % GAME_H;
    for (const s of L.stars) {
      const y = (s.y + dy) % GAME_H;
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(now / 700 + s.tw));
      g.fillStyle = `rgba(${s.hue},${(tw * L.alpha).toFixed(3)})`;
      g.beginPath(); g.arc(s.x, y, s.r, 0, Math.PI * 2); g.fill();
      if (s.r > 1.7) { // cross glint on biggest stars
        g.globalAlpha = tw * 0.35;
        g.strokeStyle = `rgba(${s.hue},0.8)`;
        g.lineWidth = 0.7;
        g.beginPath();
        g.moveTo(s.x - s.r * 3, y); g.lineTo(s.x + s.r * 3, y);
        g.moveTo(s.x, y - s.r * 3); g.lineTo(s.x, y + s.r * 3);
        g.stroke();
        g.globalAlpha = 1;
      }
    }
  }
  // shooting star
  if (!shooting && now > nextShootAt) {
    shooting = {
      x: Math.random() * GAME_W * 0.7 + GAME_W * 0.15, y: Math.random() * GAME_H * 0.3,
      vx: 4 + Math.random() * 4, vy: 2.5 + Math.random() * 2, life: 1,
    };
  }
  if (shooting) {
    const s = shooting;
    s.x += s.vx; s.y += s.vy; s.life -= 0.022;
    const grad = g.createLinearGradient(s.x, s.y, s.x - s.vx * 14, s.y - s.vy * 14);
    grad.addColorStop(0, `rgba(255,255,255,${(0.9 * s.life).toFixed(2)})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = grad;
    g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * 14, s.y - s.vy * 14); g.stroke();
    if (s.life <= 0 || s.x > GAME_W + 40 || s.y > GAME_H + 40) {
      shooting = null;
      nextShootAt = now + 5000 + Math.random() * 9000;
    }
  }
}

// ============================================================
// GLASS CONTAINER — space-station dome walls + laser danger line
// ============================================================
export function drawContainer(g, now) {
  const wallW = 12;
  // left wall
  let grad = g.createLinearGradient(0, 0, wallW, 0);
  grad.addColorStop(0, 'rgba(150,200,255,0.22)');
  grad.addColorStop(0.5, 'rgba(150,200,255,0.06)');
  grad.addColorStop(1, 'rgba(150,200,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, wallW, GAME_H);
  // right wall
  grad = g.createLinearGradient(GAME_W, 0, GAME_W - wallW, 0);
  grad.addColorStop(0, 'rgba(150,200,255,0.22)');
  grad.addColorStop(0.5, 'rgba(150,200,255,0.06)');
  grad.addColorStop(1, 'rgba(150,200,255,0)');
  g.fillStyle = grad;
  g.fillRect(GAME_W - wallW, 0, wallW, GAME_H);
  // bottom floor
  grad = g.createLinearGradient(0, GAME_H, 0, GAME_H - wallW * 1.4);
  grad.addColorStop(0, 'rgba(150,200,255,0.28)');
  grad.addColorStop(1, 'rgba(150,200,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, GAME_H - wallW * 1.4, GAME_W, wallW * 1.4);
  // bright glass edges
  g.strokeStyle = 'rgba(170,215,255,0.55)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(1.5, 0); g.lineTo(1.5, GAME_H - 2); g.lineTo(GAME_W - 1.5, GAME_H - 2); g.lineTo(GAME_W - 1.5, 0);
  g.stroke();
  // moving sheen on walls
  const sh = (now / 30) % (GAME_H * 1.6) - GAME_H * 0.3;
  grad = g.createLinearGradient(0, sh, 0, sh + 130);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.16)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, sh, 4, 130);
  g.fillRect(GAME_W - 4, sh, 4, 130);
  // corner rivets/glints
  g.fillStyle = 'rgba(200,230,255,0.7)';
  for (const [x, y] of [[6, GAME_H - 8], [GAME_W - 6, GAME_H - 8]]) {
    g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill();
  }
}

export function drawLaserLine(g, y, now, danger) {
  const pulse = 0.5 + 0.5 * Math.sin(now / (danger > 0.3 ? 110 : 400));
  const alpha = 0.30 + danger * 0.55;
  const col = danger > 0.3 ? '255,60,60' : '255,90,90';
  g.save();
  // wide soft glow
  const glow = g.createLinearGradient(0, y - 14, 0, y + 14);
  glow.addColorStop(0, `rgba(${col},0)`);
  glow.addColorStop(0.5, `rgba(${col},${(0.14 + danger * 0.3) * pulse + 0.05})`);
  glow.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = glow;
  g.fillRect(0, y - 14, GAME_W, 28);
  // laser core
  g.globalAlpha = alpha * (0.7 + 0.3 * pulse);
  g.fillStyle = `rgb(${col})`;
  g.fillRect(0, y - 1, GAME_W, 2);
  g.globalAlpha = Math.min(1, alpha + 0.25);
  g.fillStyle = 'rgba(255,230,230,0.9)';
  g.fillRect(0, y - 0.5, GAME_W, 1);
  // emitter diamonds at both ends
  g.globalAlpha = 0.9;
  for (const ex of [7, GAME_W - 7]) {
    g.fillStyle = `rgb(${col})`;
    g.beginPath();
    g.moveTo(ex, y - 6); g.lineTo(ex + 5, y); g.lineTo(ex, y + 6); g.lineTo(ex - 5, y);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(ex, y, 1.8, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ============================================================
// GLASS UI helpers
// ============================================================
function pathRound(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function glassPanel(g, x, y, w, h, r = 14) {
  g.save();
  pathRound(g, x, y, w, h, r);
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, 'rgba(30,42,80,0.72)');
  grad.addColorStop(1, 'rgba(12,18,42,0.72)');
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = 'rgba(140,190,255,0.30)';
  g.lineWidth = 1.5;
  g.stroke();
  // top sheen
  pathRound(g, x + 2, y + 2, w - 4, h * 0.4, r * 0.8);
  const sheen = g.createLinearGradient(0, y, 0, y + h * 0.45);
  sheen.addColorStop(0, 'rgba(255,255,255,0.13)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fill();
  g.restore();
}

export function neonButton(g, x, y, w, h, text, color) {
  g.save();
  // glow
  g.shadowColor = color;
  g.shadowBlur = 14;
  pathRound(g, x, y, w, h, Math.min(14, h * 0.3));
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, 'rgba(28,38,72,0.92)');
  grad.addColorStop(1, 'rgba(14,20,44,0.92)');
  g.fillStyle = grad;
  g.fill();
  g.shadowBlur = 0;
  // neon border
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.stroke();
  // inner sheen
  pathRound(g, x + 2, y + 2, w - 4, h * 0.42, Math.min(11, h * 0.24));
  const sheen = g.createLinearGradient(0, y, 0, y + h * 0.5);
  sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fill();
  // label
  g.fillStyle = '#fff';
  g.shadowColor = color;
  g.shadowBlur = 8;
  g.font = `bold ${Math.floor(h * 0.40)}px 'Segoe UI', sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, x + w / 2, y + h / 2 + 1);
  g.restore();
}
