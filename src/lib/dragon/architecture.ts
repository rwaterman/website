/** Pure building blueprints: every building as a list of parts that can each fall on their own. No three.js here. */

import { mulberry32, type Building } from './layout.ts';

/** What a part is made of, which picks its mesh: boxes, except `gable` and `stoneGable` (wedges), `spire` (cone) and `glow` (plane). */
export type PartMaterial = 'plaster' | 'wood' | 'roof' | 'gable' | 'stone' | 'stoneGable' | 'spire' | 'glow';

export interface PartSpec {
  material: PartMaterial;
  /** Centre in building-local space: x across the width, y up from the ground, z along the depth. */
  x: number;
  y: number;
  z: number;
  /** Full size along the part's own x, y, z before rotation. */
  width: number;
  height: number;
  depth: number;
  /** Local rotation in radians, applied in YXZ order before the building's own rotation. */
  yaw: number;
  pitch: number;
  roll: number;
  color: number;
  /**
   * Collapse order: stage 0 falls first (roofs, spires, merlons), higher stages after. -1 never falls:
   * foundations stay behind as the ruin.
   */
  stage: number;
}

export const FLAMMABLE_MATERIALS: ReadonlySet<PartMaterial> = new Set(['plaster', 'wood', 'roof', 'gable']);

const PLASTER = [0xf0e6d2, 0xe6d3b0, 0xd9c7a4, 0xe9cfc0, 0xcfd2c2, 0xf2ead8];
const ROOFS = [0xb9a05c, 0xa98e52, 0x8c4a34, 0x9c563a, 0x565a66, 0xc0aa66, 0x7a6a50];
const WOOD = [0x3b2a1e, 0x4a3426, 0x2f241c, 0x55402e];
const BRICK = 0x8a4f3c;
const SLATE = 0x565a66;
const PLINTH_TOP = 0.5;
/** Below ground, so sloping terrain never shows a gap under a building. */
const SINK = -1.5;
const PANEL = 0.3;
const POST = 0.36;
const ROOF_THICKNESS = 0.32;

const pick = (palette: number[], value: number): number => palette[Math.floor((value % 1) * palette.length) % palette.length];

/** Warm grey from 0..1 lightness, close to the old HSL(0.07, 0.06, l) stone tint. */
function stoneGrey(lightness: number): number {
  const channel = (scale: number): number => Math.round(Math.min(1, lightness * scale) * 255);
  return (channel(1.04) << 16) | (channel(1) << 8) | channel(0.94);
}

class Parts {
  readonly list: PartSpec[] = [];

  add(material: PartMaterial, centre: [number, number, number], size: [number, number, number], color: number, stage: number, rotation: [number, number, number] = [0, 0, 0]): void {
    const [x, y, z] = centre;
    const [width, height, depth] = size;
    const [yaw, pitch, roll] = rotation;
    this.list.push({ material, x, y, z, width, height, depth, yaw, pitch, roll, color, stage });
  }

  /** A box between two heights, centred at (x, z). */
  span(material: PartMaterial, x: number, z: number, bottom: number, top: number, width: number, depth: number, color: number, stage: number): void {
    this.add(material, [x, (bottom + top) / 2, z], [width, top - bottom, depth], color, stage);
  }

  /** Stone footing from below ground to just above it; it never falls. */
  plinth(width: number, depth: number, color: number): void {
    this.span('stone', 0, 0, SINK, PLINTH_TOP, width, depth, color, -1);
  }

  /**
   * Gable roof over a width x depth footprint with its ridge along z: two slabs that can slide off
   * separately, and a wedge at each end.
   */
  gableRoof(eaves: number, width: number, depth: number, rise: number, color: number, gableMaterial: PartMaterial, gableColor: number, stage: number): void {
    const half = width / 2;
    const slope = Math.atan2(rise, half);
    const overhang = 0.6;
    const run = half + overhang;
    const length = run / Math.cos(slope);
    const eaveY = eaves - overhang * Math.tan(slope);
    const ridgeY = eaves + rise;
    for (const side of [-1, 1]) {
      const midX = (side * run) / 2;
      const midY = (eaveY + ridgeY) / 2;
      // Lift the slab by half its thickness so its underside sits on the roof line.
      const liftX = side * Math.sin(slope) * (ROOF_THICKNESS / 2);
      const liftY = Math.cos(slope) * (ROOF_THICKNESS / 2);
      this.add('roof', [midX + liftX, midY + liftY, 0], [length, ROOF_THICKNESS, depth + 1], color, stage, [0, 0, -side * slope]);
    }
    for (const end of [-1, 1]) {
      this.add(gableMaterial, [0, eaves + rise / 2, (end * (depth - PANEL)) / 2], [width, rise, PANEL], gableColor, stage + 1);
    }
  }

