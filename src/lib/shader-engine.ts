/**
 * One shared offscreen WebGL2 canvas that renders every shader view on the page: the grid tiles,
 * the page background, and the fullscreen stage. Each frame is copied into the view's own 2D
 * <canvas> — browsers cap live GL contexts at about sixteen, so fifty tiles cannot each own one.
 * Programs compile lazily, once per shader.
 *
 * Sources are Shadertoy-style fragment bodies (`void mainImage(out vec4 fragColor, in vec2
 * fragCoord)`) registered by id. Uniforms: iResolution, iTime, iMouse. Rendering pauses for views
 * that are offscreen, in hidden tabs, and under prefers-reduced-motion (one frame, then Play).
 * While a view is solo (the stage), nothing else renders.
 *
 * Client-only: call getShaderEngine() from browser code, never at module scope of a component
 * that also renders on the server.
 */

const MAX_DPR = 2;

const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// #line resets the count so GLSL error line numbers match the shader body.
const PREAMBLE = `#version 300 es
precision highp float; uniform vec3 iResolution; uniform float iTime; uniform vec4 iMouse; out vec4 outColor;
#line 1
`;
const POSTAMBLE = `
void main() { mainImage(outColor, gl_FragCoord.xy); }`;

export const NO_WEBGL2 = 'WebGL2 is not available in this browser.';

interface Program {
  program: WebGLProgram;
  resolution: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  mouse: WebGLUniformLocation | null;
}

export interface ShaderViewOptions {
  shaderId: string;
  /** Widest backing store, in device pixels. */
  maxWidth: number;
  paused: boolean;
  /** Called when the view's compile error appears (a message) or clears (null). */
  onError(message: string | null): void;
}

export interface ShaderView {
  readonly canvas: HTMLCanvasElement;
  readonly shaderId: string;
  readonly paused: boolean;
}

