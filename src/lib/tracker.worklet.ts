/**
 * AudioWorklet that performs tracker modules (MOD, S3M, XM, IT, …) with libopenmpt compiled to
 * WebAssembly. It runs on the audio thread, so Vite bundles it on its own and
 * tracker-player.ts loads the bundle with `audioWorklet.addModule`.
 *
 * The page posts a module file (`load`). The worklet answers `loaded` with everything that stays
 * fixed while the piece plays — names, the order list, every pattern as text — then `position`
 * about fifty times a second, then `ended`. Every event carries the id of the `load` it belongs
 * to, so the page can drop events from a piece it has already replaced.
 */
import createLibopenmpt, { type Libopenmpt } from 'chiptune3/libopenmpt.worklet.js';

export interface ModuleInfo {
  title: string;
  /** Long format name, e.g. "ProTracker MOD (M.K.)". */
  format: string;
  /** The tracker libopenmpt believes wrote the file. */
  tracker: string;
  durationSeconds: number;
  channels: number;
  /** Pattern index for each position in the order list. */
  orders: number[];
  /** One line of text per row, per pattern; channels are 13 characters wide, joined by " | ". */
  patterns: string[][];
  sampleNames: string[];
  instrumentNames: string[];
  /** The song message, where the format has one. */
  message: string;
}

export interface Position {
  seconds: number;
  order: number;
  pattern: number;
  row: number;
  /** Ticks per row. */
  speed: number;
  /** Beats per minute. */
  tempo: number;
  /** Volume unit level per channel, 0 to about 1. */
  levels: number[];
}

export type TrackerCommand =
  | { type: 'load'; id: number; bytes: ArrayBuffer }
  | { type: 'seek'; seconds: number }
  | { type: 'stop'; id: number };

export type TrackerEvent =
  | { type: 'loaded'; id: number; info: ModuleInfo }
  | { type: 'position'; id: number; position: Position }
  | { type: 'ended'; id: number }
  | { type: 'error'; id: number; message: string };

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

/** The audio thread asks for this many frames at a time. */
const QUANTUM_FRAMES = 128;
const POSITION_INTERVAL_FRAMES = 1024;
const FLOAT_BYTES = 4;

const libopenmptReady = createLibopenmpt();

