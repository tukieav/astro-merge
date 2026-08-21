// Astro Merge — procedural audio via WebAudio (no audio files)
let ctx = null;
let masterGain = null;
let muted = false;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (masterGain) masterGain.gain.value = m ? 0 : 0.5;
}

export function unlockAudio() { ensureCtx(); }

export function suspend() {
  if (ctx?.state === 'running') ctx.suspend();
}

export function resume() {
  if (ctx?.state === 'suspended' && !muted) ctx.resume();
}

function tone(freq, dur, type, vol, delay = 0) {
  if (muted || !ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g); g.connect(masterGain);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

export function popSound(tier, combo) {
  ensureCtx();
  const base = 220 + tier * 55 + Math.min(combo, 8) * 40;
  tone(base, 0.18, 'sine', 0.35);
  tone(base * 1.5, 0.12, 'triangle', 0.2, 0.02);
}

export function dropSound() {
  ensureCtx();
  tone(160, 0.08, 'sine', 0.12);
}

export function bigMergeSound() {
  ensureCtx();
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.25, i * 0.07));
}

export function gameOverSound() {
  ensureCtx();
  [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.15, i * 0.15));
}

export function warnSound() {
  ensureCtx();
  tone(880, 0.1, 'square', 0.08);
}