interface View extends ShaderView {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  shaderId: string;
  paused: boolean;
  maxWidth: number;
  mouse: [number, number, number, number];
  visible: boolean;
  needsFrame: boolean;
  error: string | null;
  onError(message: string | null): void;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader returned null');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed:\n${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vertex: WebGLShader, fragment: WebGLShader): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram returned null');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown error';
    gl.deleteProgram(program);
    throw new Error(`Program link failed:\n${log}`);
  }
  return program;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class ShaderEngine {
  readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly glCanvas = document.createElement('canvas');
  private readonly gl = this.glCanvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  private readonly sources = new Map<string, string>();
  private readonly originals = new Map<string, string>();
  private readonly programs = new Map<string, Program>();
  private readonly broken = new Map<string, string>();
  private readonly views: View[] = [];
  private readonly visibility = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const view = this.views.find((candidate) => candidate.canvas === entry.target);
        if (view) view.visible = entry.isIntersecting;
      }
      this.schedule();
    },
    { threshold: 0.1 },
  );
  private soloView: View | null = null;
  private pendingFrame = 0;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.schedule();
    });
    window.addEventListener('resize', () => this.redrawAll());
    this.glCanvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.programs.clear();
      if (this.pendingFrame) cancelAnimationFrame(this.pendingFrame);
      this.pendingFrame = 0;
    });
    this.glCanvas.addEventListener('webglcontextrestored', () => this.redrawAll());
  }

  get available(): boolean {
    return this.gl !== null;
  }

  /** Adds a shader's source; the first source registered for an id is the one Reset returns to. */
  register(id: string, source: string): void {
    if (this.sources.has(id)) return;
    this.sources.set(id, source);
    this.originals.set(id, source);
  }

  has(id: string): boolean {
    return this.sources.has(id);
  }

  source(id: string): string | undefined {
    return this.sources.get(id);
  }

  original(id: string): string | undefined {
    return this.originals.get(id);
  }

  isBroken(id: string): boolean {
    return this.broken.has(id);
  }

  /** Starts drawing `shaderId` into `canvas`. Views only render once visible (see observe/setVisible). */
  view(canvas: HTMLCanvasElement, options: ShaderViewOptions): ShaderView {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Shader view canvas has no 2D context');
    const view: View = {
      canvas,
      context,
      shaderId: options.shaderId,
      paused: this.reducedMotion || options.paused,
      maxWidth: options.maxWidth,
      mouse: [0, 0, 0, 0],
      visible: false,
      needsFrame: !options.paused,
      error: null,
      onError: options.onError,
    };
    if (!this.gl) {
      this.setError(view, NO_WEBGL2);
      return view;
    }
    this.trackPointer(view);
    this.views.push(view);
    return view;
  }

  /** Stops drawing a view; its canvas keeps the last frame. */
  release(handle: ShaderView): void {
    const view = this.own(handle);
    if (!view) return;
    this.views.splice(this.views.indexOf(view), 1);
    this.visibility.unobserve(view.canvas);
    if (this.soloView === view) this.solo(null);
  }

  /** Renders the view while at least a tenth of it is on screen. */
  observe(handle: ShaderView): void {
    if (!this.gl) return;
    this.visibility.observe(handle.canvas);
  }

  setVisible(handle: ShaderView, visible: boolean): void {
    const view = this.own(handle);
    if (!view) return;
    view.visible = visible;
    view.needsFrame = visible;
    this.schedule();
  }

  show(handle: ShaderView, shaderId: string): void {
    const view = this.own(handle);
    if (!view) return;
    view.shaderId = shaderId;
    view.needsFrame = true;
    this.schedule();
  }

  setPaused(handle: ShaderView, paused: boolean): void {
    const view = this.own(handle);
    if (!view) return;
    view.paused = paused;
    if (!paused) this.schedule();
  }

  /** While a view is solo, it is the only one that renders. */
  solo(handle: ShaderView | null): void {
    this.soloView = handle ? (this.own(handle) ?? null) : null;
    this.schedule();
  }

  /**
   * Swaps in a new source for a shader everywhere it is drawn. Returns the compile error and
   * changes nothing when the source does not build.
   */
  replaceSource(id: string, source: string): string | null {
    if (!this.gl) return NO_WEBGL2;
    let next: Program;
    try {
      next = this.build(source);
    } catch (error) {
      return messageOf(error);
    }
    const previous = this.programs.get(id);
    if (previous) this.gl.deleteProgram(previous.program);
    this.programs.set(id, next);
    this.sources.set(id, source);
    this.broken.delete(id);
    for (const view of this.views) {
      if (view.shaderId === id) view.needsFrame = true;
    }
    this.schedule();
    return null;
  }

  private own(handle: ShaderView): View | undefined {
    return this.views.find((view) => view === handle);
  }

  private redrawAll(): void {
    for (const view of this.views) view.needsFrame = true;
    this.schedule();
  }

  private setError(view: View, message: string | null): void {
    if (view.error === message) return;
    view.error = message;
    view.onError(message);
  }

  private build(source: string): Program {
    const gl = this.gl;
    if (!gl) throw new Error(NO_WEBGL2);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, PREAMBLE + source + POSTAMBLE);
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    try {
      const program = link(gl, vertex, fragment);
      return {
        program,
        resolution: gl.getUniformLocation(program, 'iResolution'),
        time: gl.getUniformLocation(program, 'iTime'),
        mouse: gl.getUniformLocation(program, 'iMouse'),
      };
    } finally {
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    }
  }

  private program(id: string): Program | undefined {
    const cached = this.programs.get(id);
    if (cached) return cached;
    const source = this.sources.get(id);
    if (source === undefined) return undefined;
    const entry = this.build(source);
    this.programs.set(id, entry);
    return entry;
  }

  private render(view: View, seconds: number): void {
    const gl = this.gl;
    if (!gl) return;
    const failure = this.broken.get(view.shaderId);
    if (failure) {
      this.setError(view, failure);
      return;
    }
    let program: Program | undefined;
    try {
      program = this.program(view.shaderId);
    } catch (error) {
      const message = messageOf(error);
      this.broken.set(view.shaderId, message);
      console.error(`[shader ${view.shaderId}]`, message);
      this.setError(view, message);
      return;
    }
    // A view can be pointed at a shader whose source is still loading; it draws once it arrives.
    if (!program) return;
    this.setError(view, null);

    const { canvas } = view;
    const cssWidth = canvas.clientWidth || 1;
    const cssHeight = canvas.clientHeight || 1;
    const width = Math.min(Math.round(cssWidth * Math.min(devicePixelRatio, MAX_DPR)), view.maxWidth);
    const height = Math.max(1, Math.round((width * cssHeight) / cssWidth));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (this.glCanvas.width < width) this.glCanvas.width = width;
    if (this.glCanvas.height < height) this.glCanvas.height = height;

    gl.viewport(0, 0, width, height);
    gl.useProgram(program.program);
    gl.uniform3f(program.resolution, width, height, 1);
    gl.uniform1f(program.time, seconds);
    gl.uniform4f(program.mouse, view.mouse[0], view.mouse[1], view.mouse[2], view.mouse[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // ponytail: drawImage from a GL canvas is a GPU copy in Chrome/Firefox; if Safari
    // profiles show a readback here, switch to OffscreenCanvas + transferToImageBitmap.
    view.context.drawImage(this.glCanvas, 0, this.glCanvas.height - height, width, height, 0, 0, width, height);
  }

  private frame(now: number): void {
    this.pendingFrame = 0;
    const seconds = now / 1000;
    const candidates = this.soloView ? [this.soloView] : this.views;
    let animating = false;
    for (const view of candidates) {
      if (!view.visible) continue;
      const active = !view.paused;
      if (!active && !view.needsFrame) continue;
      view.needsFrame = false;
      this.render(view, seconds);
      if (active) animating = true;
    }
    if (animating && !document.hidden) this.schedule();
  }

  private schedule(): void {
    if (!this.pendingFrame) this.pendingFrame = requestAnimationFrame((now) => this.frame(now));
  }

  private trackPointer(view: View): void {
    const { canvas } = view;
    const track = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const scale = canvas.width / (rect.width || 1);
      view.mouse[0] = (event.clientX - rect.left) * scale;
      view.mouse[1] = (rect.height - (event.clientY - rect.top)) * scale;
    };
    canvas.addEventListener('pointermove', (event) => {
      track(event);
      if (view.paused && view.mouse[2]) {
        view.needsFrame = true;
        this.schedule();
      }
    });
    // Touch has no pointermove before the press, so the press position comes from this event.
    canvas.addEventListener('pointerdown', (event) => {
      track(event);
      view.mouse[2] = view.mouse[0];
      view.mouse[3] = view.mouse[1];
      canvas.setPointerCapture(event.pointerId);
    });
    const release = (): void => {
      view.mouse[2] = 0;
      view.mouse[3] = 0;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointerleave', release);
    canvas.addEventListener('pointercancel', release);
  }
}

let engine: ShaderEngine | undefined;

/** The page's one engine, created on first use. */
export function getShaderEngine(): ShaderEngine {
  engine ??= new ShaderEngine();
  return engine;
}
