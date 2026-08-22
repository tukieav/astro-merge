// ============================================================
// ASTRO MERGE — Suika-style planet merge game for CrazyGames
// ============================================================
import Matter from 'matter-js';
import * as audio from './audio.js';
import * as cg from './sdk.js';
import * as meta from './meta.js';
import * as art from './art.js';

const { Engine, World, Bodies, Body, Events, Composite } = Matter;

// ---------- Config ----------
const GAME_W = 520;
const GAME_H = 760;
const WALL_T = 60;
const DANGER_Y = 130;           // game over line
const DROP_Y = 90;
const GRACE_MS = 2500;          // time a planet may sit above line before game over
const FIXED_STEP_MS = 1000 / 60;
const MAX_CATCHUP_MS = 250;

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

art.initArt(TIERS, GAME_W, GAME_H);

// ---------- Canvas setup ----------
const canvas = document.getElementById('game');
const g = canvas.getContext('2d');
let scale = 1;
let dpr = 1;
let viewW = 0;
let viewH = 0;
let desktop = false;
let chamber = { x: 0, y: 0, w: GAME_W, h: GAME_H, scale: 1 };

function resize() {
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  desktop = viewW > 600 && viewW / viewH > 1.05;
  // The simulation remains a deliberate portrait chamber. On desktop it is
  // mounted into a station scene rather than letterboxed as a mobile canvas.
  scale = desktop
    ? Math.min((viewH - 28) / GAME_H, (viewW * 0.44) / GAME_W, 1.42)
    : Math.min(viewW / GAME_W, viewH / GAME_H);
  chamber = {
    x: (viewW - GAME_W * scale) / 2,
    y: desktop ? (viewH - GAME_H * scale) / 2 : 0,
    w: GAME_W * scale,
    h: GAME_H * scale,
    scale,
  };
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
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
let rings = [];          // merge shockwave rings { x, y, r, r1, life, color, lw }
let flashes = [];        // merge flash { x, y, r, life }
let sparkles = [];       // star-shaped stardust { x, y, vx, vy, r, life, rot }
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
let overlay = null;          // null | 'shop' | 'missions' | 'dex'
let runStart = 0;            // for dynamic difficulty (easier first 2 min)
let stardustEarned = 0;      // this run
let lastDrop = null;         // { planet, prevCurrent, prevNext, prevNext2 } for UNDO
let undoLeft = 0;
let bombLeft = 0;
let nextTier2 = 0;
let toasts = [];             // { text, life } top notifications (missions, daily bonus)
let dailyMsg = null;
let tutorialUntil = 0;
let tutorialMerged = false;
let simTime = 0;
let physicsAccumulator = 0;
let paused = false;
let pauseReasons = new Set();
let dropReadyAt = 0;
let lossReason = '';
let reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
let mergeTelegraphs = [];
let chainPaths = [];
let hitStopUntil = 0;

// skin palettes: id -> tier color overrides
const SKINS = {
  classic: null,
  neon: [
    ['#ff7bf5', '#a3128f'], ['#7bffec', '#0f9a8c'], ['#ffe97b', '#b28f0f'],
    ['#ff7b7b', '#a31212'], ['#c07bff', '#5f12a3'], ['#7bff9e', '#0fa33d'],
    ['#7b9dff', '#1236a3'], ['#7bfff3', '#0f8ba3'], ['#ffd47b', '#a3720f'],
    ['#ff9e7b', '#a3390f'], ['#ffffb0', '#ff9500'],
  ],
  nova: [
    ['#e0e6ff', '#5560a0'], ['#c8d4ff', '#4050a0'], ['#b0c0ff', '#3648a0'],
    ['#98b0ff', '#2c40a0'], ['#88a4ff', '#2438a0'], ['#7898ff', '#1c30a0'],
    ['#688cff', '#1428a0'], ['#5880ff', '#0c20a0'], ['#4874ff', '#0418a0'],
    ['#3868ff', '#0010a0'], ['#ffffff', '#4060ff'],
  ],
};

function toast(text) { toasts.push({ text, life: 3 }); }

// starfield
for (let i = 0; i < 90; i++) {
  stars.push({ x: Math.random() * GAME_W, y: Math.random() * GAME_H, r: Math.random() * 1.6 + 0.4, tw: Math.random() * Math.PI * 2 });
}

function randTier() {
  // weighted: small planets more common; first 2 minutes of a run are easier
  // (dynamic difficulty: bias toward smaller planets early)
  const elapsed = runStart ? (simTime - runStart) / 1000 : 999;
  const ease = Math.max(0, 1 - elapsed / 120); // 1 -> 0 over first 2 min
  const w = [30 + 14 * ease, 26 + 6 * ease, 20, 14 - 8 * ease, 10 - 6 * ease];
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
  const p = { body, tier, born: simTime, aboveSince: 0, pop: 0, sq: 0, sqT: 0, landed: false };
  planets.push(p);
  return p;
}

function reset() {
  for (const p of planets) World.remove(engine.world, p.body);
  planets = [];
  particles = [];
  rings = []; flashes = []; sparkles = [];
  mergeTelegraphs = []; chainPaths = [];
  floatTexts = [];
  score = 0; combo = 0; comboTimer = 0; mergesThisRun = 0;
  usedSecondChance = false;
  stardustEarned = 0;
  lastDrop = null;
  runStart = simTime;
  undoLeft = meta.state.unlocks.undo ? 1 : 0;
  bombLeft = meta.state.unlocks.bomb ? 1 : 0;
  currentTier = randTier();
  nextTier = randTier();
  nextTier2 = randTier();
  canDrop = true;
  dropReadyAt = simTime;
  lossReason = '';
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
function queueMerge(a, b) {
  const mx = (a.body.position.x + b.body.position.x) / 2;
  const my = (a.body.position.y + b.body.position.y) / 2;
  // A short, deterministic anticipation window makes an impending merge
  // readable without changing the fixed-step simulation result.
  mergeQueue.push({ a, b, at: simTime + 145, mx, my });
  mergeTelegraphs.push({ a, b, until: simTime + 145, color: TIERS[a.tier + 1].c1 });
  const pull = 0.018;
  Body.applyForce(a.body, a.body.position, { x: (mx - a.body.position.x) * pull, y: (my - a.body.position.y) * pull });
  Body.applyForce(b.body, b.body.position, { x: (mx - b.body.position.x) * pull, y: (my - b.body.position.y) * pull });
}

function processMerges() {
  while (mergeQueue.length) {
    if (mergeQueue[0].at > simTime) break;
    const { a, b, mx, my } = mergeQueue.shift();
    toMerge.delete(a); toMerge.delete(b);
    if (!planets.includes(a) || !planets.includes(b)) continue;
    const nt = a.tier + 1;
    World.remove(engine.world, a.body);
    World.remove(engine.world, b.body);
    planets = planets.filter(p => p !== a && p !== b);
    const np = spawnPlanet(nt, mx, my);
    np.pop = 1; // spawn pop animation
    // scoring & combo
    combo++;
    comboTimer = 1.6;
    const gained = TIERS[nt].score * combo;
    score += gained;
    mergesThisRun++;
    if (simTime < tutorialUntil) tutorialMerged = true;
    meta.recordMerge(nt);
    meta.recordCombo(combo);
    // stardust: 1 per merge + tier bonus for big planets
    const sd = 1 + (nt >= 5 ? nt - 4 : 0);
    meta.addStardust(sd);
    stardustEarned += sd;
    if (nt > discoveredMax) { discoveredMax = nt; }
    // missions check (cheap: only on merges)
    for (const m of meta.checkMissions(score)) {
      toast(`\u2605 Mission: ${m.label}  +${m.reward}\u2726`);
      audio.bigMergeSound();
      cg.happytime();
    }
    // fx
    mergeFX(mx, my, nt, combo);
    addFloatText(mx, my, nt, `+${gained}${combo > 1 ? '  x' + combo : ''}`, combo > 2);
    chainPaths.push({ x0: a.body.position.x, y0: a.body.position.y, x1: b.body.position.x, y1: b.body.position.y, life: 0.8, color: TIERS[nt].c1 });
    shake = Math.min(16, 2 + nt * 0.8 + (combo >= 5 ? 6 + combo : 0));
    // A short real-time pause gives a 3+ cascade a clean impact frame without
    // making controls feel sticky. It is deliberately capped below 80ms.
    if (combo >= 3 && !reducedMotion) hitStopUntil = Math.max(hitStopUntil, performance.now() + 65);
    if (nt >= 8) { audio.bigMergeSound(); cg.happytime(); }
    else audio.popSound(nt, combo);
  }
}

function addFloatText(x, y, tier, text, big) {
  const size = big ? 30 : 22;
  g.save();
  g.font = `bold ${size}px 'Segoe UI', sans-serif`;
  const w = Math.ceil(g.measureText(text).width);
  g.restore();
  const h = size + 6;
  const baseY = y - TIERS[tier].r - 14;
  // A small deterministic grid reserves room around a cascade. Labels keep
  // their slot as they rise, so a high-combo payout remains readable instead
  // of briefly becoming a single bright clump.
  const lanes = [0, -1, 1, -2, 2, -3, 3];
  let slot = null;
  for (let row = 0; row < 5 && !slot; row++) {
    for (const lane of lanes) {
      const candidate = {
        x: Math.max(w / 2 + 10, Math.min(GAME_W - w / 2 - 10, x + lane * 68)),
        y: Math.max(DANGER_Y + h, baseY - row * (h + 8)),
      };
      const clearOfLabels = floatTexts.every(other =>
        Math.abs(candidate.x - other.x) >= (w + other.w) / 2 + 8 ||
        Math.abs(candidate.y - other.y) >= (h + other.h) / 2 + 6);
      const textRadius = Math.max(w, h) / 2 + 12;
      const clearOfEffects = flashes.every(f => Math.hypot(candidate.x - f.x, candidate.y - f.y) > f.r * 1.3 + textRadius) &&
        rings.every(r => Math.hypot(candidate.x - r.x, candidate.y - r.y) > r.r1 + textRadius);
      if (clearOfLabels && clearOfEffects) { slot = candidate; break; }
    }
  }
  // The list is capped below, but keep a useful fallback if an extreme chain
  // fills every preferred slot.
  slot ||= { x: Math.max(w / 2 + 10, Math.min(GAME_W - w / 2 - 10, x)), y: Math.max(DANGER_Y + h, baseY - 5 * (h + 8)) };
  floatTexts.push({ ...slot, w, h, text, life: 1.2, big });
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

// full merge juice: flash + expanding ring + colored particles + stardust sparkles
function mergeFX(x, y, tier, comboN) {
  const t = TIERS[tier];
  const motionScale = reducedMotion ? 0.42 : 1;
  const boost = 1 + Math.min(1.6, (comboN - 1) * 0.22);
  flashes.push({ x, y, r: t.r * 1.5 * boost, life: reducedMotion ? 0.45 : 1 });
  rings.push({ x, y, r: t.r * 0.5, r1: t.r * (2.1 + 0.4 * boost), life: 1, color: t.c1, lw: 3 + tier * 0.4 });
  if (comboN >= 3) rings.push({ x, y, r: t.r * 0.3, r1: t.r * (3 + boost), life: 1, color: '#ffd84a', lw: 2 });
  const n = Math.min(40, Math.floor((12 + t.r / 6) * boost * motionScale));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (2 + Math.random() * 5.5) * boost;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
      r: 2 + Math.random() * 4, color: Math.random() < 0.7 ? t.c1 : t.c2,
      life: 0.6 + Math.random() * 0.6,
    });
  }
  const ns = Math.min(14, Math.floor((4 + tier + comboN) * motionScale));
  for (let i = 0; i < ns; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 3.5;
    sparkles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.2,
      r: 2 + Math.random() * 3, life: 0.8 + Math.random() * 0.6,
      rot: Math.random() * Math.PI,
    });
  }
}

