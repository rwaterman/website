/**
 * The dragon easter egg: owns the stage that replaces the page, runs the intro and the flight loop,
 * and puts everything back on exit. Loaded on demand from the footer glyph, never on page load.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { DragonAudio, type AudioFrame, type TownSound } from './audio';
import { auditionVoices, type VoiceStats } from './audition';
import { City, type Structure } from './city';
import { Dragon } from './dragon';
import { Inferno, type FireQuality } from './fire';
import { createInput, type Controls, type Input } from './input';
import { FOLD_START, Intro, INTRO_LENGTH, RIP_START, WORMHOLE_START } from './intro';
import { CLOUD, ParticleField } from './particles';
import { TOWNS } from './terrain';
import { CLOUD_COLOR, createForest, createSky, createTerrain, createWater, FOG_CLEAR, FOG_SMOKE, SUN_DIRECTION, type Sky } from './world';

/**
 * Hooks for tests and for looking at the game on a machine without a GPU, where real time is a
 * slideshow. They exist only while the game is running, and the game only exists in non-prod builds.
 */
interface DragonDebug {
  /** Offline render of every sound. */
  audition(): Promise<Record<string, VoiceStats>>;
  /** Drops a fireball on the first house still standing. */
  strike(): void;
  /** Takes the loop off requestAnimationFrame and runs `steps` frames of `dt` seconds, drawing only the last. */
  advance(dt: number, steps: number): void;
  /** Overrides the controls until called with null. */
  hold(controls: Partial<Controls> | null): void;
  /** Puts the dragon at a position and heading. */
  place(x: number, y: number, z: number, yaw: number, pitch: number): void;
  fireball(): void;
}

declare global {
  interface Window {
    __dragon?: DragonDebug;
  }
}

interface Quality extends FireQuality {
  terrainSegments: number;
  trees: number;
  clouds: number;
  pixelRatio: number;
  samples: number;
}

interface World {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  fog: THREE.FogExp2;
  sun: THREE.DirectionalLight;
  hemisphere: THREE.HemisphereLight;
  sky: Sky;
  city: City;
  dragon: Dragon;
  inferno: Inferno;
  clouds: ParticleField;
  /** Per town: the bell tower and keep, whose fall silences the bell and the horn. */
  landmarks: { bell: Structure | undefined; keep: Structure | undefined; structures: Structure[] }[];
}

type Phase = 'intro' | 'arrive' | 'flight';

const HIGH: Quality = { fireParticles: 16_000, smokeParticles: 5000, debris: 1400, emitBudget: 200, breathRate: 520, chunkScale: 1, terrainSegments: 220, trees: 2600, clouds: 300, pixelRatio: 2, samples: 4 };
const LOW: Quality = { fireParticles: 7000, smokeParticles: 2400, debris: 600, emitBudget: 90, breathRate: 300, chunkScale: 0.55, terrainSegments: 140, trees: 1100, clouds: 130, pixelRatio: 1.25, samples: 0 };

const MAX_RENDER_WIDTH = 2200;
const BASE_FOG = 0.00038;
const FIREBALL_COOLDOWN = 0.45;
const ARRIVE_LENGTH = 4.5;
const SLOW_FRAME_MS = 30;
const CLOUD_BASE = 430;
const START = new THREE.Vector3(0, 540, 1250);

