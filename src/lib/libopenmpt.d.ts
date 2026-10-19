/**
 * The slice of the Emscripten libopenmpt build (shipped by the chiptune3 package) that
 * tracker.worklet.ts calls. Every `module` and `pointer` is a byte offset into the WASM heap.
 * C API reference: https://lib.openmpt.org/doc/group__libopenmpt__c.html
 */
declare module 'chiptune3/libopenmpt.worklet.js' {
  export interface Libopenmpt {
    HEAPU8: Uint8Array;
    HEAPF32: Float32Array;
    _malloc(bytes: number): number;
    _free(pointer: number): void;
    stackSave(): number;
    stackAlloc(bytes: number): number;
    stackRestore(stack: number): void;
    UTF8ToString(pointer: number): string;
    _openmpt_free_string(pointer: number): void;
    _openmpt_module_create_from_memory(data: number, bytes: number, log: number, user: number, ctls: number): number;
    _openmpt_module_destroy(module: number): void;
    _openmpt_module_set_repeat_count(module: number, count: number): void;
    _openmpt_module_read_float_stereo(module: number, sampleRate: number, frames: number, left: number, right: number): number;
    _openmpt_module_set_position_seconds(module: number, seconds: number): number;
    _openmpt_module_get_position_seconds(module: number): number;
    _openmpt_module_get_duration_seconds(module: number): number;
    _openmpt_module_get_metadata(module: number, key: number): number;
    _openmpt_module_get_num_channels(module: number): number;
    _openmpt_module_get_num_orders(module: number): number;
    _openmpt_module_get_num_patterns(module: number): number;
    _openmpt_module_get_num_samples(module: number): number;
    _openmpt_module_get_num_instruments(module: number): number;
    _openmpt_module_get_sample_name(module: number, index: number): number;
    _openmpt_module_get_instrument_name(module: number, index: number): number;
    _openmpt_module_get_order_pattern(module: number, order: number): number;
    _openmpt_module_get_pattern_num_rows(module: number, pattern: number): number;
    _openmpt_module_format_pattern_row_channel(
      module: number,
      pattern: number,
      row: number,
      channel: number,
      width: number,
      pad: number,
    ): number;
    _openmpt_module_get_current_order(module: number): number;
    _openmpt_module_get_current_pattern(module: number): number;
    _openmpt_module_get_current_row(module: number): number;
    _openmpt_module_get_current_speed(module: number): number;
    _openmpt_module_get_current_tempo2(module: number): number;
    _openmpt_module_get_current_channel_vu_mono(module: number, channel: number): number;
  }

  export default function createLibopenmpt(): Promise<Libopenmpt>;
}
