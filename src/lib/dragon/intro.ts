/**
 * The way in: the page catches fire from the glyph, folds back on its left edge like a page in a
 * book, is torn off and sucked into a wormhole, and the wormhole carries the rider through to the sky.
 *
 * The real page is animated, not a picture of it: <body> gets a CSS 3D transform and a charring
 * filter, a transparent fire canvas rides on top with the same transform, and the wormhole is drawn
 * on the game canvas underneath, so it is what shows through as the page swings away.
 */

import * as THREE from 'three';

export type IntroPhase = 'burn' | 'fold' | 'wormhole' | 'done';

export const FOLD_START = 1.3;
export const RIP_START = 2.7;
export const WORMHOLE_START = 3.4;
export const INTRO_LENGTH = 6.6;
const RIP_LENGTH = 0.85;

const NOISE = /* glsl */ `
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
    p = p * 2.02 + 13.0;
    amplitude *= 0.5;
  }
  return sum;
}
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float near = mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float far = mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(near, far, f.z);
}
float fbm3(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    sum += amplitude * noise3(p);
    p = p * 2.03 + 11.0;
    amplitude *= 0.5;
  }
  return sum;
}`;

const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** Fire over the page: a noisy burn front spreading from the glyph, char behind it, flames above it. */
const PAGE_FIRE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uBurn;
uniform float uAspect;
uniform vec2 uOrigin;
varying vec2 vUv;
${NOISE}

float frontAt(vec2 uv) {
  vec2 p = vec2((uv.x - uOrigin.x) * uAspect, uv.y - uOrigin.y);
  float wobble = fbm(uv * vec2(uAspect, 1.0) * 5.0 + vec2(0.0, -uTime * 0.25));
  float reach = uBurn * (1.25 * max(uAspect, 1.0) + 0.45);
  return length(p) + (wobble - 0.5) * 0.3 - reach;
}

void main() {
  vec2 uv = vUv;
  float front = frontAt(uv);
  float burnt = smoothstep(0.03, -0.14, front);

  vec2 grain = uv * vec2(uAspect, 1.0);
  float ember = fbm(grain * 17.0 + uTime * 0.12);
  float cracks = smoothstep(0.52, 0.72, ember) * burnt;
  vec3 color = vec3(1.0, 0.32, 0.04) * cracks * (0.55 + 0.45 * sin(uTime * 5.0 + ember * 40.0));
  float alpha = burnt * 0.86;

  float rim = exp(-abs(front) * 34.0) * step(0.001, uBurn);
  color += vec3(1.0, 0.6, 0.16) * rim * 1.7;
  alpha = max(alpha, rim);

  // Flames stand on whatever is burning below this pixel, so look down the page for the front.
  float lick = fbm(vec2(grain.x * 6.0, uv.y * 4.0 - uTime * 2.3)) * 0.65 + fbm(vec2(grain.x * 14.0 + 7.0, uv.y * 9.0 - uTime * 3.8)) * 0.35;
  float below = frontAt(uv - vec2(0.0, 0.06 + lick * 0.2));
  float heat = exp(-max(below, 0.0) * 8.0) * smoothstep(-0.55, -0.02, below) * step(0.001, uBurn);
  heat += smoothstep(0.0, 0.6, uBurn) * exp(-uv.y * 3.2 / (0.25 + uBurn));
  float flame = smoothstep(0.42, 0.95, lick + heat * 0.75 - 0.2) * min(1.0, heat * 1.6);
  vec3 flameColor = mix(vec3(0.85, 0.12, 0.02), vec3(1.0, 0.55, 0.08), smoothstep(0.1, 0.5, flame));
  flameColor = mix(flameColor, vec3(1.0, 0.95, 0.7), smoothstep(0.55, 1.0, flame));
  color += flameColor * flame * 1.5;
  alpha = clamp(alpha + flame * 0.9, 0.0, 1.0);

  gl_FragColor = vec4(color, alpha);
}`;

const WORMHOLE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uProgress;
uniform float uOpen;
uniform float uAspect;
varying vec2 vUv;
${NOISE}

void main() {
  vec2 p = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0);
  p += 0.07 * vec2(sin(uTime * 1.3), cos(uTime * 1.7)) * uProgress;
  float r = length(p);
  float angle = atan(p.y, p.x);

  float travel = uTime * 0.3 + uProgress * uProgress * 15.0;
  float depth = 0.55 / (r + 0.04);
  float twist = angle + depth * 0.35 + uTime * 0.22 + uProgress * 3.0;

  float gas = fbm3(vec3(cos(twist) * 1.6, sin(twist) * 1.6, depth * 1.3 + travel * 3.0));
  float streak = fbm3(vec3(cos(twist * 3.0) * 2.2, sin(twist * 3.0) * 2.2, depth * 0.22 + travel * 6.0));
  float bands = pow(gas, 2.3) * 2.6 + pow(streak, 5.0) * 7.0 * (0.3 + uProgress);

  vec3 warm = vec3(1.0, 0.36, 0.07);
  vec3 violet = vec3(0.62, 0.16, 0.95);
  vec3 cool = vec3(0.22, 0.4, 1.0);
  float inward = smoothstep(1.3, 0.1, r);
  vec3 tint = mix(warm, mix(violet, cool, uProgress), clamp(inward * 0.8 + uProgress * 0.7, 0.0, 1.0));
  vec3 color = tint * bands * (0.4 + 2.0 * smoothstep(1.8, 0.15, r));

  float arc = abs(fbm3(vec3(cos(angle) * 1.3, sin(angle) * 1.3, uTime * 1.9 + depth * 0.25)) - 0.5);
  color += vec3(0.7, 0.82, 1.0) * smoothstep(0.014, 0.0, arc) * smoothstep(0.08, 0.6, r) * (0.3 + uProgress) * 2.5;

  float core = exp(-r * mix(7.5, 0.35, pow(uProgress, 3.0)));
  color += vec3(1.0, 0.95, 0.88) * core * (0.5 + 7.0 * pow(uProgress, 3.0));

  // The mouth grows from the centre; its lip burns the colour of the page fire.
  float mouthRadius = uOpen * 3.0;
  float inside = smoothstep(mouthRadius, mouthRadius - 0.3, r);
  float lip = exp(-abs(r - mouthRadius) * 11.0) * (1.0 - smoothstep(0.85, 1.0, uOpen));
  float stars = step(0.997, hash(floor(p * 160.0))) * 0.8;
  color = mix(vec3(stars), color, inside) + vec3(1.0, 0.48, 0.12) * lip * 2.4;

  gl_FragColor = vec4(color, 1.0);
}`;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const easeInOut = (value: number): number => value * value * (3 - 2 * value);

