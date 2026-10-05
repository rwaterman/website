import * as THREE from 'three';
import type { City, Structure } from './city';
import { createDebrisPool, spawnDebris, stepDebris, type DebrisPool } from './debris';
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

const BREATH_PROBES = [10, 24, 40, 58, 76];
const WIND = new THREE.Vector2(4.5, 2.2);
const FIREBALL_SPEED = 150;
const FIREBALL_GRAVITY = 20;
const BLAST_RADIUS = 24;
const FIRE_LIGHTS = 4;
const MAX_GROUND_FIRES = 48;

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

  get burningCount(): number {
    return this.city.burning.size;
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
    const chunks = Math.round(Math.min(64, Math.max(7, volume / 60)) * this.quality.chunkScale);
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
      const block = stone ? 1.1 + random() * 1.9 : 0.9 + random() * 1.5;
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
          sx: plank ? 0.35 : block,
          sy: plank ? 0.35 : block * (0.5 + random() * 0.6),
          sz: plank ? 2.2 + random() * 2.4 : block * (0.6 + random() * 0.7),
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
    this.events.collapse(new THREE.Vector3(building.x, building.y + building.height / 2, building.z), stone, size);
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

  update(dt: number, time: number, camera: THREE.PerspectiveCamera, pixelScale: number, fog: THREE.FogExp2): void {
    this.time = time;
    this.breathLight.intensity *= Math.exp(-dt * 14);
    this.updateFireballs(dt);
    this.updateBurning(dt, camera.position);
    this.updateGroundFires(dt);
    this.updateDebris(dt);
    this.updateEffects(dt);
    this.updateLights(dt, camera.position);
    this.fire.update(time, pixelScale, fog);
    this.smoke.update(time, pixelScale, fog);
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
      if (structure.fuel <= 0) this.collapse(structure, null, 0);
    }

    const live = Array.from(this.city.burning);
    if (live.length > 0) {
      const budget = Math.min(this.quality.emitBudget, live.length * 9) * Math.min(2, dt * 60);
      for (let index = 0; index < budget; index += 1) {
        const structure = live[Math.floor(random() * live.length)];
        const { building } = structure;
        if (Math.hypot(building.x - viewer.x, building.z - viewer.z) > 1500) continue;
        const x = building.x + spread(building.width * 0.5);
        const z = building.z + spread(building.depth * 0.5);
        const y = building.y + random() * (building.height + building.roof);
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
        light.userData.power = entry ? 5200 : 0;
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
