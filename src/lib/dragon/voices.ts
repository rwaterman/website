/**
 * Every sound in the game, synthesized from oscillators and noise. One-shots return a Voice so
 * the engine can cap and steal them; loops return a handle with setters.
 */

import { envelope, filter, gain, noise, oscillator, panner, route, shaper, type Mix, type Placement, type Voice } from './mix';

const random = Math.random;
const between = (low: number, high: number): number => low + random() * (high - low);

function stereo(mix: Mix, pan: number): StereoPannerNode {
  const node = mix.context.createStereoPanner();
  node.pan.value = pan;
  return node;
}

/** A short filtered noise hit: the atom for snaps, clacks, rattles and thuds. */
function click(mix: Mix, out: AudioNode, at: number, kind: 'white' | 'brown', type: BiquadFilterType, frequency: number, q: number, level: number, length: number): void {
  const amp = gain(mix, 0);
  envelope(amp.gain, at, [[0, 0], [0.002, level], [length, 0.0001]], true);
  noise(mix, kind, at, length + 0.02).connect(filter(mix, type, frequency, q)).connect(amp).connect(out);
}

/** A pitched drop: the body of thumps and booms. */
function thump(mix: Mix, out: AudioNode, at: number, from: number, to: number, sweep: number, level: number, length: number): void {
  const tone = oscillator(mix, 'sine', from, at, length + 0.05);
  envelope(tone.frequency, at, [[0, from], [sweep, to]], true);
  const amp = gain(mix, 0);
  envelope(amp.gain, at, [[0, 0.0001], [0.008, level], [length, 0.0001]], true);
  tone.connect(amp).connect(out);
}

export function playExplosion(mix: Mix, when: number, size: number, placement?: Placement): Voice {
  const { input, start } = route(mix, 'impacts', when, placement);
  const tail = 1.3 * size;
  const send = gain(mix, 0.5);
  input.connect(send).connect(mix.reverb);

  click(mix, input, start, 'white', 'highpass', 1600, 0.7, 0.9, 0.07);

  const body = noise(mix, 'brown', start, tail + 0.4);
  const bodyFilter = filter(mix, 'lowpass', 3200, 0.8);
  envelope(bodyFilter.frequency, start, [[0, 3200], [0.45, 150]], true);
  const bodyAmp = gain(mix, 0);
  envelope(bodyAmp.gain, start, [[0, 0.0001], [0.012, 1.5], [tail, 0.0001]], true);
  body.connect(bodyFilter).connect(shaper(mix)).connect(bodyAmp).connect(input);

  thump(mix, input, start, 125, 34, 0.28, 1.0, 0.65 * size);
  thump(mix, input, start + 0.02, 54, 25, 1.0, 0.85, 1.5 * size);

  const rumble = noise(mix, 'brown', start, 3.2 * size);
  const rumbleAmp = gain(mix, 0);
  envelope(rumbleAmp.gain, start, [[0, 0], [0.18, 0.55], [3.1 * size, 0]]);
  rumble.connect(filter(mix, 'lowpass', 170, 0.6)).connect(rumbleAmp).connect(input);

  const rattles = Math.round(between(9, 18) * size);
  for (let index = 0; index < rattles; index += 1) {
    click(mix, input, start + between(0.25, 1.9), 'white', 'bandpass', between(300, 2400), between(2, 6), between(0.1, 0.34), between(0.03, 0.09));
  }
  return { end: start + 3.3 * size, output: input };
}