function fullscreen(fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.Mesh {
  // No blending: the page fire writes premultiplied colour and alpha straight into its transparent canvas.
  const material = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader,
    uniforms,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  return mesh;
}

export class Intro {
  /** Rendered through the game's own pipeline, so the wormhole gets the same bloom as the world. */
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private readonly body = document.body;
  private readonly bodyStyle = document.body.getAttribute('style');
  private readonly rootStyle = document.documentElement.getAttribute('style');
  private readonly fireCanvas = document.createElement('canvas');
  private readonly fireRenderer: THREE.WebGLRenderer | null;
  private readonly fireScene = new THREE.Scene();
  private readonly fireUniforms: Record<string, THREE.IUniform>;
  private readonly wormholeUniforms: Record<string, THREE.IUniform>;
  private pageGone = false;

  /** `origin` is where the glyph was clicked, in viewport pixels: the fire starts there. */
  constructor(origin: { x: number; y: number }) {
    const aspect = innerWidth / innerHeight;
    this.wormholeUniforms = { uTime: { value: 0 }, uProgress: { value: 0 }, uOpen: { value: 0 }, uAspect: { value: aspect } };
    this.scene.add(fullscreen(WORMHOLE_FRAGMENT, this.wormholeUniforms));

    this.fireUniforms = {
      uTime: { value: 0 },
      uBurn: { value: 0 },
      uAspect: { value: aspect },
      uOrigin: { value: new THREE.Vector2(origin.x / innerWidth, 1 - origin.y / innerHeight) },
    };
    this.fireScene.add(fullscreen(PAGE_FIRE_FRAGMENT, this.fireUniforms));

    this.fireCanvas.setAttribute('data-dragon-fire', '');
    this.fireCanvas.setAttribute('aria-hidden', 'true');
    this.fireCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:2147483001;pointer-events:none;transform-origin:0 50%;';
    document.documentElement.append(this.fireCanvas);
    this.fireRenderer = this.createFireRenderer();

    // Clip the page to exactly what is on screen before animating it. The browser then folds a
    // viewport-sized layer instead of the whole document, however long the page is.
    const root = document.documentElement;
    const scrollbar = innerWidth - root.clientWidth;
    const scrolled = scrollY;
    root.style.overflow = 'hidden';
    const style = this.body.style;
    style.height = `${innerHeight}px`;
    style.minHeight = '0';
    style.overflow = 'hidden';
    style.paddingRight = `${scrollbar}px`;
    style.position = 'relative';
    style.zIndex = '2147483000';
    style.transformOrigin = '0 50%';
    style.willChange = 'transform, filter, opacity';
    style.pointerEvents = 'none';
    this.body.scrollTop = scrolled;
  }

  private createFireRenderer(): THREE.WebGLRenderer | null {
    try {
      const renderer = new THREE.WebGLRenderer({ canvas: this.fireCanvas, alpha: true, premultipliedAlpha: true, antialias: false });
      renderer.setClearColor(0x000000, 0);
      // Flames are soft; half resolution is invisible and keeps the page animation smooth.
      renderer.setPixelRatio(0.5);
      renderer.setSize(innerWidth, innerHeight, false);
      return renderer;
    } catch (error) {
      console.warn('Dragon intro: no second WebGL context for the page fire, the page will fold without flames.', error);
      return null;
    }
  }

  /** Applies the intro at `elapsed` seconds and reports which act it is in. */
  update(elapsed: number): IntroPhase {
    if (elapsed >= INTRO_LENGTH) return 'done';
    const wormhole = clamp01((elapsed - WORMHOLE_START) / (INTRO_LENGTH - WORMHOLE_START));
    this.wormholeUniforms.uTime.value = elapsed;
    this.wormholeUniforms.uProgress.value = wormhole;
    this.wormholeUniforms.uOpen.value = easeInOut(clamp01((elapsed - FOLD_START) / (WORMHOLE_START - FOLD_START + 0.5)));

    if (!this.pageGone) this.animatePage(elapsed);
    if (elapsed >= WORMHOLE_START) return 'wormhole';
    return elapsed >= FOLD_START ? 'fold' : 'burn';
  }

  private animatePage(elapsed: number): void {
    const burn = clamp01(elapsed / 2.4);
    const fold = easeInOut(clamp01((elapsed - FOLD_START) / (RIP_START - FOLD_START)));
    const rip = clamp01((elapsed - RIP_START) / RIP_LENGTH);
    const pull = rip * rip;
    if (rip >= 1) {
      this.removePage();
      return;
    }

    // Heat shudder before the page lets go.
    const shudder = (1 - fold) * burn * 3;
    const transform = [
      'perspective(1500px)',
      `translate3d(${pull * innerWidth * 0.5 + Math.sin(elapsed * 61) * shudder}px, ${Math.cos(elapsed * 47) * shudder}px, ${-pull * 2600}px)`,
      `rotateZ(${pull * 210}deg)`,
      `rotateY(${fold * 72 + pull * 45}deg)`,
      `rotateX(${Math.sin(fold * Math.PI) * 5}deg)`,
      `scale(${1 - 0.95 * pull})`,
    ].join(' ');
    const opacity = String(1 - clamp01((rip - 0.7) / 0.3));

    this.body.style.transform = transform;
    this.body.style.opacity = opacity;
    this.body.style.filter = `brightness(${1 - 0.5 * burn}) sepia(${0.85 * burn}) saturate(${1 + burn}) contrast(${1 + 0.3 * burn})`;
    this.fireCanvas.style.transform = transform;
    this.fireCanvas.style.opacity = opacity;

    if (!this.fireRenderer) return;
    this.fireUniforms.uTime.value = elapsed;
    this.fireUniforms.uBurn.value = burn;
    this.fireRenderer.render(this.fireScene, this.camera);
  }

  /** Takes the page out of the picture once the wormhole has it; the game hides <body> from here on. */
  private removePage(): void {
    this.pageGone = true;
    this.fireCanvas.remove();
    this.fireRenderer?.dispose();
    this.fireRenderer?.forceContextLoss();
    this.body.style.visibility = 'hidden';
  }

  /** Puts <body> and <html> back exactly as they were styled; the caller restores the scroll position. */
  dispose(): void {
    if (!this.pageGone) this.removePage();
    for (const [element, style] of [[this.body, this.bodyStyle], [document.documentElement, this.rootStyle]] as const) {
      if (style === null) element.removeAttribute('style');
      else element.setAttribute('style', style);
    }
    for (const child of this.scene.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
