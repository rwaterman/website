import * as THREE from 'three';
import { blueprint, FLAMMABLE_MATERIALS, lastStage, propBlueprint, type PartMaterial, type PartSpec } from './architecture';
import { boundingRadius, generateTown, mulberry32, type Building, type Prop, type Town } from './layout';
import { TOWNS } from './terrain';
import { roofTexture, scorchTexture, stoneTexture, timberTexture } from './world';

export type StructureState = 'intact' | 'burning' | 'ruined';

/** One instance of a blueprint part: where it stands, and the rigid body carrying it once it falls. */
export interface Part {
  mesh: THREE.InstancedMesh;
  index: number;
  material: PartMaterial;
  stage: number;
  flammable: boolean;
  /** World-space centre, orientation and full size; kept current while the part is falling. */
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  size: THREE.Vector3;
  /** Rigid-body slot while falling, otherwise -1. */
  body: number;
  /** Fell and came to rest; a later blast can throw it again. */
  down: boolean;
  hidden: boolean;
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
  /** Highest collapse stage among the parts. */
  stages: number;
  /** Next stage to let go of; stages below it are already falling or down. */
  released: number;
  /** Buildings count toward the score; village props do not. */
  scored: boolean;
}

const CELL = 48;
const CHAR = new THREE.Color(0.035, 0.03, 0.028);

function box(): THREE.BoxGeometry {
  return new THREE.BoxGeometry(1, 1, 1);
}