export function playRoar(mix: Mix, when: number, intensity: number): Voice {
  const { input, start } = route(mix, 'dragon', when);
  const length = between(2.0, 3.2);
  const pitch = between(60, 88);
  const contour = (scale: number): [number, number][] => [
    [0, pitch * scale * 0.72],
    [0.18 * length, pitch * scale * 1.22],
    [0.55 * length, pitch * scale],
    [length, pitch * scale * 0.58],
  ];

  const excitation = gain(mix, 1);
  for (const [type, scale, detune, level] of [
    ['sawtooth', 1, -9, 0.5],
    ['sawtooth', 1.004, 8, 0.5],
    ['square', 0.5, 0, 0.42],
    ['sawtooth', 1.5, 4, 0.2],
  ] as const) {
    const tone = oscillator(mix, type, pitch * scale, start, length + 0.1);
    tone.detune.value = detune;
    envelope(tone.frequency, start, contour(scale), true);
    tone.connect(gain(mix, level)).connect(excitation);
  }

  // The growl: fast amplitude flutter, with a slower wobble under it.
  const rough = gain(mix, 0.6);
  const flutter = oscillator(mix, 'sawtooth', between(30, 46), start, length + 0.1);
  flutter.connect(gain(mix, 0.5)).connect(rough.gain);
  const wobble = oscillator(mix, 'sine', between(5.5, 8), start, length + 0.1);
  wobble.connect(gain(mix, 0.18)).connect(rough.gain);
  excitation.connect(rough);

  const rasp = noise(mix, 'pink', start, length + 0.1);
  const raspAmp = gain(mix, 0);
  envelope(raspAmp.gain, start, [[0, 0], [0.2 * length, 0.75], [0.7 * length, 0.5], [length, 0]]);
  rasp.connect(filter(mix, 'bandpass', 1500, 0.7)).connect(raspAmp).connect(rough);

  const throat = shaper(mix);
  for (const [formant, q, level] of [
    [[320, 640, 380], 3.5, 1],
    [[850, 1380, 760], 4.5, 0.7],
    [[2400, 2950, 2200], 6, 0.35],
  ] as const) {
    const band = filter(mix, 'bandpass', formant[0], q);
    envelope(band.frequency, start, [[0, formant[0]], [0.3 * length, formant[1]], [length, formant[2]]], true);
    rough.connect(band).connect(gain(mix, level)).connect(throat);
  }
  excitation.connect(filter(mix, 'lowpass', 190, 0.7)).connect(gain(mix, 0.7)).connect(throat);

  const shelf = filter(mix, 'lowshelf', 160);
  shelf.gain.value = 6;
  const amp = gain(mix, 0);
  envelope(amp.gain, start, [[0, 0], [0.14, intensity], [0.6 * length, intensity * 0.85], [length, 0]]);
  throat.connect(shelf).connect(amp).connect(input);
  return { end: start + length + 0.1, output: input };
}

export function playWingbeat(mix: Mix, when: number, power: number, down: boolean): Voice {
  const { input, start } = route(mix, 'dragon', when);
  if (down) {
    for (const pan of [-0.6, 0.6]) {
      const sweep = filter(mix, 'lowpass', 1100, 0.8);
      envelope(sweep.frequency, start, [[0, 1100], [0.4, 150]], true);
      const amp = gain(mix, 0);
      envelope(amp.gain, start, [[0, 0], [0.12, 0.5 * power], [0.48, 0]]);
      noise(mix, 'brown', start, 0.55).connect(sweep).connect(amp).connect(stereo(mix, pan)).connect(input);
    }
    const air = filter(mix, 'bandpass', 520, 1.2);
    envelope(air.frequency, start, [[0, 520], [0.4, 210]], true);
    const airAmp = gain(mix, 0);
    envelope(airAmp.gain, start, [[0, 0], [0.1, 0.22 * power], [0.42, 0]]);
    noise(mix, 'pink', start, 0.5).connect(air).connect(airAmp).connect(input);
    thump(mix, input, start + 0.03, 64, 40, 0.2, 0.3 * power, 0.26);
    return { end: start + 0.6, output: input };
  }

  const lift = filter(mix, 'bandpass', 380, 1.5);
  envelope(lift.frequency, start, [[0, 380], [0.3, 920]], true);
  const liftAmp = gain(mix, 0);
  envelope(liftAmp.gain, start, [[0, 0], [0.14, 0.15 * power], [0.34, 0]]);
  noise(mix, 'pink', start, 0.4).connect(lift).connect(liftAmp).connect(input);

  // Leather creaking as the membrane takes the load.
  const creak = oscillator(mix, 'sawtooth', 95, start, 0.24);
  envelope(creak.frequency, start, [[0, between(85, 100)], [0.2, between(130, 150)]], true);
  const stutter = gain(mix, 0.5);
  oscillator(mix, 'square', between(19, 27), start, 0.24).connect(gain(mix, 0.5)).connect(stutter.gain);
  const creakAmp = gain(mix, 0);
  envelope(creakAmp.gain, start, [[0, 0], [0.04, 0.05 * power], [0.2, 0]]);
  creak.connect(filter(mix, 'bandpass', 720, 8)).connect(stutter).connect(creakAmp).connect(input);
  return { end: start + 0.45, output: input };
}

