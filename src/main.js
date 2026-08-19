// ============================================================
// ASTRO MERGE — Suika-style planet merge game for CrazyGames
// ============================================================
import Matter from 'matter-js';
import * as audio from './audio.js';
import * as cg from './sdk.js';

const { Engine, World, Bodies, Body, Events, Composite } = Matter;

// ---------- Config ----------
const GAME_W = 520;
const GAME_H = 760;
const WALL_T = 60;
const DANGER_Y = 130;           // game over line
const DROP_Y = 90;
const GRACE_MS = 2500;          // time a planet may sit above line before game over

// 11 planet tiers: name, radius, color pair, score
const TIERS = [
  { name: 'Pluto',   r: 17,  c1: '#c9b8a8', c2: '#8a7263', score: 1 },
  { name: 'Moon',    r: 24,  c1: '#e8e8f0', c2: '#9a9ab0', score: 3 },
  { name: 'Mercury', r: 32,  c1: '#d8a86a', c2: '#94622c', score: 6 },
  { name: 'Mars',    r: 40,  c1: '#f07850', c2: '#a03818', score: 10 },
  { name: 'Venus',   r: 50,  c1: '#f8d888', c2: '#c08830', score: 15 },
  { name: 'Earth',   r: 62,  c1: '#58a8f0', c2: '#1858a0', score: 21 },
  { name: 'Neptune', r: 76,  c1: '#6878f8', c2: '#2830a0', score: 28 },
  { name: 'Uranus',  r: 92,  c1: '#88e8e0', c2: '#30a098', score: 36 },
  { name: 'Saturn',  r: 110, c1: '#f0d8a0', c2: '#b09050', score: 45, ring: true },
  { name: 'Jupiter', r: 130, c1: '#e8b880', c2: '#a06840', score: 55, bands: true },
  { name: 'Sun',     r: 154, c1: '#fff0a0', c2: '#f08000', score: 100, glow: true },
];
const MAX_DROP_TIER = 4; // player only drops tiers 0..4

// ---------- Canvas setup ----------
const canvas = document.getElementById('game');
const g = canvas.getContext('2d');
let scale = 1;

function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  scale = Math.min(vw / GAME_W, vh / GAME_H);
  canvas.width = Math.floor(GAME_W * scale);
  canvas.height = Math.floor(GAME_H * scale);
}
window.addEventListener('resize', resize);
resize();

// ---------- Physics ----------
const engine = Engine.create();
engine.gravity.y = 1.1;
engine.positionIterations = 8;
engine.velocityIterations = 6;

const wallOpts = { isStatic: true, friction: 0.3, restitution: 0.1 };
World.add(engine.world, [
  Bodies.rectangle(GAME_W / 2, GAME_H + WALL_T / 2 - 8, GAME_W + 200, WALL_T, wallOpts),
  Bodies.rectangle(-WALL_T / 2 + 4, GAME_H / 2, WALL_T, GAME_H * 2, wallOpts),
  Bodies.rectangle(GAME_W + WALL_T / 2 - 4, GAME_H / 2, WALL_T, GAME_H * 2, wallOpts),
]);

// ---------- Game state ----------
let planets = [];        // { body, tier, born, aboveSince }
let particles = [];
let floatTexts = [];
let stars = [];
let score = 0;
let best = 0;
let combo = 0;
let comboTimer = 0;
let state = 'menu';      // menu | playing | dropping | gameover | adplaying
let currentTier = 0;
let nextTier = 0;
let dropX = GAME_W / 2;
let canDrop = true;
let shake = 0;
let dangerPulse = 0;
let mergesThisRun = 0;
let usedSecondChance = false;
let discoveredMax = 4;
let gameOverAt = 0;

// starfield
for (let i = 0; i < 90; i++) {
  stars.push({ x: Math.random() * GAME_W, y: Math.random() * GAME_H, r: Math.random() * 1.6 + 0.4, tw: Math.random() * Math.PI * 2 });
}

function randTier() {
  // weighted: small planets more common
  const w = [30, 26, 20, 14, 10];
  const total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
  return 0;
}

