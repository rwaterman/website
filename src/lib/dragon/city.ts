import * as THREE from 'three';
import { boundingRadius, generateTown, mulberry32, type Building, type Town } from './layout';
import { TOWNS } from './terrain';
import { roofTexture, scorchTexture, stoneTexture, timberTexture } from './world';

export type StructureState = 'intact' | 'burning' | 'ruined';

interface Part {
  mesh: THREE.InstancedMesh;
  index: number;
}

export interface Structure {
  building: Building;
  parts: Part[];
  state: StructureState;
  /** Wood catches fire; stone has to be broken. */
  flammable: boolean;
  /** Accumulated heat; a flammable structure ignites at 1. */
  heat: number;
  /** Hit points for stone, in fireballs. */
  health: number;
  /** Seconds of burning left before the structure falls in. */
  fuel: number;
  burnTime: number;
  /** Seconds a ruin keeps smouldering. */
  smoulder: number;
  /** Seconds until a lit powder store goes up; negative when not armed. */
  fuse: number;
  radius: number;
  top: number;
  blades: THREE.Object3D | null;
}

const CELL = 48;
const CHAR = new THREE.Color(0.035, 0.03, 0.028);

const PLASTER = [0xf0e6d2, 0xe6d3b0, 0xd9c7a4, 0xe9cfc0, 0xcfd2c2, 0xf2ead8];
const ROOFS = [0xb9a05c, 0xa98e52, 0x8c4a34, 0x9c563a, 0x565a66, 0xc0aa66, 0x7a6a50];

