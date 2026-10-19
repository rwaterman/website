import * as THREE from 'three';
import type { City, Part, Structure } from './city';
import { createDebrisPool, spawnDebris, stepDebris, type DebrisPool } from './debris';
import { addBody, BODY_ASLEEP, createRigidPool, impulseFrom, releaseBody, stepRigid, type RigidPool } from './rigid';
import { DUST, EMBER, FIRE, FLASH, ParticleField, SMOKE } from './particles';
import { terrainHeight, WATER_LEVEL } from './terrain';

export interface FireQuality {
  fireParticles: number;
  smokeParticles: number;
  debris: number;
  /** Flame particles per frame shared by every burning building. */
  emitBudget: number;
  /** Breath particles per second. */
  breathRate: number;
  /** Multiplier on rubble chunks per collapse. */
  chunkScale: number;
  /** Building parts that can be falling at once; more come down as the first ones settle. */
  bodies: number;
}

/** What the fire system tells the rest of the game, mainly so the audio can follow it. */
export interface FireEvents {
  explosion(position: THREE.Vector3, size: number): void;
  collapse(position: THREE.Vector3, stone: boolean, size: number): void;
  ignite(position: THREE.Vector3): void;
  debrisImpact(position: THREE.Vector3, speed: number): void;
}

interface Fireball {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
  alive: boolean;
}

interface GroundFire {
  x: number;
  y: number;
  z: number;
  life: number;
}

interface Shockwave {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  size: number;
}

interface Flash {
  light: THREE.PointLight;
  power: number;
}

/** A structure coming down a stage at a time. `origin` is the blast that did it, if any. */
interface Collapse {
  structure: Structure;
  origin: THREE.Vector3 | null;
  force: number;
  clock: number;
}

const BREATH_PROBES = [10, 24, 40, 58, 76];
const WIND = new THREE.Vector2(4.5, 2.2);
const FIREBALL_SPEED = 150;
const FIREBALL_GRAVITY = 20;
const BLAST_RADIUS = 24;
const FIRE_LIGHTS = 4;
const MAX_GROUND_FIRES = 48;
/** Seconds between collapse stages when fire, not a blast, brings a building down. */
const STAGE_DELAY = 0.3;
/** Parts a single blast may pick back up off the ground and throw again. */
const MAX_RETHROWN = 140;

const random = Math.random;
const spread = (amount: number): number => (random() - 0.5) * 2 * amount;

export class Inferno {
  readonly group = new THREE.Group();
  readonly fire: ParticleField;
  readonly smoke: ParticleField;
  readonly breathLight = new THREE.PointLight(new THREE.Color(1, 0.5, 0.15), 0, 0, 2);

  private readonly city: City;
  private readonly quality: FireQuality;
  private readonly events: FireEvents;
  private readonly debris: DebrisPool;
  private readonly rigid: RigidPool;
  /** The building part each rigid-body slot is carrying, or null for a free slot. */
  private readonly bodyParts: (Part | null)[];
  private readonly collapses: Collapse[] = [];
  private readonly debrisMesh: THREE.InstancedMesh;
  private readonly drawn: Uint8Array;
  private readonly fireballs: Fireball[] = [];
  private readonly groundFires: GroundFire[] = [];
  private readonly shockwaves: Shockwave[] = [];
  private readonly flashes: Flash[] = [];
  private readonly fireLights: THREE.PointLight[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private breathCarry = 0;
  private lightTimer = 0;
  private time = 0;
  private impactsThisFrame = 0;
  private partImpactsThisFrame = 0;

  constructor(city: City, quality: FireQuality, events: FireEvents) {
    this.city = city;
    this.quality = quality;
    this.events = events;
    this.fire = new ParticleField(quality.fireParticles, true);
    this.smoke = new ParticleField(quality.smokeParticles, false);
    for (const field of [this.fire, this.smoke]) {
      field.material.uniforms.uWind.value = WIND;
      this.group.add(field.points);
    }

    this.debris = createDebrisPool(quality.debris);
    this.rigid = createRigidPool(quality.bodies);
    this.bodyParts = new Array<Part | null>(quality.bodies).fill(null);
    this.drawn = new Uint8Array(quality.debris).fill(2);
    this.debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), quality.debris);
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.matrix.makeScale(0, 0, 0);
    for (let index = 0; index < quality.debris; index += 1) {
      this.debrisMesh.setMatrixAt(index, this.matrix);
      this.debrisMesh.setColorAt(index, this.color.setRGB(0, 0, 0));
    }
    this.group.add(this.debrisMesh);