  /** Four wall panels between two heights; the long faces carry the corners. */
  walls(material: PartMaterial, width: number, depth: number, bottom: number, top: number, thickness: number, color: number, stage: number): void {
    for (const end of [-1, 1]) {
      this.span(material, 0, (end * (depth - thickness)) / 2, bottom, top, width, thickness, color, stage);
      this.span(material, (end * (width - thickness)) / 2, 0, bottom, top, thickness, depth - thickness * 2, color, stage);
    }
  }

  /** Corner posts and a plate along the top of the long walls: the frame that shows through the plaster. */
  frame(width: number, depth: number, bottom: number, top: number, color: number, stage: number): void {
    for (const sideX of [-1, 1]) {
      for (const sideZ of [-1, 1]) {
        this.span('wood', (sideX * (width - POST)) / 2, (sideZ * (depth - POST)) / 2, bottom, top, POST, POST, color, stage);
      }
    }
    for (const end of [-1, 1]) {
      this.add('wood', [0, top - 0.15, (end * (depth + 0.02)) / 2], [width, 0.3, POST], color, stage);
    }
  }

  /** A window on a wall face: lit glass between open shutters, or closed shutters. `face` is +-1 along z. */
  window(x: number, y: number, z: number, face: number, lit: boolean, wood: number, stage: number): void {
    const out = z + face * (PANEL / 2 + 0.04);
    if (lit) {
      this.add('glow', [x, y, out], [0.8, 0.95, 1], 0xffffff, stage);
      for (const side of [-1, 1]) this.add('wood', [x + side * 0.72, y, out + face * 0.05], [0.5, 1, 0.08], wood, stage);
    } else {
      this.add('wood', [x, y, out + face * 0.03], [1.0, 1.05, 0.08], wood, stage);
    }
  }
}

function house(building: Building, random: () => number): PartSpec[] {
  const parts = new Parts();
  const { width, depth, height, roof, tint } = building;
  const plaster = pick(PLASTER, tint);
  const roofColor = pick(ROOFS, tint + 0.37);
  const wood = pick(WOOD, tint * 3.1);
  const lit = tint > 0.25;
  const twoStorey = height > 7;

  parts.plinth(width + 0.3, depth + 0.3, stoneGrey(0.5 + tint * 0.15));

  const groundTop = twoStorey ? PLINTH_TOP + (height - PLINTH_TOP) * 0.48 : height;
  const groundStage = twoStorey ? 4 : 3;
  parts.walls('plaster', width, depth, PLINTH_TOP, groundTop, PANEL, plaster, groundStage);
  parts.frame(width, depth, PLINTH_TOP, groundTop, wood, groundStage);
  const doorX = (random() - 0.5) * width * 0.5;
  parts.add('wood', [doorX, PLINTH_TOP + 1.05, -depth / 2 - 0.06], [1.15, 2.1, 0.14], wood, groundStage);
  const windowY = PLINTH_TOP + (groundTop - PLINTH_TOP) * 0.6;
  parts.window(doorX > 0 ? -width * 0.25 : width * 0.25, windowY, -depth / 2 + PANEL / 2, -1, lit && random() < 0.7, wood, groundStage);
  parts.window((random() - 0.5) * width * 0.4, windowY, depth / 2 - PANEL / 2, 1, lit && random() < 0.6, wood, groundStage);

  let roofWidth = width;
  let roofDepth = depth;
  if (twoStorey) {
    // The upper storey is jettied out over the street on both long faces.
    const jetty = 0.45;
    roofDepth = depth + jetty * 2;
    parts.add('wood', [0, groundTop + 0.18, 0], [width + 0.1, 0.36, roofDepth], wood, 3);
    parts.walls('plaster', width, roofDepth, groundTop + 0.36, height, PANEL, plaster, 3);
    parts.frame(width, roofDepth, groundTop + 0.36, height, wood, 3);
    const upperY = groundTop + 0.36 + (height - groundTop - 0.36) * 0.55;
    for (const face of [-1, 1]) {
      for (const x of [-width * 0.25, width * 0.25]) parts.window(x, upperY, (face * (roofDepth - PANEL)) / 2, face, lit && random() < 0.5, wood, 3);
    }
  }

  parts.gableRoof(height, roofWidth, roofDepth, roof, roofColor, 'gable', plaster, 0);
  if (random() < 0.6) {
    const side = random() < 0.5 ? -1 : 1;
    const along = (random() - 0.5) * roofDepth * 0.5;
    const offset = roofWidth * 0.22;
    const roofHere = height + roof * (1 - offset / (roofWidth / 2));
    parts.span('stone', side * offset, along, height - 0.5, roofHere + 1.4, 0.9, 0.9, BRICK, 0);
  }
  return parts.list;
}