export function playCollapse(mix: Mix, when: number, stone: boolean, size: number, placement?: Placement): Voice {
  const { input, start } = route(mix, 'impacts', when, placement);

  if (stone) {
    click(mix, input, start, 'white', 'lowpass', 900, 0.7, 0.8, 0.06);
    const slide = noise(mix, 'brown', start, 2.4);
    const slideFilter = filter(mix, 'lowpass', 900, 0.7);
    envelope(slideFilter.frequency, start, [[0, 900], [1.6, 90]], true);
    const slideAmp = gain(mix, 0);
    envelope(slideAmp.gain, start, [[0, 0], [0.2, 0.95 * size], [2.3, 0]]);
    slide.connect(slideFilter).connect(slideAmp).connect(input);
    thump(mix, input, start + 0.15, 50, 29, 0.8, 0.6 * size, 1.1);
    const boulders = Math.round(between(9, 15));
    for (let index = 0; index < boulders; index += 1) {
      const at = start + between(0.2, 2.0);
      thump(mix, input, at, between(80, 140), between(40, 60), 0.07, between(0.2, 0.5), 0.16);
      click(mix, input, at, 'brown', 'lowpass', between(350, 700), 0.7, between(0.2, 0.45), 0.09);
    }
    return { end: start + 2.6, output: input };
  }

  // Timber: a groan as the frame gives, snapping beams, then the crash and clatter.
  const groanFrom = between(70, 110);
  const groan = oscillator(mix, 'sawtooth', groanFrom, start, 0.6);
  envelope(groan.frequency, start, [[0, groanFrom], [0.5, groanFrom * between(0.62, 0.78)]], true);
  const judder = gain(mix, 0.5);
  oscillator(mix, 'square', between(14, 22), start, 0.6).connect(gain(mix, 0.5)).connect(judder.gain);
  const groanAmp = gain(mix, 0);
  envelope(groanAmp.gain, start, [[0, 0], [0.15, 0.3], [0.55, 0]]);
  groan.connect(filter(mix, 'bandpass', 420, 7)).connect(judder).connect(groanAmp).connect(input);

  const snaps = Math.round(between(3, 6));
  for (let index = 0; index < snaps; index += 1) {
    click(mix, input, start + between(0.08, 0.6), 'white', 'bandpass', between(1700, 3600), 3, between(0.35, 0.7), 0.03);
  }

  const crashAt = start + 0.42;
  const crash = noise(mix, 'brown', crashAt, 1.5);
  const crashFilter = filter(mix, 'lowpass', 1900, 0.7);
  envelope(crashFilter.frequency, crashAt, [[0, 1900], [0.9, 200]], true);
  const crashAmp = gain(mix, 0);
  envelope(crashAmp.gain, crashAt, [[0, 0], [0.06, 0.9 * size], [1.4, 0]]);
  crash.connect(crashFilter).connect(crashAmp).connect(input);
  thump(mix, input, crashAt, 82, 42, 0.2, 0.5 * size, 0.4);

  const clatter = Math.round(between(8, 14));
  for (let index = 0; index < clatter; index += 1) {
    click(mix, input, crashAt + between(0.1, 1.3), 'white', 'bandpass', between(400, 1900), between(2, 5), between(0.12, 0.3), between(0.03, 0.07));
  }
  return { end: start + 2.1, output: input };
}

