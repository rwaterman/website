/**
 * The audio mix graph and the building blocks the voices are made from. Everything takes a
 * BaseAudioContext so the same code renders live and through an OfflineAudioContext.
 *
 *   voice -> [distance low-pass -> panner] -> bus --+--> master -> compressor -> limiter -> soft clip -> out
 *                                                   +--> reverb send -> convolver --^
 */

export type BusName = 'ambience' | 'dragon' | 'fire' | 'impacts' | 'town';

export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface Mix {
  context: BaseAudioContext;
  buses: Record<BusName, GainNode>;
  /** Extra reverb send for voices that want a longer tail than their bus gives them. */
  reverb: GainNode;
  master: GainNode;
  noise: { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer; crackle: AudioBuffer };
  drive: Float32Array<ArrayBuffer>;
  listener: Point;
}

/** Where a voice sits in the world; omit for sounds that belong to the rider's own dragon. */
export interface Placement {
  position: Point;
  /** Distance at which the sound is at full level. */
  reference: number;
  hrtf: boolean;
}

export interface Voice {
  /** Context time at which the voice has finished. */
  end: number;
  /** Final gain of the voice; fade it to steal the voice. */
  output: GainNode;
}

const BUS_LEVEL: Record<BusName, number> = { ambience: 0.55, dragon: 0.9, fire: 0.75, impacts: 1.0, town: 0.6 };
const BUS_REVERB: Record<BusName, number> = { ambience: 0.04, dragon: 0.28, fire: 0.1, impacts: 0.4, town: 0.5 };
const SPEED_OF_SOUND = 343;
const MAX_SOUND_DELAY = 4;

const random = Math.random;

function fillNoise(context: BaseAudioContext, seconds: number, fill: (data: Float32Array, rate: number) => void): AudioBuffer {
  const buffer = context.createBuffer(1, Math.floor(seconds * context.sampleRate), context.sampleRate);
  fill(buffer.getChannelData(0), context.sampleRate);
  return buffer;
}

function normalise(data: Float32Array, peak: number): void {
  let max = 0;
  for (const sample of data) max = Math.max(max, Math.abs(sample));
  if (max === 0) return;
  for (let index = 0; index < data.length; index += 1) data[index] *= peak / max;
}

function whiteNoise(data: Float32Array): void {
  for (let index = 0; index < data.length; index += 1) data[index] = random() * 2 - 1;
}

/** Paul Kellet's economy pink filter. */
function pinkNoise(data: Float32Array): void {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let index = 0; index < data.length; index += 1) {
    const white = random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[index] = b0 + b1 + b2 + white * 0.1848;
  }
  normalise(data, 0.95);
}

function brownNoise(data: Float32Array): void {
  let last = 0;
  for (let index = 0; index < data.length; index += 1) {
    last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
    data[index] = last;
  }
  normalise(data, 0.95);
}

/** Sparse pops of random size and length: burning wood. */
function crackleNoise(data: Float32Array, rate: number): void {
  let index = 0;
  while (index < data.length) {
    index += Math.floor(rate * (0.004 + random() * random() * 0.16));
    const level = random() ** 3;
    const length = Math.floor(rate * (0.0006 + random() * 0.005));
    for (let offset = 0; offset < length && index + offset < data.length; offset += 1) {
      data[index + offset] += (random() * 2 - 1) * level * Math.exp((-5 * offset) / length);
    }
  }
  normalise(data, 0.95);
}

/** An open-valley tail: a few early slaps off the hills, then a darkening diffuse decay. */
function impulseResponse(context: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(seconds * context.sampleRate);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let smoothed = 0;
    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      const damping = 0.25 + 0.7 * progress;
      smoothed = smoothed * damping + (random() * 2 - 1) * (1 - damping);
      data[index] = smoothed * Math.exp(-5.2 * progress) * Math.min(1, index / (0.012 * context.sampleRate));
    }
    for (let slap = 0; slap < 5; slap += 1) {
      const at = Math.floor((0.05 + random() * 0.38) * context.sampleRate);
      const level = 0.5 * (1 - slap * 0.15) * (random() < 0.5 ? 1 : -1);
      for (let offset = 0; offset < 260 && at + offset < length; offset += 1) {
        data[at + offset] += level * (random() * 2 - 1) * Math.exp(-offset / 60);
      }
    }
    normalise(data, 0.6);
  }
  return buffer;
}

function tanhCurve(drive: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let index = 0; index < curve.length; index += 1) {
    const x = (index / (curve.length - 1)) * 2 - 1;
    curve[index] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
}