function spawnPlanet(tier, x, y, vx = 0, vy = 0) {
  const t = TIERS[tier];
  const body = Bodies.circle(x, y, t.r, {
    friction: 0.25, frictionStatic: 0.4, restitution: 0.18,
    density: 0.0012 + tier * 0.0003,
    label: 'planet',
  });
  Body.setVelocity(body, { x: vx, y: vy });
  Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.05);
  World.add(engine.world, body);
  const p = { body, tier, born: performance.now(), aboveSince: 0 };
  planets.push(p);
  return p;
}

function reset() {
  for (const p of planets) World.remove(engine.world, p.body);
  planets = [];
  particles = [];
  floatTexts = [];
  score = 0; combo = 0; comboTimer = 0; mergesThisRun = 0;
  usedSecondChance = false;
  currentTier = randTier();
  nextTier = randTier();
  canDrop = true;
}

// ---------- Merging ----------
const toMerge = new Set();
Events.on(engine, 'collisionStart', (ev) => {
  for (const pair of ev.pairs) {
    const a = planets.find(p => p.body === pair.bodyA);
    const b = planets.find(p => p.body === pair.bodyB);
    if (!a || !b || a.tier !== b.tier) continue;
    if (toMerge.has(a) || toMerge.has(b)) continue;
    if (a.tier >= TIERS.length - 1) continue; // two Suns don't merge
    toMerge.add(a); toMerge.add(b);
    queueMerge(a, b);
  }
});

const mergeQueue = [];
function queueMerge(a, b) { mergeQueue.push([a, b]); }

function processMerges() {
  while (mergeQueue.length) {
    const [a, b] = mergeQueue.shift();
    toMerge.delete(a); toMerge.delete(b);
    if (!planets.includes(a) || !planets.includes(b)) continue;
    const nt = a.tier + 1;
    const mx = (a.body.position.x + b.body.position.x) / 2;
    const my = (a.body.position.y + b.body.position.y) / 2;
    World.remove(engine.world, a.body);
    World.remove(engine.world, b.body);
    planets = planets.filter(p => p !== a && p !== b);
    spawnPlanet(nt, mx, my);
    // scoring & combo
    combo++;
    comboTimer = 1.6;
    const gained = TIERS[nt].score * combo;
    score += gained;
    mergesThisRun++;
    if (nt > discoveredMax) { discoveredMax = nt; }
    // fx
    burstParticles(mx, my, TIERS[nt].c1, TIERS[nt].r);
    floatTexts.push({ x: mx, y: my - TIERS[nt].r, text: `+${gained}${combo > 1 ? '  x' + combo : ''}`, life: 1.2, big: combo > 2 });
    shake = Math.min(10, 2 + nt * 0.8);
    if (nt >= 8) { audio.bigMergeSound(); cg.happytime(); }
    else audio.popSound(nt, combo);
  }
}

// ---------- Particles ----------
function burstParticles(x, y, color, radius) {
  const n = Math.min(26, 10 + Math.floor(radius / 8));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 5;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
      r: 2 + Math.random() * 4, color, life: 0.6 + Math.random() * 0.5,
    });
  }
}

// ---------- Input ----------
function toGameX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) / scale;
}

function clampDropX(x, tier) {
  const r = TIERS[tier].r;
  return Math.max(r + 6, Math.min(GAME_W - r - 6, x));
}

function pointerMove(clientX) {
  dropX = clampDropX(toGameX(clientX), currentTier);
}

function pointerUp() {
  if (state === 'menu') { startGame(); return; }
  if (state === 'gameover') return; // buttons handled separately
  if (state !== 'playing' || !canDrop) return;
  audio.unlockAudio();
  canDrop = false;
  spawnPlanet(currentTier, dropX, DROP_Y);
  audio.dropSound();
  currentTier = nextTier;
  nextTier = randTier();
  dropX = clampDropX(dropX, currentTier);
  setTimeout(() => { canDrop = true; }, 450);
}

canvas.addEventListener('mousemove', e => pointerMove(e.clientX));
canvas.addEventListener('mousedown', e => { pointerMove(e.clientX); });
canvas.addEventListener('mouseup', e => { handleClick(e.clientX, e.clientY); });
canvas.addEventListener('touchmove', e => { e.preventDefault(); pointerMove(e.touches[0].clientX); }, { passive: false });
canvas.addEventListener('touchstart', e => { e.preventDefault(); pointerMove(e.touches[0].clientX); }, { passive: false });
canvas.addEventListener('touchend', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  handleClick(t.clientX, t.clientY);
}, { passive: false });

