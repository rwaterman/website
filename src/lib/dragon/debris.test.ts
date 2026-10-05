import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDebrisPool, spawnDebris, stepDebris, type DebrisChunk } from './debris.ts';

const chunk: DebrisChunk = { x: 0, y: 20, z: 0, vx: 4, vy: 0, vz: 0, sx: 1, sy: 2, sz: 1, r: 1, g: 1, b: 1, life: 60 };
const flat = (): number => 3;
const fixed = (): number => 0.5;

test('a chunk falls, bounces lower each time, and comes to rest on the ground', () => {
  const pool = createDebrisPool(4);
  const index = spawnDebris(pool, chunk, fixed);
  const impacts: number[] = [];
  for (let step = 0; step < 1200 && !pool.resting[index]; step += 1) {
    stepDebris(pool, 1 / 60, flat, (_, speed) => impacts.push(speed));
  }
  assert.equal(pool.resting[index], 1);
  assert.ok(impacts.length >= 2, 'expected more than one bounce');
  for (const [bounce, speed] of impacts.entries()) {
    if (bounce > 0) assert.ok(speed < impacts[bounce - 1], 'each bounce must lose energy');
  }
  assert.equal(pool.position[index * 3 + 1], 3 + chunk.sy / 2);
  assert.ok(pool.position[index * 3] > 0, 'horizontal velocity carried it sideways');
});

test('chunks expire and the ring reuses the oldest slot', () => {
  const pool = createDebrisPool(2);
  spawnDebris(pool, { ...chunk, life: 0.5 }, fixed);
  for (let step = 0; step < 60; step += 1) stepDebris(pool, 1 / 60, flat);
  assert.equal(pool.life[0], 0);
  spawnDebris(pool, chunk, fixed);
  assert.equal(spawnDebris(pool, { ...chunk, x: 9 }, fixed), 0);
  assert.equal(pool.position[0], 9);
});
