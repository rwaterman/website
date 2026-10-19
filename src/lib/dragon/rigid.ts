/** Pure rigid-box integrator: building parts tip, topple, roll and settle on terrain. No three.js here. */

import { GRAVITY } from './debris.ts';

export const BODY_FREE = 0;
export const BODY_AWAKE = 1;
export const BODY_ASLEEP = 2;

export interface RigidPool {
  capacity: number;
  /** Slot where the next free-slot search starts. */
  cursor: number;
  /** Centre of mass in world space, 3 per body. */
  position: Float32Array;
  velocity: Float32Array;
  /** Orientation as x, y, z, w, 4 per body. */
  quaternion: Float32Array;
  /** World-space angular velocity in rad/s, 3 per body. */
  angular: Float32Array;
  /** Half-extents in the body frame, 3 per body. */
  half: Float32Array;
  inverseMass: Float32Array;
  /** Body-frame diagonal of the inverse inertia tensor, 3 per body. */
  inverseInertia: Float32Array;
  /** BODY_FREE, BODY_AWAKE or BODY_ASLEEP. */
  state: Uint8Array;
  /** Seconds spent slow while touching the ground; the body sleeps once this passes the sleep delay. */
  stillTime: Float32Array;
  /** 1 when the body touched the ground during its last step. */
  grounded: Uint8Array;
}

export interface RigidBody {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  hx: number;
  hy: number;
  hz: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
}

const DENSITY = 1;
const MAX_STEP = 0.1;
const MAX_SUBSTEP = 1 / 120;
const SOLVER_ITERATIONS = 4;
const RESTITUTION = 0.25;
/** Approach speed below which a contact does not bounce, so resting boxes stay put. */
const BOUNCE_SPEED = 1.2;
const FRICTION = 0.6;
/** Corners this close above the terrain join the solver as speculative contacts, so a rocking box cannot pump energy. */
const CONTACT_MARGIN = 0.02;
const GRADIENT_STEP = 0.5;
/** Steepest terrain rise per metre assumed when skipping corner tests for airborne bodies. */
const MAX_TERRAIN_SLOPE = 2;
const AIR_LINEAR_DAMPING = 0.02;
const GROUND_LINEAR_DAMPING = 0.2;
const AIR_ANGULAR_DAMPING = 0.8;
const GROUND_ANGULAR_DAMPING = 2;
const MAX_LINEAR_SPEED = 150;
const MAX_ANGULAR_SPEED = 14;
const SLEEP_LINEAR_SPEED = 0.35;
const SLEEP_ANGULAR_SPEED = 0.35;
const SLEEP_DELAY = 0.4;
/** Fewer supporting corners than this means edge or corner contact, which must not sleep on the short delay. */
const SLEEP_SUPPORT = 3;
/** Fallback delay for slow bodies that never find face support, such as a box wedged on a ridge. */
const UNSUPPORTED_SLEEP_DELAY = 3;
const IMPACT_SPEED = 4;
/** Spin in rad/s added per m/s of blast kick, randomised per axis. */
const BLAST_SPIN = 0.3;
const MAX_CONTACTS = 8;

const position = new Float64Array(3);
const velocity = new Float64Array(3);
const orientation = new Float64Array(4);
const spin = new Float64Array(3);
const halfExtent = new Float64Array(3);
const inverseInertiaBody = new Float64Array(3);
const rotation = new Float64Array(9);
const inverseInertiaWorld = new Float64Array(9);
const normal = new Float64Array(3);
const tangentA = new Float64Array(3);
const tangentB = new Float64Array(3);
const contactArm = new Float64Array(MAX_CONTACTS * 3);
const contactNormalMass = new Float64Array(MAX_CONTACTS);
const contactTangentAMass = new Float64Array(MAX_CONTACTS);
const contactTangentBMass = new Float64Array(MAX_CONTACTS);
const contactBias = new Float64Array(MAX_CONTACTS);
const contactSeparation = new Float64Array(MAX_CONTACTS);
const contactNormalImpulse = new Float64Array(MAX_CONTACTS);
const contactTangentAImpulse = new Float64Array(MAX_CONTACTS);
const contactTangentBImpulse = new Float64Array(MAX_CONTACTS);
const scratch = { inverseMass: 0, contactCount: 0, impactSpeed: 0 };