const STYLE = /* css */ `
html.dragon-active { background: #000; overflow: hidden; }
html.dragon-active body { display: none !important; }
[data-dragon-stage] { position: fixed; inset: 0; z-index: 2147482999; background: #000; overflow: hidden; color: #f4e9d8; font-family: var(--font-display, sans-serif); user-select: none; -webkit-user-select: none; touch-action: none; cursor: crosshair; }
[data-dragon-stage] canvas { display: block; width: 100%; height: 100%; }
[data-dragon-stage] [hidden] { display: none !important; }
.dragon-hud { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 1.2s ease; }
.dragon-hud[data-on] { opacity: 1; }
.dragon-vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 55%, rgba(8, 2, 1, 0.55) 100%); }
.dragon-flash { position: absolute; inset: 0; background: #fff6ea; opacity: 0; pointer-events: none; }
.dragon-flash[data-on] { animation: dragon-flash 1.5s ease-out forwards; }
@keyframes dragon-flash { from { opacity: 1; } to { opacity: 0; } }
.dragon-score { position: absolute; top: max(1rem, env(safe-area-inset-top)); left: max(1.25rem, env(safe-area-inset-left)); font-size: 0.8rem; letter-spacing: 0.16em; text-transform: uppercase; text-shadow: 0 1px 6px #000; }
.dragon-score strong { display: block; font-size: 2rem; letter-spacing: 0.02em; line-height: 1; color: #ffb35c; }
.dragon-score span { display: block; margin-top: 0.3rem; opacity: 0.8; }
.dragon-title { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; text-transform: uppercase; text-shadow: 0 2px 24px rgba(0, 0, 0, 0.8); opacity: 0; }
.dragon-title[data-on] { animation: dragon-title 6s ease forwards; }
.dragon-title h2 { margin: 0; font-size: clamp(2.4rem, 9vw, 7rem); font-weight: 700; letter-spacing: 0.04em; line-height: 0.95; }
.dragon-title p { margin: 0.8rem 0 0; font-family: var(--font-mono, monospace); font-size: clamp(0.7rem, 1.6vw, 0.95rem); letter-spacing: 0.3em; color: #ffb35c; }
@keyframes dragon-title { 0% { opacity: 0; transform: scale(1.12); } 18% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; transform: scale(1); } }
.dragon-keys { position: absolute; left: 50%; bottom: max(1.25rem, env(safe-area-inset-bottom)); transform: translateX(-50%); width: max-content; max-width: 92vw; margin: 0; font-family: var(--font-mono, monospace); font-size: 0.72rem; letter-spacing: 0.1em; text-align: center; text-transform: uppercase; text-shadow: 0 1px 6px #000; transition: opacity 2s ease; }
.dragon-keys[data-off] { opacity: 0; }
.dragon-keys b { color: #ffb35c; font-weight: 500; }
.dragon-sight { position: absolute; left: 50%; top: 50%; width: 26px; height: 26px; margin: -13px 0 0 -13px; border: 1.5px solid rgba(255, 220, 170, 0.55); border-radius: 50%; }
.dragon-sight::after { content: ''; position: absolute; left: 50%; top: 50%; width: 3px; height: 3px; margin: -1.5px; border-radius: 50%; background: rgba(255, 220, 170, 0.9); }
.dragon-button { pointer-events: auto; position: absolute; display: grid; place-items: center; border: 1.5px solid rgba(255, 200, 140, 0.7); border-radius: 50%; background: rgba(40, 10, 4, 0.5); color: #ffd9a8; font: 600 0.75rem var(--font-mono, monospace); letter-spacing: 0.1em; text-transform: uppercase; touch-action: none; }
.dragon-button:active { background: rgba(255, 120, 30, 0.6); }
.dragon-exit { top: max(0.8rem, env(safe-area-inset-top)); right: max(0.8rem, env(safe-area-inset-right)); width: 2.4rem; height: 2.4rem; font-size: 1rem; opacity: 0.6; }
.dragon-fire { right: max(1.4rem, env(safe-area-inset-right)); bottom: max(1.8rem, env(safe-area-inset-bottom)); width: 5.6rem; height: 5.6rem; }
.dragon-bomb { right: max(7.6rem, calc(env(safe-area-inset-right) + 6.2rem)); bottom: max(1.2rem, env(safe-area-inset-bottom)); width: 4rem; height: 4rem; }
.dragon-pause { position: absolute; inset: 0; display: grid; place-content: center; gap: 0.6rem; background: rgba(6, 2, 1, 0.6); text-align: center; text-transform: uppercase; letter-spacing: 0.16em; pointer-events: auto; cursor: pointer; }
.dragon-pause strong { font-size: 2rem; }
.dragon-pause span { font-family: var(--font-mono, monospace); font-size: 0.75rem; color: #ffb35c; }
@media (prefers-reduced-motion: reduce) { .dragon-flash[data-on], .dragon-title[data-on] { animation-duration: 0.01s; } .dragon-title[data-on] { opacity: 1; } }
`;