export function playIgnite(mix: Mix, when: number, placement?: Placement): Voice {
  const { input, start } = route(mix, 'fire', when, placement);
  const sweep = filter(mix, 'lowpass', 200, 1.2);
  envelope(sweep.frequency, start, [[0, 200], [0.14, 1500], [0.45, 300]], true);
  const amp = gain(mix, 0);
  envelope(amp.gain, start, [[0, 0], [0.08, 0.6], [0.5, 0]]);
  noise(mix, 'brown', start, 0.6).connect(sweep).connect(amp).connect(input);

  const pops = gain(mix, 0);
  envelope(pops.gain, start, [[0, 0], [0.1, 0.5], [0.9, 0]]);
  noise(mix, 'crackle', start, 1.0, between(0.8, 1.3)).connect(filter(mix, 'highpass', 1500)).connect(pops).connect(input);
  return { end: start + 1.0, output: input };
}

export function playFireballLaunch(mix: Mix, when: number): Voice {
  const { input, start } = route(mix, 'dragon', when);
  click(mix, input, start, 'brown', 'lowpass', 950, 0.8, 1.0, 0.11);
  thump(mix, input, start, 160, 52, 0.2, 0.75, 0.3);

  const whoosh = filter(mix, 'bandpass', 500, 1.4);
  envelope(whoosh.frequency, start, [[0, 500], [0.22, 2300], [0.75, 380]], true);
  const amp = gain(mix, 0);
  envelope(amp.gain, start, [[0, 0], [0.12, 0.4], [0.8, 0]]);
  noise(mix, 'pink', start, 0.9).connect(whoosh).connect(amp).connect(input);
  return { end: start + 0.9, output: input };
}

export function playDebrisImpact(mix: Mix, when: number, speed: number, placement?: Placement): Voice {
  const { input, start } = route(mix, 'impacts', when, placement);
  const level = Math.min(0.55, speed / 38);
  click(mix, input, start, 'brown', 'lowpass', 280 + speed * 22, 0.7, level, 0.09);
  click(mix, input, start, 'white', 'bandpass', between(900, 2600), 2, level * 0.4, 0.02);
  return { end: start + 0.15, output: input };
}

/** A church bell: inharmonic partials, the low ones ringing longest. `cracked` detunes it for the last toll. */
export function playBell(mix: Mix, when: number, pitch: number, strength: number, cracked: boolean, placement?: Placement): Voice {
  const { input, start } = route(mix, 'town', when, placement);
  const partials: [number, number][] = [
    [0.5, 0.45],
    [1, 1],
    [1.19, 0.6],
    [1.5, 0.34],
    [2, 0.72],
    [2.51, 0.3],
    [2.66, 0.24],
    [3.01, 0.28],
    [4.17, 0.18],
    [5.43, 0.11],
  ];
  let longest = 0;
  for (const [ratio, level] of partials) {
    const decay = 4.4 / ratio ** 0.75;
    longest = Math.max(longest, decay);
    const skew = cracked ? 1 + (random() - 0.5) * 0.06 : 1 + (random() - 0.5) * 0.003;
    const tone = oscillator(mix, 'sine', pitch * ratio * skew, start, decay + 0.05);
    const amp = gain(mix, 0);
    envelope(amp.gain, start, [[0, 0.0001], [0.004, level * strength * 0.3], [decay, 0.0001]], true);
    tone.connect(amp).connect(input);
  }
  click(mix, input, start, 'white', 'bandpass', 2600, 1, 0.35 * strength, 0.035);
  if (cracked) click(mix, input, start, 'white', 'bandpass', 900, 3, 0.5, 0.3);
  return { end: start + longest, output: input };
}