export function createRigidPool(capacity: number): RigidPool {
  return {
    capacity,
    cursor: 0,
    position: new Float32Array(capacity * 3),
    velocity: new Float32Array(capacity * 3),
    quaternion: new Float32Array(capacity * 4),
    angular: new Float32Array(capacity * 3),
    half: new Float32Array(capacity * 3),
    inverseMass: new Float32Array(capacity),
    inverseInertia: new Float32Array(capacity * 3),
    state: new Uint8Array(capacity),
    stillTime: new Float32Array(capacity),
    grounded: new Uint8Array(capacity),
  };
}

/** Adds an awake body; returns its index, or -1 when the pool is full. Never overwrites a live body. */
export function addBody(pool: RigidPool, body: RigidBody): number {
  if (!(body.hx > 0 && body.hy > 0 && body.hz > 0)) {
    throw new RangeError(`rigid body half-extents must be positive, got ${body.hx}, ${body.hy}, ${body.hz}`);
  }
  const index = findFreeSlot(pool);
  if (index < 0) return -1;
  pool.cursor = (index + 1) % pool.capacity;

  const offset = index * 3;
  const length = Math.hypot(body.qx, body.qy, body.qz, body.qw);
  const scale = length > 1e-9 ? 1 / length : 0;
  pool.position.set([body.x, body.y, body.z], offset);
  pool.velocity.set([body.vx, body.vy, body.vz], offset);
  pool.angular.set([body.wx, body.wy, body.wz], offset);
  pool.half.set([body.hx, body.hy, body.hz], offset);
  if (scale > 0) pool.quaternion.set([body.qx * scale, body.qy * scale, body.qz * scale, body.qw * scale], index * 4);
  else pool.quaternion.set([0, 0, 0, 1], index * 4);

  const mass = DENSITY * 8 * body.hx * body.hy * body.hz;
  const xx = body.hx * body.hx;
  const yy = body.hy * body.hy;
  const zz = body.hz * body.hz;
  pool.inverseMass[index] = 1 / mass;
  pool.inverseInertia.set([3 / (mass * (yy + zz)), 3 / (mass * (xx + zz)), 3 / (mass * (xx + yy))], offset);
  pool.state[index] = BODY_AWAKE;
  pool.stillTime[index] = 0;
  pool.grounded[index] = 0;
  return index;
}

/** Frees the slot so a later addBody can reuse it. */
export function releaseBody(pool: RigidPool, index: number): void {
  assertIndex(pool, index);
  pool.state[index] = BODY_FREE;
  pool.stillTime[index] = 0;
  pool.grounded[index] = 0;
}

/** Puts a sleeping body back into the simulation; free slots are left alone. */
export function wakeBody(pool: RigidPool, index: number): void {
  assertIndex(pool, index);
  if (pool.state[index] === BODY_FREE) return;
  pool.state[index] = BODY_AWAKE;
  pool.stillTime[index] = 0;
}

/** Bodies that are awake or asleep. */
export function liveCount(pool: RigidPool): number {
  let count = 0;
  for (let index = 0; index < pool.capacity; index += 1) {
    if (pool.state[index] !== BODY_FREE) count += 1;
  }
  return count;
}

/**
 * Blast: every live body within `radius` of the centre wakes and gets a velocity kick away from it of
 * `force * falloff` (linear falloff to zero at the radius) plus a random spin drawn from `random`.
 */
export function impulseFrom(
  pool: RigidPool,
  x: number,
  y: number,
  z: number,
  force: number,
  radius: number,
  random: () => number,
): void {
  for (let index = 0; index < pool.capacity; index += 1) {
    if (pool.state[index] === BODY_FREE) continue;
    const offset = index * 3;
    const dx = pool.position[offset] - x;
    const dy = pool.position[offset + 1] - y;
    const dz = pool.position[offset + 2] - z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > radius) continue;

    const kick = force * (1 - distance / radius);
    const scale = distance > 1e-6 ? kick / distance : 0;
    pool.velocity[offset] += dx * scale;
    pool.velocity[offset + 1] += distance > 1e-6 ? dy * scale : kick;
    pool.velocity[offset + 2] += dz * scale;
    pool.angular[offset] += (random() * 2 - 1) * kick * BLAST_SPIN;
    pool.angular[offset + 1] += (random() * 2 - 1) * kick * BLAST_SPIN;
    pool.angular[offset + 2] += (random() * 2 - 1) * kick * BLAST_SPIN;
    pool.state[index] = BODY_AWAKE;
    pool.stillTime[index] = 0;
  }
}