// ---------- Input ----------
function toGameX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left - chamber.x) / chamber.scale;
}

function clampDropX(x, tier) {
  const r = TIERS[tier].r;
  return Math.max(r + 6, Math.min(GAME_W - r - 6, x));
}

function pointerMove(clientX) {
  dropX = clampDropX(toGameX(clientX), currentTier);
}

function pointerUp(clientX = null, clientY = null) {
  if (paused) return;
  if (overlay) return; // overlay buttons handled in handleClick
  if (state === 'menu') { startGame(); return; }
  if (state === 'gameover') return; // buttons handled separately
  if (state !== 'playing' || !canDrop || overlay) return;
  if (desktop && clientX !== null) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    if (x < chamber.x || x > chamber.x + chamber.w || y < chamber.y || y > chamber.y + chamber.h) return;
  }
  audio.unlockAudio();
  canDrop = false;
  const dropped = spawnPlanet(currentTier, dropX, DROP_Y);
  if (!meta.state.onboardingComplete) {
    tutorialUntil = 0;
    meta.completeOnboarding();
  }
  lastDrop = { planet: dropped, prevCurrent: currentTier, prevNext: nextTier, prevNext2: nextTier2 };
  audio.dropSound();
  currentTier = nextTier;
  nextTier = nextTier2;
  nextTier2 = randTier();
  dropX = clampDropX(dropX, currentTier);
  dropReadyAt = simTime + 450;
}

// UNDO power-up: revoke the last drop (only before it merges)
function useUndo() {
  if (state !== 'playing' || undoLeft <= 0 || !lastDrop) return;
  const p = lastDrop.planet;
  if (!planets.includes(p)) { lastDrop = null; return; } // already merged
  World.remove(engine.world, p.body);
  planets = planets.filter(q => q !== p);
  burstParticles(p.body.position.x, p.body.position.y, '#ffffff', TIERS[p.tier].r);
  currentTier = lastDrop.prevCurrent;
  nextTier = lastDrop.prevNext;
  nextTier2 = lastDrop.prevNext2;
  dropX = clampDropX(dropX, currentTier);
  undoLeft--;
  lastDrop = null;
  canDrop = true;
  audio.warnSound();
}