function hall(building: Building): PartSpec[] {
  const parts = new Parts();
  const { width, depth, height, roof, tint } = building;
  const grey = stoneGrey(0.62 + tint * 0.22);
  const thickness = 1.2;
  parts.plinth(width + 0.6, depth + 0.6, stoneGrey(0.5));
  // Long walls in three bays, so the nave can fall a bay at a time.
  const bays = 3;
  for (const side of [-1, 1]) {
    for (let bay = 0; bay < bays; bay += 1) {
      const z = -depth / 2 + thickness + ((bay + 0.5) * (depth - thickness * 2)) / bays;
      parts.span('stone', (side * (width - thickness)) / 2, z, PLINTH_TOP, height, thickness, (depth - thickness * 2) / bays, grey, 2 + bay);
      parts.span('stone', side * (width / 2 + 0.7), z - (depth - thickness * 2) / bays / 2, PLINTH_TOP, height * 0.72, 1.4, 1.8, grey, 3 + bay);
      parts.add('glow', [side * (width / 2 + 0.06), height * 0.55, z], [1.2, 5, 1], 0xffffff, 2 + bay, [Math.PI / 2, 0, 0]);
    }
  }
  for (const end of [-1, 1]) parts.span('stone', 0, (end * (depth - thickness)) / 2, PLINTH_TOP, height, width, thickness, grey, 2);
  parts.add('wood', [0, PLINTH_TOP + 2, -depth / 2 - 0.1], [2.6, 4, 0.2], 0x3b2a1e, 2);
  parts.gableRoof(height, width, depth, roof, SLATE, 'stoneGable', grey, 0);
  return parts.list;
}

function powder(building: Building): PartSpec[] {
  const parts = new Parts();
  const { width, depth, height, roof } = building;
  const stone = 0x8a8478;
  parts.plinth(width + 0.3, depth + 0.3, stoneGrey(0.48));
  parts.walls('stone', width, depth, PLINTH_TOP, height, 0.8, stone, 2);
  parts.add('wood', [0, PLINTH_TOP + 0.9, -depth / 2 - 0.06], [1.2, 1.8, 0.14], 0x2f241c, 2);
  parts.gableRoof(height, width, depth, roof, 0x8c4a34, 'stoneGable', stone, 0);
  return parts.list;
}

/** A square tower in courses that crumble from the top, under a spire. */
function tower(building: Building, color: number, lit: boolean): PartSpec[] {
  const parts = new Parts();
  const { width, depth, height, roof } = building;
  const thickness = Math.min(1.6, width * 0.18);
  parts.plinth(width + 0.5, depth + 0.5, stoneGrey(0.5));
  const courses = Math.max(2, Math.round((height - PLINTH_TOP) / 4.5));
  const course = (height - PLINTH_TOP) / courses;
  for (let index = 0; index < courses; index += 1) {
    const bottom = PLINTH_TOP + index * course;
    const stage = courses - index;
    parts.walls('stone', width, depth, bottom, bottom + course, thickness, color, stage);
    if (lit && index === courses - 1) parts.add('glow', [0, bottom + course * 0.5, -depth / 2 - 0.06], [1.1, 2.4, 1], 0xffffff, stage);
  }
  parts.add('spire', [0, height + roof / 2, 0], [width * 1.25, roof, depth * 1.25], building.kind === 'windmill' ? 0x7a6a50 : SLATE, 0);
  return parts.list;
}