/**
 * Advances awake bodies by `dt`, in substeps of at most 1/120 s. `groundAt` returns terrain height.
 * `onImpact` gets the hardest ground hit of a body's step when it exceeds the impact speed, at most once per body per step.
 */
export function stepRigid(
  pool: RigidPool,
  dt: number,
  groundAt: (x: number, z: number) => number,
  onImpact?: (index: number, speed: number) => void,
): void {
  if (!(dt > 0)) return;
  const step = Math.min(dt, MAX_STEP);
  const substeps = Math.ceil(step / MAX_SUBSTEP);
  const substep = step / substeps;
  for (let index = 0; index < pool.capacity; index += 1) {
    if (pool.state[index] !== BODY_AWAKE) continue;
    loadBody(pool, index);
    scratch.impactSpeed = 0;
    let touched = false;
    for (let iteration = 0; iteration < substeps; iteration += 1) {
      integrate(substep);
      updateFrame();
      collectContacts(groundAt, substep);
      const grounded = scratch.contactCount > 0;
      touched ||= grounded;
      if (grounded) solveContacts();
      dampAndClamp(substep, grounded);
      if (!isSlow()) pool.stillTime[index] = 0;
      else if (grounded) pool.stillTime[index] += substep;
      const delay = scratch.contactCount >= SLEEP_SUPPORT ? SLEEP_DELAY : UNSUPPORTED_SLEEP_DELAY;
      if (pool.stillTime[index] >= delay) {
        velocity.fill(0);
        spin.fill(0);
        pool.state[index] = BODY_ASLEEP;
        break;
      }
    }
    storeBody(pool, index);
    pool.grounded[index] = touched ? 1 : 0;
    if (onImpact && scratch.impactSpeed > IMPACT_SPEED) onImpact(index, scratch.impactSpeed);
  }
}

function assertIndex(pool: RigidPool, index: number): void {
  if (Number.isInteger(index) && index >= 0 && index < pool.capacity) return;
  throw new RangeError(`rigid body index ${index} is outside a pool of ${pool.capacity}`);
}

function findFreeSlot(pool: RigidPool): number {
  for (let step = 0; step < pool.capacity; step += 1) {
    const index = (pool.cursor + step) % pool.capacity;
    if (pool.state[index] === BODY_FREE) return index;
  }
  return -1;
}

function loadBody(pool: RigidPool, index: number): void {
  const offset = index * 3;
  for (let axis = 0; axis < 3; axis += 1) {
    position[axis] = pool.position[offset + axis];
    velocity[axis] = pool.velocity[offset + axis];
    spin[axis] = pool.angular[offset + axis];
    halfExtent[axis] = pool.half[offset + axis];
    inverseInertiaBody[axis] = pool.inverseInertia[offset + axis];
  }
  for (let component = 0; component < 4; component += 1) orientation[component] = pool.quaternion[index * 4 + component];
  scratch.inverseMass = pool.inverseMass[index];
}

function storeBody(pool: RigidPool, index: number): void {
  const offset = index * 3;
  for (let axis = 0; axis < 3; axis += 1) {
    pool.position[offset + axis] = position[axis];
    pool.velocity[offset + axis] = velocity[axis];
    pool.angular[offset + axis] = spin[axis];
  }
  for (let component = 0; component < 4; component += 1) pool.quaternion[index * 4 + component] = orientation[component];
}