const HUD = /* html */ `
<div class="dragon-hud" data-hud>
  <div class="dragon-vignette"></div>
  <div class="dragon-sight"></div>
  <div class="dragon-score"><strong data-razed>0</strong>razed of <b data-total>0</b><span data-ablaze></span></div>
  <div class="dragon-title" data-title><h2>Here be dragons</h2><p data-subtitle>The realm is yours to burn</p></div>
  <p class="dragon-keys" data-keys></p>
  <button class="dragon-button dragon-bomb" type="button" data-bomb hidden>Bomb</button>
  <button class="dragon-button dragon-fire" type="button" data-fire hidden>Fire</button>
  <button class="dragon-button dragon-exit" type="button" data-exit aria-label="Leave the dragon">&#x2715;</button>
</div>
<div class="dragon-pause" data-pause hidden><strong>Paused</strong><span>Click to fly on &middot; Esc to leave</span></div>
<div class="dragon-flash" data-flash></div>
`;

const KEYS_DESKTOP = '<b>Mouse</b> steer &middot; <b>Hold click</b> or <b>Space</b> breathe fire &middot; <b>F</b> fireball &middot; <b>W S</b> speed &middot; <b>Shift</b> surge &middot; <b>M</b> mute &middot; <b>Esc</b> leave';
const KEYS_TOUCH = '<b>Drag</b> to steer &middot; hold <b>Fire</b> &middot; tap <b>Bomb</b>';

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

function pickQuality(renderer: THREE.WebGLRenderer): Quality {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  const software = /swiftshader|llvmpipe|software/i.test(gpu);
  const modest = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;
  return software || modest ? LOW : HIGH;
}

let active: Game | null = null;

class Game {
  private readonly abort = new AbortController();
  private readonly style = document.createElement('style');
  private readonly stage = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloom: UnrealBloomPass;
  private readonly quality: Quality;
  private readonly input: Input;
  private readonly audio: DragonAudio | null;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly scrollTop = scrollY;
  private readonly builder: Generator<void, World>;
  private readonly cameraPosition = new THREE.Vector3();
  private readonly cameraDirection = new THREE.Vector3();
  private readonly cameraUp = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private intro: Intro | null;
  private world: World | null = null;
  private compiled = false;
  private phase: Phase = 'intro';
  private raf = 0;
  private last = performance.now();
  private introTime = 0;
  private manual = false;
  private draw = true;
  private held: Partial<Controls> | null = null;
  private time = 0;
  private frames = 0;
  private arriveTime = 0;
  private pixelScale = 1;
  private resolution = 1;
  private frameMs = 16;
  private paused = false;
  private stopped = false;
  private fireballQueued = false;
  private fireballCooldown = 0;
  private shake = 0;
  private pall = 0;
  private slowTimer = 0;
  private slowSurveys = 0;
  private burningCount = 0;
  private wisps = 0;
  private skipped = false;
  private readonly cues = { rip: false, wormhole: false };
  private readonly alarmed: boolean[] = TOWNS.map(() => false);
  private townSounds: TownSound[] = [];
  private nearFires: THREE.Vector3[] = [];