/** A war horn from the keep: two blasts with a brassy swell. */
export function playHorn(mix: Mix, when: number, pitch: number, placement?: Placement): Voice {
  const { input, start } = route(mix, 'town', when, placement);
  const blasts: [number, number][] = [
    [0, 2.1],
    [2.6, 3.0],
  ];
  for (const [offset, length] of blasts) {
    const at = start + offset;
    const brass = filter(mix, 'lowpass', 300, 2.2);
    envelope(brass.frequency, at, [[0, 300], [0.4, 1250], [length - 0.4, 800], [length, 260]], true);
    const amp = gain(mix, 0);
    envelope(amp.gain, at, [[0, 0], [0.3, 0.55], [length - 0.45, 0.5], [length, 0]]);
    const vibrato = oscillator(mix, 'sine', 4.6, at, length);
    const depth = gain(mix, 0);
    envelope(depth.gain, at, [[0, 0], [0.8, 0], [length, pitch * 0.012]]);
    vibrato.connect(depth);
    for (const detune of [-6, 5]) {
      const tone = oscillator(mix, 'sawtooth', pitch, at, length + 0.05);
      tone.detune.value = detune;
      envelope(tone.frequency, at, [[0, pitch * 0.93], [0.18, pitch]], true);
      depth.connect(tone.frequency);
      tone.connect(gain(mix, 0.5)).connect(brass);
    }
    brass.connect(amp).connect(input);
  }
  return { end: start + 5.7, output: input };
}

export function playScream(mix: Mix, when: number, placement?: Placement): Voice {
  const { input, start } = route(mix, 'town', when, placement);
  const length = between(0.45, 1.0);
  const pitch = between(430, 760);
  const voice = oscillator(mix, 'sawtooth', pitch, start, length + 0.05);
  envelope(voice.frequency, start, [[0, pitch], [0.3 * length, pitch * between(1.3, 1.7)], [length, pitch * between(0.8, 1.1)]], true);
  const vibrato = oscillator(mix, 'sine', between(5.5, 7.5), start, length + 0.05);
  vibrato.connect(gain(mix, pitch * 0.03)).connect(voice.frequency);
  const amp = gain(mix, 0);
  envelope(amp.gain, start, [[0, 0], [0.08, 0.12], [0.7 * length, 0.1], [length, 0]]);
  for (const [formant, level] of [[between(800, 1100), 1], [between(2500, 3100), 0.5]] as const) {
    voice.connect(filter(mix, 'bandpass', formant, 5)).connect(gain(mix, level)).connect(amp);
  }
  amp.connect(input);
  return { end: start + length + 0.1, output: input };
}

/** Paper tearing off its spine and whipping away. */
export function playPageRip(mix: Mix, when: number): Voice {
  const { input, start } = route(mix, 'impacts', when);
  const tear = filter(mix, 'bandpass', 2400, 1.1);
  envelope(tear.frequency, start, [[0, 2400], [0.3, 5200], [0.55, 1500]], true);
  const tearAmp = gain(mix, 0);
  envelope(tearAmp.gain, start, [[0, 0], [0.04, 0.5], [0.4, 0.3], [0.6, 0]]);
  const grain = gain(mix, 0.5);
  oscillator(mix, 'sawtooth', 62, start, 0.7).connect(gain(mix, 0.5)).connect(grain.gain);
  noise(mix, 'white', start, 0.7).connect(tear).connect(grain).connect(tearAmp).connect(input);

  const whip = filter(mix, 'bandpass', 300, 1.6);
  envelope(whip.frequency, start + 0.35, [[0, 300], [0.5, 2600], [0.9, 700]], true);
  const whipAmp = gain(mix, 0);
  envelope(whipAmp.gain, start + 0.35, [[0, 0], [0.4, 0.6], [0.95, 0]]);
  noise(mix, 'pink', start + 0.35, 1.0).connect(whip).connect(whipAmp).connect(input);
  thump(mix, input, start, 90, 45, 0.15, 0.5, 0.3);
  return { end: start + 1.4, output: input };
}

/**
 * The wormhole: a detuned drone opening up, an endlessly rising tone, a swirling comb, and a
 * riser that peaks exactly at `length`, where playArrival takes over.
 */