    const ballGeometry = new THREE.IcosahedronGeometry(1.6, 1);
    const ballMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 2.6, 0.5) });
    for (let index = 0; index < 6; index += 1) {
      const mesh = new THREE.Mesh(ballGeometry, ballMaterial);
      mesh.visible = false;
      this.group.add(mesh);
      this.fireballs.push({ mesh, velocity: new THREE.Vector3(), age: 0, alive: false });
    }

    const ringGeometry = new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2);
    for (let index = 0; index < 6; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(3, 1.6, 0.7),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(ringGeometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.shockwaves.push({ mesh, material, age: 1, size: 1 });
    }

    for (let index = 0; index < 2; index += 1) {
      const light = new THREE.PointLight(new THREE.Color(1, 0.62, 0.3), 0, 0, 2);
      this.group.add(light);
      this.flashes.push({ light, power: 0 });
    }
    for (let index = 0; index < FIRE_LIGHTS; index += 1) {
      const light = new THREE.PointLight(new THREE.Color(1, 0.42, 0.1), 0, 0, 2);
      this.group.add(light);
      this.fireLights.push(light);
    }
    this.group.add(this.breathLight);
  }

  /** One frame of dragon breath from `origin` along `direction`; `inherit` is the dragon's velocity. */
  breathe(origin: THREE.Vector3, direction: THREE.Vector3, inherit: THREE.Vector3, dt: number): void {
    this.breathCarry += this.quality.breathRate * dt;
    const count = Math.floor(this.breathCarry);
    this.breathCarry -= count;
    for (let index = 0; index < count; index += 1) {
      const speed = 120 + random() * 50;
      const cone = speed * 0.075;
      this.fire.emit(
        origin.x + direction.x * random() * 3,
        origin.y + direction.y * random() * 3,
        origin.z + direction.z * random() * 3,
        direction.x * speed + inherit.x + spread(cone),
        direction.y * speed + inherit.y + spread(cone),
        direction.z * speed + inherit.z + spread(cone),
        0.5 + random() * 0.45,
        2.2 + random() * 2.4,
        FIRE,
        this.time,
      );
    }
    if (random() < dt * 30) {
      this.fire.emit(origin.x, origin.y, origin.z, direction.x * 90 + inherit.x + spread(22), direction.y * 90 + inherit.y + spread(22), direction.z * 90 + inherit.z + spread(22), 1 + random(), 0.7, EMBER, this.time);
    }
    this.breathLight.position.copy(origin).addScaledVector(direction, 8);
    this.breathLight.intensity = 2600 + random() * 900;

    for (const distance of BREATH_PROBES) {
      this.point.copy(origin).addScaledVector(direction, distance);
      const reach = 3 + distance * 0.09;
      const ground = Math.max(terrainHeight(this.point.x, this.point.z), WATER_LEVEL);
      this.city.query(this.point.x, this.point.z, reach, (structure) => {
        if (this.point.y < structure.top + reach + 2) this.heat(structure, dt * 2.6);
      });
      if (this.point.y - ground < reach + 2) {
        if (ground > WATER_LEVEL && random() < dt * 9) this.addGroundFire(this.point.x + spread(reach), ground, this.point.z + spread(reach));
        break;
      }
    }
  }

  launchFireball(origin: THREE.Vector3, direction: THREE.Vector3, inherit: THREE.Vector3): boolean {
    const ball = this.fireballs.find((candidate) => !candidate.alive);
    if (!ball) return false;
    ball.alive = true;
    ball.age = 0;
    ball.mesh.visible = true;
    ball.mesh.position.copy(origin).addScaledVector(direction, 3);
    ball.velocity.copy(direction).multiplyScalar(FIREBALL_SPEED).add(inherit);
    return true;
  }

  private heat(structure: Structure, amount: number): void {
    if (structure.state !== 'intact') return;
    if (!structure.flammable) {
      structure.health -= amount * 0.11;
      if (structure.health <= 0) this.collapse(structure, null, 0);
      return;
    }
    structure.heat += amount;
    if (structure.heat >= 1 && this.city.ignite(structure)) {
      const { building } = structure;
      this.events.ignite(new THREE.Vector3(building.x, building.y + building.height, building.z));
    }
  }

  private addGroundFire(x: number, y: number, z: number): void {
    if (this.groundFires.length >= MAX_GROUND_FIRES) this.groundFires.shift();
    this.groundFires.push({ x, y, z, life: 3.5 + random() * 3.5 });
    if (random() < 0.35) this.city.addScorch(x, y, z, 10 + random() * 8);
  }

  /** Breaks a structure into rubble. `origin` and `force` throw the pieces away from a blast. */
  collapse(structure: Structure, origin: THREE.Vector3 | null, force: number): void {
    const { building } = structure;
    const wasBurning = structure.state === 'burning';
    if (!this.city.ruin(structure)) return;

    const stone = !structure.flammable;
    const volume = building.width * building.depth * (building.height + building.roof * 0.5);
    // The building's own parts do the heavy falling; these are the splinters and chips around them.
    const chunks = Math.round(Math.min(24, Math.max(4, volume / 160)) * this.quality.chunkScale);
    const cos = Math.cos(building.rotation);
    const sin = Math.sin(building.rotation);
    const charred = wasBurning && structure.burnTime > 2.5;

    for (let index = 0; index < chunks; index += 1) {
      const localX = spread(building.width / 2);
      const localZ = spread(building.depth / 2);
      const x = building.x + localX * cos + localZ * sin;
      const z = building.z - localX * sin + localZ * cos;
      const y = building.y + 0.5 + random() * (building.height + building.roof * 0.6);
      let vx = spread(4);
      let vy = random() * 5;
      let vz = spread(4);
      if (origin) {
        const dx = x - origin.x;
        const dy = y - origin.y + 4;
        const dz = z - origin.z;
        const distance = Math.max(3, Math.hypot(dx, dy, dz));
        const push = (force * (0.6 + random() * 0.8)) / (1 + distance * 0.05);
        vx += (dx / distance) * push;
        vy += (dy / distance) * push + force * 0.35 * random();
        vz += (dz / distance) * push;
      }

      const plank = !stone && random() < 0.45;
      const block = stone ? 0.5 + random() * 0.9 : 0.4 + random() * 0.7;
      const shade = stone ? 0.3 + random() * 0.22 : charred ? 0.03 + random() * 0.05 : random() < 0.5 ? 0.16 + random() * 0.08 : 0.55 + random() * 0.25;
      spawnDebris(
        this.debris,
        {
          x,
          y,
          z,
          vx,
          vy,
          vz,
          sx: plank ? 0.22 : block,
          sy: plank ? 0.22 : block * (0.5 + random() * 0.6),
          sz: plank ? 1.4 + random() * 1.6 : block * (0.6 + random() * 0.7),
          r: shade * (stone ? 1 : 1.12),
          g: shade,
          b: shade * (stone ? 0.96 : 0.82),
          life: 12 + random() * 10,
        },
        random,
      );
    }

    const size = Math.min(2.5, 0.6 + volume / 4000);
    for (let index = 0; index < 18 * size; index += 1) {
      const x = building.x + spread(building.width * 0.6);
      const z = building.z + spread(building.depth * 0.6);
      this.smoke.emit(x, building.y + random() * building.height * 0.5, z, spread(9), 2 + random() * 5, spread(9), 2.5 + random() * 2.5, 9 + random() * 9 * size, DUST, this.time);
    }
    if (wasBurning) {
      for (let index = 0; index < 40; index += 1) {
        this.fire.emit(building.x + spread(building.width / 2), building.y + random() * building.height, building.z + spread(building.depth / 2), spread(14), 6 + random() * 22, spread(14), 1.2 + random() * 2, 0.6 + random() * 0.5, EMBER, this.time);
      }
    }
    this.collapses.push({ structure, origin: origin?.clone() ?? null, force, clock: 0 });
    this.events.collapse(new THREE.Vector3(building.x, building.y + building.height / 2, building.z), stone, size);
  }

  /** Lets go of every part in `stage`; later stages wait their turn in `updateCollapses`. */
  private releaseStage(structure: Structure, stage: number, origin: THREE.Vector3 | null, force: number): void {
    for (const part of structure.parts) {
      if (part.stage === stage) this.releasePart(structure, part, origin, force);
    }
    structure.released = Math.max(structure.released, stage + 1);
  }

  /** Hands a standing (or settled) part to the rigid-body pool, thrown by a blast or toppling on its own. */
  private releasePart(structure: Structure, part: Part, origin: THREE.Vector3 | null, force: number): void {
    if (part.hidden || part.body >= 0) return;
    if (part.material === 'glow') {
      this.city.hidePart(part);
      return;
    }
    const { position, quaternion, size } = part;
    let vx = spread(1.5);
    let vy = random() * 1.5;
    let vz = spread(1.5);
    let wx = spread(0.8);
    let wy = spread(0.8);
    let wz = spread(0.8);
    if (origin) {
      const dx = position.x - origin.x;
      const dy = position.y - origin.y + 4;
      const dz = position.z - origin.z;
      const distance = Math.max(3, Math.hypot(dx, dy, dz));
      const push = (force * (0.6 + random() * 0.8)) / (1 + distance * 0.05);
      vx += (dx / distance) * push;
      vy += (dy / distance) * push + force * 0.3 * random();
      vz += (dz / distance) * push;
      wx = spread(5);
      wy = spread(5);
      wz = spread(5);
    } else if (size.y > Math.max(size.x, size.z) * 0.7) {
      // Upright pieces topple over their base, mostly away from the middle of the building.
      const outX = position.x - structure.building.x;
      const outZ = position.z - structure.building.z;
      const length = Math.hypot(outX, outZ) || 1;
      const sign = random() < 0.7 ? 1 : -1;
      const rate = 0.9 + random() * 0.9;
      // Spinning about (up x outward) tips the top outward.
      wx = (outZ / length) * rate * sign;
      wy = spread(0.2);
      wz = (-outX / length) * rate * sign;
      vx = (outX / length) * sign * 1.5;
      vy = 0;
      vz = (outZ / length) * sign * 1.5;
    }
    const slot = addBody(this.rigid, {
      x: position.x,
      y: position.y,
      z: position.z,
      qx: quaternion.x,
      qy: quaternion.y,
      qz: quaternion.z,
      qw: quaternion.w,
      hx: size.x / 2,
      hy: size.y / 2,
      hz: size.z / 2,
      vx,
      vy,
      vz,
      wx,
      wy,
      wz,
    });
    if (slot < 0) {
      // Every body is busy: the part crumbles where it stands instead.
      this.city.hidePart(part);
      const block = Math.min(2.5, Math.max(size.x, size.y, size.z) * 0.4);
      spawnDebris(this.debris, { x: position.x, y: position.y, z: position.z, vx, vy: vy + 4, vz, sx: block, sy: block * 0.6, sz: block, r: 0.2, g: 0.18, b: 0.16, life: 10 }, random);
      return;
    }
    part.body = slot;
    part.down = false;
    this.bodyParts[slot] = part;
  }

  private updateCollapses(dt: number): void {
    for (let index = this.collapses.length - 1; index >= 0; index -= 1) {
      const collapse = this.collapses[index];
      collapse.clock -= dt;
      if (collapse.clock > 0) continue;
      const { structure } = collapse;
      this.releaseStage(structure, structure.released, collapse.origin, collapse.force);
      if (structure.released > structure.stages) {
        this.collapses.splice(index, 1);
        continue;
      }
      collapse.clock = collapse.origin ? 0.06 : STAGE_DELAY + random() * 0.2;
    }
  }

  /** Steps the falling parts and writes them back into their instances; settled parts give up their slot. */
  private updateBodies(dt: number): void {
    const pool = this.rigid;
    this.partImpactsThisFrame = 0;
    stepRigid(pool, dt, terrainHeight, (index, speed) => {
      if (speed < 7 || this.partImpactsThisFrame >= 2) return;
      this.partImpactsThisFrame += 1;
      const at = new THREE.Vector3(pool.position[index * 3], pool.position[index * 3 + 1], pool.position[index * 3 + 2]);
      this.events.debrisImpact(at, speed);
      for (let puff = 0; puff < 4; puff += 1) {
        this.smoke.emit(at.x + spread(1.5), at.y, at.z + spread(1.5), spread(4), 1 + random() * 3, spread(4), 1.6 + random() * 1.4, 5 + random() * 5, DUST, this.time);
      }
    });
    for (let slot = 0; slot < this.bodyParts.length; slot += 1) {
      const part = this.bodyParts[slot];
      if (!part) continue;
      const offset = slot * 3;
      this.point.set(pool.position[offset], pool.position[offset + 1], pool.position[offset + 2]);
      this.quaternion.set(pool.quaternion[slot * 4], pool.quaternion[slot * 4 + 1], pool.quaternion[slot * 4 + 2], pool.quaternion[slot * 4 + 3]);
      this.city.movePart(part, this.point, this.quaternion);
      if (pool.state[slot] !== BODY_ASLEEP) continue;
      part.body = -1;
      part.down = true;
      releaseBody(pool, slot);
      this.bodyParts[slot] = null;
    }
  }

  /** A blast also picks up rubble already lying in its radius and throws it again. */
  private throwLoose(centre: THREE.Vector3, force: number, radius: number): void {
    impulseFrom(this.rigid, centre.x, centre.y, centre.z, force, radius, random);
    let thrown = 0;
    this.city.query(centre.x, centre.z, radius, (structure) => {
      if (structure.released === 0) return;
      for (const part of structure.parts) {
        if (thrown >= MAX_RETHROWN) return;
        if (!part.down || part.hidden || part.position.distanceTo(centre) > radius) continue;
        this.releasePart(structure, part, centre, force);
        thrown += 1;
      }
    });
  }

  /** A random flammable part still standing or falling, for flames to come off; null if there is none. */
  private flamePart(structure: Structure): Part | null {
    const { parts } = structure;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const part = parts[Math.floor(random() * parts.length)];
      if (part.flammable && !part.hidden && !part.down) return part;
    }
    return null;
  }

  /** Fire, embers and dust thrown out from a point, with no damage done: the dragon hitting something. */
  burst(at: THREE.Vector3, size: number): void {
    for (let index = 0; index < 60 * size; index += 1) {
      const theta = random() * Math.PI * 2;
      const up = random();
      const flat = Math.sqrt(1 - up * up);
      const speed = (14 + random() * 30) * Math.sqrt(size);
      this.fire.emit(at.x, at.y, at.z, Math.cos(theta) * flat * speed, up * speed, Math.sin(theta) * flat * speed, 0.4 + random() * 0.6, (4 + random() * 5) * size, FIRE, this.time);
    }
    for (let index = 0; index < 30 * size; index += 1) {
      this.fire.emit(at.x, at.y, at.z, spread(40), 10 + random() * 40, spread(40), 1 + random() * 1.6, 0.5 + random() * 0.5, EMBER, this.time);
    }
    for (let index = 0; index < 16 * size; index += 1) {
      this.smoke.emit(at.x + spread(3), at.y, at.z + spread(3), spread(10), 3 + random() * 6, spread(10), 2 + random() * 2, 8 + random() * 8 * size, DUST, this.time);
    }
  }

  explode(x: number, y: number, z: number, size: number): void {
    const centre = new THREE.Vector3(x, y, z);
    const radius = BLAST_RADIUS * size;

    for (let index = 0; index < 5; index += 1) {
      this.fire.emit(x + spread(3), y + 2 + random() * 4, z + spread(3), 0, 0, 0, 0.22 + random() * 0.2, 34 * size, FLASH, this.time);
    }
    for (let index = 0; index < 80 * size; index += 1) {
      const theta = random() * Math.PI * 2;
      const up = random();
      const speed = (18 + random() * 46) * Math.sqrt(size);
      const flat = Math.sqrt(1 - up * up);
      this.fire.emit(x, y + 1, z, Math.cos(theta) * flat * speed, up * speed, Math.sin(theta) * flat * speed, 0.45 + random() * 0.75, (5 + random() * 6) * size, FIRE, this.time);
    }
    for (let index = 0; index < 60 * size; index += 1) {
      this.fire.emit(x, y + 1, z, spread(55), 14 + random() * 60, spread(55), 1.4 + random() * 2.2, 0.55 + random() * 0.6, EMBER, this.time);
    }
    for (let index = 0; index < 26 * size; index += 1) {
      this.smoke.emit(x + spread(radius * 0.25), y + random() * 6, z + spread(radius * 0.25), spread(8), 9 + random() * 16, spread(8), 4 + random() * 4, (13 + random() * 14) * size, SMOKE, this.time);
    }
    for (let index = 0; index < 28; index += 1) {
      const theta = random() * Math.PI * 2;
      const speed = 22 + random() * 26;
      this.smoke.emit(x, y + 1, z, Math.cos(theta) * speed, 2 + random() * 4, Math.sin(theta) * speed, 1.8 + random() * 1.6, 8 + random() * 8, DUST, this.time);
    }

    const wave = this.shockwaves.reduce((oldest, candidate) => (candidate.age > oldest.age ? candidate : oldest));
    wave.age = 0;
    wave.size = radius * 2.4;
    wave.mesh.position.set(x, y + 1.5, z);
    wave.mesh.visible = true;

    const flash = this.flashes.reduce((dimmest, candidate) => (candidate.power < dimmest.power ? candidate : dimmest));
    flash.power = 140_000 * size;
    flash.light.position.set(x, y + 12, z);

    const hits: { structure: Structure; distance: number }[] = [];
    this.city.query(x, z, radius, (structure, distance) => {
      if (structure.state !== 'ruined' && y < structure.top + radius) hits.push({ structure, distance });
    });
    for (const { structure, distance } of hits) {
      const close = distance < radius * 0.42;
      if (structure.building.kind === 'powder') {
        // A short fuse instead of an instant blast, so chained stores go off one after another.
        this.city.ignite(structure);
        structure.fuse = Math.min(structure.fuse, 0.12 + random() * 0.4);
      } else if (structure.flammable) {
        if (close) this.collapse(structure, centre, 46 * size);
        else this.city.ignite(structure);
      } else {
        structure.health -= close ? 2 * size : 0.7 * size * (1 - distance / radius);
        if (structure.health <= 0) this.collapse(structure, centre, 38 * size);
      }
    }

    this.throwLoose(centre, 40 * size, radius);

    const ground = terrainHeight(x, z);
    if (ground > WATER_LEVEL) {
      this.city.addScorch(x, ground, z, radius * 1.5);
      // Clods of earth thrown up from the crater.
      for (let index = 0; index < 10 * this.quality.chunkScale; index += 1) {
        const block = 0.5 + random() * 0.9;
        spawnDebris(this.debris, { x: x + spread(4), y: ground + 1, z: z + spread(4), vx: spread(26), vy: 14 + random() * 26, vz: spread(26), sx: block, sy: block * 0.7, sz: block, r: 0.14, g: 0.1, b: 0.07, life: 9 + random() * 6 }, random);
      }
    }
    this.events.explosion(centre, size);
  }

  /** `viewer` is the camera's world position: the camera rides the dragon, so its own position is local. */
  update(dt: number, time: number, viewer: THREE.Vector3, pixelScale: number, fog: THREE.FogExp2): void {
    this.time = time;
    this.breathLight.intensity *= Math.exp(-dt * 14);
    this.updateFireballs(dt);
    this.updateBurning(dt, viewer);
    this.updateGroundFires(dt);
    this.updateCollapses(dt);
    this.updateBodies(dt);
    this.updateDebris(dt);
    this.updateEffects(dt);
    this.updateLights(dt, viewer);
    this.fire.update(time, pixelScale, fog);
    this.smoke.update(time, pixelScale, fog);
    this.city.flush();
  }

  private updateFireballs(dt: number): void {
    for (const ball of this.fireballs) {
      if (!ball.alive) continue;
      ball.age += dt;
      ball.velocity.y -= FIREBALL_GRAVITY * dt;
      const position = ball.mesh.position;
      position.addScaledVector(ball.velocity, dt);
      ball.mesh.scale.setScalar(1 + 0.25 * Math.sin(ball.age * 40));
      for (let index = 0; index < 5; index += 1) {
        this.fire.emit(position.x + spread(1), position.y + spread(1), position.z + spread(1), ball.velocity.x * 0.25 + spread(6), ball.velocity.y * 0.25 + spread(6), ball.velocity.z * 0.25 + spread(6), 0.3 + random() * 0.4, 3 + random() * 2.5, FIRE, this.time);
      }
      if (random() < 0.5) this.smoke.emit(position.x, position.y, position.z, spread(3), 2, spread(3), 1.6 + random(), 5 + random() * 3, SMOKE, this.time);

      const ground = Math.max(terrainHeight(position.x, position.z), WATER_LEVEL);
      const floor = Math.max(ground, this.city.roofAt(position.x, position.z));
      if (position.y > floor && ball.age < 8) continue;
      ball.alive = false;
      ball.mesh.visible = false;
      this.explode(position.x, Math.max(position.y, ground), position.z, 1);
    }
  }

  private updateBurning(dt: number, viewer: THREE.Vector3): void {
    const burning = Array.from(this.city.burning);
    for (const structure of burning) {
      const { building } = structure;
      structure.burnTime += dt;
      structure.fuel -= dt;
      if (random() < dt * 4) this.city.char(structure, Math.min(1, structure.burnTime / 7));
      if (random() < dt * 0.55) {
        this.city.query(building.x, building.z, structure.radius + 9, (neighbour) => {
          if (neighbour !== structure && neighbour.flammable) this.heat(neighbour, 0.3 + random() * 0.25);
        });
      }
      if (structure.fuse >= 0) {
        structure.fuse -= dt;
        if (structure.fuse < 0) {
          this.collapse(structure, new THREE.Vector3(building.x, building.y, building.z), 50);
          this.explode(building.x, building.y + 2, building.z, 2.2);
          continue;
        }
      }
      // The roof falls in while the walls still burn.
      if (structure.released === 0 && structure.fuel < 2.5) this.releaseStage(structure, 0, null, 0);
      if (structure.fuel <= 0) this.collapse(structure, null, 0);
    }

    const live = Array.from(this.city.burning);
    if (live.length > 0) {
      const budget = Math.min(this.quality.emitBudget, live.length * 9) * Math.min(2, dt * 60);
      for (let index = 0; index < budget; index += 1) {
        const structure = live[Math.floor(random() * live.length)];
        const { building } = structure;
        if (Math.hypot(building.x - viewer.x, building.z - viewer.z) > 1500) continue;
        const part = this.flamePart(structure);
        const x = part ? part.position.x + spread(part.size.x * 0.45) : building.x + spread(building.width * 0.5);
        const z = part ? part.position.z + spread(part.size.z * 0.45) : building.z + spread(building.depth * 0.5);
        const y = part ? part.position.y + spread(part.size.y * 0.4) : building.y + random() * (building.height + building.roof);
        const big = 0.7 + structure.radius * 0.07;
        this.fire.emit(x, y, z, spread(2.5), 4 + random() * 8, spread(2.5), 0.5 + random() * 0.7, (3.4 + random() * 3.6) * big, FIRE, this.time);
        if (index % 5 === 0) {
          this.smoke.emit(x, structure.top, z, spread(2), 6 + random() * 6, spread(2), 4.5 + random() * 3.5, (9 + random() * 8) * big, SMOKE, this.time);
        }
        if (index % 7 === 0) {
          this.fire.emit(x, y, z, spread(7), 8 + random() * 14, spread(7), 1.4 + random() * 2, 0.5 + random() * 0.5, EMBER, this.time);
        }
      }
    }

    for (const structure of this.city.smouldering) {
      structure.smoulder -= dt;
      if (structure.smoulder <= 0) {
        this.city.smouldering.delete(structure);
        continue;
      }
      const { building } = structure;
      if (random() < dt * 1.6) {
        this.smoke.emit(building.x + spread(building.width * 0.4), building.y + 1, building.z + spread(building.depth * 0.4), spread(1.5), 3 + random() * 4, spread(1.5), 4 + random() * 4, 7 + random() * 7, SMOKE, this.time);
      }
      if (structure.flammable && structure.smoulder > 10 && random() < dt * 5) {
        this.fire.emit(building.x + spread(building.width * 0.4), building.y + 0.5, building.z + spread(building.depth * 0.4), spread(1.5), 2 + random() * 4, spread(1.5), 0.5 + random() * 0.5, 2.5 + random() * 2.5, FIRE, this.time);
      }
    }
  }

  private updateGroundFires(dt: number): void {
    for (let index = this.groundFires.length - 1; index >= 0; index -= 1) {
      const patch = this.groundFires[index];
      patch.life -= dt;
      if (patch.life <= 0) {
        this.groundFires.splice(index, 1);
        continue;
      }
      if (random() < dt * 22) {
        this.fire.emit(patch.x + spread(3), patch.y + 0.3, patch.z + spread(3), spread(1.5), 3 + random() * 5, spread(1.5), 0.45 + random() * 0.5, 3 + random() * 3, FIRE, this.time);
      }
      if (random() < dt * 2.5) {
        this.smoke.emit(patch.x, patch.y + 2, patch.z, spread(1.5), 4 + random() * 4, spread(1.5), 3 + random() * 3, 6 + random() * 6, SMOKE, this.time);
      }
    }
  }

  private updateDebris(dt: number): void {
    const pool = this.debris;
    this.impactsThisFrame = 0;
    stepDebris(pool, dt, terrainHeight, (index, speed) => {
      // ponytail: only the two hardest hits per frame make a sound; raise if rubble feels mute.
      if (speed < 9 || this.impactsThisFrame >= 2) return;
      this.impactsThisFrame += 1;
      this.events.debrisImpact(new THREE.Vector3(pool.position[index * 3], pool.position[index * 3 + 1], pool.position[index * 3 + 2]), speed);
    });
    // ponytail: free-falling boxes with ground bounce only, no chunk-to-chunk contact or stacking.
    // Swap in a rigid-body engine (Rapier) if piles of rubble need to hold each other up.
    for (let index = 0; index < pool.capacity; index += 1) {
      const life = pool.life[index];
      // Chunks lying still, and empty slots, keep the matrix they were last drawn with.
      const drawn = life <= 0 ? 2 : pool.resting[index] && life > 1.2 ? 1 : 0;
      if (drawn !== 0 && this.drawn[index] === drawn) continue;
      this.drawn[index] = drawn;
      const offset = index * 3;
      const fade = Math.min(1, life / 1.2);
      this.euler.set(pool.rotation[offset], pool.rotation[offset + 1], pool.rotation[offset + 2]);
      this.quaternion.setFromEuler(this.euler);
      this.scale.set(pool.size[offset] * fade, pool.size[offset + 1] * fade, pool.size[offset + 2] * fade);
      this.point.set(pool.position[offset], pool.position[offset + 1], pool.position[offset + 2]);
      this.matrix.compose(this.point, this.quaternion, this.scale);
      this.debrisMesh.setMatrixAt(index, this.matrix);
      this.debrisMesh.setColorAt(index, this.color.setRGB(pool.color[offset], pool.color[offset + 1], pool.color[offset + 2]));
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
  }

  private updateEffects(dt: number): void {
    for (const wave of this.shockwaves) {
      if (!wave.mesh.visible) continue;
      wave.age += dt * 1.5;
      if (wave.age >= 1) {
        wave.mesh.visible = false;
        continue;
      }
      const eased = 1 - (1 - wave.age) * (1 - wave.age);
      wave.mesh.scale.setScalar(Math.max(0.01, eased * wave.size));
      wave.material.opacity = (1 - wave.age) * 0.8;
    }
    for (const flash of this.flashes) {
      flash.power *= Math.exp(-dt * 7);
      flash.light.intensity = flash.power < 50 ? 0 : flash.power;
    }
  }

  private updateLights(dt: number, viewer: THREE.Vector3): void {
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.3;
      const nearest = Array.from(this.city.burning)
        .map((structure) => ({ structure, distance: Math.hypot(structure.building.x - viewer.x, structure.building.z - viewer.z) }))
        .sort((a, b) => a.distance - b.distance);
      for (const [index, light] of this.fireLights.entries()) {
        // Spread the lights across the fire front rather than stacking them on adjacent houses.
        const entry = nearest[index * Math.max(1, Math.floor(nearest.length / FIRE_LIGHTS))];
        light.userData.power = entry ? 2600 : 0;
        if (entry) light.position.set(entry.structure.building.x, entry.structure.top + 5, entry.structure.building.z);
      }
    }
    for (const [index, light] of this.fireLights.entries()) {
      const target = (light.userData.power as number | undefined) ?? 0;
      const flicker = 0.8 + 0.2 * Math.sin(this.time * (11 + index * 3.7)) * Math.sin(this.time * (5.3 + index));
      light.intensity += (target * flicker - light.intensity) * Math.min(1, dt * 5);
    }
  }
}
