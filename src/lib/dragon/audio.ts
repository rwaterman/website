/** The live audio engine: owns the AudioContext, follows the game each frame, and caps the voices. */

import { createMix, distanceTo, type BusName, type Mix, type Placement, type Point, type Voice } from './mix';
import {
  createBuildingFire,
  createCrowd,
  createFireBed,
  createFireBreath,
  createWind,
  playArrival,
  playBell,
  playCollapse,
  playDebrisImpact,
  playExplosion,
  playFireballLaunch,
  playHorn,
  playIgnite,
  playPageRip,
  playRoar,
  playScream,
  playWingbeat,
  playWormhole,
  type BreathLoop,
  type PlacedLoop,
  type WindLoop,
} from './voices';

export interface TownSound {
  church: Point;
  keep: Point;
  /** Set once anything in the town has caught fire. */
  alarmed: boolean;
  bellStanding: boolean;
  keepStanding: boolean;
  /** 0..1 share of the town already destroyed. */
  razed: number;
  burning: number;
}

export interface AudioFrame {
  position: Point;
  forward: Point;
  up: Point;
  speed: number;
  /** 0 level .. 1 steep dive. */
  dive: number;
  wingPhase: number;
  flapPower: number;
  /** Nearest burning buildings, closest first. */
  fires: Point[];
  burningCount: number;
  towns: TownSound[];
}

type Category = 'explosion' | 'collapse' | 'ignite' | 'debris';

interface Tracked extends Voice {
  distance: number;
}

const VOICE_CAP: Record<Category, number> = { explosion: 6, collapse: 5, ignite: 4, debris: 8 };
const BELL_PITCH = [196, 233, 262];
const HORN_PITCH = [110, 131, 147];
const PLACED_FIRES = 4;
const DUCKED: BusName[] = ['ambience', 'town', 'fire'];

export class DragonAudio {
  readonly context: AudioContext;
  readonly mix: Mix;
  private readonly wind: WindLoop;
  private readonly breath: BreathLoop;
  private readonly fires: PlacedLoop[];
  private readonly fireBed: { set(level: number): void };
  private readonly crowd: PlacedLoop;
  private readonly voices: Record<Category, Tracked[]> = { explosion: [], collapse: [], ignite: [], debris: [] };
  private readonly nextBell: number[] = [];
  private readonly nextHorn: number[] = [];
  private readonly bellSilenced: boolean[] = [];
  private readonly busRest = new Map<BusName, number>();
  private wormhole: Voice | null = null;
  private lastBeat = -1;
  private nextScream = 0;
  private nextRoar = 0;
  private breathing = false;
  private muted = false;

  constructor() {
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.mix = createMix(this.context);
    for (const name of DUCKED) this.busRest.set(name, this.mix.buses[name].gain.value);
    this.wind = createWind(this.mix);
    this.breath = createFireBreath(this.mix);
    this.fires = Array.from({ length: PLACED_FIRES }, () => createBuildingFire(this.mix));
    this.fireBed = createFireBed(this.mix);
    this.crowd = createCrowd(this.mix);
  }

  get state(): AudioContextState {
    return this.context.state;
  }

  async resume(): Promise<void> {
    if (this.context.state === 'suspended') await this.context.resume();
  }

  async suspend(): Promise<void> {
    if (this.context.state === 'running') await this.context.suspend();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.mix.master.gain.setTargetAtTime(this.muted ? 0 : 0.85, this.context.currentTime, 0.05);
    return this.muted;
  }

  async dispose(): Promise<void> {
    if (this.context.state !== 'closed') await this.context.close();
  }

  private placed(position: Point, reference: number, hrtf: boolean): Placement {
    return { position: { x: position.x, y: position.y, z: position.z }, reference, hrtf };
  }

  /**
   * Plays a capped one-shot. At the cap, a new voice nearer than the farthest playing one takes
   * its place; a farther one is dropped.
   */
  private capped(category: Category, position: Point, play: () => Voice): void {
    const now = this.context.currentTime;
    const active = this.voices[category].filter((voice) => voice.end > now);
    this.voices[category] = active;
    const distance = distanceTo(this.mix, position);
    if (active.length >= VOICE_CAP[category]) {
      const farthest = active.reduce((far, voice) => (voice.distance > far.distance ? voice : far));
      if (farthest.distance <= distance) return;
      farthest.output.gain.setTargetAtTime(0, now, 0.03);
      farthest.end = now;
    }
    active.push({ ...play(), distance });
  }

  private duck(amount: number): void {
    const now = this.context.currentTime;
    for (const name of DUCKED) {
      const param = this.mix.buses[name].gain;
      const rest = this.busRest.get(name) ?? 1;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(rest * (1 - amount), now, 0.02);
      param.setTargetAtTime(rest, now + 0.45, 0.7);
    }
  }

  explosion(position: Point, size: number): void {
    const distance = distanceTo(this.mix, position);
    this.capped('explosion', position, () => playExplosion(this.mix, this.context.currentTime, size, this.placed(position, 95 * size, true)));
    if (distance < 420) {
      // The duck lands with the sound, not with the flash.
      const delayMs = (distance / 343) * 1000;
      window.setTimeout(() => {
        if (this.context.state === 'running') this.duck(Math.min(0.7, (1 - distance / 420) * size));
      }, delayMs);
    }
  }

