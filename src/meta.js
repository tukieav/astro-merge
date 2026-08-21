// Meta-progression: persistent stardust currency, unlocks, missions, dex, daily streak.
// Saved via CrazyGames SDK data module (cloud) + localStorage fallback (see sdk.js).
import * as cg from './sdk.js';

const KEY = 'meta';

export const state = {
  version: 2,
  stardust: 0,
  totalRuns: 0,
  totalMerges: 0,
  skin: 'classic',
  unlocks: { neon: false, nova: false, undo: false, bomb: false, next2: false },
  missionsDone: {},
  dex: {},            // tierIndex -> times created
  streak: 0,
  lastDay: '',
  bestCombo: 0,
  music: true,
};

export const MISSIONS = [
  { id: 'mars',    label: 'Create Mars',        reward: 20,  check: s => (s.dex[3] || 0) > 0 },
  { id: 'earth',   label: 'Create Earth',       reward: 40,  check: s => (s.dex[5] || 0) > 0 },
  { id: 'saturn',  label: 'Create Saturn',      reward: 80,  check: s => (s.dex[8] || 0) > 0 },
  { id: 'jupiter', label: 'Create Jupiter',     reward: 120, check: s => (s.dex[9] || 0) > 0 },
  { id: 'sun',     label: 'Create the Sun',     reward: 300, check: s => (s.dex[10] || 0) > 0 },
  { id: 'combo4',  label: 'Reach combo x4',     reward: 30,  check: s => s.bestCombo >= 4 },
  { id: 'combo8',  label: 'Reach combo x8',     reward: 100, check: s => s.bestCombo >= 8 },
  { id: 'runs5',   label: 'Play 5 runs',        reward: 50,  check: s => s.totalRuns >= 5 },
  { id: 'runs20',  label: 'Play 20 runs',       reward: 150, check: s => s.totalRuns >= 20 },
  { id: 'merge100',label: 'Merge 100 planets',  reward: 60,  check: s => s.totalMerges >= 100 },
  { id: 'merge500',label: 'Merge 500 planets',  reward: 200, check: s => s.totalMerges >= 500 },
];

// score-based missions get checked with the live score passed in
export const SCORE_MISSIONS = [
  { id: 'score500',  label: 'Score 500 in one run',  reward: 30,  target: 500 },
  { id: 'score2000', label: 'Score 2000 in one run', reward: 80,  target: 2000 },
  { id: 'score5000', label: 'Score 5000 in one run', reward: 200, target: 5000 },
];

export const SHOP_ITEMS = [
  { id: 'undo',  name: 'UNDO DROP',   desc: '1 undo per run',        cost: 100 },
  { id: 'next2', name: 'FAR SIGHT',   desc: 'see 2 next planets',    cost: 200 },
  { id: 'bomb',  name: 'NOVA BOMB',   desc: 'clear 3 smallest, 1/run', cost: 250 },
  { id: 'neon',  name: 'NEON SKIN',   desc: 'planet color theme',    cost: 150 },
  { id: 'nova',  name: 'NOVA SKIN',   desc: 'planet color theme',    cost: 400 },
];

let dirty = false;

function number(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

// Saves are player-controlled local data. Copy only known, correctly-shaped
// fields so old/corrupt saves cannot turn an expected object into a primitive.
function migrate(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
  const safe = {
    version: 2,
    stardust: number(saved.stardust, 0),
    totalRuns: number(saved.totalRuns, 0),
    totalMerges: number(saved.totalMerges, 0),
    skin: typeof saved.skin === 'string' ? saved.skin : 'classic',
    unlocks: {}, missionsDone: {}, dex: {},
    streak: number(saved.streak, 0, 0, 3650),
    lastDay: typeof saved.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.lastDay) ? saved.lastDay : '',
    bestCombo: number(saved.bestCombo, 0, 0, 999),
    music: typeof saved.music === 'boolean' ? saved.music : true,
  };
  for (const id of Object.keys(state.unlocks)) safe.unlocks[id] = !!saved.unlocks?.[id];
  for (const [id, value] of Object.entries(saved.missionsDone || {})) if (typeof value === 'boolean') safe.missionsDone[id] = value;
  for (const [tier, value] of Object.entries(saved.dex || {})) {
    if (/^(?:[0-9]|10)$/.test(tier)) safe.dex[tier] = number(value, 0, 0, 1000000);
  }
  if (safe.skin !== 'classic' && !safe.unlocks[safe.skin]) safe.skin = 'classic';
  return safe;
}

export function load() {
  const saved = migrate(cg.loadData(KEY));
  if (saved) Object.assign(state, saved);
  return dailyBonus();
}

export function save() {
  cg.saveData(KEY, state);
  dirty = false;
}

export function markDirty() { dirty = true; }
export function flushIfDirty() { if (dirty) save(); }

// Returns { amount, streak } if a daily bonus was granted, else null
function dailyBonus() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastDay === today) return null;
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  state.streak = state.lastDay === yest ? state.streak + 1 : 1;
  state.lastDay = today;
  const amount = Math.min(50, 10 * state.streak);
  state.stardust += amount;
  save();
  return { amount, streak: state.streak };
}

export function addStardust(n) { state.stardust += n; markDirty(); }

export function recordMerge(tier) {
  state.dex[tier] = (state.dex[tier] || 0) + 1;
  state.totalMerges++;
  markDirty();
}

export function recordCombo(c) {
  if (c > state.bestCombo) { state.bestCombo = c; markDirty(); }
}

export function recordRunEnd(score) {
  state.totalRuns++;
  markDirty();
  save();
}

export function buy(id) {
  const item = SHOP_ITEMS.find(i => i.id === id);
  if (!item || state.unlocks[id] || state.stardust < item.cost) return false;
  state.stardust -= item.cost;
  state.unlocks[id] = true;
  save();
  return true;
}

export function setSkin(id) {
  if (id !== 'classic' && !state.unlocks[id]) return false;
  state.skin = id;
  save();
  return true;
}

// Check all one-time missions; returns array of newly completed {label, reward}
export function checkMissions(score) {
  const completed = [];
  for (const m of MISSIONS) {
    if (!state.missionsDone[m.id] && m.check(state)) {
      state.missionsDone[m.id] = true;
      state.stardust += m.reward;
      completed.push(m);
    }
  }
  for (const m of SCORE_MISSIONS) {
    if (!state.missionsDone[m.id] && score >= m.target) {
      state.missionsDone[m.id] = true;
      state.stardust += m.reward;
      completed.push(m);
    }
  }
  if (completed.length) save();
  return completed;
}

export function missionList(score) {
  const all = [
    ...MISSIONS.map(m => ({ id: m.id, label: m.label, reward: m.reward, done: !!state.missionsDone[m.id] })),
    ...SCORE_MISSIONS.map(m => ({ id: m.id, label: m.label, reward: m.reward, done: !!state.missionsDone[m.id] })),
  ];
  return all;
}
