// Fixed-step regression gate: identical simulated duration must produce the same
// physics position, spawn count and difficulty phase at 60, 144 and 165Hz.
const assert = require('node:assert/strict');
const Matter = require('matter-js');
const STEP = 1000 / 60;

function simulate(hz, fixed = true) {
  const engine = Matter.Engine.create();
  engine.gravity.y = 1.1;
  Matter.World.add(engine.world, [
    Matter.Bodies.rectangle(260, 790, 640, 60, { isStatic: true }),
    Matter.Bodies.rectangle(-25, 380, 50, 900, { isStatic: true }),
    Matter.Bodies.rectangle(545, 380, 50, 900, { isStatic: true }),
  ]);
  const planet = Matter.Bodies.circle(260, 90, 17, { restitution: 0.18, friction: 0.25 });
  Matter.World.add(engine.world, planet);
  let elapsed = 0, accumulator = 0, simTime = 0, spawns = 0, frames = 0;
  const totalFrames = Math.round(hz * 120);
  while (frames < totalFrames) {
    const delta = 1000 / hz;
    elapsed += delta; frames++;
    if (fixed) {
      accumulator += delta;
      while (accumulator + 1e-7 >= STEP) {
        Matter.Engine.update(engine, STEP);
        simTime += STEP;
        spawns = Math.floor(simTime / 1000);
        accumulator -= STEP;
      }
    } else {
      Matter.Engine.update(engine, STEP);
      simTime += STEP;
      spawns = frames; // representative frame-count difficulty bug
    }
  }
  return { x: planet.position.x, y: planet.position.y, vx: planet.velocity.x, vy: planet.velocity.y, spawns, difficulty: Math.max(0, 1 - simTime / 120000), frames };
}

const baseline = simulate(60);
for (const hz of [144, 165]) {
  const actual = simulate(hz);
  for (const key of ['x', 'y', 'vx', 'vy']) assert.ok(Math.abs(actual[key] - baseline[key]) < 0.0001, `${hz}Hz ${key} drifted: ${actual[key]} vs ${baseline[key]}`);
  assert.equal(actual.spawns, baseline.spawns, `${hz}Hz spawn count`);
  assert.equal(actual.difficulty, baseline.difficulty, `${hz}Hz difficulty`);
}
// Mutation/negative proof: a frame-count simulation diverges at high refresh.
assert.notEqual(simulate(165, false).spawns, baseline.spawns, 'negative control must expose frame-count difficulty');
console.log('PASS fixed-step determinism: 60/144/165Hz', { baseline, at144: simulate(144), at165: simulate(165) });
