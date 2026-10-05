import * as THREE from 'three';
import { mulberry32 } from './layout';
import { riverZ, terrainHeight, TOWNS, WATER_LEVEL, WORLD_RADIUS } from './terrain';

export const SUN_DIRECTION = new THREE.Vector3(-0.78, 0.2, -0.42).normalize();
export const FOG_CLEAR = new THREE.Color(0.62, 0.36, 0.3);
export const FOG_SMOKE = new THREE.Color(0.2, 0.09, 0.06);
export const CLOUD_COLOR = new THREE.Color(1.0, 0.74, 0.6);

const SKY_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = clip.xyww;
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
uniform float uTime;
uniform float uSmoke;
uniform float uCloud;
varying vec3 vDirection;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 5; octave++) {
    sum += amplitude * noise(p);
    p = p * 2.03 + 17.0;
    amplitude *= 0.5;
  }
  return sum;
}

void main() {
  vec3 direction = normalize(vDirection);
  float height = max(direction.y, 0.0);
  float sunAmount = max(dot(direction, uSun), 0.0);

  vec3 zenith = vec3(0.045, 0.06, 0.17);
  vec3 upper = vec3(0.3, 0.17, 0.32);
  vec3 horizon = vec3(1.0, 0.47, 0.2);
  vec3 sky = mix(horizon, upper, smoothstep(0.0, 0.22, height));
  sky = mix(sky, zenith, smoothstep(0.15, 0.75, height));
  sky += vec3(1.0, 0.42, 0.12) * pow(sunAmount, 6.0) * 0.55;
  sky += vec3(1.0, 0.8, 0.5) * pow(sunAmount, 900.0) * 14.0;
  sky += vec3(1.0, 0.6, 0.3) * pow(sunAmount, 60.0) * 0.9;

  vec2 starCell = floor(direction.xz / (0.35 + height) * 190.0);
  float star = step(0.9965, hash(starCell)) * smoothstep(0.3, 0.8, height);
  sky += vec3(0.8, 0.85, 1.0) * star * (0.5 + 0.5 * sin(uTime * 2.0 + hash(starCell) * 40.0));

  vec2 cloudUv = direction.xz / (height + 0.12) * 1.3 + vec2(uTime * 0.006, 0.0);
  float cover = smoothstep(0.48, 0.86, fbm(cloudUv)) * smoothstep(0.015, 0.2, height);
  float underlit = fbm(cloudUv + uSun.xz * 0.12);
  vec3 cloud = mix(vec3(0.2, 0.12, 0.2), vec3(1.0, 0.5, 0.26), smoothstep(0.35, 0.8, underlit) * (0.45 + 0.55 * sunAmount));
  sky = mix(sky, cloud, cover * 0.85);

  vec3 pall = mix(vec3(0.26, 0.1, 0.05), vec3(0.05, 0.03, 0.035), smoothstep(0.0, 0.6, height));
  sky = mix(sky, pall, uSmoke * (0.75 - 0.35 * height));
  sky = mix(sky, vec3(1.0, 0.74, 0.6), uCloud);
  gl_FragColor = vec4(sky, 1.0);
}`;

export interface Sky {
  mesh: THREE.Mesh;
  uniforms: { uSun: THREE.IUniform; uTime: THREE.IUniform; uSmoke: THREE.IUniform; uCloud: THREE.IUniform };
}

export function createSky(): Sky {
  const uniforms = { uSun: { value: SUN_DIRECTION }, uTime: { value: 0 }, uSmoke: { value: 0 }, uCloud: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}

function distanceToNearestTown(x: number, z: number): { distance: number; radius: number } {
  let best = { distance: Infinity, radius: 1 };
  for (const town of TOWNS) {
    const distance = Math.hypot(x - town.x, z - town.z);
    if (distance / town.radius < best.distance / best.radius) best = { distance, radius: town.radius };
  }
  return best;
}

function cellHash(x: number, z: number): number {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function createTerrain(segments: number): THREE.Mesh {
  const size = WORLD_RADIUS * 2.3;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  const grass = new THREE.Color(0.2, 0.3, 0.1);
  const dirt = new THREE.Color(0.33, 0.25, 0.16);
  const rock = new THREE.Color(0.3, 0.27, 0.27);
  const snow = new THREE.Color(0.85, 0.74, 0.72);
  const sand = new THREE.Color(0.42, 0.36, 0.24);
  const fields = [new THREE.Color(0.42, 0.36, 0.12), new THREE.Color(0.24, 0.36, 0.1), new THREE.Color(0.34, 0.24, 0.13), new THREE.Color(0.3, 0.4, 0.14)];

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const height = terrainHeight(x, z);
    position.setY(index, height);

    const town = distanceToNearestTown(x, z);
    const ratio = town.distance / town.radius;
    color.copy(grass).multiplyScalar(0.8 + 0.4 * cellHash(Math.floor(x / 23), Math.floor(z / 23)));
    if (ratio > 1.08 && ratio < 3.2 && height > 3 && height < 40) {
      const field = fields[Math.floor(cellHash(Math.floor(x / 70), Math.floor(z / 70)) * fields.length)];
      color.lerp(field, 0.75);
    }
    if (ratio < 1.04) color.lerp(dirt, 0.85);
    if (height < 2.2) color.lerp(sand, 0.8);
    if (height > 70) color.lerp(rock, Math.min(1, (height - 70) / 50));
    if (height > 210) color.lerp(snow, Math.min(1, (height - 210) / 60));
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

export function createWater(): THREE.Mesh {
  const size = WORLD_RADIUS * 2.3;
  const material = new THREE.MeshPhongMaterial({
    color: new THREE.Color(0.05, 0.09, 0.13),
    specular: new THREE.Color(1.0, 0.55, 0.3),
    shininess: 180,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = WATER_LEVEL;
  return mesh;
}

export function createForest(count: number): THREE.InstancedMesh {
  const geometry = new THREE.ConeGeometry(1, 1, 6, 1);
  geometry.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ flatShading: true }), count);
  const random = mulberry32(451);
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const color = new THREE.Color();
  let placed = 0;
  // Trees clump: pick a grove centre, then scatter around it.
  for (let attempt = 0; attempt < count * 12 && placed < count; attempt += 1) {
    const groveAngle = random() * Math.PI * 2;
    const groveRadius = 120 + random() * 1300;
    const x = Math.cos(groveAngle) * groveRadius + (random() - 0.5) * 220;
    const z = Math.sin(groveAngle) * groveRadius + (random() - 0.5) * 220;
    const height = terrainHeight(x, z);
    if (height < 3 || height > 120) continue;
    if (Math.abs(z - riverZ(x)) < 100) continue;
    const town = distanceToNearestTown(x, z);
    if (town.distance < town.radius * 1.45) continue;
    if (cellHash(Math.floor(x / 160), Math.floor(z / 160)) < 0.45) continue;
    const tall = 9 + random() * 11;
    position.set(x, height - 0.5, z);
    scale.set(tall * 0.3, tall, tall * 0.3);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(placed, matrix);
    color.setRGB(0.07 + random() * 0.05, 0.16 + random() * 0.08, 0.07 + random() * 0.03);
    mesh.setColorAt(placed, color);
    placed += 1;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function canvasTexture(size: number, draw: (context: CanvasRenderingContext2D, random: () => number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is not available for building textures');
  draw(context, mulberry32(size * 31));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function speckle(context: CanvasRenderingContext2D, random: () => number, size: number, count: number, alpha: number): void {
  for (let index = 0; index < count; index += 1) {
    const shade = random() < 0.5 ? 0 : 255;
    context.fillStyle = `rgba(${shade},${shade},${shade},${random() * alpha})`;
    context.fillRect(random() * size, random() * size, 1 + random() * 3, 1 + random() * 3);
  }
}

/** White plaster with dark oak framing; the instance colour tints the plaster. */
export function timberTexture(): THREE.CanvasTexture {
  const size = 256;
  return canvasTexture(size, (context, random) => {
    context.fillStyle = '#e9e1cf';
    context.fillRect(0, 0, size, size);
    speckle(context, random, size, 1400, 0.07);
    context.strokeStyle = '#33241a';
    context.lineCap = 'square';
    const beam = (x0: number, y0: number, x1: number, y1: number, width: number): void => {
      context.lineWidth = width;
      context.beginPath();
      context.moveTo(x0, y0);
      context.lineTo(x1, y1);
      context.stroke();
    };
    for (const y of [6, 128, 250]) beam(0, y, size, y, 14);
    for (const x of [6, 90, 166, 250]) beam(x, 0, x, size, 13);
    beam(6, 128, 90, 6, 9);
    beam(250, 128, 166, 6, 9);
    beam(90, 250, 166, 128, 9);
    // A shuttered window and a door, so walls read as lived in from the air.
    context.fillStyle = '#1c1410';
    context.fillRect(108, 34, 40, 56);
    context.fillStyle = '#3a2a1d';
    context.fillRect(24, 160, 46, 90);
    context.strokeStyle = '#33241a';
    context.lineWidth = 5;
    context.strokeRect(108, 34, 40, 56);
    beam(128, 34, 128, 90, 3);
    beam(108, 62, 148, 62, 3);
  });
}

export function stoneTexture(): THREE.CanvasTexture {
  const size = 256;
  return canvasTexture(size, (context, random) => {
    context.fillStyle = '#6f6a66';
    context.fillRect(0, 0, size, size);
    const course = 32;
    for (let row = 0; row < size / course; row += 1) {
      const shift = row % 2 === 0 ? 0 : 32;
      for (let column = -1; column < size / 64 + 1; column += 1) {
        const shade = 150 + Math.floor(random() * 60);
        context.fillStyle = `rgb(${shade},${shade - 4},${shade - 10})`;
        context.fillRect(column * 64 + shift + 2, row * course + 2, 60, course - 4);
      }
    }
    speckle(context, random, size, 2600, 0.12);
  });
}

export function roofTexture(): THREE.CanvasTexture {
  const size = 128;
  return canvasTexture(size, (context, random) => {
    context.fillStyle = '#d8d2c4';
    context.fillRect(0, 0, size, size);
    for (let row = 0; row < 8; row += 1) {
      const shade = 150 + Math.floor(random() * 50);
      context.fillStyle = `rgb(${shade},${shade},${shade})`;
      context.fillRect(0, row * 16, size, 4);
      for (let column = 0; column < 8; column += 1) {
        context.fillStyle = `rgba(0,0,0,${0.08 + random() * 0.18})`;
        context.fillRect(column * 16 + (row % 2) * 8, row * 16 + 4, 2, 12);
      }
    }
    speckle(context, random, size, 900, 0.14);
  });
}

/** Soft radial blob used for scorch marks. */
export function scorchTexture(): THREE.CanvasTexture {
  const size = 128;
  const texture = canvasTexture(size, (context, random) => {
    const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0,0,0,0.95)');
    gradient.addColorStop(0.55, 'rgba(8,5,3,0.7)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    context.globalCompositeOperation = 'destination-out';
    for (let index = 0; index < 60; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 38 + random() * 26;
      context.beginPath();
      context.arc(64 + Math.cos(angle) * radius, 64 + Math.sin(angle) * radius, 3 + random() * 8, 0, Math.PI * 2);
      context.fill();
    }
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