export function playWormhole(mix: Mix, when: number, length: number): Voice {
  const { input, start } = route(mix, 'ambience', when);
  const send = gain(mix, 0.6);
  input.connect(send).connect(mix.reverb);
  const amp = gain(mix, 0);
  envelope(amp.gain, start, [[0, 0], [0.5, 0.5], [length - 0.15, 1.1], [length, 0]]);
  amp.connect(input);

  const drone = filter(mix, 'lowpass', 140, 3);
  envelope(drone.frequency, start, [[0, 140], [length, 3200]], true);
  for (const [pitch, detune] of [[41.2, -11], [41.2, 9], [61.7, 4], [82.4, -5]] as const) {
    const tone = oscillator(mix, 'sawtooth', pitch, start, length);
    tone.detune.value = detune;
    envelope(tone.detune, start, [[0, detune], [length, detune + 700]]);
    tone.connect(gain(mix, 0.3)).connect(drone);
  }
  drone.connect(shaper(mix)).connect(gain(mix, 0.5)).connect(amp);

  // Shepard-style riser: octave-spaced tones climbing through a fixed loudness window.
  for (let voice = 0; voice < 5; voice += 1) {
    const from = 55 * 2 ** voice;
    const tone = oscillator(mix, 'sine', from, start, length);
    envelope(tone.frequency, start, [[0, from], [length, from * 4]], true);
    const window = gain(mix, 0);
    const peak = 0.16 * Math.sin(((voice + 0.5) / 5) * Math.PI);
    envelope(window.gain, start, [[0, 0], [length * 0.4, peak], [length, peak * 1.6]]);
    tone.connect(window).connect(amp);
  }

  // The swirl: noise through a comb whose delay is swept, panned in a circle.
  const comb = mix.context.createDelay(0.05);
  comb.delayTime.value = 0.012;
  const sweep = oscillator(mix, 'sine', 0.35, start, length);
  envelope(sweep.frequency, start, [[0, 0.35], [length, 4.5]], true);
  sweep.connect(gain(mix, 0.008)).connect(comb.delayTime);
  const feedback = gain(mix, 0.82);
  comb.connect(feedback).connect(comb);
  const rush = filter(mix, 'bandpass', 500, 0.8);
  envelope(rush.frequency, start, [[0, 500], [length, 5200]], true);
  const rushAmp = gain(mix, 0);
  envelope(rushAmp.gain, start, [[0, 0.05], [length, 0.5]]);
  noise(mix, 'pink', start, length).connect(rush).connect(rushAmp).connect(comb);
  const orbit = stereo(mix, 0);
  const spin = oscillator(mix, 'sine', 0.5, start, length);
  envelope(spin.frequency, start, [[0, 0.5], [length, 6]], true);
  spin.connect(gain(mix, 0.9)).connect(orbit.pan);
  comb.connect(orbit).connect(gain(mix, 0.35)).connect(amp);
  rushAmp.connect(gain(mix, 0.5)).connect(amp);

  const rumble = gain(mix, 0);
  envelope(rumble.gain, start, [[0, 0.2], [length, 0.9]]);
  noise(mix, 'brown', start, length).connect(filter(mix, 'lowpass', 110, 0.7)).connect(rumble).connect(amp);
  return { end: start + length, output: input };
}

/** Breaking out of the wormhole into open sky: a thunderclap, then a glassy shimmer falling away. */
export function playArrival(mix: Mix, when: number): Voice {
  const boom = playExplosion(mix, when, 1.7);
  const { input, start } = route(mix, 'ambience', when);
  const send = gain(mix, 0.9);
  input.connect(send).connect(mix.reverb);
  for (const ratio of [1, 1.5, 2, 2.67, 4]) {
    const pitch = 880 * ratio;
    const tone = oscillator(mix, 'sine', pitch, start, 3.2);
    envelope(tone.frequency, start, [[0, pitch], [3, pitch * 0.5]], true);
    const amp = gain(mix, 0);
    envelope(amp.gain, start, [[0, 0.0001], [0.02, 0.07 / ratio], [3, 0.0001]], true);
    tone.connect(amp).connect(input);
  }
  return { end: boom.end, output: boom.output };
}