/** Semi-implicit Euler: gravity into velocity, then velocity and spin into pose. */
function integrate(dt: number): void {
  velocity[1] -= GRAVITY * dt;
  position[0] += velocity[0] * dt;
  position[1] += velocity[1] * dt;
  position[2] += velocity[2] * dt;

  const x = orientation[0];
  const y = orientation[1];
  const z = orientation[2];
  const w = orientation[3];
  const half = dt * 0.5;
  const wx = spin[0] * half;
  const wy = spin[1] * half;
  const wz = spin[2] * half;
  const nx = x + wx * w + wy * z - wz * y;
  const ny = y + wy * w + wz * x - wx * z;
  const nz = z + wz * w + wx * y - wy * x;
  const nw = w - wx * x - wy * y - wz * z;
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
  if (!(length > 1e-9)) {
    orientation.fill(0);
    orientation[3] = 1;
    return;
  }
  orientation[0] = nx / length;
  orientation[1] = ny / length;
  orientation[2] = nz / length;
  orientation[3] = nw / length;
}

/** Rotation matrix (row-major) and world-space inverse inertia R * Iinv * Rᵀ for the current pose. */
function updateFrame(): void {
  const x = orientation[0];
  const y = orientation[1];
  const z = orientation[2];
  const w = orientation[3];
  rotation[0] = 1 - 2 * (y * y + z * z);
  rotation[1] = 2 * (x * y - z * w);
  rotation[2] = 2 * (x * z + y * w);
  rotation[3] = 2 * (x * y + z * w);
  rotation[4] = 1 - 2 * (x * x + z * z);
  rotation[5] = 2 * (y * z - x * w);
  rotation[6] = 2 * (x * z - y * w);
  rotation[7] = 2 * (y * z + x * w);
  rotation[8] = 1 - 2 * (x * x + y * y);
  for (let row = 0; row < 3; row += 1) {
    for (let column = row; column < 3; column += 1) {
      let sum = 0;
      for (let axis = 0; axis < 3; axis += 1) {
        sum += rotation[row * 3 + axis] * inverseInertiaBody[axis] * rotation[column * 3 + axis];
      }
      inverseInertiaWorld[row * 3 + column] = sum;
      inverseInertiaWorld[column * 3 + row] = sum;
    }
  }
}

/** Finds box corners at or below the terrain, lifts the body clear and prepares each contact for the solver. */
function collectContacts(groundAt: (x: number, z: number) => number, dt: number): void {
  scratch.contactCount = 0;
  const hx = halfExtent[0];
  const hy = halfExtent[1];
  const hz = halfExtent[2];
  const reachY = Math.abs(rotation[3]) * hx + Math.abs(rotation[4]) * hy + Math.abs(rotation[5]) * hz;
  const reach = Math.sqrt(hx * hx + hy * hy + hz * hz);
  if (position[1] - reachY > groundAt(position[0], position[2]) + reach * MAX_TERRAIN_SLOPE + CONTACT_MARGIN) return;

  let deepest = 0;
  for (let corner = 0; corner < 8; corner += 1) {
    const lx = corner & 1 ? hx : -hx;
    const ly = corner & 2 ? hy : -hy;
    const lz = corner & 4 ? hz : -hz;
    const ax = rotation[0] * lx + rotation[1] * ly + rotation[2] * lz;
    const ay = rotation[3] * lx + rotation[4] * ly + rotation[5] * lz;
    const az = rotation[6] * lx + rotation[7] * ly + rotation[8] * lz;
    const depth = groundAt(position[0] + ax, position[2] + az) - (position[1] + ay);
    if (!(depth > -CONTACT_MARGIN)) continue;
    const contact = scratch.contactCount;
    contactArm[contact * 3] = ax;
    contactArm[contact * 3 + 1] = ay;
    contactArm[contact * 3 + 2] = az;
    contactSeparation[contact] = -depth;
    scratch.contactCount += 1;
    if (depth > deepest) deepest = depth;
  }
  if (scratch.contactCount === 0) return;

  position[1] += deepest;
  terrainNormal(groundAt);
  for (let contact = 0; contact < scratch.contactCount; contact += 1) {
    contactSeparation[contact] += deepest;
    prepareContact(contact, dt);
  }
}