/** Unit triangular prism centred on the origin: base at y = -0.5, apex ridge at y = 0.5 along z. */
function wedgeGeometry(): THREE.BufferGeometry {
  const h = 0.5;
  // prettier-ignore
  const positions = [
    // front and back triangles
    -h, -h, h, h, -h, h, 0, h, h,
    h, -h, -h, -h, -h, -h, 0, h, -h,
    // left slope
    -h, -h, -h, -h, -h, h, 0, h, h, -h, -h, -h, 0, h, h, 0, h, -h,
    // right slope
    h, -h, h, h, -h, -h, 0, h, -h, h, -h, h, 0, h, -h, 0, h, h,
    // underside
    -h, -h, -h, h, -h, -h, h, -h, h, -h, -h, -h, h, -h, h, -h, -h, h,
  ];
  // prettier-ignore
  const uvs = [
    0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1,
    0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
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
  return geometry;
}

/** A prop wears the same shape as a building so the fire, the physics and the dragon treat it alike. */
function propAsBuilding(prop: Prop): Building {
  return { kind: 'prop', town: prop.town, x: prop.x, z: prop.z, y: prop.y, width: prop.width, depth: prop.depth, height: prop.height, roof: prop.kind === 'well' ? 1 : 0, rotation: prop.rotation, ring: false, tint: prop.tint };
}

interface DirtyRange {
  min: number;
  max: number;
}

export class City {
  readonly group = new THREE.Group();
  readonly towns: Town[];
  readonly structures: Structure[] = [];
  readonly burning = new Set<Structure>();
  readonly smouldering = new Set<Structure>();
  razed = 0;
  /** How many structures count toward the score: the buildings, not the props. */
  readonly scoredCount: number;

  private readonly grid = new Map<number, Structure[]>();
  private readonly meshes: Record<PartMaterial, THREE.InstancedMesh>;
  private readonly scorch: THREE.InstancedMesh;
  private readonly counts = new Map<THREE.InstancedMesh, number>();
  private readonly dirty = new Map<THREE.InstancedMesh, DirtyRange>();
  private readonly colorsDirty = new Set<THREE.InstancedMesh>();
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly color = new THREE.Color();
  private readonly hiddenScale = new THREE.Vector3(0, 0, 0);
  private readonly base = new Map<Part, THREE.Color>();
  private readonly random = mulberry32(99);
  private scorchCursor = 0;

  constructor() {
    this.towns = TOWNS.map((site, index) => generateTown(site, index));
    const buildings = this.towns.flatMap((town) => town.buildings);
    const props = this.towns.flatMap((town) => town.props);
    const plans = [
      ...buildings.map((building) => ({ building, parts: blueprint(building), scored: true })),
      ...props.map((prop) => ({ building: propAsBuilding(prop), parts: propBlueprint(prop), scored: false })),
    ];
    this.scoredCount = buildings.length;
    const capacity = (material: PartMaterial): number => plans.reduce((sum, plan) => sum + plan.parts.filter((part) => part.material === material).length, 0);

    const timber = timberTexture();
    const stone = stoneTexture();
    const roof = roofTexture();
    const lambert = (map: THREE.Texture | null, options: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ map, ...options });
    this.meshes = {
      plaster: this.instanced(box(), lambert(timber), capacity('plaster')),
      wood: this.instanced(box(), lambert(null), capacity('wood')),
      roof: this.instanced(box(), lambert(roof), capacity('roof')),
      gable: this.instanced(wedgeGeometry(), lambert(timber), capacity('gable')),
      stone: this.instanced(box(), lambert(stone), capacity('stone')),
      stoneGable: this.instanced(wedgeGeometry(), lambert(stone), capacity('stoneGable')),
      spire: this.instanced(spireGeometry(), lambert(roof, { flatShading: true }), capacity('spire')),
      glow: this.instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.5, 0.5), side: THREE.DoubleSide }), capacity('glow')),
    };
    this.scorch = this.instanced(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      buildings.length + 160,
    );
    this.scorch.renderOrder = 1;
    this.scorch.count = 0;

    for (const plan of plans) this.add(plan.building, plan.parts, plan.scored);
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

  private add(building: Building, specs: PartSpec[], scored: boolean): void {
    const { kind, height, roof, tint } = building;
    const flammable = kind === 'house' || kind === 'hall' || kind === 'windmill' || kind === 'powder' || (kind === 'prop' && specs.some((spec) => spec.material !== 'stone'));
    const structure: Structure = {
      building,
      parts: [],
      state: 'intact',
      flammable,
      heat: 0,
      health: kind === 'keep' ? 3 : kind === 'tower' ? 2 : 1,
      fuel: kind === 'prop' ? 3 + tint * 3 : 6 + tint * 7 + (kind === 'hall' ? 8 : 0),
      burnTime: 0,
      smoulder: 0,
      fuse: -1,
      radius: boundingRadius(building),
      top: building.y + height + roof,
      blades: null,
      stages: lastStage(specs),
      released: 0,
      scored,
    };
    for (const spec of specs) structure.parts.push(this.addPart(building, spec));
    if (kind === 'windmill') structure.blades = this.createBlades(building);

    this.structures.push(structure);
    const key = this.cellKey(building.x, building.z);
    const cell = this.grid.get(key);
    if (cell) cell.push(structure);
    else this.grid.set(key, [structure]);
  }

  private addPart(building: Building, spec: PartSpec): Part {
    const mesh = this.meshes[spec.material];
    const index = this.counts.get(mesh) ?? 0;
    this.counts.set(mesh, index + 1);
    const cos = Math.cos(building.rotation);
    const sin = Math.sin(building.rotation);
    const position = new THREE.Vector3(building.x + spec.x * cos + spec.z * sin, building.y + spec.y, building.z - spec.x * sin + spec.z * cos);
    const quaternion = new THREE.Quaternion()
      .setFromAxisAngle(this.up, building.rotation)
      .multiply(this.quaternion.setFromEuler(this.euler.set(spec.pitch, spec.yaw, spec.roll, 'YXZ')));
    const size = new THREE.Vector3(spec.width, spec.height, spec.depth);
    mesh.setMatrixAt(index, this.matrix.compose(position, quaternion, size));
    const color = new THREE.Color(spec.color);
    mesh.setColorAt(index, color);
    const part: Part = { mesh, index, material: spec.material, stage: spec.stage, flammable: FLAMMABLE_MATERIALS.has(spec.material), position, quaternion, size, body: -1, down: false, hidden: false };
    this.base.set(part, color);
    return part;
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

  private markDirty(mesh: THREE.InstancedMesh, index: number): void {
    const range = this.dirty.get(mesh);
    if (range) {
      range.min = Math.min(range.min, index);
      range.max = Math.max(range.max, index);
    } else {
      this.dirty.set(mesh, { min: index, max: index });
    }
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

  /** Darkens a burning structure toward charcoal as its fuel runs down; stone only soots a little. */
  char(structure: Structure, amount: number): void {
    for (const part of structure.parts) {
      if (part.material === 'glow') continue;
      const base = this.base.get(part);
      if (!base) continue;
      this.color.copy(base).lerp(CHAR, part.flammable ? amount : amount * 0.45);
      part.mesh.setColorAt(part.index, this.color);
      this.colorsDirty.add(part.mesh);
    }
  }

  /** Writes a falling part's current transform into its instance. */
  movePart(part: Part, position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    part.position.copy(position);
    part.quaternion.copy(quaternion);
    part.mesh.setMatrixAt(part.index, this.matrix.compose(position, quaternion, part.size));
    this.markDirty(part.mesh, part.index);
  }

  hidePart(part: Part): void {
    if (part.hidden) return;
    part.hidden = true;
    part.mesh.setMatrixAt(part.index, this.matrix.compose(part.position, part.quaternion, this.hiddenScale));
    this.markDirty(part.mesh, part.index);
  }

  /**
   * Marks the structure as razed: it stops burning, its windows go dark and it leaves a scorch mark.
   * Its parts are left where they stand for the fire system to bring down. Returns false if already down.
   */
  ruin(structure: Structure): boolean {
    if (structure.state === 'ruined') return false;
    structure.state = 'ruined';
    structure.smoulder = 18 + this.random() * 14;
    this.burning.delete(structure);
    this.smouldering.add(structure);
    if (structure.scored) this.razed += 1;
    for (const part of structure.parts) {
      if (part.material === 'glow') this.hidePart(part);
    }
    if (structure.blades) {
      this.group.remove(structure.blades);
      structure.blades = null;
    }
    const { building } = structure;
    this.addScorch(building.x, building.y, building.z, structure.radius * (structure.scored ? 3.4 : 2));
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

  /** Uploads only the instance ranges that moved this frame. */
  flush(): void {
    for (const [mesh, range] of this.dirty) {
      const attribute = mesh.instanceMatrix;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(range.min * 16, (range.max - range.min + 1) * 16);
      attribute.needsUpdate = true;
    }
    this.dirty.clear();
    for (const mesh of this.colorsDirty) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.colorsDirty.clear();
  }
}