function basedBox(): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/** Unit gable roof: ridge along Z, eaves at y = 0, apex at y = 1. */
function gableGeometry(): THREE.BufferGeometry {
  const half = 0.5;
  const positions = [
    // left slope
    -half, 0, half, 0, 1, half, 0, 1, -half, -half, 0, half, 0, 1, -half, -half, 0, -half,
    // right slope
    half, 0, half, half, 0, -half, 0, 1, -half, half, 0, half, 0, 1, -half, 0, 1, half,
    // gable ends
    -half, 0, half, half, 0, half, 0, 1, half, half, 0, -half, -half, 0, -half, 0, 1, -half,
  ];
  const uvs = [
    0, 0, 0, 1, 2, 1, 0, 0, 2, 1, 2, 0,
    0, 0, 2, 0, 2, 1, 0, 0, 2, 1, 0, 1,
    0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function spireGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(0.72, 1, 4, 1);
  geometry.rotateY(Math.PI / 4);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

export class City {
  readonly group = new THREE.Group();
  readonly towns: Town[];
  readonly structures: Structure[] = [];
  readonly burning = new Set<Structure>();
  readonly smouldering = new Set<Structure>();
  razed = 0;

  private readonly grid = new Map<number, Structure[]>();
  private readonly timber: THREE.InstancedMesh;
  private readonly stone: THREE.InstancedMesh;
  private readonly roof: THREE.InstancedMesh;
  private readonly spire: THREE.InstancedMesh;
  private readonly merlon: THREE.InstancedMesh;
  private readonly glow: THREE.InstancedMesh;
  private readonly rubble: THREE.InstancedMesh;
  private readonly scorch: THREE.InstancedMesh;
  private readonly counts = new Map<THREE.InstancedMesh, number>();
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly color = new THREE.Color();
  private readonly base = new Map<Structure, THREE.Color[]>();
  private readonly random = mulberry32(99);
  private scorchCursor = 0;
  private rubbleCursor = 0;

  constructor() {
    this.towns = TOWNS.map((site, index) => generateTown(site, index));
    const buildings = this.towns.flatMap((town) => town.buildings);
    const count = (kinds: Building['kind'][]): number => buildings.filter((building) => kinds.includes(building.kind)).length;

    const houses = count(['house']);
    const stoneCount = count(['hall', 'tower', 'keep', 'wall', 'powder', 'windmill']);
    this.timber = this.instanced(basedBox(), new THREE.MeshLambertMaterial({ map: timberTexture() }), houses);
    this.stone = this.instanced(basedBox(), new THREE.MeshLambertMaterial({ map: stoneTexture() }), stoneCount);
    this.roof = this.instanced(gableGeometry(), new THREE.MeshLambertMaterial({ map: roofTexture(), side: THREE.DoubleSide }), houses + count(['hall', 'powder']));
    this.spire = this.instanced(spireGeometry(), new THREE.MeshLambertMaterial({ map: roofTexture(), flatShading: true }), count(['tower', 'windmill']));
    this.merlon = this.instanced(basedBox(), new THREE.MeshLambertMaterial({ map: stoneTexture() }), count(['wall']) * 4 + count(['keep']) * 24);
    this.glow = this.instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.5, 0.5), side: THREE.DoubleSide }), houses * 2 + count(['keep', 'hall']) * 6);
    this.rubble = this.instanced(new THREE.DodecahedronGeometry(0.6, 0), new THREE.MeshLambertMaterial({ flatShading: true }), buildings.length);
    this.scorch = this.instanced(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      buildings.length + 160,
    );
    this.scorch.renderOrder = 1;
    for (const mesh of [this.rubble, this.scorch]) mesh.count = 0;

    for (const building of buildings) this.add(building);
    for (const [mesh, used] of this.counts) {
      mesh.count = used;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.counts.clear();
  }

  private instanced(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(mesh);
    return mesh;
  }

  /** Writes one instance in building-local space (x right, y up from the ground, z forward). */
  private addPart(
    structure: Structure,
    mesh: THREE.InstancedMesh,
    local: THREE.Vector3,
    scale: THREE.Vector3,
    hex: number,
    spin = 0,
  ): void {
    const { building } = structure;
    const index = this.counts.get(mesh) ?? 0;
    this.counts.set(mesh, index + 1);
    const cos = Math.cos(building.rotation);
    const sin = Math.sin(building.rotation);
    const position = new THREE.Vector3(
      building.x + local.x * cos + local.z * sin,
      building.y + local.y,
      building.z - local.x * sin + local.z * cos,
    );
    this.quaternion.setFromAxisAngle(this.up, building.rotation + spin);
    this.matrix.compose(position, this.quaternion, scale);
    mesh.setMatrixAt(index, this.matrix);
    const color = new THREE.Color(hex);
    mesh.setColorAt(index, color);
    structure.parts.push({ mesh, index });
    const colors = this.base.get(structure) ?? [];
    colors.push(color);
    this.base.set(structure, colors);
  }

  private add(building: Building): void {
    const { kind, width, depth, height, roof, tint } = building;
    const flammable = kind === 'house' || kind === 'hall' || kind === 'windmill' || kind === 'powder';
    const structure: Structure = {
      building,
      parts: [],
      state: 'intact',
      flammable,
      heat: 0,
      health: kind === 'keep' ? 3 : kind === 'tower' ? 2 : 1,
      fuel: 6 + tint * 7 + (kind === 'hall' ? 8 : 0),
      burnTime: 0,
      smoulder: 0,
      fuse: -1,
      radius: boundingRadius(building),
      top: building.y + height + roof,
      blades: null,
    };
    const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
    const pick = (palette: number[], offset: number): number => palette[Math.floor(((tint + offset) % 1) * palette.length)];
    const grey = new THREE.Color().setHSL(0.07, 0.06, 0.62 + tint * 0.22).getHex();
    // Sunk a little so sloping ground never shows a gap under the walls.
    const sink = -1.5;
    const wallHeight = height - sink;

    if (kind === 'house') {
      this.addPart(structure, this.timber, v(0, sink, 0), v(width, wallHeight, depth), pick(PLASTER, 0));
      this.addPart(structure, this.roof, v(0, height, 0), v(width * 1.16, roof, depth * 1.1), pick(ROOFS, 0.37));
      const lit = tint > 0.25;
      if (lit) {
        this.addPart(structure, this.glow, v(width * 0.2, height * 0.55, depth / 2 + 0.06), v(0.9, 1.1, 1), 0xffffff);
        this.addPart(structure, this.glow, v(-width * 0.2, height * 0.55, -depth / 2 - 0.06), v(0.9, 1.1, 1), 0xffffff);
      }
    } else if (kind === 'hall') {
      this.addPart(structure, this.stone, v(0, sink, 0), v(width, wallHeight, depth), grey);
      this.addPart(structure, this.roof, v(0, height, 0), v(width * 1.1, roof, depth * 1.04), 0x565a66);
      for (const side of [-1, 1]) {
        for (const along of [-0.3, 0, 0.3]) {
          this.addPart(structure, this.glow, v((side * width) / 2 + side * 0.06, height * 0.55, along * depth), v(1.2, 5, 1), 0xffffff, Math.PI / 2);
        }
      }
    } else if (kind === 'powder') {
      this.addPart(structure, this.stone, v(0, sink, 0), v(width, wallHeight, depth), 0x8a8478);
      this.addPart(structure, this.roof, v(0, height, 0), v(width * 1.15, roof, depth * 1.1), 0x8c4a34);
    } else if (kind === 'tower' || kind === 'windmill') {
      this.addPart(structure, this.stone, v(0, sink, 0), v(width, wallHeight, depth), kind === 'windmill' ? 0xd8cfbc : grey);
      this.addPart(structure, this.spire, v(0, height, 0), v(width * 1.25, roof, depth * 1.25), kind === 'windmill' ? 0x7a6a50 : 0x565a66);
    } else if (kind === 'wall') {
      this.addPart(structure, this.stone, v(0, sink, 0), v(width, wallHeight, depth), grey);
      for (const along of [-0.375, -0.125, 0.125, 0.375]) {
        this.addPart(structure, this.merlon, v(along * width, height, depth * 0.3), v(width * 0.13, 1.8, 1.1), grey);
      }
    } else {
      this.addPart(structure, this.stone, v(0, sink, 0), v(width, wallHeight, depth), grey);
      for (const side of [0, 1, 2, 3]) {
        const angle = (side * Math.PI) / 2;
        for (const along of [-0.42, -0.25, -0.085, 0.085, 0.25, 0.42]) {
          const x = Math.cos(angle) * width * 0.47 - Math.sin(angle) * along * width;
          const z = Math.sin(angle) * depth * 0.47 + Math.cos(angle) * along * depth;
          this.addPart(structure, this.merlon, v(x, height, z), v(2.6, 3, 2.6), grey);
        }
      }
      for (const side of [0, 1, 2, 3]) {
        const angle = (side * Math.PI) / 2;
        const x = Math.cos(angle) * (width / 2 + 0.06);
        const z = Math.sin(angle) * (depth / 2 + 0.06);
        this.addPart(structure, this.glow, v(x, height * 0.7, z), v(1.1, 3.4, 1), 0xffffff, side % 2 === 0 ? Math.PI / 2 : 0);
      }
    }

    if (kind === 'windmill') structure.blades = this.createBlades(building);

    this.structures.push(structure);
    const key = this.cellKey(building.x, building.z);
    const cell = this.grid.get(key);
    if (cell) cell.push(structure);
    else this.grid.set(key, [structure]);
  }

  private createBlades(building: Building): THREE.Object3D {
    const hub = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color: 0x6b5236, side: THREE.DoubleSide });
    for (let blade = 0; blade < 4; blade += 1) {
      const sail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 12, 0.25), material);
      sail.position.y = 6.6;
      const arm = new THREE.Group();
      arm.rotation.z = (blade * Math.PI) / 2;
      arm.add(sail);
      hub.add(arm);
    }
    hub.position.set(
      building.x + Math.sin(building.rotation) * (building.depth / 2 + 0.9),
      building.y + building.height - 2,
      building.z + Math.cos(building.rotation) * (building.depth / 2 + 0.9),
    );
    hub.rotation.y = building.rotation;
    this.group.add(hub);
    return hub;
  }

  private cellKey(x: number, z: number): number {
    return (Math.floor(x / CELL) + 512) * 1024 + Math.floor(z / CELL) + 512;
  }

  /** Calls `visit` for every structure whose footprint is within `radius` of the point. */
  query(x: number, z: number, radius: number, visit: (structure: Structure, distance: number) => void): void {
    const reach = radius + 30;
    for (let cellX = Math.floor((x - reach) / CELL); cellX <= Math.floor((x + reach) / CELL); cellX += 1) {
      for (let cellZ = Math.floor((z - reach) / CELL); cellZ <= Math.floor((z + reach) / CELL); cellZ += 1) {
        const cell = this.grid.get((cellX + 512) * 1024 + cellZ + 512);
        if (!cell) continue;
        for (const structure of cell) {
          const distance = Math.hypot(structure.building.x - x, structure.building.z - z) - structure.radius;
          if (distance <= radius) visit(structure, Math.max(0, distance));
        }
      }
    }
  }

  /** Highest structure top under the point, or -Infinity over open ground. */
  roofAt(x: number, z: number): number {
    let top = -Infinity;
    this.query(x, z, 0, (structure, distance) => {
      if (structure.state !== 'ruined' && distance <= 0) top = Math.max(top, structure.top);
    });
    return top;
  }

  ignite(structure: Structure): boolean {
    if (structure.state !== 'intact' || !structure.flammable) return false;
    structure.state = 'burning';
    structure.heat = 1;
    this.burning.add(structure);
    if (structure.building.kind === 'powder') structure.fuse = 0.5 + this.random() * 0.7;
    return true;
  }

  /** Darkens a burning structure toward charcoal as its fuel runs down. */
  char(structure: Structure, amount: number): void {
    const colors = this.base.get(structure);
    if (!colors) return;
    for (const [index, part] of structure.parts.entries()) {
      if (part.mesh === this.glow) continue;
      this.color.copy(colors[index]).lerp(CHAR, amount);
      part.mesh.setColorAt(part.index, this.color);
      if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Removes the structure's meshes and leaves rubble and a scorch mark. Returns false if already down. */
  ruin(structure: Structure): boolean {
    if (structure.state === 'ruined') return false;
    structure.state = 'ruined';
    structure.smoulder = 18 + this.random() * 14;
    this.burning.delete(structure);
    this.smouldering.add(structure);
    this.razed += 1;

    this.matrix.makeScale(0, 0, 0);
    for (const part of structure.parts) {
      part.mesh.setMatrixAt(part.index, this.matrix);
      part.mesh.instanceMatrix.needsUpdate = true;
    }
    if (structure.blades) {
      this.group.remove(structure.blades);
      structure.blades = null;
    }

    const { building } = structure;
    const position = new THREE.Vector3(building.x, building.y + 0.5, building.z);
    this.quaternion.setFromEuler(new THREE.Euler(this.random() * 0.4, building.rotation, this.random() * 0.4));
    this.matrix.compose(position, this.quaternion, new THREE.Vector3(building.width * 0.85, 1.6 + building.height * 0.09, building.depth * 0.85));
    this.rubble.setMatrixAt(this.rubbleCursor, this.matrix);
    const shade = structure.flammable ? 0.05 + this.random() * 0.04 : 0.2 + this.random() * 0.1;
    this.rubble.setColorAt(this.rubbleCursor, this.color.setRGB(shade * 1.1, shade, shade * 0.95));
    this.rubbleCursor += 1;
    this.rubble.count = this.rubbleCursor;
    this.rubble.instanceMatrix.needsUpdate = true;
    if (this.rubble.instanceColor) this.rubble.instanceColor.needsUpdate = true;

    this.addScorch(building.x, building.y, building.z, structure.radius * 3.4);
    return true;
  }

  addScorch(x: number, y: number, z: number, size: number): void {
    const index = this.scorchCursor % this.scorch.instanceMatrix.count;
    this.scorchCursor += 1;
    this.quaternion.setFromAxisAngle(this.up, this.random() * Math.PI * 2);
    this.matrix.compose(new THREE.Vector3(x, y + 0.25, z), this.quaternion, new THREE.Vector3(size, 1, size));
    this.scorch.setMatrixAt(index, this.matrix);
    this.scorch.count = Math.min(this.scorchCursor, this.scorch.instanceMatrix.count);
    this.scorch.instanceMatrix.needsUpdate = true;
  }

  spinBlades(dt: number): void {
    for (const structure of this.structures) {
      if (structure.blades) structure.blades.rotateZ(dt * (structure.state === 'burning' ? 2.4 : 0.7));
    }
  }
}