class TrackerProcessor extends AudioWorkletProcessor {
  private lib: Libopenmpt | undefined;
  private module = 0;
  private id = 0;
  private channels = 0;
  private left = 0;
  private right = 0;
  private framesSincePosition = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<TrackerCommand>) => void this.handle(event.data);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const lib = this.lib;
    const output = outputs[0];
    if (!lib || !this.module || !output || output.length < 2) return true;

    const frames = lib._openmpt_module_read_float_stereo(this.module, sampleRate, QUANTUM_FRAMES, this.left, this.right);
    if (frames === 0) {
      this.unload();
      this.post({ type: 'ended', id: this.id });
      return true;
    }
    const left = this.left / FLOAT_BYTES;
    const right = this.right / FLOAT_BYTES;
    output[0].set(lib.HEAPF32.subarray(left, left + frames));
    output[1].set(lib.HEAPF32.subarray(right, right + frames));

    this.framesSincePosition += frames;
    if (this.framesSincePosition >= POSITION_INTERVAL_FRAMES) {
      this.framesSincePosition = 0;
      this.postPosition(lib);
    }
    return true;
  }

  private post(event: TrackerEvent): void {
    this.port.postMessage(event);
  }

  private async handle(command: TrackerCommand): Promise<void> {
    if (command.type === 'stop') {
      if (command.id < this.id) return;
      this.id = command.id;
      this.unload();
      return;
    }
    if (command.type === 'seek') {
      if (!this.lib || !this.module) return;
      this.lib._openmpt_module_set_position_seconds(this.module, command.seconds);
      this.postPosition(this.lib);
      return;
    }
    if (command.id < this.id) return;
    this.id = command.id;
    try {
      this.lib ??= await libopenmptReady;
      if (command.id !== this.id) return;
      this.load(this.lib, command.id, command.bytes);
    } catch (error) {
      if (command.id !== this.id) return;
      this.unload();
      this.post({ type: 'error', id: command.id, message: error instanceof Error ? error.message : String(error) });
    }
  }

  private load(lib: Libopenmpt, id: number, bytes: ArrayBuffer): void {
    this.unload();
    this.id = id;

    const file = lib._malloc(bytes.byteLength);
    lib.HEAPU8.set(new Uint8Array(bytes), file);
    const module = lib._openmpt_module_create_from_memory(file, bytes.byteLength, 0, 0, 0);
    // libopenmpt parses the whole file into its own structures, so the copy is not needed again.
    lib._free(file);
    if (!module) throw new Error('libopenmpt does not recognize this file as a tracker module.');

    // Play through once and report `ended`; the default repeats forever.
    lib._openmpt_module_set_repeat_count(module, 0);
    this.left ||= lib._malloc(QUANTUM_FRAMES * FLOAT_BYTES);
    this.right ||= lib._malloc(QUANTUM_FRAMES * FLOAT_BYTES);
    this.channels = lib._openmpt_module_get_num_channels(module);
    this.framesSincePosition = 0;

    this.post({ type: 'loaded', id, info: this.describe(lib, module) });
    this.module = module;
  }

  private unload(): void {
    if (this.lib && this.module) this.lib._openmpt_module_destroy(this.module);
    this.module = 0;
  }

  private postPosition(lib: Libopenmpt): void {
    const module = this.module;
    this.post({
      type: 'position',
      id: this.id,
      position: {
        seconds: lib._openmpt_module_get_position_seconds(module),
        order: lib._openmpt_module_get_current_order(module),
        pattern: lib._openmpt_module_get_current_pattern(module),
        row: lib._openmpt_module_get_current_row(module),
        speed: lib._openmpt_module_get_current_speed(module),
        tempo: lib._openmpt_module_get_current_tempo2(module),
        levels: Array.from({ length: this.channels }, (_, channel) =>
          lib._openmpt_module_get_current_channel_vu_mono(module, channel),
        ),
      },
    });
  }

  private describe(lib: Libopenmpt, module: number): ModuleInfo {
    /** Reads a string libopenmpt allocated for the caller, then frees it. */
    const take = (pointer: number): string => {
      const text = lib.UTF8ToString(pointer);
      lib._openmpt_free_string(pointer);
      return text;
    };
    const metadata = (key: string): string => {
      const stack = lib.stackSave();
      const keyPointer = lib.stackAlloc(key.length + 1);
      for (let index = 0; index < key.length; index++) lib.HEAPU8[keyPointer + index] = key.charCodeAt(index);
      lib.HEAPU8[keyPointer + key.length] = 0;
      const value = take(lib._openmpt_module_get_metadata(module, keyPointer));
      lib.stackRestore(stack);
      return value;
    };
    const names = (count: number, name: (index: number) => number): string[] =>
      Array.from({ length: count }, (_, index) => take(name(index)));

    const channels = lib._openmpt_module_get_num_channels(module);
    // ponytail: every pattern is formatted up front and cloned to the page in one message — a few
    // hundred KB for 4-channel classics, several MB for a 64-channel epic. Format patterns on
    // request if a module ever stalls on load.
    const patterns = Array.from({ length: lib._openmpt_module_get_num_patterns(module) }, (_, pattern) =>
      Array.from({ length: lib._openmpt_module_get_pattern_num_rows(module, pattern) }, (_, row) =>
        Array.from({ length: channels }, (_, channel) =>
          take(lib._openmpt_module_format_pattern_row_channel(module, pattern, row, channel, 0, 1)),
        ).join(' | '),
      ),
    );

    return {
      title: metadata('title'),
      format: metadata('type_long'),
      tracker: metadata('tracker'),
      durationSeconds: lib._openmpt_module_get_duration_seconds(module),
      channels,
      orders: Array.from({ length: lib._openmpt_module_get_num_orders(module) }, (_, order) =>
        lib._openmpt_module_get_order_pattern(module, order),
      ),
      patterns,
      sampleNames: names(lib._openmpt_module_get_num_samples(module), (index) =>
        lib._openmpt_module_get_sample_name(module, index),
      ),
      instrumentNames: names(lib._openmpt_module_get_num_instruments(module), (index) =>
        lib._openmpt_module_get_instrument_name(module, index),
      ),
      message: metadata('message_raw'),
    };
  }
}

registerProcessor('tracker', TrackerProcessor);