// NOVA BOMB power-up: clear the 3 smallest planets
function useBomb() {
  if (state !== 'playing' || bombLeft <= 0) return false;
  if (planets.length < 3) {
    toast('NOVA needs 3 planets');
    audio.warnSound();
    return false;
  }
  const sorted = [...planets].sort((a, b) => a.tier - b.tier).slice(0, 3);
  for (const p of sorted) {
    burstParticles(p.body.position.x, p.body.position.y, '#ffd84a', TIERS[p.tier].r * 1.5);
    World.remove(engine.world, p.body);
  }
  planets = planets.filter(p => !sorted.includes(p));
  bombLeft--;
  shake = 8;
  audio.bigMergeSound();
  return true;
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

// Keyboard support complements the mouse-first design. Physical key codes keep
// the cluster usable on AZERTY layouts (labels change, the key position does not).
const keysHeld = {};
window.addEventListener('keydown', (e) => {
  if (paused) return;
  if (overlay && (e.code === 'Escape' || e.code === 'Backspace')) {
    e.preventDefault();
    closeOverlay();
    return;
  }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') {
    keysHeld[e.code] = true;
    e.preventDefault();
  }
  if (e.code === 'KeyU') { e.preventDefault(); if (!e.repeat) useUndo(); return; }
  if (e.code === 'KeyB') { e.preventDefault(); if (!e.repeat) useBomb(); return; }
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowDown' || e.code === 'KeyW' || e.code === 'KeyS') {
    e.preventDefault();
    if (overlay) { closeOverlay(); return; }
    pointerUp();
  }
});
window.addEventListener('keyup', (e) => { delete keysHeld[e.code]; });
function keyboardMove(dt) {
  if (state !== 'playing' || overlay) return;
  const sp = 420 * dt;
  if (keysHeld['ArrowLeft'] || keysHeld['KeyA']) dropX = clampDropX(dropX - sp, currentTier);
  if (keysHeld['ArrowRight'] || keysHeld['KeyD']) dropX = clampDropX(dropX + sp, currentTier);
}

// button hitboxes (set during render)
let buttons = [];
function handleClick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  for (const b of buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return; }
  }
  pointerUp(clientX, clientY);
}

// ---------- Game flow ----------
function startGame() {
  closeOverlay();
  reset();
  // The opening is intentionally authored: a waiting Pluto plus the same
  // first drop guarantees a satisfying merge in the first interaction.
  currentTier = 0;
  nextTier = 0;
  nextTier2 = randTier();
  spawnPlanet(0, GAME_W / 2, GAME_H - TIERS[0].r - 12);
  tutorialUntil = meta.state.onboardingComplete ? 0 : simTime + 30000;
  tutorialMerged = false;
  state = 'playing';
  cg.gameplayStart();
}

async function gameOver() {
  if (state !== 'playing') return;
  state = 'gameover';
  gameOverAt = simTime;
  if (overlay) closeOverlay();
  audio.gameOverSound();
  cg.gameplayStop();
  if (score > best) {
    best = score;
    cg.saveBest(best);
    // record bonus: +10% of score as stardust on a new best
    const bonus = Math.max(5, Math.floor(score * 0.1 / 10));
    meta.addStardust(bonus);
    stardustEarned += bonus;
  }
  doubledStardust = false;
  meta.recordRunEnd(score);
}

let doubledStardust = false;
async function doubleStardust() {
  if (doubledStardust || stardustEarned <= 0) return;
  state = 'adplaying';
  const ok = await cg.requestAd('rewarded', {
    onStart: () => { setPaused('ad', true); audio.setMuted(true); },
    onFinish: () => { audio.setMuted(cg.getMuteSetting()); setPaused('ad', false); },
  });
  if (ok) {
    meta.addStardust(stardustEarned);
    toast(`+${stardustEarned}\u2726 doubled!`);
    stardustEarned *= 2;
    doubledStardust = true;
    meta.save();
  }
  state = 'gameover';
}

async function restartWithAd() {
  // Retry is always immediate. A midgame ad can be requested only at a later
  // natural break, never as a gate in front of a player's restart.
  startGame();
}

async function secondChance() {
  state = 'adplaying';
  const ok = await cg.requestAd('rewarded', {
    onStart: () => { setPaused('ad', true); audio.setMuted(true); },
    onFinish: () => { audio.setMuted(cg.getMuteSetting()); setPaused('ad', false); },
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
      else if (now - p.aboveSince > GRACE_MS) { lossReason = 'A planet stayed above the pressure line.'; gameOver(); return; }
    } else {
      p.aboveSince = 0;
    }
  }
  dangerPulse = anyAbove ? Math.min(1, dangerPulse + 0.04) : Math.max(0, dangerPulse - 0.04);
  if (anyAbove && Math.floor(now / 500) !== Math.floor((now - FIXED_STEP_MS) / 500)) audio.warnSound();
}

function setPaused(reason, shouldPause, reportLifecycle = true) {
  if (shouldPause) pauseReasons.add(reason); else pauseReasons.delete(reason);
  const next = pauseReasons.size > 0;
  if (next === paused) return;
  paused = next;
  for (const key of Object.keys(keysHeld)) delete keysHeld[key];
  if (paused) {
    audio.suspend();
    if (state === 'playing' && reportLifecycle) cg.gameplayStop();
  } else {
    lastTime = performance.now();
    audio.resume();
    if (state === 'playing' && reportLifecycle) cg.gameplayStart();
  }
}

function openOverlay(name) {
  overlay = name;
  // A station panel is a deliberate decision pause: do not charge the chamber
  // grace clock while the player is comparing an upgrade or goal.
  setPaused('overlay', state === 'playing', false);
}

function closeOverlay() {
  overlay = null;
  setPaused('overlay', false, false);
}

window.addEventListener('blur', () => setPaused('blur', true));
window.addEventListener('focus', () => setPaused('blur', false));
document.addEventListener('visibilitychange', () => {
  setPaused('hidden', document.hidden);
  if (document.hidden) meta.flushIfDirty();
});

// ---------- Drawing ----------
function drawPlanet(x, y, angle, tier, alpha = 1, sx = 1, sy = 1, now = 0) {
  const t = TIERS[tier];
  const pal = SKINS[meta.state.skin];
  const c1 = pal ? pal[tier][0] : t.c1;
  const c2 = pal ? pal[tier][1] : t.c2;
  const sprite = art.getPlanetSprite(tier, c1, c2);
  g.save();
  g.translate(x, y);
  g.scale(sx, sy);
  g.globalAlpha = alpha;
  // subtle texture rotation (slow spin, rings/glow stay baked upright)
  g.rotate(angle * 0.35);
  const hs = sprite.half * sprite.scale;
  g.drawImage(sprite.canvas, -hs, -hs, hs * 2, hs * 2);
  g.rotate(-angle * 0.35);
  if (t.glow && now) art.drawSunCorona(g, 0, 0, t.r, now);
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
  art.neonButton(g, x, y, w, h, text, color);
  // Buttons may live in the scaled chamber or in desktop-side UI. Store their
  // actual CSS-pixel rectangles so hit testing remains exact at every DPR.
  const m = g.getTransform();
  buttons.push({
    x: (m.a * x + m.c * y + m.e) / dpr,
    y: (m.b * x + m.d * y + m.f) / dpr,
    w: Math.abs(m.a * w) / dpr,
    h: Math.abs(m.d * h) / dpr,
    fn, label: text,
  });
}

