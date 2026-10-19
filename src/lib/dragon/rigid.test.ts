import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BODY_ASLEEP,
  BODY_AWAKE,
  addBody,
  createRigidPool,
  impulseFrom,
  liveCount,
  releaseBody,
  stepRigid,
  type RigidBody,
  type RigidPool,
} from './rigid.ts';

type Quaternion = [number, number, number, number];
type Ground = (x: number, z: number) => number;

const flat: Ground = () => 0;

function box(overrides: Partial<RigidBody>): RigidBody {
  return { x: 0, y: 10, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, hx: 1, hy: 1, hz: 1, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, ...overrides };
}

function axisAngle(x: number, y: number, z: number, angle: number): Quaternion {
  const sine = Math.sin(angle / 2);
  return [x * sine, y * sine, z * sine, Math.cos(angle / 2)];
}

function multiply(a: Quaternion, b: Quaternion): Quaternion {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** Row-major rotation matrix of a body's stored quaternion. */
function rotationOf(pool: RigidPool, index: number): number[] {
  const [x, y, z, w] = pool.quaternion.subarray(index * 4, index * 4 + 4);
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

/** How far the deepest corner sits below the terrain; negative when the box is clear of it. */
function penetration(pool: RigidPool, index: number, ground: Ground): number {
  const matrix = rotationOf(pool, index);
  const [px, py, pz] = pool.position.subarray(index * 3, index * 3 + 3);
  const [hx, hy, hz] = pool.half.subarray(index * 3, index * 3 + 3);
  let deepest = -Infinity;
  for (let corner = 0; corner < 8; corner += 1) {
    const lx = corner & 1 ? hx : -hx;
    const ly = corner & 2 ? hy : -hy;
    const lz = corner & 4 ? hz : -hz;
    const x = px + matrix[0] * lx + matrix[1] * ly + matrix[2] * lz;
    const y = py + matrix[3] * lx + matrix[4] * ly + matrix[5] * lz;
    const z = pz + matrix[6] * lx + matrix[7] * ly + matrix[8] * lz;
    deepest = Math.max(deepest, ground(x, z) - y);
  }
  return deepest;
}

/** Largest |dot| of a body axis with world up: 1 means the box lies square on a face. */
function flatness(pool: RigidPool, index: number): number {
  const matrix = rotationOf(pool, index);
  return Math.max(Math.abs(matrix[3]), Math.abs(matrix[4]), Math.abs(matrix[5]));
}

function allFinite(pool: RigidPool): boolean {
  const arrays = [pool.position, pool.velocity, pool.quaternion, pool.angular];
  return arrays.every((array) => array.every((value) => Number.isFinite(value)));
}

/** Steps until the body sleeps or time runs out; returns the simulated seconds taken. */
function settle(pool: RigidPool, index: number, seconds: number, dt: number, ground: Ground, onStep?: () => void): number {
  let elapsed = 0;
  while (elapsed < seconds && pool.state[index] !== BODY_ASLEEP) {
    stepRigid(pool, dt, ground);
    elapsed += dt;
    onStep?.();
  }
  return elapsed;
}

test('a flat box dropped level lands and sleeps on its broad face', () => {
  const pool = createRigidPool(1);
  const index = addBody(pool, box({ hx: 1, hy: 0.5, hz: 2 }));
  settle(pool, index, 6, 1 / 60, flat);
  assert.equal(pool.state[index], BODY_ASLEEP);
  assert.ok(Math.abs(pool.position[1] - 0.5) <= 0.05, `centre at ${pool.position[1]}`);
});

test('a cube dropped on a corner tips over and lies flat', () => {
  const pool = createRigidPool(1);
  const [qx, qy, qz, qw] = multiply(axisAngle(0, 0, 1, (20 * Math.PI) / 180), axisAngle(1, 0, 0, (30 * Math.PI) / 180));
  const index = addBody(pool, box({ qx, qy, qz, qw }));
  settle(pool, index, 8, 1 / 60, flat);
  assert.equal(pool.state[index], BODY_ASLEEP);
  assert.ok(Math.abs(pool.position[1] - 1) <= 0.06, `centre at ${pool.position[1]}`);
  assert.ok(flatness(pool, index) > 0.99, `axis alignment ${flatness(pool, index)}`);
});

test('a tall slab rolled about its base edge topples onto its large face', () => {
  const pool = createRigidPool(1);
  // Spin about the -x base edge, so the centre moves with it: v = ω × (centre - edge) = (-3ω, 0.5ω, 0).
  const index = addBody(pool, box({ y: 3, hx: 0.5, hy: 3, hz: 2, wz: 1.5, vx: -4.5, vy: 0.75 }));
  settle(pool, index, 10, 1 / 60, flat);
  assert.equal(pool.state[index], BODY_ASLEEP);
  assert.ok(Math.abs(pool.position[1] - 0.5) <= 0.08, `centre at ${pool.position[1]}`);
  assert.ok(flatness(pool, index) > 0.99, `axis alignment ${flatness(pool, index)}`);
});

test('bounces lose energy: after the first impact the box never climbs back to half its drop', () => {
  const pool = createRigidPool(1);
  const index = addBody(pool, box({ hx: 0.6, hy: 0.6, hz: 0.6 }));
  const impacts: number[] = [];
  let peakAfterImpact = -Infinity;
  for (let step = 0; step < 360; step += 1) {
    stepRigid(pool, 1 / 60, flat, (_, speed) => impacts.push(speed));
    if (impacts.length > 0) peakAfterImpact = Math.max(peakAfterImpact, pool.position[1]);
  }
  assert.ok(impacts.length >= 1, 'the drop should register an impact');
  assert.ok(impacts[0] > 20, `first impact at ${impacts[0]} m/s`);
  assert.ok(peakAfterImpact < 5, `rose back to ${peakAfterImpact}`);
});

test('a box never sinks into the ground while dropping and settling', () => {
  const pool = createRigidPool(1);
  const [qx, qy, qz, qw] = axisAngle(0.6, 0, 0.8, 0.7);
  const index = addBody(pool, box({ hx: 0.8, hy: 0.4, hz: 1.5, qx, qy, qz, qw, vx: 3, wy: 4 }));
  let deepest = -Infinity;
  for (let step = 0; step < 360; step += 1) {
    stepRigid(pool, 1 / 60, flat);
    deepest = Math.max(deepest, penetration(pool, index, flat));
  }
  assert.ok(deepest <= 0.15, `sank ${deepest} m`);
  assert.equal(pool.state[index], BODY_ASLEEP);
});

test('a 60 m drop at 0.05 s steps does not tunnel and stays finite', () => {
  const pool = createRigidPool(1);
  const [qx, qy, qz, qw] = axisAngle(0, 0.6, 0.8, 1.1);
  const index = addBody(pool, box({ y: 60, hx: 0.5, hy: 0.25, hz: 1, qx, qy, qz, qw }));
  let deepest = -Infinity;
  settle(pool, index, 12, 0.05, flat, () => {
    deepest = Math.max(deepest, penetration(pool, index, flat));
  });
  assert.ok(allFinite(pool), 'state contains a non-finite value');
  assert.equal(pool.state[index], BODY_ASLEEP);
  assert.ok(pool.position[1] > 0, `ended at ${pool.position[1]}`);
  assert.ok(penetration(pool, index, flat) <= 0.05, 'resting below ground');
  assert.ok(deepest <= 0.15, `sank ${deepest} m mid-fall`);
});

test('a blast wakes and throws bodies inside its radius and leaves the rest asleep', () => {
  const pool = createRigidPool(2);
  const near = addBody(pool, box({ x: 2, y: 0.5, z: 1, hx: 0.5, hy: 0.5, hz: 0.5 }));
  const far = addBody(pool, box({ x: 30, y: 0.5, z: 0, hx: 0.5, hy: 0.5, hz: 0.5 }));
  settle(pool, near, 5, 1 / 60, flat);
  settle(pool, far, 5, 1 / 60, flat);
  assert.equal(pool.state[near], BODY_ASLEEP);
  assert.equal(pool.state[far], BODY_ASLEEP);
  const farBefore = [...pool.position.subarray(3, 6), ...pool.velocity.subarray(3, 6), ...pool.angular.subarray(3, 6)];

  impulseFrom(pool, 0, 0, 0, 30, 10, () => 0.9);

  assert.equal(pool.state[near], BODY_AWAKE);
  assert.ok(Math.hypot(...pool.angular.subarray(0, 3)) > 1, 'the blast should set the body spinning');
  const [px, py, pz] = pool.position.subarray(0, 3);
  const [vx, vy, vz] = pool.velocity.subarray(0, 3);
  assert.ok(px * vx + py * vy + pz * vz > 0, 'kick should point away from the blast');
  assert.equal(pool.state[far], BODY_ASLEEP);
  assert.deepEqual([...pool.position.subarray(3, 6), ...pool.velocity.subarray(3, 6), ...pool.angular.subarray(3, 6)], farBefore);
});

test('a full pool refuses new bodies until a slot is released', () => {
  const pool = createRigidPool(2);
  assert.equal(addBody(pool, box({})), 0);
  assert.equal(addBody(pool, box({ x: 5 })), 1);
  assert.equal(addBody(pool, box({ x: 9 })), -1);
  assert.equal(liveCount(pool), 2);
  releaseBody(pool, 0);
  assert.equal(liveCount(pool), 1);
  assert.equal(addBody(pool, box({ x: 9 })), 0);
  assert.equal(pool.position[0], 9);
  assert.equal(pool.position[3], 5, 'the live body was left untouched');
  assert.equal(liveCount(pool), 2);
});

test('a box dropped on a slope comes to rest without sinking', () => {
  const slope: Ground = (x) => x * 0.2;
  const pool = createRigidPool(1);
  const index = addBody(pool, box({ y: 8, hx: 0.8, hy: 0.5, hz: 1.2, wy: 1 }));
  let deepest = -Infinity;
  settle(pool, index, 10, 1 / 60, slope, () => {
    deepest = Math.max(deepest, penetration(pool, index, slope));
  });
  assert.ok(allFinite(pool), 'state contains a non-finite value');
  assert.equal(pool.state[index], BODY_ASLEEP);
  assert.ok(deepest <= 0.15, `sank ${deepest} m`);
});

test('a hard landing reports one impact per step and a gentle one none', () => {
  const pool = createRigidPool(2);
  addBody(pool, box({ y: 20, hx: 0.5, hy: 0.5, hz: 0.5 }));
  addBody(pool, box({ x: 10, y: 0.52, hx: 0.5, hy: 0.5, hz: 0.5 }));
  const hits = new Map<number, number>();
  for (let step = 0; step < 120; step += 1) {
    const seen = new Set<number>();
    stepRigid(pool, 1 / 60, flat, (index) => {
      assert.ok(!seen.has(index), 'more than one impact in a step');
      seen.add(index);
      hits.set(index, (hits.get(index) ?? 0) + 1);
    });
  }
  assert.ok((hits.get(0) ?? 0) >= 1, 'the dropped box should report its landing');
  assert.equal(hits.get(1), undefined, 'a box set down gently should not report an impact');
});
