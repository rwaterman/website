/** Pure rubble integrator: gravity, ground bounce with energy loss, then rest. No three.js here. */

export interface DebrisPool {
  capacity: number;
  /** Next slot to overwrite; the pool is a ring so old rubble makes way for new. */
  cursor: number;
  position: Float32Array;
  velocity: Float32Array;
  rotation: Float32Array;
  spin: Float32Array;
  size: Float32Array;
  color: Float32Array;
  /** Seconds left before the chunk is removed; 0 marks a free slot. */
  life: Float32Array;
  resting: Uint8Array;
}

export interface DebrisChunk {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  sx: number;
  sy: number;
  sz: number;
  r: number;
  g: number;
  b: number;
  life: number;
}

export const GRAVITY = 32;
const RESTITUTION = 0.36;
const FRICTION = 0.55;
const REST_SPEED = 2.2;

export function createDebrisPool(capacity: number): DebrisPool {
  return {
    capacity,
    cursor: 0,
    position: new Float32Array(capacity * 3),
    velocity: new Float32Array(capacity * 3),
    rotation: new Float32Array(capacity * 3),
    spin: new Float32Array(capacity * 3),
    size: new Float32Array(capacity * 3),
    color: new Float32Array(capacity * 3),
    life: new Float32Array(capacity),
    resting: new Uint8Array(capacity),
  };
}

export function spawnDebris(pool: DebrisPool, chunk: DebrisChunk, random: () => number): number {
  const index = pool.cursor;
  pool.cursor = (pool.cursor + 1) % pool.capacity;
  const offset = index * 3;
  pool.position.set([chunk.x, chunk.y, chunk.z], offset);
  pool.velocity.set([chunk.vx, chunk.vy, chunk.vz], offset);
  pool.rotation.set([random() * 6.28, random() * 6.28, random() * 6.28], offset);
  pool.spin.set([(random() - 0.5) * 12, (random() - 0.5) * 12, (random() - 0.5) * 12], offset);
  pool.size.set([chunk.sx, chunk.sy, chunk.sz], offset);
  pool.color.set([chunk.r, chunk.g, chunk.b], offset);
  pool.life[index] = chunk.life;
  pool.resting[index] = 0;
  return index;
}

/** Advances every live chunk by `dt`; `onImpact` gets each ground hit with its impact speed. */
export function stepDebris(
  pool: DebrisPool,
  dt: number,
  groundAt: (x: number, z: number) => number,
  onImpact?: (index: number, speed: number) => void,
): void {
  for (let index = 0; index < pool.capacity; index += 1) {
    if (pool.life[index] <= 0) continue;
    pool.life[index] = Math.max(0, pool.life[index] - dt);
    if (pool.resting[index]) continue;

    const offset = index * 3;
    pool.velocity[offset + 1] -= GRAVITY * dt;
    pool.position[offset] += pool.velocity[offset] * dt;
    pool.position[offset + 1] += pool.velocity[offset + 1] * dt;
    pool.position[offset + 2] += pool.velocity[offset + 2] * dt;
    pool.rotation[offset] += pool.spin[offset] * dt;
    pool.rotation[offset + 1] += pool.spin[offset + 1] * dt;
    pool.rotation[offset + 2] += pool.spin[offset + 2] * dt;

    const floor = groundAt(pool.position[offset], pool.position[offset + 2]) + pool.size[offset + 1] * 0.5;
    if (pool.position[offset + 1] > floor) continue;

    const impact = -pool.velocity[offset + 1];
    pool.position[offset + 1] = floor;
    if (impact < REST_SPEED) {
      pool.resting[index] = 1;
      pool.velocity.fill(0, offset, offset + 3);
      pool.spin.fill(0, offset, offset + 3);
      continue;
    }
    pool.velocity[offset + 1] = impact * RESTITUTION;
    pool.velocity[offset] *= FRICTION;
    pool.velocity[offset + 2] *= FRICTION;
    pool.spin[offset] *= FRICTION;
    pool.spin[offset + 1] *= FRICTION;
    pool.spin[offset + 2] *= FRICTION;
    onImpact?.(index, impact);
  }
}