  collapse(position: Point, stone: boolean, size: number): void {
    this.capped('collapse', position, () => playCollapse(this.mix, this.context.currentTime, stone, size, this.placed(position, 60, true)));
  }

  ignite(position: Point): void {
    this.capped('ignite', position, () => playIgnite(this.mix, this.context.currentTime, this.placed(position, 45, false)));
  }

  debrisImpact(position: Point, speed: number): void {
    this.capped('debris', position, () => playDebrisImpact(this.mix, this.context.currentTime, speed, this.placed(position, 35, false)));
  }

  fireball(): void {
    playFireballLaunch(this.mix, this.context.currentTime);
  }

  roar(intensity: number): void {
    playRoar(this.mix, this.context.currentTime, intensity);
    this.nextRoar = this.context.currentTime + 9;
  }

  setBreathing(breathing: boolean): void {
    if (breathing === this.breathing) return;
    this.breathing = breathing;
    if (breathing) this.breath.start();
    else this.breath.stop();
  }

  /** Intro cues, unplaced: the site catching fire, the page tearing away, the wormhole, the arrival. */
  introIgnite(): void {
    playIgnite(this.mix, this.context.currentTime);
    this.fireBed.set(0.9);
  }

  introRip(): void {
    playPageRip(this.mix, this.context.currentTime);
  }

  introWormhole(length: number): void {
    this.fireBed.set(0);
    this.wormhole = playWormhole(this.mix, this.context.currentTime, length);
  }

  introArrival(): void {
    // Cuts the wormhole short if the rider skipped ahead; a no-op when it has already run out.
    this.wormhole?.output.gain.setTargetAtTime(0, this.context.currentTime, 0.04);
    this.wormhole = null;
    this.fireBed.set(0);
    playArrival(this.mix, this.context.currentTime);
    this.roar(1);
  }

  update(frame: AudioFrame): void {
    const { context, mix } = this;
    const now = context.currentTime;
    mix.listener = frame.position;
    const listener = context.listener;
    if (listener.positionX) {
      listener.positionX.value = frame.position.x;
      listener.positionY.value = frame.position.y;
      listener.positionZ.value = frame.position.z;
      listener.forwardX.value = frame.forward.x;
      listener.forwardY.value = frame.forward.y;
      listener.forwardZ.value = frame.forward.z;
      listener.upX.value = frame.up.x;
      listener.upY.value = frame.up.y;
      listener.upZ.value = frame.up.z;
    } else {
      // Firefox before 2023 only has the deprecated setters.
      listener.setPosition(frame.position.x, frame.position.y, frame.position.z);
      listener.setOrientation(frame.forward.x, frame.forward.y, frame.forward.z, frame.up.x, frame.up.y, frame.up.z);
    }

    this.wind.set(frame.speed, frame.dive);

    // Two cues per wingbeat, locked to the animation: the wings are highest at a phase of pi/2
    // (the downstroke starts) and lowest at 3pi/2 (the recovery starts).
    const beat = Math.floor(frame.wingPhase / Math.PI + 0.5);
    if (this.lastBeat >= 0 && beat !== this.lastBeat) playWingbeat(mix, now, 0.45 + frame.flapPower * 0.55, beat % 2 === 1);
    this.lastBeat = beat;

    for (const [index, loop] of this.fires.entries()) {
      const fire = frame.fires[index];
      loop.set(fire ?? frame.position, fire ? 1 : 0);
    }
    this.fireBed.set(Math.min(0.9, Math.max(0, frame.burningCount - PLACED_FIRES) / 45));

    let loudest: TownSound | null = null;
    for (const [index, town] of frame.towns.entries()) {
      if (!town.alarmed) continue;
      if (!loudest || town.burning > loudest.burning) loudest = town;

      if (town.bellStanding) {
        if (now >= (this.nextBell[index] ?? 0)) {
          this.nextBell[index] = now + 1.45 + Math.random() * 0.5;
          playBell(mix, now, BELL_PITCH[index % BELL_PITCH.length], 1, false, this.placed(town.church, 130, true));
        }
      } else if (!this.bellSilenced[index]) {
        this.bellSilenced[index] = true;
        playBell(mix, now, BELL_PITCH[index % BELL_PITCH.length] * 0.94, 1.2, true, this.placed(town.church, 130, true));
      }

      if (town.keepStanding && now >= (this.nextHorn[index] ?? 0)) {
        this.nextHorn[index] = now + 16 + Math.random() * 9;
        playHorn(mix, now + 0.8, HORN_PITCH[index % HORN_PITCH.length], this.placed(town.keep, 170, true));
      }
    }

    // Panic rises with the fires and dies away as the town empties.
    const panic = loudest ? Math.min(1, loudest.burning / 14) * (1 - loudest.razed * 0.8) : 0;
    this.crowd.set(loudest?.church ?? frame.position, panic * 0.9);
    if (loudest && panic > 0.1 && now >= this.nextScream) {
      this.nextScream = now + (0.25 + Math.random() * 1.6) / panic;
      const church = loudest.church;
      playScream(mix, now, this.placed({ x: church.x + (Math.random() - 0.5) * 160, y: church.y, z: church.z + (Math.random() - 0.5) * 160 }, 70, false));
    }

    if (this.breathing && now >= this.nextRoar && Math.random() < 0.004) this.roar(0.8);
  }
}
