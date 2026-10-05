import * as THREE from 'three';

/** Particle kinds; the shader picks motion, size curve and colour ramp from this. */
export const FIRE = 0;
export const EMBER = 1;
export const SMOKE = 2;
export const FLASH = 3;
export const DUST = 4;
/** A cloud puff: stays where it is born, fading in and out over its life. */
export const CLOUD = 5;

const VERTEX = /* glsl */ `
attribute vec3 aVelocity;
attribute vec4 aData; // birth, life, size, kind
uniform float uTime;
uniform float uScale;
uniform float uFogDensity;
uniform vec2 uWind;
varying float vLife;
varying float vKind;
varying float vSeed;
varying float vFog;

void main() {
  float age = uTime - aData.x;
  float life = age / aData.y;
  float kind = aData.w;
  vLife = life;
  vKind = kind;
  vSeed = fract(aData.x * 37.71 + position.x * 0.137 + position.z * 0.071);
  if (life < 0.0 || life > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  float drag = 0.6;
  float lift = 9.0;
  float wander = 0.7;
  float windage = 0.25;
  float grow = 0.55 + 1.7 * life;
  if (kind > 4.5) { drag = 1.0; lift = 0.0; wander = 0.0; windage = 0.0; grow = 1.0; }
  else if (kind > 3.5) { drag = 1.6; lift = 1.5; wander = 1.2; windage = 0.6; grow = 0.5 + 2.4 * life; }
  else if (kind > 2.5) { drag = 4.0; lift = 0.0; wander = 0.0; windage = 0.0; grow = 0.35 + 1.6 * life; }
  else if (kind > 1.5) { drag = 1.1; lift = 3.4; wander = 1.8; windage = 1.0; grow = 0.55 + 2.9 * life; }
  else if (kind > 0.5) { drag = 0.45; lift = -11.0; wander = 0.5; windage = 0.4; grow = 1.0 - 0.6 * life; }

  vec3 p = position + aVelocity * (1.0 - exp(-drag * age)) / drag;
  p.y += 0.5 * lift * age * age;
  p.xz += uWind * age * windage;
  p.x += sin(age * 2.7 + vSeed * 40.0) * age * wander;
  p.z += cos(age * 2.3 + vSeed * 31.0) * age * wander;

  vec4 view = modelViewMatrix * vec4(p, 1.0);
  float depth = max(-view.z, 0.1);
  vFog = exp(-uFogDensity * uFogDensity * depth * depth);
  gl_PointSize = min(aData.z * grow * uScale / depth, 900.0);
  gl_Position = projectionMatrix * view;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uFogColor;
uniform float uAdditive;
varying float vLife;
varying float vKind;
varying float vSeed;
varying float vFog;

void main() {
  vec2 centred = gl_PointCoord - 0.5;
  float d = length(centred) * 2.0;
  if (d > 1.0) discard;
  float soft = pow(1.0 - d, 1.4);
  float fadeIn = smoothstep(0.0, 0.07, vLife);
  vec3 color;
  float alpha;

  if (vKind > 4.5) {
    color = mix(vec3(1.0, 0.68, 0.52), vec3(0.46, 0.34, 0.47), vSeed);
    alpha = soft * 0.42 * smoothstep(0.0, 0.04, vLife) * (1.0 - smoothstep(0.85, 1.0, vLife));
  } else if (vKind > 3.5) {
    color = mix(vec3(0.34, 0.29, 0.23), vec3(0.2, 0.18, 0.16), vLife);
    alpha = soft * 0.5 * fadeIn * (1.0 - vLife);
  } else if (vKind > 2.5) {
    color = vec3(1.0, 0.82, 0.55) * 7.0 * (1.0 - vLife);
    alpha = soft * (1.0 - vLife);
  } else if (vKind > 1.5) {
    float lit = 1.0 - smoothstep(0.0, 0.3, vLife);
    color = mix(vec3(0.15, 0.115, 0.1), vec3(0.035, 0.032, 0.035), vLife) * (0.7 + 0.6 * vSeed);
    color += vec3(0.9, 0.3, 0.04) * lit * 0.9;
    alpha = soft * 0.55 * fadeIn * pow(1.0 - vLife, 0.8);
  } else if (vKind > 0.5) {
    float flicker = 0.6 + 0.4 * sin(vLife * 60.0 + vSeed * 50.0);
    color = mix(vec3(1.0, 0.72, 0.25), vec3(1.0, 0.22, 0.03), vLife) * 4.5 * flicker;
    alpha = pow(1.0 - d, 2.5) * (1.0 - vLife * vLife);
  } else {
    vec3 hot = vec3(1.0, 0.92, 0.62) * 5.0;
    vec3 mid = vec3(1.0, 0.42, 0.06) * 3.0;
    vec3 cool = vec3(0.5, 0.05, 0.01) * 1.1;
    color = vLife < 0.22 ? mix(hot, mid, vLife / 0.22) : mix(mid, cool, (vLife - 0.22) / 0.78);
    alpha = soft * fadeIn * (1.0 - vLife) * (0.65 + 0.35 * vSeed);
  }

  if (uAdditive > 0.5) {
    gl_FragColor = vec4(color * alpha * vFog, 1.0);
  } else {
    gl_FragColor = vec4(mix(uFogColor, color, vFog), alpha);
  }
}`;

/**
 * Stateless GPU particles: each one stores where and when it was born, and the vertex shader
 * works out where it is now. The CPU only writes a particle once, at spawn.
 */
export class ParticleField {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private readonly capacity: number;
  private readonly position: THREE.BufferAttribute;
  private readonly velocity: THREE.BufferAttribute;
  private readonly data: THREE.BufferAttribute;
  private cursor = 0;
  private dirtyStart = -1;
  private dirtyCount = 0;

  constructor(capacity: number, additive: boolean) {
    this.capacity = capacity;
    const geometry = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
    this.velocity = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
    this.data = new THREE.BufferAttribute(new Float32Array(capacity * 4).fill(-1000), 4);
    for (const attribute of [this.position, this.velocity, this.data]) attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.position);
    geometry.setAttribute('aVelocity', this.velocity);
    geometry.setAttribute('aData', this.data);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 800 },
        uFogDensity: { value: 0 },
        uFogColor: { value: new THREE.Color() },
        uWind: { value: new THREE.Vector2() },
        uAdditive: { value: additive ? 1 : 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
  }

  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    kind: number,
    time: number,
  ): void {
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.position.setXYZ(index, x, y, z);
    this.velocity.setXYZ(index, vx, vy, vz);
    this.data.setXYZW(index, time, life, size, kind);
    if (this.dirtyStart < 0) this.dirtyStart = index;
    this.dirtyCount += 1;
  }

  /** Uploads whatever was emitted since the last call and advances the shader clock. */
  update(time: number, pixelScale: number, fog: THREE.FogExp2): void {
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = time;
    uniforms.uScale.value = pixelScale;
    uniforms.uFogDensity.value = fog.density;
    uniforms.uFogColor.value.copy(fog.color);
    if (this.dirtyStart < 0) return;

    const wrapped = this.dirtyStart + this.dirtyCount > this.capacity;
    for (const attribute of [this.position, this.velocity, this.data]) {
      attribute.clearUpdateRanges();
      if (!wrapped) attribute.addUpdateRange(this.dirtyStart * attribute.itemSize, this.dirtyCount * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    this.dirtyStart = -1;
    this.dirtyCount = 0;
  }
}