export interface WindLoop {
  /** `speed` in m/s, `dive` 0..1. */
  set(speed: number, dive: number): void;
}

export function createWind(mix: Mix): WindLoop {
  const { context } = mix;
  const start = context.currentTime;
  const out = gain(mix, 1);
  out.connect(mix.buses.ambience);

  const bands = [-0.7, 0.7].map((pan, index) => {
    const band = filter(mix, 'bandpass', 400, 0.5);
    const amp = gain(mix, 0.1);
    noise(mix, 'pink', start, null, index === 0 ? 1 : 1.07).connect(band).connect(amp).connect(stereo(mix, pan)).connect(out);
    return { band, amp };
  });

  const hiss = gain(mix, 0);
  noise(mix, 'white', start, null).connect(filter(mix, 'highpass', 2600)).connect(filter(mix, 'lowpass', 7500)).connect(hiss).connect(out);

  // Buffeting: low rumble with a slow random swell.
  const buffet = gain(mix, 0.12);
  const swell = gain(mix, 0.1);
  noise(mix, 'brown', start, null, 0.03).connect(filter(mix, 'lowpass', 2)).connect(gain(mix, 3)).connect(swell.gain);
  noise(mix, 'brown', start, null).connect(filter(mix, 'lowpass', 130)).connect(swell).connect(buffet).connect(out);

  let nextGust = 0;
  let gust = 1;
  return {
    set: (speed, dive) => {
      const now = context.currentTime;
      if (now >= nextGust) {
        nextGust = now + between(0.5, 1.6);
        gust = between(0.78, 1.28);
      }
      const amount = Math.min(1, Math.max(0, (speed - 30) / 120));
      for (const [index, { band, amp }] of bands.entries()) {
        band.frequency.setTargetAtTime((260 + amount * 950) * (index === 0 ? 1 : 1.12) * gust, now, 0.4);
        amp.gain.setTargetAtTime((0.1 + amount * 0.5) * gust, now, 0.35);
      }
      hiss.gain.setTargetAtTime(amount * amount * 0.2 + dive * 0.1, now, 0.25);
      buffet.gain.setTargetAtTime(0.1 + amount * 0.3, now, 0.5);
    },
  };
}

export interface BreathLoop {
  start(): void;
  stop(): void;
}

export function createFireBreath(mix: Mix): BreathLoop {
  const { context } = mix;
  const start = context.currentTime;
  const out = gain(mix, 0);
  out.connect(mix.buses.fire);

  noise(mix, 'brown', start, null).connect(filter(mix, 'lowpass', 540, 0.8)).connect(gain(mix, 0.95)).connect(out);

  // Turbulence: mid noise whose level is driven by a slow random signal, so it never loops audibly.
  const turbulence = gain(mix, 0.3);
  noise(mix, 'brown', start, null, 0.05).connect(filter(mix, 'lowpass', 14)).connect(gain(mix, 1.6)).connect(turbulence.gain);
  noise(mix, 'white', start, null).connect(filter(mix, 'bandpass', 1300, 0.6)).connect(turbulence).connect(out);

  const throat = filter(mix, 'lowpass', 230, 1.5);
  for (const pitch of [47, 70.5]) oscillator(mix, 'sawtooth', pitch, start, null).connect(gain(mix, 0.11)).connect(throat);
  throat.connect(out);

  noise(mix, 'crackle', start, null, 1.2).connect(filter(mix, 'highpass', 1800)).connect(gain(mix, 0.5)).connect(out);
  noise(mix, 'white', start, null).connect(filter(mix, 'bandpass', 4200, 1.2)).connect(gain(mix, 0.07)).connect(out);

  return {
    start: () => {
      const now = context.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(1, now, 0.05);
      const whoomp = gain(mix, 1);
      whoomp.connect(mix.buses.fire);
      thump(mix, whoomp, now, 98, 42, 0.26, 0.7, 0.34);
      click(mix, whoomp, now, 'brown', 'lowpass', 700, 0.8, 0.6, 0.16);
    },
    stop: () => {
      const now = context.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0, now, 0.13);
    },
  };
}