function wall(building: Building): PartSpec[] {
  const parts = new Parts();
  const { width, depth, height, tint } = building;
  const grey = stoneGrey(0.62 + tint * 0.22);
  parts.plinth(width, depth + 0.4, stoneGrey(0.52));
  const columns = 4;
  const courses = height > 10 ? 3 : 2;
  const course = (height - PLINTH_TOP) / courses;
  for (let row = 0; row < courses; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = -width / 2 + ((column + 0.5) * width) / columns;
      // A slight per-block jitter in colour so the courses read.
      const shade = stoneGrey(0.6 + tint * 0.2 + ((row * 7 + column * 3) % 5) * 0.012);
      parts.span('stone', x, 0, PLINTH_TOP + row * course, PLINTH_TOP + (row + 1) * course, width / columns, depth, shade, courses - row);
    }
  }
  for (const along of [-0.375, -0.125, 0.125, 0.375]) {
    parts.span('stone', along * width, depth * 0.3, height, height + 1.8, width * 0.13, 1.1, grey, 0);
  }
  return parts.list;
}

function keep(building: Building): PartSpec[] {
  const parts = new Parts();
  const { width, depth, height, tint } = building;
  const grey = stoneGrey(0.62 + tint * 0.22);
  const thickness = 3;
  parts.plinth(width + 1, depth + 1, stoneGrey(0.5));
  const columns = 3;
  const courses = 4;
  const course = (height - PLINTH_TOP) / courses;
  for (let row = 0; row < courses; row += 1) {
    const bottom = PLINTH_TOP + row * course;
    const stage = courses - row;
    for (let column = 0; column < columns; column += 1) {
      const along = -0.5 + (column + 0.5) / columns;
      const shade = stoneGrey(0.6 + tint * 0.2 + ((row * 5 + column * 3) % 4) * 0.015);
      for (const end of [-1, 1]) {
        parts.span('stone', along * width, (end * (depth - thickness)) / 2, bottom, bottom + course, width / columns, thickness, shade, stage);
        parts.span('stone', (end * (width - thickness)) / 2, along * (depth - thickness * 2), bottom, bottom + course, thickness, (depth - thickness * 2) / columns, shade, stage);
      }
    }
  }
  parts.span('wood', 0, 0, height - 1.2, height - 0.4, width - thickness * 2, depth - thickness * 2, 0x3b2a1e, 0);
  for (let side = 0; side < 4; side += 1) {
    const angle = (side * Math.PI) / 2;
    for (const along of [-0.42, -0.25, -0.085, 0.085, 0.25, 0.42]) {
      const x = Math.cos(angle) * width * 0.47 - Math.sin(angle) * along * width;
      const z = Math.sin(angle) * depth * 0.47 + Math.cos(angle) * along * depth;
      parts.span('stone', x, z, height, height + 3, 2.6, 2.6, grey, 0);
    }
    const x = Math.cos(angle) * (width / 2 + 0.06);
    const z = Math.sin(angle) * (depth / 2 + 0.06);
    parts.add('glow', [x, height * 0.7, z], [1.1, 3.4, 1], 0xffffff, 1, [side % 2 === 0 ? Math.PI / 2 : 0, 0, 0]);
  }
  return parts.list;
}

/** Every part of `building`, in building-local space. Deterministic for a given building. */
export function blueprint(building: Building): PartSpec[] {
  const random = mulberry32(Math.floor(building.tint * 2 ** 31) ^ Math.floor(building.x * 131 + building.z * 17));
  switch (building.kind) {
    case 'house':
      return house(building, random);
    case 'hall':
      return hall(building);
    case 'powder':
      return powder(building);
    case 'tower':
      return tower(building, stoneGrey(0.62 + building.tint * 0.22), building.height > 25);
    case 'windmill':
      return tower(building, 0xd8cfbc, false);
    case 'wall':
      return wall(building);
    case 'keep':
      return keep(building);
  }
}

/** Highest stage in a blueprint: how many steps its collapse takes. */
export function lastStage(parts: PartSpec[]): number {
  return parts.reduce((highest, part) => Math.max(highest, part.stage), 0);
}
