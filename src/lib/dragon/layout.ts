/** Pure seeded town generator. No three.js here so node:test can load it. */

import { terrainHeight, type TownSite } from './terrain.ts';

/** `prop` is never generated as a building: it marks a village prop dressed up as a structure. */
export type BuildingKind = 'house' | 'hall' | 'tower' | 'keep' | 'wall' | 'powder' | 'windmill' | 'prop';

export type PropKind = 'well' | 'stall' | 'cart' | 'hay' | 'barrel' | 'crate' | 'fence';

/** Village dressing: small, mostly wooden, worth nothing on the score, but it burns and breaks like the rest. */
export interface Prop {
  kind: PropKind;
  town: number;
  x: number;
  z: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  tint: number;
}

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
  props: Prop[];
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

  const props = placeProps(site, townIndex, buildings, streetAngles, random);
  return { site, buildings, props, church: { x: church.x, z: church.z }, keep: { x: keep.x, z: keep.z } };
}

const PROP_SIZES: Record<PropKind, { width: number; depth: number; height: number }> = {
  well: { width: 3.2, depth: 3.2, height: 4.2 },
  stall: { width: 4.2, depth: 3, height: 3.4 },
  cart: { width: 2.2, depth: 4.2, height: 2.4 },
  hay: { width: 1.6, depth: 2.4, height: 1.3 },
  barrel: { width: 0.9, depth: 0.9, height: 1.2 },
  crate: { width: 1.1, depth: 1.1, height: 1.1 },
  fence: { width: 6, depth: 0.3, height: 1.3 },
};

/** Props go in after the buildings, from the same seeded stream, so adding them leaves the buildings unchanged. */
function placeProps(site: TownSite, townIndex: number, buildings: Building[], streetAngles: number[], random: () => number): Prop[] {
  const props: Prop[] = [];
  const large = site.radius > 180;
  const footprint = (width: number, depth: number): number => 0.5 * Math.hypot(width, depth);

  const tryProp = (kind: PropKind, localX: number, localZ: number, rotation: number, margin: number): boolean => {
    const size = PROP_SIZES[kind];
    const x = site.x + localX;
    const z = site.z + localZ;
    const reach = footprint(size.width, size.depth);
    const blocked =
      buildings.some((building) => Math.hypot(x - building.x, z - building.z) < boundingRadius(building) + reach + margin) ||
      props.some((other) => Math.hypot(x - other.x, z - other.z) < footprint(other.width, other.depth) + reach + margin * 0.5);
    if (blocked) return false;
    props.push({ kind, town: townIndex, x, z, y: terrainHeight(x, z), rotation, tint: random(), ...size });
    return true;
  };

  // The market square: a well in the middle, stalls around it, carts at its edge.
  tryProp('well', 0, 0, random() * Math.PI, 0);
  const stalls = large ? 8 : 4;
  for (let index = 0; index < stalls; index += 1) {
    const angle = (index * 2 * Math.PI) / stalls + random() * 0.3;
    const distance = MARKET_RADIUS * (0.55 + random() * 0.15);
    if (tryProp('stall', Math.cos(angle) * distance, Math.sin(angle) * distance, Math.PI / 2 - angle, 0.5)) {
      for (let goods = 0; goods < 2; goods += 1) {
        const side = goods === 0 ? -1 : 1;
        const along = angle + (side * 3.4) / distance;
        tryProp(random() < 0.5 ? 'barrel' : 'crate', Math.cos(along) * distance, Math.sin(along) * distance, random() * Math.PI, 0.2);
      }
    }
  }
  const carts = large ? 4 : 2;
  for (let index = 0; index < carts; index += 1) {
    const street = streetAngles[index % streetAngles.length];
    const distance = MARKET_RADIUS * 0.85 + random() * 4;
    tryProp('cart', Math.cos(street + 0.08) * distance, Math.sin(street + 0.08) * distance, Math.PI / 2 - street + (random() - 0.5) * 0.6, 0.5);
  }

  // Barrels and crates stacked by the doors of some houses.
  for (const building of buildings) {
    if (building.kind !== 'house' || random() > 0.22) continue;
    const cos = Math.cos(building.rotation);
    const sin = Math.sin(building.rotation);
    const count = 1 + Math.floor(random() * 3);
    for (let index = 0; index < count; index += 1) {
      const localX = (random() - 0.5) * building.width * 0.8;
      const localZ = -building.depth / 2 - 1.1;
      const x = building.x + localX * cos + localZ * sin - site.x;
      const z = building.z - localX * sin + localZ * cos - site.z;
      // Right against its own house, so only the props need to stay clear of each other.
      const size = PROP_SIZES.barrel;
      const worldX = site.x + x;
      const worldZ = site.z + z;
      if (props.some((other) => Math.hypot(worldX - other.x, worldZ - other.z) < footprint(other.width, other.depth) + footprint(size.width, size.depth))) continue;
      const kind: PropKind = random() < 0.55 ? 'barrel' : 'crate';
      props.push({ kind, town: townIndex, x: worldX, z: worldZ, y: terrainHeight(worldX, worldZ), rotation: building.rotation + random(), tint: random(), ...PROP_SIZES[kind] });
    }
  }

  // Fenced fields with hay bales beyond the windmills.
  for (const windmill of buildings.filter((building) => building.kind === 'windmill')) {
    const angle = Math.atan2(windmill.z - site.z, windmill.x - site.x);
    const centre = Math.hypot(windmill.x - site.x, windmill.z - site.z) + 26;
    const fieldX = Math.cos(angle) * centre;
    const fieldZ = Math.sin(angle) * centre;
    const across = { x: -Math.sin(angle), z: Math.cos(angle) };
    const out = { x: Math.cos(angle), z: Math.sin(angle) };
    const halfLong = 15;
    const halfShort = 9;
    for (let segment = -2; segment <= 2; segment += 1) {
      for (const side of [-1, 1]) {
        const offset = segment * 6;
        tryProp('fence', fieldX + across.x * offset + out.x * side * halfShort, fieldZ + across.z * offset + out.z * side * halfShort, -angle - Math.PI / 2, 0);
      }
    }
    for (let segment = -1; segment <= 1; segment += 1) {
      for (const side of [-1, 1]) {
        const offset = segment * 6;
        tryProp('fence', fieldX + out.x * offset + across.x * side * halfLong, fieldZ + out.z * offset + across.z * side * halfLong, -angle, 0);
      }
    }
    const bales = 3 + Math.floor(random() * 4);
    for (let index = 0; index < bales; index += 1) {
      const a = (random() - 0.5) * (halfLong - 3) * 2;
      const b = (random() - 0.5) * (halfShort - 3) * 2;
      tryProp('hay', fieldX + across.x * a + out.x * b, fieldZ + across.z * a + out.z * b, random() * Math.PI, 0.3);
    }
  }
  return props;
}