export interface PlacedLoop {
  /** Moves the loop and sets its level; a level of 0 parks it. */
  set(position: { x: number; y: number; z: number }, level: number): void;
}

function placedLoop(mix: Mix, busName: 'fire' | 'town', reference: number, build: (out: AudioNode, start: number) => void): PlacedLoop {
  const { context } = mix;
  const out = gain(mix, 0);
  const position = panner(mix, { position: { x: 0, y: 0, z: 0 }, reference, hrtf: true });
  out.connect(position).connect(mix.buses[busName]);
  build(out, context.currentTime);
  return {
    set: (point, level) => {
      const now = context.currentTime;
      out.gain.setTargetAtTime(level, now, 0.3);
      if (level === 0) return;
      position.positionX.setTargetAtTime(point.x, now, 0.05);
      position.positionY.setTargetAtTime(point.y, now, 0.05);
      position.positionZ.setTargetAtTime(point.z, now, 0.05);
    },
  };
}

/** One burning building, heard from where it stands. */
export function createBuildingFire(mix: Mix): PlacedLoop {
  return placedLoop(mix, 'fire', 28, (out, start) => {
    noise(mix, 'crackle', start, null, between(0.8, 1.25)).connect(filter(mix, 'bandpass', 2600, 0.5)).connect(gain(mix, 0.9)).connect(out);
    noise(mix, 'brown', start, null).connect(filter(mix, 'lowpass', 420, 0.7)).connect(gain(mix, 0.8)).connect(out);
    const lick = gain(mix, 0.2);
    noise(mix, 'brown', start, null, 0.04).connect(filter(mix, 'lowpass', 9)).connect(gain(mix, 1.2)).connect(lick.gain);
    noise(mix, 'pink', start, null).connect(filter(mix, 'bandpass', 900, 0.8)).connect(lick).connect(out);
  });
}

/** A town in panic: babble shaped by vowel formants, swelling at random. */
export function createCrowd(mix: Mix): PlacedLoop {
  return placedLoop(mix, 'town', 110, (out, start) => {
    const swell = gain(mix, 0.5);
    noise(mix, 'brown', start, null, 0.03).connect(filter(mix, 'lowpass', 5)).connect(gain(mix, 2.2)).connect(swell.gain);
    for (const [formant, level, rate] of [[620, 1, 3.1], [1150, 0.7, 4.3], [2600, 0.3, 5.7]] as const) {
      const band = filter(mix, 'bandpass', formant, 4);
      const wander = oscillator(mix, 'sine', rate * 0.07, start, null);
      wander.connect(gain(mix, formant * 0.18)).connect(band.frequency);
      const syllables = gain(mix, 0.6);
      oscillator(mix, 'sine', rate, start, null).connect(gain(mix, 0.4)).connect(syllables.gain);
      noise(mix, 'pink', start, null).connect(band).connect(syllables).connect(gain(mix, level)).connect(swell);
    }
    swell.connect(out);
  });
}

/** Many fires at once, too far or too many to place: one bed under the placed loops. */
export function createFireBed(mix: Mix): { set(level: number): void } {
  const start = mix.context.currentTime;
  const out = gain(mix, 0);
  out.connect(mix.buses.fire);
  noise(mix, 'brown', start, null).connect(filter(mix, 'lowpass', 300, 0.7)).connect(gain(mix, 0.7)).connect(out);
  noise(mix, 'crackle', start, null, 0.7).connect(filter(mix, 'bandpass', 1800, 0.5)).connect(gain(mix, 0.3)).connect(out);
  return { set: (level) => out.gain.setTargetAtTime(level, mix.context.currentTime, 0.6) };
}