export function createMix(context: BaseAudioContext): Mix {
  const master = context.createGain();
  master.gain.value = 0.85;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.22;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  // The compressors cannot catch a transient inside their attack time; this keeps the output under full scale.
  const clip = context.createWaveShaper();
  clip.curve = tanhCurve(1.5);
  master.connect(compressor).connect(limiter).connect(clip).connect(context.destination);

  const convolver = context.createConvolver();
  convolver.buffer = impulseResponse(context, 3.6);
  const reverbReturn = context.createGain();
  reverbReturn.gain.value = 0.8;
  convolver.connect(reverbReturn).connect(master);
  const reverb = context.createGain();
  reverb.connect(convolver);

  const bus = (name: BusName): GainNode => {
    const gain = context.createGain();
    gain.gain.value = BUS_LEVEL[name];
    gain.connect(master);
    const send = context.createGain();
    send.gain.value = BUS_REVERB[name];
    gain.connect(send).connect(convolver);
    return gain;
  };

  return {
    context,
    buses: { ambience: bus('ambience'), dragon: bus('dragon'), fire: bus('fire'), impacts: bus('impacts'), town: bus('town') },
    reverb,
    master,
    noise: {
      white: fillNoise(context, 2, whiteNoise),
      pink: fillNoise(context, 4, pinkNoise),
      brown: fillNoise(context, 4, brownNoise),
      crackle: fillNoise(context, 5, crackleNoise),
    },
    drive: tanhCurve(3),
    listener: { x: 0, y: 0, z: 0 },
  };
}

/** Schedules a breakpoint envelope: `points` are [seconds after `start`, value]. */
export function envelope(param: AudioParam, start: number, points: [number, number][], exponential = false): void {
  param.cancelScheduledValues(start);
  param.setValueAtTime(points[0][1], start + points[0][0]);
  for (const [offset, value] of points.slice(1)) {
    if (exponential) param.exponentialRampToValueAtTime(Math.max(value, 0.0001), start + offset);
    else param.linearRampToValueAtTime(value, start + offset);
  }
}

export function noise(mix: Mix, kind: keyof Mix['noise'], start: number, duration: number | null, rate = 1): AudioBufferSourceNode {
  const source = mix.context.createBufferSource();
  source.buffer = mix.noise[kind];
  source.loop = true;
  source.playbackRate.value = rate;
  source.start(start, random() * (source.buffer.duration - 0.1));
  if (duration !== null) source.stop(start + duration);
  return source;
}

export function oscillator(mix: Mix, type: OscillatorType, frequency: number, start: number, duration: number | null): OscillatorNode {
  const source = mix.context.createOscillator();
  source.type = type;
  source.frequency.value = frequency;
  source.start(start);
  if (duration !== null) source.stop(start + duration);
  return source;
}

export function filter(mix: Mix, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const node = mix.context.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

export function gain(mix: Mix, value: number): GainNode {
  const node = mix.context.createGain();
  node.gain.value = value;
  return node;
}

export function shaper(mix: Mix): WaveShaperNode {
  const node = mix.context.createWaveShaper();
  node.curve = mix.drive;
  node.oversample = '2x';
  return node;
}

export function distanceTo(mix: Mix, position: Point): number {
  return Math.hypot(position.x - mix.listener.x, position.y - mix.listener.y, position.z - mix.listener.z);
}

export function panner(mix: Mix, placement: Placement): PannerNode {
  const node = mix.context.createPanner();
  node.panningModel = placement.hrtf ? 'HRTF' : 'equalpower';
  node.distanceModel = 'inverse';
  node.refDistance = placement.reference;
  node.rolloffFactor = 1;
  node.maxDistance = 20_000;
  node.positionX.value = placement.position.x;
  node.positionY.value = placement.position.y;
  node.positionZ.value = placement.position.z;
  return node;
}

/** Air absorbs the top end: the further the source, the duller it arrives. */
export function airCutoff(distance: number): number {
  return Math.min(20_000, Math.max(650, 20_000 * Math.exp(-distance / 380)));
}

/**
 * Routes a voice to its bus. A placed voice passes through a distance low-pass and a panner, and
 * starts late by the time sound takes to cover the distance, so a far blast is seen before it is heard.
 */
export function route(mix: Mix, busName: BusName, when: number, placement?: Placement): { input: GainNode; start: number } {
  const input = mix.context.createGain();
  if (!placement) {
    input.connect(mix.buses[busName]);
    return { input, start: when };
  }
  const distance = distanceTo(mix, placement.position);
  const air = filter(mix, 'lowpass', airCutoff(distance), 0.5);
  input.connect(air).connect(panner(mix, placement)).connect(mix.buses[busName]);
  return { input, start: when + Math.min(MAX_SOUND_DELAY, distance / SPEED_OF_SOUND) };
}
