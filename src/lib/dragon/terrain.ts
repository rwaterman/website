/** Pure world shape: town sites and the height field. No three.js here so node:test can load it. */

export interface TownSite {
  x: number;
  z: number;
  radius: number;
  /** Ground level of the flattened plateau the town stands on. */
  ground: number;
  seed: number;
  houses: number;
}

export const TOWNS: TownSite[] = [
  { x: 0, z: 0, radius: 230, ground: 10, seed: 1066, houses: 200 },
  { x: 760, z: -420, radius: 125, ground: 14, seed: 1215, houses: 46 },
  { x: -640, z: 640, radius: 115, ground: 12, seed: 1348, houses: 28 },
];

export const WORLD_RADIUS = 1900;
export const WATER_LEVEL = 0;

const MOUNTAIN_START = 1250;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function riverZ(x: number): number {
  return 420 + 120 * Math.sin(x * 0.0021);
}

export function terrainHeight(x: number, z: number): number {
  let height =
    9 +
    14 * Math.sin(x * 0.004 + 1.3) * Math.cos(z * 0.0035) +
    7 * Math.sin(x * 0.011 + z * 0.009) +
    2.5 * Math.sin(x * 0.027 - z * 0.023);
  height = Math.max(height, 2.5);

  const riverDistance = Math.abs(z - riverZ(x));
  height -= (height + 9) * smoothstep(95, 20, riverDistance);

  const radius = Math.hypot(x, z);
  if (radius > MOUNTAIN_START) {
    const rise = (radius - MOUNTAIN_START) / 650;
    const angle = Math.atan2(z, x);
    const ridge = 0.55 + 0.45 * Math.abs(Math.sin(angle * 9 + Math.sin(angle * 4) * 2));
    height += rise * rise * 380 * ridge;
  }

  for (const town of TOWNS) {
    const distance = Math.hypot(x - town.x, z - town.z);
    const blend = smoothstep(town.radius * 1.4, town.radius * 1.05, distance);
    height += (town.ground - height) * blend;
  }
  return height;
}