// button hitboxes (set during render)
let buttons = [];
function handleClick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) / scale;
  const y = (clientY - rect.top) / scale;
  for (const b of buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return; }
  }
  pointerUp();
}

// ---------- Game flow ----------
function startGame() {
  reset();
  state = 'playing';
  cg.gameplayStart();
}

async function gameOver() {
  state = 'gameover';
  gameOverAt = performance.now();
  audio.gameOverSound();
  cg.gameplayStop();
  if (score > best) { best = score; cg.saveBest(best); }
}

async function restartWithAd() {
  state = 'adplaying';
  await cg.requestAd('midgame', {
    onStart: () => audio.setMuted(true),
    onFinish: () => audio.setMuted(cg.getMuteSetting()),
  });
  startGame();
}

async function secondChance() {
  state = 'adplaying';
  const ok = await cg.requestAd('rewarded', {
    onStart: () => audio.setMuted(true),
    onFinish: () => audio.setMuted(cg.getMuteSetting()),
  });
  if (ok) {
    usedSecondChance = true;
    // remove the smallest 40% of planets to free space
    const sorted = [...planets].sort((a, b) => a.tier - b.tier);
    const removeCount = Math.max(3, Math.floor(sorted.length * 0.4));
    for (let i = 0; i < removeCount && i < sorted.length; i++) {
      const p = sorted[i];
      burstParticles(p.body.position.x, p.body.position.y, TIERS[p.tier].c1, TIERS[p.tier].r);
      World.remove(engine.world, p.body);
    }
    planets = planets.filter(p => !sorted.slice(0, removeCount).includes(p));
    for (const p of planets) p.aboveSince = 0;
    state = 'playing';
    cg.gameplayStart();
  } else {
    state = 'gameover';
  }
}

// ---------- Danger check ----------
function checkDanger(now) {
  let anyAbove = false;
  for (const p of planets) {
    const settled = now - p.born > 1200;
    const above = p.body.position.y - TIERS[p.tier].r < DANGER_Y;
    if (settled && above) {
      anyAbove = true;
      if (!p.aboveSince) p.aboveSince = now;
      else if (now - p.aboveSince > GRACE_MS) { gameOver(); return; }
    } else {
      p.aboveSince = 0;
    }
  }
  dangerPulse = anyAbove ? Math.min(1, dangerPulse + 0.04) : Math.max(0, dangerPulse - 0.04);
  if (anyAbove && Math.random() < 0.02) audio.warnSound();
}