function drawLabel(text, x, y, size = 13, color = 'rgba(205,225,255,0.68)', align = 'left') {
  g.fillStyle = color;
  g.font = `700 ${size}px 'Segoe UI', sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'top';
  g.fillText(text, x, y);
}

function drawMenuLogo(now) {
  const cx = GAME_W / 2;
  g.save();
  // A small orbital mark anchors a custom, two-line title rather than leaving
  // the menu as plain system text.
  g.translate(cx, 392);
  g.strokeStyle = 'rgba(123,185,255,0.72)'; g.lineWidth = 2;
  g.beginPath(); g.ellipse(0, 0, 174, 27, -0.14, 0, Math.PI * 2); g.stroke();
  const phase = now * 0.0011;
  const dotX = Math.cos(phase) * 174, dotY = Math.sin(phase) * 27;
  g.fillStyle = '#ffd84a'; g.shadowColor = '#ffd84a'; g.shadowBlur = 14;
  g.beginPath(); g.arc(dotX, dotY, 5, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0;
  const title = g.createLinearGradient(0, -42, 0, 37);
  title.addColorStop(0, '#ffffff'); title.addColorStop(0.52, '#b8d7ff'); title.addColorStop(1, '#6f94ff');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = "900 48px 'Segoe UI', sans-serif";
  g.lineWidth = 7; g.strokeStyle = '#17245f'; g.strokeText('ASTRO', 0, -23);
  g.fillStyle = title; g.fillText('ASTRO', 0, -23);
  g.font = "900 44px 'Segoe UI', sans-serif";
  g.lineWidth = 7; g.strokeStyle = '#17245f'; g.strokeText('MERGE', 0, 25);
  g.fillStyle = '#f7fbff'; g.fillText('MERGE', 0, 25);
  g.restore();
}

function drawSideCard(x, y, w, h, title, accent = '#6fa8ff') {
  art.glassPanel(g, x, y, w, h, 18);
  g.fillStyle = accent;
  g.fillRect(x + 16, y + 15, 30, 3);
  drawLabel(title, x + 16, y + 25, 12);
}

function drawDesktopUI(now) {
  if (!desktop) return;
  const pad = Math.max(20, Math.min(42, viewW * 0.026));
  const gap = 22;
  const leftW = Math.max(210, chamber.x - pad - gap);
  const rightX = chamber.x + chamber.w + gap;
  const rightW = Math.max(210, viewW - rightX - pad);
  const panelW = Math.min(390, leftW);
  const lx = pad + Math.max(0, (leftW - panelW) * 0.5);
  const rpW = Math.min(390, rightW);
  const rx = rightX + Math.max(0, (rightW - rpW) * 0.5);
  const titleY = Math.max(18, chamber.y + 4);

  drawSideCard(lx, titleY, panelW, 158, 'MISSION CONTROL', '#82cfff');
  g.fillStyle = '#fff'; g.font = "800 19px 'Segoe UI', sans-serif";
  g.textAlign = 'left'; g.textBaseline = 'top';
  const goal = tutorialMerged ? 'FIRST MERGE COMPLETE' : 'MAKE A MOON';
  g.fillText(goal, lx + 16, titleY + 51);
  drawLabel(tutorialMerged ? 'Next: build a three-merge combo.' : 'Drop the glowing Pluto onto its twin.', lx + 16, titleY + 78, 13, 'rgba(255,255,255,0.72)');
  const progress = tutorialMerged ? 1 : Math.min(0.82, Math.max(0.18, (now % 3000) / 3000));
  g.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(lx + 16, titleY + 112, panelW - 32, 9, 5); g.fill();
  g.fillStyle = tutorialMerged ? '#56e39f' : '#ffd84a'; roundRect(lx + 16, titleY + 112, (panelW - 32) * progress, 9, 5); g.fill();
  drawLabel(tutorialMerged ? '1 / 1 ORBIT GOAL' : 'QUICK START', lx + 16, titleY + 130, 11, tutorialMerged ? '#78edb0' : '#ffd84a');

  drawSideCard(lx, titleY + 178, panelW, 142, 'STAR CHART', '#b798ff');
  const known = TIERS.filter((_, i) => (meta.state.dex[i] || 0) > 0 || i <= MAX_DROP_TIER).length;
  g.fillStyle = '#ffd84a'; g.font = "800 30px 'Segoe UI', sans-serif"; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText(`✦ ${meta.state.stardust}`, lx + 16, titleY + 212);
  drawLabel('STARDUST IN RESERVE', lx + 18, titleY + 250, 11);
  g.fillStyle = '#fff'; g.font = "800 20px 'Segoe UI', sans-serif"; g.fillText(`${known} / ${TIERS.length}`, lx + 16, titleY + 276);
  drawLabel('PLANETS DISCOVERED', lx + 82, titleY + 280, 11);

  drawSideCard(rx, titleY, rpW, 188, 'ORBITAL SCANNER', '#ffca70');
  drawLabel('NEXT DROP', rx + 16, titleY + 52, 11);
  const drawScannerPlanet = (tier, px, py, max, alpha = 1) => {
    const s = Math.min(1, max / TIERS[tier].r);
    g.save(); g.translate(px, py); g.scale(s, s); drawPlanet(0, 0, 0, tier, alpha, 1, 1, now); g.restore();
  };
  drawScannerPlanet(nextTier, rx + 54, titleY + 101, 30);
  g.fillStyle = '#fff'; g.font = "800 17px 'Segoe UI', sans-serif"; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(TIERS[nextTier].name, rx + 98, titleY + 80);
  drawLabel('AFTER THAT', rx + 98, titleY + 106, 11);
  drawScannerPlanet(nextTier2, rx + 54, titleY + 148, 19, 0.72);
  g.fillStyle = 'rgba(255,255,255,0.76)'; g.font = "700 14px 'Segoe UI', sans-serif"; g.fillText(TIERS[nextTier2].name, rx + 98, titleY + 137);

  drawSideCard(rx, titleY + 208, rpW, 112, 'RUN TELEMETRY', '#67e8d8');
  g.fillStyle = '#fff'; g.font = "800 29px 'Segoe UI', sans-serif"; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(String(score), rx + 16, titleY + 242);
  drawLabel('SCORE', rx + 18, titleY + 278, 11);
  g.fillStyle = combo > 1 ? '#ffd84a' : 'rgba(255,255,255,0.84)'; g.font = "800 22px 'Segoe UI', sans-serif"; g.fillText(combo > 1 ? `x${combo}` : 'READY', rx + rpW * 0.58, titleY + 247);
  drawLabel('COMBO', rx + rpW * 0.58, titleY + 278, 11);

  const controlsY = Math.min(viewH - 146, titleY + 340);
  drawSideCard(rx, controlsY, rpW, 126, 'STATION ACCESS', '#78a8ff');
  const bw = Math.floor((rpW - 48) / 3);
  drawButton(rx + 16, controlsY + 53, bw, 52, 'SHOP', () => openOverlay('shop'), '#8f6dff');
  drawButton(rx + 24 + bw, controlsY + 53, bw, 52, 'GOALS', () => openOverlay('missions'), '#4da8ff');
  drawButton(rx + 32 + bw * 2, controlsY + 53, bw, 52, 'DEX', () => openOverlay('dex'), '#ff9f43');
}

let lastTime = performance.now();
function advanceSimulation() {
  simTime += FIXED_STEP_MS;
  if (dropReadyAt && simTime >= dropReadyAt) canDrop = true;
  if (state === 'playing' && !overlay) {
    keyboardMove(FIXED_STEP_MS / 1000);
    Engine.update(engine, FIXED_STEP_MS);
    processMerges();
    checkDanger(simTime);
    if (comboTimer > 0) { comboTimer -= FIXED_STEP_MS / 1000; if (comboTimer <= 0) combo = 0; }
    for (const p of planets) {
      if (!p.landed && simTime - p.born > 80) {
        const vy = p.body.velocity.y;
        if (p.maxVy === undefined) p.maxVy = 0;
        p.maxVy = Math.max(p.maxVy, vy);
        if (p.maxVy > 4 && vy < 1.2) {
          p.landed = true;
          p.sq = Math.min(0.30, p.maxVy * 0.025);
          p.sqT = simTime;
        }
      }
    }
  }
  const dt = FIXED_STEP_MS / 1000;
  const unit = dt * 60;
  for (const p of planets) if (p.pop > 0) p.pop = Math.max(0, p.pop - dt * 5.4);
  for (const p of particles) { p.x += p.vx * unit; p.y += p.vy * unit; p.vy += 0.15 * unit; p.life -= dt * 1.4; }
  particles = particles.filter(p => p.life > 0).slice(-360);
  for (const r of rings) r.life -= dt * 2.2;
  rings = rings.filter(r => r.life > 0).slice(-24);
  for (const f of flashes) f.life -= dt * 4.5;
  flashes = flashes.filter(f => f.life > 0).slice(-24);
  for (const s of sparkles) { s.x += s.vx * unit; s.y += s.vy * unit; s.vy += 0.08 * unit; s.life -= dt * 1.2; s.rot += dt * 4; }
  sparkles = sparkles.filter(s => s.life > 0).slice(-160);
  for (const f of floatTexts) { f.y -= 40 * dt; f.life -= dt; }
  floatTexts = floatTexts.filter(f => f.life > 0).slice(-12);
  for (const t of toasts) t.life -= dt;
  toasts = toasts.filter(t => t.life > 0).slice(-5);
  mergeTelegraphs = mergeTelegraphs.filter(m => m.until > simTime);
  for (const path of chainPaths) path.life -= dt * 1.5;
  chainPaths = chainPaths.filter(path => path.life > 0).slice(-12);
  if (shake > 0) shake = Math.max(0, shake - dt * (reducedMotion ? 55 : 30));
}

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(MAX_CATCHUP_MS, Math.max(0, now - lastTime));
  lastTime = now;
  if (!paused && now >= hitStopUntil) {
    physicsAccumulator += elapsed;
    while (physicsAccumulator + 1e-7 >= FIXED_STEP_MS) {
      advanceSimulation();
      physicsAccumulator -= FIXED_STEP_MS;
    }
  }

  render(now);
}

function render(now) {
  buttons = [];
  // First paint the complete browser viewport in CSS pixels. The chamber is a
  // second, local coordinate system so Matter physics stays untouched.
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  art.drawDesktopScene(g, viewW, viewH, now, desktop);
  g.save();
  g.translate(chamber.x, chamber.y);
  g.scale(chamber.scale, chamber.scale);
  if (shake > 0 && !reducedMotion) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  // background
  g.fillStyle = '#05070f';
  g.fillRect(-14, -14, GAME_W + 28, GAME_H + 28);
  art.drawBackground(g, now);

  // glass container (space station walls)
  if (state === 'playing' || state === 'gameover' || state === 'dropping') {
    art.drawContainer(g, now);
  }

  // danger line — pulsing laser
  if (state === 'playing' || state === 'gameover') {
    art.drawLaserLine(g, DANGER_Y, now, dangerPulse);
  }

  // Spatial pressure read: every settled body breaking the line gets a
  // projected danger column and a visible grace countdown.
  if (state === 'playing') {
    for (const p of planets) {
      if (!p.aboveSince) continue;
      const remaining = Math.max(0, (GRACE_MS - (simTime - p.aboveSince)) / 1000);
      g.save();
      g.globalAlpha = 0.18 + dangerPulse * 0.35;
      g.fillStyle = '#ff4d5d';
      g.fillRect(p.body.position.x - TIERS[p.tier].r, 0, TIERS[p.tier].r * 2, DANGER_Y);
      g.strokeStyle = '#ffe2e5'; g.lineWidth = 2;
      g.beginPath(); g.arc(p.body.position.x, Math.max(20, p.body.position.y - TIERS[p.tier].r - 16), 11 + dangerPulse * 7, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1; g.fillStyle = '#fff1f1'; g.font = "bold 14px 'Segoe UI', sans-serif"; g.textAlign = 'center';
      g.fillText(`${remaining.toFixed(1)}s`, p.body.position.x, Math.max(18, p.body.position.y - TIERS[p.tier].r - 11));
      g.restore();
    }
  }

  // Pair telegraphs make the pull and the resulting tier readable before the
  // bodies are removed by the fixed-step merge.
  for (const m of mergeTelegraphs) {
    if (!planets.includes(m.a) || !planets.includes(m.b)) continue;
    const life = Math.max(0, (m.until - simTime) / 145);
    const ax = m.a.body.position.x, ay = m.a.body.position.y, bx = m.b.body.position.x, by = m.b.body.position.y;
    g.save(); g.globalAlpha = 0.35 + (1 - life) * 0.55; g.strokeStyle = m.color; g.lineWidth = 2.5;
    g.setLineDash([5, 5]); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.setLineDash([]);
    for (const [x, y] of [[ax, ay], [bx, by]]) { g.beginPath(); g.arc(x, y, TIERS[m.a.tier].r + 7 + (1 - life) * 8, 0, Math.PI * 2); g.stroke(); }
    g.restore();
  }

  // planets
  for (const p of planets) {
    // spawn pop: overshoot scale-in on merge result
    const pop = p.pop > 0 ? 1 + Math.sin((1 - p.pop) * Math.PI) * 0.22 : 1;
    // squash & stretch after landing (decaying bounce)
    let sqx = 1, sqy = 1;
    if (p.sq > 0) {
      const el = (simTime - p.sqT) / 260;
      if (el < 1) {
        const k = p.sq * (1 - el) * Math.cos(el * Math.PI * 2);
        sqx = 1 + k; sqy = 1 - k;
      } else p.sq = 0;
    }
    drawPlanet(p.body.position.x, p.body.position.y, p.body.angle, p.tier, 1, pop * sqx, pop * sqy, now);
  }

  // merge FX: flashes (additive), rings, sparkles
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const f of flashes) {
    const grad = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (1.3 - f.life * 0.3));
    grad.addColorStop(0, `rgba(255,255,255,${(f.life * 0.85).toFixed(2)})`);
    grad.addColorStop(0.4, `rgba(255,240,190,${(f.life * 0.4).toFixed(2)})`);
    grad.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(f.x, f.y, f.r * 1.3, 0, Math.PI * 2); g.fill();
  }
  for (const r of rings) {
    const t = 1 - r.life;
    const rr = r.r + (r.r1 - r.r) * (1 - Math.pow(1 - t, 3));
    g.globalAlpha = r.life * 0.85;
    g.strokeStyle = r.color;
    g.lineWidth = r.lw * r.life + 0.5;
    g.beginPath(); g.arc(r.x, r.y, rr, 0, Math.PI * 2); g.stroke();
  }
  g.globalAlpha = 1;
  for (const s of sparkles) {
    g.globalAlpha = Math.min(1, s.life);
    g.fillStyle = '#ffe9a0';
    g.save();
    g.translate(s.x, s.y); g.rotate(s.rot);
    // 4-point star
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? s.r * 0.36 : s.r;
      const a = (i / 8) * Math.PI * 2;
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
    g.restore();
  }
  g.globalAlpha = 1;
  g.restore();

  for (const path of chainPaths) {
    g.save(); g.globalAlpha = path.life; g.strokeStyle = path.color; g.lineWidth = 2;
    g.setLineDash([3, 7]); g.beginPath(); g.moveTo(path.x0, path.y0); g.lineTo(path.x1, path.y1); g.stroke(); g.setLineDash([]); g.restore();
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
      // soft beam trail under the held planet
      const tr = TIERS[currentTier].r;
      const beam = g.createLinearGradient(0, DROP_Y, 0, GAME_H - 20);
      beam.addColorStop(0, 'rgba(150,200,255,0.10)');
      beam.addColorStop(1, 'rgba(150,200,255,0.01)');
      g.fillStyle = beam;
      g.fillRect(dropX - tr * 0.45, DROP_Y, tr * 0.9, GAME_H - 20 - DROP_Y);
      g.strokeStyle = 'rgba(180,220,255,0.30)';
      g.lineWidth = 1;
      g.setLineDash([6, 10]);
      g.beginPath(); g.moveTo(dropX, DROP_Y + tr); g.lineTo(dropX, GAME_H - 20); g.stroke();
      g.setLineDash([]);
      // gentle bob while aiming
      const bob = Math.sin(now / 300) * 2;
      drawPlanet(dropX, DROP_Y + bob, 0, currentTier, 0.95, 1, 1, now);
    }
    // First-run, in-play visual onboarding. It intentionally uses two concise
    // labels plus a click gesture, and permanently clears after one valid drop.
    if (simTime < tutorialUntil) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 260);
      const targetY = GAME_H - TIERS[0].r - 42;
      g.save();
      g.globalAlpha = 0.2 + pulse * 0.22;
      g.strokeStyle = '#ffd84a'; g.lineWidth = 4;
      g.beginPath(); g.arc(GAME_W / 2, GAME_H - TIERS[0].r - 12, TIERS[0].r + 13 + pulse * 7, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.78 + pulse * 0.2;
      g.strokeStyle = '#ffd84a'; g.lineWidth = 3;
      g.setLineDash([7, 8]);
      g.beginPath(); g.moveTo(GAME_W / 2, DROP_Y + 44); g.lineTo(GAME_W / 2, targetY - 16); g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#ffd84a';
      g.beginPath(); g.moveTo(GAME_W / 2 - 8, targetY - 21); g.lineTo(GAME_W / 2 + 8, targetY - 21); g.lineTo(GAME_W / 2, targetY - 8); g.closePath(); g.fill();
      art.glassPanel(g, GAME_W / 2 - 145, 142, 290, 72, 14);
      // Simple mouse/touch gesture glyph: cursor, press ripple and drop path.
      g.globalAlpha = 0.92;
      g.fillStyle = '#dceaff';
      g.beginPath(); g.moveTo(GAME_W / 2 - 112, 160); g.lineTo(GAME_W / 2 - 112, 189); g.lineTo(GAME_W / 2 - 104, 181); g.lineTo(GAME_W / 2 - 98, 194); g.lineTo(GAME_W / 2 - 92, 191); g.lineTo(GAME_W / 2 - 99, 176); g.lineTo(GAME_W / 2 - 88, 176); g.closePath(); g.fill();
      g.strokeStyle = '#ffd84a'; g.lineWidth = 2; g.beginPath(); g.arc(GAME_W / 2 - 107, 168, 14 + pulse * 4, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#fff'; g.font = "bold 15px 'Segoe UI', sans-serif"; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('CLICK A COLUMN TO DROP', GAME_W / 2 - 80, 165);
      g.fillStyle = '#ffd84a'; g.font = "bold 13px 'Segoe UI', sans-serif";
      g.fillText('MATCH THE GLOWING PLUTO', GAME_W / 2 - 80, 188);
      g.restore();
    }
    // HUD
    art.glassPanel(g, 10, 8, 150, 84, 12);
    g.fillStyle = '#fff';
    g.font = "bold 30px 'Segoe UI', sans-serif";
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(String(score), 22, 14);
    g.font = "14px 'Segoe UI', sans-serif";
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillText(`BEST ${Math.max(best, score)}`, 22, 48);
    g.fillStyle = '#ffd84a';
    g.fillText(`\u2726 ${meta.state.stardust}`, 22, 68);
    // next planet (scaled-down preview)
    art.glassPanel(g, GAME_W - 78, 8, 68, meta.state.unlocks.next2 ? 118 : 84, 12);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.textAlign = 'right';
    g.fillText('NEXT', GAME_W - 24, 16);
    {
      const pr = TIERS[nextTier].r;
      const s = Math.min(1, 22 / pr);
      g.save();
      g.translate(GAME_W - 42, 58);
      g.scale(s, s);
      drawPlanet(0, 0, 0, nextTier, 1);
      g.restore();
      // FAR SIGHT unlock: show planet after next
      if (meta.state.unlocks.next2) {
        const pr2 = TIERS[nextTier2].r;
        const s2 = Math.min(1, 14 / pr2);
        g.save();
        g.translate(GAME_W - 42, 104);
        g.scale(s2, s2);
        drawPlanet(0, 0, 0, nextTier2, 0.6);
        g.restore();
      }
    }
    // power-up buttons (bottom corners)
    if (meta.state.unlocks.undo) drawButton(10, GAME_H - 60, 118, 48, undoLeft > 0 ? `↶ UNDO ${undoLeft}/1` : 'UNDO USED', useUndo, undoLeft > 0 ? '#5f3dc4' : '#555b70');
    if (meta.state.unlocks.bomb) {
      const novaReady = bombLeft > 0 && planets.length >= 3;
      const novaLabel = bombLeft <= 0 ? 'NOVA USED' : (novaReady ? `☀ NOVA ${bombLeft}/1` : 'NOVA · 3+');
      drawButton(GAME_W - 128, GAME_H - 60, 118, 48, novaLabel, useBomb, novaReady ? '#e8590c' : '#555b70');
    }
    // combo
    if (combo > 1) {
      g.textAlign = 'center';
      const cs = 26 + Math.min(18, combo * 2.4);
      g.save();
      g.shadowColor = combo >= 5 ? '#ff8c3a' : '#ffd84a';
      g.shadowBlur = 8 + combo * 2;
      g.fillStyle = combo >= 5 ? '#ffb03a' : '#ffd84a';
      g.font = `bold ${cs | 0}px 'Segoe UI', sans-serif`;
      const wob = combo >= 4 ? Math.sin(now / 60) * (combo * 0.4) : 0;
      g.fillText(`COMBO x${combo}`, GAME_W / 2 + wob, 14);
      g.restore();
    }
  }

  if (state === 'menu') {
    g.fillStyle = 'rgba(4,6,15,0.45)';
    g.fillRect(0, 0, GAME_W, GAME_H);
    // animated mini solar system: sun + orbiting planets
    {
      const scx = GAME_W / 2, scy = 235;
      g.save();
      g.translate(scx, scy);
      g.scale(0.5, 0.5);
      drawPlanet(0, 0, 0, 10, 1, 1, 1, now);
      g.restore();
      const orbits = [
        { tier: 5, d: 155, sp: 0.00022, ph: 0 },
        { tier: 8, d: 215, sp: 0.00013, ph: 2.2 },
        { tier: 3, d: 118, sp: 0.00034, ph: 4.1 },
      ];
      for (const o of orbits) {
        g.strokeStyle = 'rgba(150,190,255,0.10)';
        g.lineWidth = 1;
        g.beginPath(); g.ellipse(scx, scy, o.d, o.d * 0.38, 0, 0, Math.PI * 2); g.stroke();
        const a = now * o.sp + o.ph;
        const px = scx + Math.cos(a) * o.d;
        const py = scy + Math.sin(a) * o.d * 0.38;
        const sc = 0.42 + 0.10 * Math.sin(a); // fake depth
        g.save();
        g.translate(px, py);
        g.scale(sc, sc);
        drawPlanet(0, 0, now * 0.0004, o.tier, 1);
        g.restore();
      }
    }
    drawMenuLogo(now);
    g.font = "20px 'Segoe UI', sans-serif";
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Merge planets. Build the Sun.', GAME_W / 2, 470);
    drawButton(GAME_W / 2 - 110, 500, 220, 64, 'PLAY', startGame, '#37b24d');
    drawButton(GAME_W / 2 - 165, 585, 100, 46, 'SHOP', () => openOverlay('shop'), '#5f3dc4');
    drawButton(GAME_W / 2 - 50, 585, 100, 46, 'GOALS', () => openOverlay('missions'), '#1971c2');
    drawButton(GAME_W / 2 + 65, 585, 100, 46, 'DEX', () => openOverlay('dex'), '#e8590c');
    g.fillStyle = '#ffd84a';
    g.font = "bold 20px 'Segoe UI', sans-serif";
    g.fillText(`\u2726 ${meta.state.stardust} stardust`, GAME_W / 2, 665);
    if (best > 0) {
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.font = "16px 'Segoe UI', sans-serif";
      g.fillText(`Best score: ${best}`, GAME_W / 2, 695);
    }
    if (dailyMsg) {
      g.fillStyle = '#ffd84a';
      g.font = "bold 16px 'Segoe UI', sans-serif";
      g.fillText(`Daily bonus +${dailyMsg.amount}\u2726  (day ${dailyMsg.streak})`, GAME_W / 2, 725);
    }
  }

  if (state === 'gameover' && !overlay) {
    g.fillStyle = 'rgba(5,8,18,0.7)';
    g.fillRect(0, 0, GAME_W, GAME_H);
    art.glassPanel(g, GAME_W / 2 - 175, 160, 350, 210, 18);
    g.save();
    g.shadowColor = '#ff5050';
    g.shadowBlur = 18;
    g.fillStyle = '#ff6b6b';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = "bold 30px 'Segoe UI', sans-serif";
    g.fillText('CHAMBER OVERLOAD', GAME_W / 2, 210);
    g.restore();
    g.fillStyle = '#fff';
    g.font = "bold 34px 'Segoe UI', sans-serif";
    g.fillText(String(score), GAME_W / 2, 270);
    g.font = "16px 'Segoe UI', sans-serif";
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.fillText(lossReason || (score >= best && score > 0 ? 'NEW BEST!' : `Best: ${best}`), GAME_W / 2, 310);
    g.fillStyle = '#ffd84a';
    g.fillText(`+${stardustEarned}\u2726 stardust earned`, GAME_W / 2, 340);
    let by = 385;
    if (!usedSecondChance && planets.length > 4 && simTime - gameOverAt > 600) {
      drawButton(GAME_W / 2 - 150, by, 300, 56, '\u25B6 SECOND CHANCE (AD)', secondChance, '#f59f00');
      by += 70;
    }
    if (simTime - gameOverAt > 600) {
      if (!doubledStardust && stardustEarned > 0) {
        drawButton(GAME_W / 2 - 150, by, 300, 56, `\u25B6 DOUBLE \u2726 (AD)`, doubleStardust, '#5f3dc4');
        by += 70;
      }
      drawButton(GAME_W / 2 - 110, by, 220, 56, 'PLAY AGAIN', restartWithAd, '#37b24d');
      by += 70;
      drawButton(GAME_W / 2 - 110, by, 220, 44, 'SHOP', () => openOverlay('shop'), '#5f3dc4');
    }
  }

  if (overlay) renderOverlay();

  // toasts (mission complete / daily bonus)
  {
    let ty = 100;
    for (const t of toasts) {
      g.globalAlpha = Math.min(1, t.life);
      g.fillStyle = 'rgba(20,26,53,0.92)';
      g.font = "bold 17px 'Segoe UI', sans-serif";
      const w = g.measureText(t.text).width + 36;
      roundRect(GAME_W / 2 - w / 2, ty, w, 36, 10);
      g.fill();
      g.strokeStyle = '#ffd84a'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = '#ffd84a';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t.text, GAME_W / 2, ty + 19);
      ty += 44;
    }
    g.globalAlpha = 1;
  }

  if (state === 'adplaying') {
    g.fillStyle = 'rgba(5,8,18,0.85)';
    g.fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = "22px 'Segoe UI', sans-serif";
    g.fillText('Loading...', GAME_W / 2, GAME_H / 2);
  }
  g.restore();
  // Chamber paint may cover the scene seam; redraw it in viewport space so
  // every browser edge remains an intentional part of the station frame.
  g.fillStyle = '#1d3478';
  g.fillRect(0, 0, viewW, 3);
  g.fillRect(0, viewH - 3, viewW, 3);
  drawDesktopUI(now);
}

// ---------- Overlays: shop / missions / dex ----------
function renderOverlay() {
  g.fillStyle = 'rgba(5,8,18,0.88)';
  g.fillRect(0, 0, GAME_W, GAME_H);
  g.textAlign = 'center'; g.textBaseline = 'middle';

  if (overlay === 'shop') {
    g.save();
    g.shadowColor = '#8f6dff'; g.shadowBlur = 14;
    g.fillStyle = '#fff';
    g.font = "bold 34px 'Segoe UI', sans-serif";
    g.fillText('SHOP', GAME_W / 2, 60);
    g.restore();
    g.fillStyle = '#ffd84a';
    g.font = "bold 20px 'Segoe UI', sans-serif";
    g.fillText(`\u2726 ${meta.state.stardust}`, GAME_W / 2, 100);
    let y = 140;
    for (const item of meta.SHOP_ITEMS) {
      const owned = meta.state.unlocks[item.id];
      const afford = meta.state.stardust >= item.cost;
      art.glassPanel(g, 16, y - 8, GAME_W - 32, 66, 12);
      g.textAlign = 'left';
      g.fillStyle = '#fff';
      g.font = "bold 18px 'Segoe UI', sans-serif";
      g.fillText(item.name, 30, y + 18);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = "14px 'Segoe UI', sans-serif";
      g.fillText(item.desc, 30, y + 40);
      if (owned) {
        const isSkin = item.id === 'neon' || item.id === 'nova';
        if (isSkin) {
          const active = meta.state.skin === item.id;
          drawButton(GAME_W - 150, y + 4, 120, 44, active ? 'ACTIVE' : 'EQUIP',
            () => { meta.setSkin(active ? 'classic' : item.id); }, active ? '#37b24d' : '#4a6cf0');
        } else {
          g.textAlign = 'right';
          g.fillStyle = '#37b24d';
          g.font = "bold 16px 'Segoe UI', sans-serif";
          g.fillText('OWNED', GAME_W - 30, y + 26);
        }
      } else {
        drawButton(GAME_W - 150, y + 4, 120, 44, `${item.cost}\u2726`,
          () => { if (meta.buy(item.id)) { audio.bigMergeSound(); toast(`Unlocked: ${item.name}!`); if (state === 'playing') { undoLeft = meta.state.unlocks.undo ? Math.max(undoLeft, 1) : 0; bombLeft = meta.state.unlocks.bomb ? Math.max(bombLeft, 1) : 0; } } else audio.warnSound(); },
          afford ? '#f59f00' : '#555b70');
      }
      y += 78;
    }
  }

  if (overlay === 'missions') {
    g.fillStyle = '#fff';
    g.font = "bold 34px 'Segoe UI', sans-serif";
    g.fillText('GOALS', GAME_W / 2, 56);
    const list = meta.missionList(score);
    let y = 100;
    g.font = "15px 'Segoe UI', sans-serif";
    for (const m of list) {
      g.textAlign = 'left';
      g.fillStyle = m.done ? '#37b24d' : 'rgba(255,255,255,0.85)';
      g.fillText(`${m.done ? '\u2713' : '\u25CB'}  ${m.label}`, 36, y);
      g.textAlign = 'right';
      g.fillStyle = m.done ? 'rgba(255,255,255,0.35)' : '#ffd84a';
      g.fillText(`+${m.reward}\u2726`, GAME_W - 36, y);
      y += 38;
    }
  }

  if (overlay === 'dex') {
    g.fillStyle = '#fff';
    g.font = "bold 34px 'Segoe UI', sans-serif";
    g.fillText('PLANET DEX', GAME_W / 2, 56);
    const cols = 3;
    for (let i = 0; i < TIERS.length; i++) {
      const cx = GAME_W / 2 + (i % cols - 1) * 150;
      const cy = 150 + Math.floor(i / cols) * 140;
      const count = meta.state.dex[i] || 0;
      const known = count > 0 || i <= MAX_DROP_TIER;
      const s = Math.min(1, 38 / TIERS[i].r);
      g.save();
      g.translate(cx, cy);
      g.scale(s, s);
      if (known) drawPlanet(0, 0, 0, i, 1);
      else {
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.beginPath(); g.arc(0, 0, TIERS[i].r, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.font = `bold ${TIERS[i].r}px 'Segoe UI', sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('?', 0, 0);
      }
      g.restore();
      g.fillStyle = known ? '#fff' : 'rgba(255,255,255,0.35)';
      g.font = "bold 14px 'Segoe UI', sans-serif";
      g.textAlign = 'center';
      g.fillText(known ? TIERS[i].name : '???', cx, cy + 52);
      if (count > 0) {
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.font = "12px 'Segoe UI', sans-serif";
        g.fillText(`\u00D7${count}`, cx, cy + 68);
      }
    }
  }

  drawButton(GAME_W / 2 - 80, GAME_H - 70, 160, 50, 'BACK', closeOverlay, '#4a6cf0');
}