function terrainNormal(groundAt: (x: number, z: number) => number): void {
  const x = position[0];
  const z = position[2];
  const slopeX = (groundAt(x + GRADIENT_STEP, z) - groundAt(x - GRADIENT_STEP, z)) / (2 * GRADIENT_STEP);
  const slopeZ = (groundAt(x, z + GRADIENT_STEP) - groundAt(x, z - GRADIENT_STEP)) / (2 * GRADIENT_STEP);
  const length = Math.sqrt(slopeX * slopeX + 1 + slopeZ * slopeZ);
  normal[0] = Number.isFinite(length) ? -slopeX / length : 0;
  normal[1] = Number.isFinite(length) ? 1 / length : 1;
  normal[2] = Number.isFinite(length) ? -slopeZ / length : 0;

  // Tangent A = normal × X (or × Z when the normal leans along X), tangent B = normal × A.
  const useZ = Math.abs(normal[0]) > 0.9;
  const ax = useZ ? normal[1] : 0;
  const ay = useZ ? -normal[0] : normal[2];
  const az = useZ ? 0 : -normal[1];
  const tangentLength = Math.sqrt(ax * ax + ay * ay + az * az);
  tangentA[0] = ax / tangentLength;
  tangentA[1] = ay / tangentLength;
  tangentA[2] = az / tangentLength;
  tangentB[0] = normal[1] * tangentA[2] - normal[2] * tangentA[1];
  tangentB[1] = normal[2] * tangentA[0] - normal[0] * tangentA[2];
  tangentB[2] = normal[0] * tangentA[1] - normal[1] * tangentA[0];
}

/**
 * A corner that reaches the ground this substep fast enough bounces with restitution; otherwise the solver only stops it
 * closing more than its remaining gap, which is zero for touching corners.
 */
function prepareContact(contact: number, dt: number): void {
  contactNormalMass[contact] = 1 / effectiveMass(contact, normal);
  contactTangentAMass[contact] = 1 / effectiveMass(contact, tangentA);
  contactTangentBMass[contact] = 1 / effectiveMass(contact, tangentB);
  contactNormalImpulse[contact] = 0;
  contactTangentAImpulse[contact] = 0;
  contactTangentBImpulse[contact] = 0;
  const approach = -pointVelocityAlong(contact, normal);
  const gap = contactSeparation[contact];
  const touches = approach * dt >= gap;
  contactBias[contact] = touches && approach > BOUNCE_SPEED ? approach * RESTITUTION : -gap / dt;
  if (touches && approach > scratch.impactSpeed) scratch.impactSpeed = approach;
}

/** invMass + (r × d) · Iinv_world (r × d): how hard the body resists an impulse along `direction` at the contact. */
function effectiveMass(contact: number, direction: Float64Array): number {
  const offset = contact * 3;
  const rx = contactArm[offset];
  const ry = contactArm[offset + 1];
  const rz = contactArm[offset + 2];
  const cx = ry * direction[2] - rz * direction[1];
  const cy = rz * direction[0] - rx * direction[2];
  const cz = rx * direction[1] - ry * direction[0];
  const ix = inverseInertiaWorld[0] * cx + inverseInertiaWorld[1] * cy + inverseInertiaWorld[2] * cz;
  const iy = inverseInertiaWorld[3] * cx + inverseInertiaWorld[4] * cy + inverseInertiaWorld[5] * cz;
  const iz = inverseInertiaWorld[6] * cx + inverseInertiaWorld[7] * cy + inverseInertiaWorld[8] * cz;
  return scratch.inverseMass + cx * ix + cy * iy + cz * iz;
}

/** (v + ω × r) · direction at the contact point. */
function pointVelocityAlong(contact: number, direction: Float64Array): number {
  const offset = contact * 3;
  const rx = contactArm[offset];
  const ry = contactArm[offset + 1];
  const rz = contactArm[offset + 2];
  const vx = velocity[0] + spin[1] * rz - spin[2] * ry;
  const vy = velocity[1] + spin[2] * rx - spin[0] * rz;
  const vz = velocity[2] + spin[0] * ry - spin[1] * rx;
  return vx * direction[0] + vy * direction[1] + vz * direction[2];
}

