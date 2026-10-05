/** Pure seeded town generator. No three.js here so node:test can load it. */

import { terrainHeight, type TownSite } from './terrain.ts';

export type BuildingKind = 'house' | 'hall' | 'tower' | 'keep' | 'wall' | 'powder' | 'windmill';

export interface Building {
  kind: BuildingKind;
  town: number;
  x: number;
  z: number;
  /** Ground level under the building. */
  y: number;
  width: number;
  depth: number;
  height: number;
  /** Height of the roof above the walls; 0 for flat tops. */
  roof: number;
  rotation: number;
  /** Part of the curtain wall; ring pieces touch their neighbours by design. */
  ring: boolean;
  /** 0..1 per-building variation for colour and timing. */
  tint: number;
}

export interface Town {
  site: TownSite;
  buildings: Building[];
  church: { x: number; z: number };
  keep: { x: number; z: number };
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function boundingRadius(building: Building): number {
  return 0.5 * Math.hypot(building.width, building.depth);
}

const WALL_SEGMENT = 26;
const WALL_INSET = 20;
const MARKET_RADIUS = 36;
const RING_STEP = 17;

export function generateTown(site: TownSite, townIndex: number): Town {
  const random = mulberry32(site.seed);
  const buildings: Building[] = [];
  const large = site.radius > 180;

  const make = (kind: BuildingKind, localX: number, localZ: number, size: Partial<Building>): Building => {
    const x = site.x + localX;
    const z = site.z + localZ;
    return {
      kind,
      town: townIndex,
      x,
      z,
      y: terrainHeight(x, z),
      width: 8,
      depth: 8,
      height: 6,
      roof: 0,
      rotation: 0,
      ring: false,
      tint: random(),
      ...size,
    };
  };

  const place = (kind: BuildingKind, localX: number, localZ: number, size: Partial<Building>): Building => {
    const building = make(kind, localX, localZ, size);
    buildings.push(building);
    return building;
  };

  const tryPlace = (
    kind: BuildingKind,
    localX: number,
    localZ: number,
    size: Partial<Building>,
    margin: number,
  ): boolean => {
    const candidate = make(kind, localX, localZ, size);
    const blocked = buildings.some(
      (other) =>
        Math.hypot(candidate.x - other.x, candidate.z - other.z) <
        boundingRadius(candidate) + boundingRadius(other) + margin,
    );
    if (!blocked) buildings.push(candidate);
    return !blocked;
  };

  // Curtain wall: straight segments with a tower every fifth, and a gap at each gate.
  const streets = large ? 8 : 4;
  const streetOffset = random() * Math.PI;
  const streetAngles = Array.from({ length: streets }, (_, index) => streetOffset + (index * 2 * Math.PI) / streets);
  const nearStreet = (angle: number, halfWidth: number, onlyGates: boolean): boolean =>
    streetAngles.some((street, index) => {
      if (onlyGates && large && index % 2 === 1) return false;
      const delta = Math.atan2(Math.sin(angle - street), Math.cos(angle - street));
      return Math.abs(delta) < halfWidth;
    });

  const segments = Math.round((2 * Math.PI * site.radius) / WALL_SEGMENT);
  const wallHeight = large ? 12 : 8;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index * 2 * Math.PI) / segments;
    const x = Math.cos(angle) * site.radius;
    const z = Math.sin(angle) * site.radius;
    const rotation = Math.PI / 2 - angle;
    if (nearStreet(angle, (WALL_SEGMENT * 0.55) / site.radius, true)) continue;
    if (index % 5 === 0) {
      place('tower', x, z, { width: 9, depth: 9, height: wallHeight + 9, roof: 7, rotation, ring: true });
    } else {
      place('wall', x, z, { width: WALL_SEGMENT + 0.5, depth: 3.5, height: wallHeight, rotation, ring: true });
    }
  }

  // Landmarks first, so the houses pack around them.
  const keepAngle = random() * 2 * Math.PI;
  const keepDistance = site.radius * 0.5;
  const keepSize = large ? 34 : 20;
  const keep = place('keep', Math.cos(keepAngle) * keepDistance, Math.sin(keepAngle) * keepDistance, {
    width: keepSize,
    depth: keepSize,
    height: large ? 40 : 24,
    rotation: random() * Math.PI,
  });

  const churchAngle = keepAngle + Math.PI * (0.75 + random() * 0.5);
  const churchDistance = MARKET_RADIUS + 24;
  const churchRotation = random() * Math.PI;
  const naveX = Math.cos(churchAngle) * churchDistance;
  const naveZ = Math.sin(churchAngle) * churchDistance;
  place('hall', naveX, naveZ, { width: 13, depth: 30, height: 13, roof: 9, rotation: churchRotation });
  const church = place('tower', naveX + Math.sin(churchRotation) * 22, naveZ + Math.cos(churchRotation) * 22, {
    width: 9,
    depth: 9,
    height: 30,
    roof: 16,
    rotation: churchRotation,
  });

  const powderStores = large ? 6 : 2;
  for (let index = 0; index < powderStores; index += 1) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const angle = random() * 2 * Math.PI;
      const distance = MARKET_RADIUS + 20 + random() * (site.radius - WALL_INSET - MARKET_RADIUS - 30);
      const size = { width: 7, depth: 7, height: 4.5, roof: 3, rotation: random() * Math.PI };
      if (tryPlace('powder', Math.cos(angle) * distance, Math.sin(angle) * distance, size, 6)) break;
    }
  }

  // Houses on concentric rings, broken by the radial streets.
  let houses = 0;
  for (let ringRadius = MARKET_RADIUS + 8; ringRadius < site.radius - WALL_INSET && houses < site.houses; ringRadius += RING_STEP) {
    let angle = random() * 0.3;
    const end = angle + 2 * Math.PI;
    while (angle < end && houses < site.houses) {
      const width = 7 + random() * 4.5;
      const depth = 8 + random() * 4.5;
      const tall = random() < 0.3;
      const step = (width + 2.5 + random() * 3) / ringRadius;
      const centre = angle + step / 2;
      angle += step;
      if (centre + step / 2 > end) break;
      if (nearStreet(centre, 7 / ringRadius + step / 2, false)) continue;
      const size = {
        width,
        depth,
        height: tall ? 7.5 + random() * 2 : 4.2 + random() * 1.6,
        roof: 3 + random() * 2.5,
        rotation: Math.PI / 2 - centre,
      };
      if (!tryPlace('house', Math.cos(centre) * ringRadius, Math.sin(centre) * ringRadius, size, 1)) continue;
      houses += 1;
    }
  }

  // Windmills on the fields outside the walls.
  const windmills = large ? 5 : 2;
  for (let index = 0; index < windmills; index += 1) {
    const angle = streetOffset + ((index + 0.5) * 2 * Math.PI) / windmills;
    const distance = site.radius + 45 + random() * 25;
    place('windmill', Math.cos(angle) * distance, Math.sin(angle) * distance, {
      width: 8,
      depth: 8,
      height: 17,
      roof: 5,
      rotation: random() * 2 * Math.PI,
    });
  }

  return { site, buildings, church: { x: church.x, z: church.z }, keep: { x: keep.x, z: keep.z } };
}