// debug hooks for QA (harmless in prod)
if (location.search.includes('debug=1')) {
  window.__astro = {
    forceGameOver: () => gameOver(),
    restart: () => startGame(),
    getState: () => ({
      state, score, combo, planets: planets.length, overlay,
      stardust: meta.state.stardust, unlocks: { ...meta.state.unlocks },
      skin: meta.state.skin, streak: meta.state.streak,
      missionsDone: Object.keys(meta.state.missionsDone).length,
      totalRuns: meta.state.totalRuns, totalMerges: meta.state.totalMerges,
      undoLeft, bombLeft, stardustEarned, paused, simTime,
      hitStopRemaining: Math.max(0, hitStopUntil - performance.now()),
      onboarding: simTime < tutorialUntil,
      tiers: planets.reduce((all, p) => { all[p.tier] = (all[p.tier] || 0) + 1; return all; }, {}),
      floatTexts: floatTexts.map(({ x, y, w, h, text }) => ({ x, y, w, h, text })),
      counts: { planets: planets.length, particles: particles.length, rings: rings.length, sparkles: sparkles.length, texts: floatTexts.length, telegraphs: mergeTelegraphs.length, queuedMerges: mergeQueue.length, listeners: 13, timers: 0 },
    }),
    addScore: (n) => { score += n; },
    addStardust: (n) => { meta.addStardust(n); meta.save(); },
    buy: (id) => meta.buy(id),
    setSkin: (id) => meta.setSkin(id),
    openOverlay,
    closeOverlay,
    meta: meta.state,
    spawn: (tier, x, y) => spawnPlanet(tier, x ?? GAME_W / 2, y ?? 200),
    useUndo,
    useBomb,
    advance: (seconds) => {
      const steps = Math.max(0, Math.floor(seconds * 60));
      for (let i = 0; i < steps; i++) if (!paused) advanceSimulation();
      return window.__astro.getState();
    },
    setPaused: (value) => setPaused('debug', value),
    setReducedMotion: (value) => { reducedMotion = !!value; },
    pressButton: (substr) => {
      const b = buttons.find(b => b.label && b.label.includes(substr));
      if (b) { b.fn(); return true; }
      return false;
    },
    buttons: () => buttons.map(b => b.label),
    buttonRects: () => buttons.map(({ x, y, w, h, label }) => ({ x, y, w, h, label })),
  };
}

(async () => {
  await cg.initSDK();
  cg.loadingStart();
  best = cg.loadBest();
  dailyMsg = meta.load(); // shown in menu; no duplicate toast
  audio.setMuted(cg.getMuteSetting());
  cg.onSettingsChange(s => audio.setMuted(!!s.muteAudio));
  cg.loadingStop && cg.loadingStop();
  // flush pending meta saves periodically + on tab close (never lose progress)
  setInterval(() => meta.flushIfDirty(), 5000);
  window.addEventListener('beforeunload', () => meta.flushIfDirty());
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  motionQuery?.addEventListener?.('change', event => { reducedMotion = event.matches; });
  window.__astroReady = true;
  requestAnimationFrame(frame);
})();