function applyImpulse(contact: number, jx: number, jy: number, jz: number): void {
  const offset = contact * 3;
  const rx = contactArm[offset];
  const ry = contactArm[offset + 1];
  const rz = contactArm[offset + 2];
  velocity[0] += jx * scratch.inverseMass;
  velocity[1] += jy * scratch.inverseMass;
  velocity[2] += jz * scratch.inverseMass;
  const tx = ry * jz - rz * jy;
  const ty = rz * jx - rx * jz;
  const tz = rx * jy - ry * jx;
  spin[0] += inverseInertiaWorld[0] * tx + inverseInertiaWorld[1] * ty + inverseInertiaWorld[2] * tz;
  spin[1] += inverseInertiaWorld[3] * tx + inverseInertiaWorld[4] * ty + inverseInertiaWorld[5] * tz;
  spin[2] += inverseInertiaWorld[6] * tx + inverseInertiaWorld[7] * ty + inverseInertiaWorld[8] * tz;
}

/** Sequential impulses with accumulated clamping: non-negative normal push, friction inside the Coulomb disc. */
function solveContacts(): void {
  for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
    for (let contact = 0; contact < scratch.contactCount; contact += 1) {
      const previousNormal = contactNormalImpulse[contact];
      const normalDelta = contactNormalMass[contact] * (contactBias[contact] - pointVelocityAlong(contact, normal));
      const nextNormal = Math.max(0, previousNormal + normalDelta);
      contactNormalImpulse[contact] = nextNormal;
      const pushed = nextNormal - previousNormal;
      applyImpulse(contact, normal[0] * pushed, normal[1] * pushed, normal[2] * pushed);

      const previousA = contactTangentAImpulse[contact];
      const previousB = contactTangentBImpulse[contact];
      let nextA = previousA - contactTangentAMass[contact] * pointVelocityAlong(contact, tangentA);
      let nextB = previousB - contactTangentBMass[contact] * pointVelocityAlong(contact, tangentB);
      const limit = FRICTION * nextNormal;
      const magnitude = Math.sqrt(nextA * nextA + nextB * nextB);
      if (magnitude > limit) {
        const scale = magnitude > 0 ? limit / magnitude : 0;
        nextA *= scale;
        nextB *= scale;
      }
      contactTangentAImpulse[contact] = nextA;
      contactTangentBImpulse[contact] = nextB;
      const deltaA = nextA - previousA;
      const deltaB = nextB - previousB;
      applyImpulse(
        contact,
        tangentA[0] * deltaA + tangentB[0] * deltaB,
        tangentA[1] * deltaA + tangentB[1] * deltaB,
        tangentA[2] * deltaA + tangentB[2] * deltaB,
      );
    }
  }
}

function dampAndClamp(dt: number, grounded: boolean): void {
  const linear = Math.exp(-dt * (grounded ? GROUND_LINEAR_DAMPING : AIR_LINEAR_DAMPING));
  const angular = Math.exp(-dt * (grounded ? GROUND_ANGULAR_DAMPING : AIR_ANGULAR_DAMPING));
  for (let axis = 0; axis < 3; axis += 1) {
    velocity[axis] = Number.isFinite(velocity[axis]) ? velocity[axis] * linear : 0;
    spin[axis] = Number.isFinite(spin[axis]) ? spin[axis] * angular : 0;
  }
  const speed = Math.sqrt(velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2]);
  if (speed > MAX_LINEAR_SPEED) {
    const scale = MAX_LINEAR_SPEED / speed;
    velocity[0] *= scale;
    velocity[1] *= scale;
    velocity[2] *= scale;
  }
  const turn = Math.sqrt(spin[0] * spin[0] + spin[1] * spin[1] + spin[2] * spin[2]);
  if (turn > MAX_ANGULAR_SPEED) {
    const scale = MAX_ANGULAR_SPEED / turn;
    spin[0] *= scale;
    spin[1] *= scale;
    spin[2] *= scale;
  }
}

function isSlow(): boolean {
  const speed = velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2];
  const turn = spin[0] * spin[0] + spin[1] * spin[1] + spin[2] * spin[2];
  return speed < SLEEP_LINEAR_SPEED * SLEEP_LINEAR_SPEED && turn < SLEEP_ANGULAR_SPEED * SLEEP_ANGULAR_SPEED;
}