  constructor(origin: { x: number; y: number }) {
    this.style.textContent = STYLE;
    document.head.append(this.style);
    this.stage.setAttribute('data-dragon-stage', '');
    this.stage.setAttribute('role', 'application');
    this.stage.setAttribute('aria-label', 'Dragon flight. Press Escape to leave.');
    this.stage.dataset.phase = 'burn';
    this.stage.append(this.canvas);
    this.stage.insertAdjacentHTML('beforeend', HUD);

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    } catch (error) {
      this.style.remove();
      throw new Error('The dragon needs WebGL2, which this browser did not provide.', { cause: error });
    }
    // Appended to <html>, not <body>, so the page can fold away over it and then be hidden whole.
    document.documentElement.append(this.stage);
    this.quality = pickQuality(this.renderer);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.quality.samples });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.65, 0.92);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.audio = this.createAudio();
    this.input = createInput(this.stage, this.abort.signal, {
      onExit: () => this.stop(),
      onMute: () => this.audio?.toggleMute(),
      onFireball: () => {
        this.fireballQueued = true;
      },
      // Esc is swallowed by the browser while the pointer is locked: mid-intro it means "take me back",
      // in flight it means pause.
      onLockLost: () => {
        if (this.phase === 'intro') this.stop();
        else this.setPaused(true);
      },
    });
    this.wireHud();

    this.builder = this.buildWorld();
    this.intro = this.reducedMotion ? null : new Intro(origin);
    if (this.intro) {
      this.audio?.introIgnite();
    } else {
      document.documentElement.classList.add('dragon-active');
    }
    this.resize();
    window.addEventListener('resize', () => this.resize(), { signal: this.abort.signal });
    this.input.requestLock();

    window.__dragon = {
      audition: auditionVoices,
      strike: () => this.strike(),
      advance: (dt, steps) => {
        this.manual = true;
        for (let index = 0; index < steps; index += 1) this.step(dt, index === steps - 1);
      },
      hold: (controls) => {
        this.held = controls;
      },
      place: (x, y, z, yaw, pitch) => {
        if (!this.world) return;
        this.world.dragon.rig.position.set(x, y, z);
        this.world.dragon.yaw = yaw;
        this.world.dragon.pitch = pitch;
      },
      fireball: () => {
        this.fireballQueued = true;
      },
    };
    this.raf = requestAnimationFrame(this.frame);
  }

  private createAudio(): DragonAudio | null {
    try {
      const audio = new DragonAudio();
      void this.resumeAudio(audio);
      return audio;
    } catch (error) {
      console.warn('Dragon: Web Audio is unavailable, flying silent.', error);
      return null;
    }
  }

  private async resumeAudio(audio: DragonAudio): Promise<void> {
    try {
      await audio.resume();
    } catch (error) {
      // Safari can refuse until the next gesture; every pointerdown on the stage tries again.
      console.info('Dragon: audio will start on the next click or tap.', error);
    }
  }

  private wireHud(): void {
    const { signal } = this.abort;
    const find = <T extends HTMLElement>(selector: string): T => {
      const element = this.stage.querySelector<T>(selector);
      if (!element) throw new Error(`Dragon HUD is missing ${selector}`);
      return element;
    };
    find('[data-exit]').addEventListener('click', () => this.stop(), { signal });
    find('[data-bomb]').addEventListener(
      'pointerdown',
      (event) => {
        event.stopPropagation();
        this.fireballQueued = true;
      },
      { signal },
    );
    this.input.holdFire(find('[data-fire]'));
    find('[data-pause]').addEventListener('click', () => this.setPaused(false), { signal });
    find('[data-keys]').innerHTML = KEYS_DESKTOP;

    this.stage.addEventListener(
      'pointerdown',
      (event) => {
        if (this.audio && this.audio.state === 'suspended' && !this.paused) void this.resumeAudio(this.audio);
        if (event.pointerType === 'touch') {
          find('[data-fire]').hidden = false;
          find('[data-bomb]').hidden = false;
          find('[data-keys]').innerHTML = KEYS_TOUCH;
        } else if (!this.input.locked && !this.paused) {
          this.input.requestLock();
        }
        // A click or tap during the intro skips to the sky.
        if (this.phase === 'intro' && this.introTime > 0.7) this.skipped = true;
      },
      { signal },
    );
  }

  private setPaused(paused: boolean): void {
    if (this.stopped || this.paused === paused) return;
    this.paused = paused;
    const panel = this.stage.querySelector<HTMLElement>('[data-pause]');
    if (panel) panel.hidden = !paused;
    if (paused) {
      void this.audio?.suspend();
    } else {
      if (this.audio) void this.resumeAudio(this.audio);
      this.input.requestLock();
      this.last = performance.now();
    }
  }

  private resize(): void {
    const width = innerWidth;
    const height = innerHeight;
    const ratio = Math.max(0.4, Math.min(devicePixelRatio, this.quality.pixelRatio, MAX_RENDER_WIDTH / width) * this.resolution);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
    this.bloom.resolution.set((width * ratio) / 2, (height * ratio) / 2);
    if (this.world) {
      this.world.camera.aspect = width / height;
      this.world.camera.updateProjectionMatrix();
    }
  }

  /** Builds the world a piece per frame, so the intro keeps animating while it loads. */
  private *buildWorld(): Generator<void, World> {
    const scene = new THREE.Scene();
    const fog = new THREE.FogExp2(FOG_CLEAR.clone(), BASE_FOG);
    scene.fog = fog;
    const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.6, 0.36), 2.7);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(1000);
    const hemisphere = new THREE.HemisphereLight(new THREE.Color(0.36, 0.4, 0.64), new THREE.Color(0.3, 0.18, 0.1), 1.5);
    const sky = createSky();
    scene.add(sun, hemisphere, sky.mesh);
    yield;

    scene.add(createTerrain(this.quality.terrainSegments), createWater());
    yield;

    const city = new City();
    scene.add(city.group);
    yield;

    scene.add(createForest(this.quality.trees));
    const dragon = new Dragon();
    const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.8, 9000);
    dragon.rig.add(camera);
    scene.add(dragon.rig);
    yield;

    const inferno = new Inferno(city, this.quality, {
      explosion: (position, size) => {
        this.audio?.explosion(position, size);
        const distance = position.distanceTo(this.cameraPosition);
        this.shake = Math.min(2.4, this.shake + size * 1.5 * Math.max(0, 1 - distance / 520));
        this.raiseAlarm(position);
      },
      collapse: (position, stone, size) => {
        this.audio?.collapse(position, stone, size);
        const distance = position.distanceTo(this.cameraPosition);
        this.shake = Math.min(2.4, this.shake + size * 0.3 * Math.max(0, 1 - distance / 220));
      },
      ignite: (position) => {
        this.audio?.ignite(position);
        this.raiseAlarm(position);
      },
      debrisImpact: (position, speed) => this.audio?.debrisImpact(position, speed),
    });
    scene.add(inferno.group);

    const clouds = new ParticleField(this.quality.clouds + 320, false);
    clouds.points.renderOrder = 1.5;
    scene.add(clouds.points);
    for (let index = 0; index < this.quality.clouds; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * 2100;
      // Born halfway through a very long life, so the deck is simply there.
      clouds.emit(Math.cos(angle) * radius, CLOUD_BASE + Math.random() * 150, Math.sin(angle) * radius, 0, 0, 0, 200_000, 150 + Math.random() * 190, CLOUD, -100_000);
    }

    const landmarks = city.towns.map((town, index) => {
      const structures = city.structures.filter((structure) => structure.building.town === index);
      const at = (point: { x: number; z: number }): Structure | undefined =>
        structures.find((structure) => structure.building.x === point.x && structure.building.z === point.z);
      return { bell: at(town.church), keep: at(town.keep), structures };
    });
    return { scene, camera, fog, sun, hemisphere, sky, city, dragon, inferno, clouds, landmarks };
  }

  private async compile(world: World): Promise<void> {
    try {
      await this.renderer.compileAsync(world.scene, world.camera);
    } catch (error) {
      // Shaders then compile on the first frame instead: a hitch, not a failure.
      console.warn('Dragon: shader precompile failed.', error);
    }
    this.compiled = true;
  }

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const elapsed = (now - this.last) / 1000;
    this.last = now;
    if (document.hidden || this.paused || this.manual) return;
    this.step(Math.min(0.25, elapsed), true);
  };

  /** One frame. `elapsed` is real seconds; the simulation clamps it so a slow frame cannot tunnel. */
  private step(elapsed: number, draw: boolean): void {
    const dt = Math.min(0.05, elapsed);
    this.draw = draw;
    this.time += dt;
    this.frames += 1;
    this.frameMs += (elapsed * 1000 - this.frameMs) * 0.05;

    if (!this.world) {
      const step = this.builder.next();
      if (step.done) {
        this.world = step.value;
        void this.compile(step.value);
      }
    }

    if (this.phase === 'intro') this.introFrame(dt, elapsed);
    else if (this.world) this.flightFrame(dt, this.world);

    this.stage.dataset.frames = String(this.frames);
    this.stage.dataset.audio = this.audio?.state ?? 'none';
  }

  private introFrame(dt: number, elapsedReal: number): void {
    const ready = this.world !== null && this.compiled;
    if (!this.intro) {
      if (ready) this.arrive();
      return;
    }
    // Real time, not clamped simulation time: on a slow machine the intro drops frames, it does not drag.
    this.introTime += elapsedReal;
    const raw = this.skipped ? INTRO_LENGTH : this.introTime;
    // If the world is not built yet, hold at the wormhole's white core until it is.
    const elapsed = ready ? raw : Math.min(raw, INTRO_LENGTH - 0.02);

    if (!this.cues.rip && elapsed >= RIP_START && !this.skipped) {
      this.cues.rip = true;
      this.audio?.introRip();
    }
    if (!this.cues.wormhole && elapsed >= WORMHOLE_START - 0.6 && !this.skipped) {
      this.cues.wormhole = true;
      this.audio?.introWormhole(INTRO_LENGTH - elapsed);
    }

    const phase = this.intro.update(elapsed);
    this.stage.dataset.phase = phase;
    if (phase === 'done') {
      this.arrive();
      return;
    }
    // Nothing shows through the page until it starts to fold.
    if (elapsed < FOLD_START - 0.2) return;
    this.renderPass.scene = this.intro.scene;
    this.renderPass.camera = this.intro.camera;
    if (this.draw) this.composer.render(dt);
  }

  /** Out of the wormhole (or straight in, under reduced motion) and into the sky. */
  private arrive(): void {
    const world = this.world;
    if (!world) return;
    document.documentElement.classList.add('dragon-active');
    this.intro?.dispose();
    const cinematic = this.intro !== null;
    this.intro = null;

    this.renderPass.scene = world.scene;
    this.renderPass.camera = world.camera;
    this.resize();
    this.phase = cinematic ? 'arrive' : 'flight';
    this.stage.dataset.phase = this.phase;
    this.stage.dataset.total = String(world.city.structures.length);

    if (cinematic) {
      world.dragon.rig.position.copy(START);
      world.dragon.pitch = -0.42;
      world.dragon.speed = 95;
      this.stage.querySelector('[data-flash]')?.setAttribute('data-on', '');
      this.audio?.introArrival();
    } else {
      world.dragon.rig.position.set(START.x, 300, START.z - 250);
      this.audio?.roar(0.9);
    }

    const total = this.stage.querySelector('[data-total]');
    if (total) total.textContent = String(world.city.structures.length);
    this.stage.querySelector('[data-hud]')?.setAttribute('data-on', '');
    this.stage.querySelector('[data-title]')?.setAttribute('data-on', '');
    window.setTimeout(() => this.stage.querySelector('[data-keys]')?.setAttribute('data-off', ''), 14_000);
  }

  private raiseAlarm(position: THREE.Vector3): void {
    for (const [index, site] of TOWNS.entries()) {
      if (Math.hypot(position.x - site.x, position.z - site.z) < site.radius * 1.5) this.alarmed[index] = true;
    }
  }

  private strike(): void {
    const world = this.world;
    const house = world?.city.structures.find((structure) => structure.building.kind === 'house' && structure.state === 'intact');
    if (world && house) world.inferno.explode(house.building.x, house.building.y + 2, house.building.z, 1);
  }

  private flightFrame(dt: number, world: World): void {
    const { camera, dragon, inferno, city, fog, sky } = world;
    this.input.update(dt);
    const controls = this.held ? { ...this.input.controls, ...this.held } : this.input.controls;

    // After the wormhole the dragon dives out of the cloud on its own, then hands over the reins.
    let handoff = 1;
    let cloud = 0;
    if (this.phase === 'arrive') {
      this.arriveTime += dt;
      handoff = smoothstep(1.6, 4.2, this.arriveTime);
      cloud = 1 - smoothstep(0.2, 2.8, this.arriveTime);
      if (this.arriveTime >= ARRIVE_LENGTH) {
        this.phase = 'flight';
        this.stage.dataset.phase = 'flight';
      }
    }
    const armed = handoff > 0.6;
    const breathing = controls.fire && armed;
    dragon.update(dt, {
      steerX: controls.steerX * handoff,
      steerY: controls.steerY * handoff - 0.5 * (1 - handoff),
      throttle: controls.throttle * handoff + (1 - handoff),
      boost: controls.boost && armed,
      breathing,
    });

    this.shake *= Math.exp(-dt * 3.2);
    const jolt = this.reducedMotion ? 0 : this.shake;
    camera.position.set((Math.random() - 0.5) * jolt * 0.5, 3.0 + (Math.random() - 0.5) * jolt * 0.5, 1.4);
    camera.rotation.set(-0.11 + (Math.random() - 0.5) * jolt * 0.02, 0, -dragon.roll * 0.3 + (Math.random() - 0.5) * jolt * 0.02);
    const fov = THREE.MathUtils.clamp(72 + (dragon.speed - 58) * 0.17, 66, 94);
    if (Math.abs(fov - camera.fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(this.cameraPosition);
    camera.getWorldDirection(this.cameraDirection);
    this.cameraUp.set(0, 1, 0).transformDirection(camera.matrixWorld);
    this.pixelScale = this.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));

    // Fire leaves the mouth but converges on the sight, a hundred metres out.
    this.target.copy(this.cameraPosition).addScaledVector(this.cameraDirection, 100);
    const aim = dragon.aim(this.target);
    if (breathing) inferno.breathe(dragon.mouth, aim, dragon.velocity, dt);
    this.audio?.setBreathing(breathing);

    this.fireballCooldown -= dt;
    if (this.fireballQueued && armed && this.fireballCooldown <= 0 && inferno.launchFireball(dragon.mouth, aim, dragon.velocity)) {
      this.fireballCooldown = FIREBALL_COOLDOWN;
      this.audio?.fireball();
    }
    this.fireballQueued = false;

    const destroyed = city.razed / city.structures.length;
    this.pall += (Math.min(1, city.burning.size / 70 + destroyed * 0.75) - this.pall) * Math.min(1, dt * 0.5);
    fog.color.copy(FOG_CLEAR).lerp(FOG_SMOKE, this.pall).lerp(CLOUD_COLOR, cloud);
    fog.density = BASE_FOG + this.pall * 0.00045 + cloud * 0.014;
    world.sun.intensity = 2.7 * (1 - this.pall * 0.6);
    world.hemisphere.intensity = 1.5 * (1 - this.pall * 0.45);
    sky.mesh.position.copy(this.cameraPosition);
    sky.uniforms.uTime.value = this.time;
    sky.uniforms.uSmoke.value = this.pall;
    sky.uniforms.uCloud.value = cloud;

    if (cloud > 0.05 && this.wisps < 300) {
      // Shreds of cloud ahead of the dive, so breaking through reads as speed.
      for (let index = 0; index < 2; index += 1) {
        this.wisps += 1;
        const reach = 160 + Math.random() * 260;
        world.clouds.emit(
          this.cameraPosition.x + this.cameraDirection.x * reach + (Math.random() - 0.5) * 220,
          this.cameraPosition.y + this.cameraDirection.y * reach + (Math.random() - 0.5) * 160,
          this.cameraPosition.z + this.cameraDirection.z * reach + (Math.random() - 0.5) * 220,
          0,
          0,
          0,
          3,
          70 + Math.random() * 70,
          CLOUD,
          this.time,
        );
      }
    }

    city.spinBlades(dt);
    inferno.update(dt, this.time, camera, this.pixelScale, fog);
    world.clouds.update(this.time, this.pixelScale, fog);

    this.slowTimer -= dt;
    if (this.slowTimer <= 0) {
      this.slowTimer = 0.25;
      this.survey(world);
      this.adapt();
    }
    this.audio?.update(this.audioFrame(dragon));
    if (this.draw) this.composer.render(dt);
  }

  /** Four times a second: what is burning nearby, how each town is faring, and the HUD numbers. */
  private survey(world: World): void {
    const { city } = world;
    this.nearFires = Array.from(city.burning)
      .map((structure) => ({ structure, distance: Math.hypot(structure.building.x - this.cameraPosition.x, structure.building.z - this.cameraPosition.z) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4)
      .map(({ structure }) => new THREE.Vector3(structure.building.x, structure.top, structure.building.z));

    this.townSounds = city.towns.map((town, index) => {
      const { bell, keep, structures } = world.landmarks[index];
      let burning = 0;
      let ruined = 0;
      for (const structure of structures) {
        if (structure.state === 'burning') burning += 1;
        else if (structure.state === 'ruined') ruined += 1;
      }
      return {
        church: { x: town.church.x, y: town.site.ground + 30, z: town.church.z },
        keep: { x: town.keep.x, y: town.site.ground + 30, z: town.keep.z },
        alarmed: this.alarmed[index],
        bellStanding: bell !== undefined && bell.state !== 'ruined',
        keepStanding: keep !== undefined && keep.state !== 'ruined',
        razed: ruined / structures.length,
        burning,
      };
    });

    const razed = this.stage.querySelector('[data-razed]');
    const ablaze = this.stage.querySelector('[data-ablaze]');
    if (razed) razed.textContent = String(city.razed);
    if (ablaze) ablaze.textContent = city.burning.size > 0 ? `${city.burning.size} ablaze` : '';
    this.stage.dataset.razed = String(city.razed);
    this.stage.dataset.burning = String(city.burning.size);
    this.burningCount = city.burning.size;
    if (city.razed === city.structures.length) {
      const subtitle = this.stage.querySelector('[data-subtitle]');
      const title = this.stage.querySelector<HTMLElement>('[data-title]');
      if (subtitle && title && subtitle.textContent !== 'The realm is ash') {
        subtitle.textContent = 'The realm is ash';
        title.removeAttribute('data-on');
        void title.offsetWidth;
        title.setAttribute('data-on', '');
      }
    }
  }

  /** Sheds resolution, then bloom, when the frame time says the GPU cannot keep up. */
  private adapt(): void {
    this.slowSurveys = this.frameMs < SLOW_FRAME_MS ? 0 : this.slowSurveys + 1;
    if (this.slowSurveys < 4) return;
    this.slowSurveys = 0;
    if (this.resolution > 0.55) {
      this.resolution *= 0.82;
      this.resize();
      this.frameMs = 20;
    } else if (this.bloom.enabled) {
      this.bloom.enabled = false;
      this.frameMs = 20;
    }
  }

  private audioFrame(dragon: Dragon): AudioFrame {
    return {
      position: this.cameraPosition,
      forward: this.cameraDirection,
      up: this.cameraUp,
      speed: dragon.speed,
      dive: Math.min(1, Math.max(0, -dragon.pitch / 0.8)),
      wingPhase: dragon.wingPhase,
      flapPower: dragon.flapPower,
      fires: this.nearFires,
      burningCount: this.burningCount,
      towns: this.townSounds,
    };
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    active = null;
    delete window.__dragon;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    if (document.pointerLockElement) document.exitPointerLock();

    this.intro?.dispose();
    document.documentElement.classList.remove('dragon-active');
    // Hiding <body> collapsed the document, which reset the scroll position.
    window.scrollTo({ top: this.scrollTop, behavior: 'instant' });

    void this.closeAudio();
    this.world?.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (object instanceof THREE.InstancedMesh) object.dispose();
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of materials) {
        (material as THREE.MeshLambertMaterial).map?.dispose();
        material.dispose();
      }
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.stage.remove();
    this.style.remove();
    document.querySelector<HTMLElement>('[data-dragon-egg]')?.focus({ preventScroll: true });
  }

  private async closeAudio(): Promise<void> {
    try {
      await this.audio?.dispose();
    } catch (error) {
      console.warn('Dragon: audio context did not close cleanly.', error);
    }
  }
}

/** Starts the easter egg. `origin` is where the glyph was clicked, in viewport pixels. */
export function startDragon(origin: { x: number; y: number }): void {
  if (active) return;
  active = new Game(origin);
}
