/**
 * Renders every voice through an OfflineAudioContext and measures it, so a test can prove each
 * sound is audible, finite, and under full scale without anyone listening.
 */

import { createMix, type Mix } from './mix';
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
} from './voices';

export interface VoiceStats {
  peak: number;
  rms: number;
  seconds: number;
}

const SAMPLE_RATE = 44_100;
const NEARBY = { x: 12, y: 0, z: -20 };

const VOICES: Record<string, { seconds: number; play: (mix: Mix) => void }> = {
  explosion: { seconds: 4, play: (mix) => void playExplosion(mix, 0, 1) },
  roar: { seconds: 3.5, play: (mix) => void playRoar(mix, 0, 1) },
  wingDown: { seconds: 0.8, play: (mix) => void playWingbeat(mix, 0, 1, true) },
  wingUp: { seconds: 0.6, play: (mix) => void playWingbeat(mix, 0, 1, false) },
  collapseTimber: { seconds: 2.5, play: (mix) => void playCollapse(mix, 0, false, 1) },
  collapseStone: { seconds: 3, play: (mix) => void playCollapse(mix, 0, true, 1) },
  ignite: { seconds: 1.2, play: (mix) => void playIgnite(mix, 0) },
  fireball: { seconds: 1.2, play: (mix) => void playFireballLaunch(mix, 0) },
  debris: { seconds: 0.4, play: (mix) => void playDebrisImpact(mix, 0, 20) },
  bell: { seconds: 5, play: (mix) => void playBell(mix, 0, 196, 1, false) },
  horn: { seconds: 6, play: (mix) => void playHorn(mix, 0, 110) },
  scream: { seconds: 1.3, play: (mix) => void playScream(mix, 0) },
  pageRip: { seconds: 1.6, play: (mix) => void playPageRip(mix, 0) },
  wormhole: { seconds: 3.3, play: (mix) => void playWormhole(mix, 0, 3.2) },
  arrival: { seconds: 5, play: (mix) => void playArrival(mix, 0) },
  wind: { seconds: 2, play: (mix) => createWind(mix).set(100, 0.4) },
  breath: { seconds: 2, play: (mix) => createFireBreath(mix).start() },
  buildingFire: { seconds: 2, play: (mix) => createBuildingFire(mix).set(NEARBY, 1) },
  crowd: { seconds: 2, play: (mix) => createCrowd(mix).set(NEARBY, 1) },
  fireBed: { seconds: 3, play: (mix) => createFireBed(mix).set(0.9) },
};

export async function auditionVoices(): Promise<Record<string, VoiceStats>> {
  const results: Record<string, VoiceStats> = {};
  for (const [name, voice] of Object.entries(VOICES)) {
    const context = new OfflineAudioContext(2, Math.ceil(voice.seconds * SAMPLE_RATE), SAMPLE_RATE);
    voice.play(createMix(context));
    const rendered = await context.startRendering();
    let peak = 0;
    let sum = 0;
    for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
      for (const sample of rendered.getChannelData(channel)) {
        peak = Math.max(peak, Math.abs(sample));
        sum += sample * sample;
      }
    }
    results[name] = { peak, rms: Math.sqrt(sum / (rendered.length * rendered.numberOfChannels)), seconds: rendered.duration };
  }
  return results;
}