// ---------- Drawing ----------
function drawPlanet(x, y, angle, tier, alpha = 1) {
  const t = TIERS[tier];
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.globalAlpha = alpha;
  if (t.glow) {
    const gl = g.createRadialGradient(0, 0, t.r * 0.6, 0, 0, t.r * 1.6);
    gl.addColorStop(0, 'rgba(255,200,60,0.55)');
    gl.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = gl;
    g.beginPath(); g.arc(0, 0, t.r * 1.6, 0, Math.PI * 2); g.fill();
  }
  const grad = g.createRadialGradient(-t.r * 0.35, -t.r * 0.35, t.r * 0.1, 0, 0, t.r);
  grad.addColorStop(0, t.c1);
  grad.addColorStop(1, t.c2);
  g.fillStyle = grad;
  g.beginPath(); g.arc(0, 0, t.r, 0, Math.PI * 2); g.fill();
  // craters / details
  if (tier <= 3) {
    g.fillStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + tier;
      g.beginPath();
      g.arc(Math.cos(a) * t.r * 0.45, Math.sin(a) * t.r * 0.45, t.r * 0.16, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (t.bands) {
    g.strokeStyle = 'rgba(120,60,20,0.35)';
    g.lineWidth = t.r * 0.12;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.ellipse(0, i * t.r * 0.3, t.r * Math.sqrt(1 - Math.pow(i * 0.3, 2)) * 0.97, t.r * 0.1, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // red spot
    g.fillStyle = 'rgba(200,70,40,0.6)';
    g.beginPath(); g.ellipse(t.r * 0.35, t.r * 0.25, t.r * 0.2, t.r * 0.12, 0.3, 0, Math.PI * 2); g.fill();
  }
  if (tier === 5) { // Earth continents
    g.fillStyle = 'rgba(60,160,70,0.8)';
    g.beginPath(); g.ellipse(-t.r * 0.25, -t.r * 0.15, t.r * 0.3, t.r * 0.22, 0.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(t.r * 0.3, t.r * 0.3, t.r * 0.22, t.r * 0.15, -0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(t.r * 0.1, -t.r * 0.4, t.r * 0.35, t.r * 0.1, 0.2, 0, Math.PI * 2); g.fill();
  }
  if (t.ring) {
    g.strokeStyle = 'rgba(220,190,130,0.9)';
    g.lineWidth = t.r * 0.14;
    g.beginPath(); g.ellipse(0, 0, t.r * 1.45, t.r * 0.4, -0.35, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(160,130,80,0.5)';
    g.lineWidth = t.r * 0.06;
    g.beginPath(); g.ellipse(0, 0, t.r * 1.62, t.r * 0.46, -0.35, 0, Math.PI * 2); g.stroke();
  }
  // rim light
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, t.r - 1, 0, Math.PI * 2); g.stroke();
  g.restore();
}

function roundRect(x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawButton(x, y, w, h, text, fn, color = '#4a6cf0') {
  roundRect(x, y, w, h, 14);
  g.fillStyle = color;
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.3)';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = '#fff';
  g.font = `bold ${Math.floor(h * 0.42)}px 'Segoe UI', sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, x + w / 2, y + h / 2 + 1);
  buttons.push({ x, y, w, h, fn });
}

let lastTime = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (state === 'playing') {
    Engine.update(engine, 1000 / 60);
    processMerges();
    checkDanger(now);
    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 0; }
  }

  // update particles / texts
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= dt * 1.4;
  }
  particles = particles.filter(p => p.life > 0);
  for (const f of floatTexts) { f.y -= 40 * dt; f.life -= dt; }
  floatTexts = floatTexts.filter(f => f.life > 0);
  if (shake > 0) shake = Math.max(0, shake - dt * 30);

  render(now);
}

function render(now) {
  buttons = [];
  g.setTransform(scale, 0, 0, scale, 0, 0);
  if (shake > 0) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  // background
  const bg = g.createLinearGradient(0, 0, 0, GAME_H);
  bg.addColorStop(0, '#0b0e1a');
  bg.addColorStop(1, '#141a35');
  g.fillStyle = bg;
  g.fillRect(-10, -10, GAME_W + 20, GAME_H + 20);
  for (const s of stars) {
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(now / 900 + s.tw));
    g.fillStyle = `rgba(255,255,255,${tw * 0.8})`;
    g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill();
  }

  // danger line
  if (state === 'playing' || state === 'gameover') {
    const pulse = 0.25 + dangerPulse * 0.55 * (0.6 + 0.4 * Math.sin(now / 120));
    g.strokeStyle = `rgba(255,70,70,${pulse})`;
    g.lineWidth = 3;
    g.setLineDash([12, 10]);
    g.beginPath(); g.moveTo(0, DANGER_Y); g.lineTo(GAME_W, DANGER_Y); g.stroke();
    g.setLineDash([]);
  }

  // planets
  for (const p of planets) {
    drawPlanet(p.body.position.x, p.body.position.y, p.body.angle, p.tier);
  }

  // particles
  for (const p of particles) {
    g.globalAlpha = Math.max(0, p.life);
    g.fillStyle = p.color;
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;

  // float texts
  for (const f of floatTexts) {
    g.globalAlpha = Math.min(1, f.life);
    g.fillStyle = f.big ? '#ffd84a' : '#fff';
    g.font = `bold ${f.big ? 30 : 22}px 'Segoe UI', sans-serif`;
    g.textAlign = 'center';
    g.fillText(f.text, f.x, f.y);
  }
  g.globalAlpha = 1;

  if (state === 'playing') {
    // drop preview
    if (canDrop) {
      g.globalAlpha = 0.35;
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.setLineDash([6, 8]);
      g.beginPath(); g.moveTo(dropX, DROP_Y); g.lineTo(dropX, GAME_H - 20); g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      drawPlanet(dropX, DROP_Y, 0, currentTier, 0.9);
    }
    // HUD
    g.fillStyle = '#fff';
    g.font = "bold 30px 'Segoe UI', sans-serif";
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(String(score), 18, 12);
    g.font = "14px 'Segoe UI', sans-serif";
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillText(`BEST ${Math.max(best, score)}`, 18, 46);
    // next planet (scaled-down preview)
    g.textAlign = 'right';
    g.fillText('NEXT', GAME_W - 18, 14);
    {
      const pr = TIERS[nextTier].r;
      const s = Math.min(1, 22 / pr);
      g.save();
      g.translate(GAME_W - 42, 58);
      g.scale(s, s);
      drawPlanet(0, 0, 0, nextTier, 1);
      g.restore();
    }
    // combo
    if (combo > 1) {
      g.textAlign = 'center';
      g.fillStyle = '#ffd84a';
      g.font = "bold 26px 'Segoe UI', sans-serif";
      g.fillText(`COMBO x${combo}`, GAME_W / 2, 14);
    }
  }

  if (state === 'menu') {
    g.fillStyle = 'rgba(5,8,18,0.55)';
    g.fillRect(0, 0, GAME_W, GAME_H);
    // title planets decoration
    drawPlanet(GAME_W / 2 - 130, 200, 0.4, 5, 1);
    drawPlanet(GAME_W / 2 + 120, 170, -0.3, 8, 1);
    drawPlanet(GAME_W / 2, 300, 0.1, 3, 1);
    g.fillStyle = '#fff';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = "bold 54px 'Segoe UI', sans-serif";
    g.fillText('ASTRO MERGE', GAME_W / 2, 420);
    g.font = "20px 'Segoe UI', sans-serif";
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText('Merge planets. Build the Sun.', GAME_W / 2, 465);
    drawButton(GAME_W / 2 - 110, 520, 220, 64, 'PLAY', startGame, '#37b24d');
    if (best > 0) {
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.font = "16px 'Segoe UI', sans-serif";
      g.fillText(`Best score: ${best}`, GAME_W / 2, 625);
    }
  }

  if (state === 'gameover') {
    g.fillStyle = 'rgba(5,8,18,0.7)';
    g.fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle = '#ff6b6b';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = "bold 44px 'Segoe UI', sans-serif";
    g.fillText('GAME OVER', GAME_W / 2, 240);
    g.fillStyle = '#fff';
    g.font = "bold 34px 'Segoe UI', sans-serif";
    g.fillText(String(score), GAME_W / 2, 300);
    g.font = "16px 'Segoe UI', sans-serif";
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.fillText(score >= best && score > 0 ? 'NEW BEST!' : `Best: ${best}`, GAME_W / 2, 340);
    let by = 400;
    if (!usedSecondChance && planets.length > 4 && performance.now() - gameOverAt > 600) {
      drawButton(GAME_W / 2 - 150, by, 300, 60, '\u25B6 SECOND CHANCE (AD)', secondChance, '#f59f00');
      by += 80;
    }
    if (performance.now() - gameOverAt > 600) {
      drawButton(GAME_W / 2 - 110, by, 220, 60, 'PLAY AGAIN', restartWithAd, '#37b24d');
    }
  }

  if (state === 'adplaying') {
    g.fillStyle = 'rgba(5,8,18,0.85)';
    g.fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = "22px 'Segoe UI', sans-serif";
    g.fillText('Loading...', GAME_W / 2, GAME_H / 2);
  }
}

// ---------- Boot ----------
// debug hooks for QA (harmless in prod)
if (location.search.includes('debug=1')) {
  window.__astro = {
    forceGameOver: () => gameOver(),
    getState: () => ({ state, score, planets: planets.length }),
    addScore: (n) => { score += n; },
  };
}

(async () => {
  cg.loadingStart && cg.loadingStart();
  await cg.initSDK();
  best = cg.loadBest();
  audio.setMuted(cg.getMuteSetting());
  cg.onSettingsChange(s => audio.setMuted(!!s.muteAudio));
  cg.loadingStop && cg.loadingStop();
  requestAnimationFrame(frame);
})();
