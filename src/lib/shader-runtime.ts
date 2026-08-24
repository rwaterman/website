/**
 * Client-side runner for every `[data-shader]` tile on the page plus the `[data-stage]`
 * fullscreen overlay.
 *
 * One shared offscreen WebGL2 canvas renders each visible target and the frame is
 * copied into that target's own 2D <canvas> — browsers cap live GL contexts at about
 * sixteen, so fifty tiles cannot each own one. Programs compile lazily, once per shader.
 *
 * Each tile (`data-shader="id"`) holds a <canvas>, a <code data-shader-source="id"> with a
 * Shadertoy-style fragment body (`void mainImage(out vec4 fragColor, in vec2 fragCoord)`),
 * a [data-play] button (labels via data-label-play/-pause), a [data-error] element, and
 * optionally a [data-fullscreen] button. A tile that starts with `data-paused` renders
 * nothing until played. Uniforms: iResolution, iTime, iMouse. Rendering pauses offscreen,
 * in hidden tabs, and under prefers-reduced-motion (one frame, then Play).
 * [data-random-shader] buttons open the stage on a random shader.
 */

const MAX_DPR = 2;
const TILE_MAX_WIDTH = 1280;
// ponytail: 1080p is plenty for the heavy raymarchers on an iGPU; raise if desktops want more.
const STAGE_MAX_WIDTH = 1920;
const IDLE_MS = 2500;

const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Two lines, so GLSL error line numbers are offset by exactly two.
const PREAMBLE = `#version 300 es
precision highp float; uniform vec3 iResolution; uniform float iTime; uniform vec4 iMouse; out vec4 outColor;
`;
const POSTAMBLE = `
void main() { mainImage(outColor, gl_FragCoord.xy); }`;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Program {
  program: WebGLProgram;
  resolution: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  mouse: WebGLUniformLocation | null;
}

interface Target {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  errorOut: HTMLElement;
  playButton: HTMLButtonElement;
  maxWidth: number;
  shaderId: string;
  mouse: [number, number, number, number];
  visible: boolean;
  paused: boolean;
  needsFrame: boolean;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader returned null');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed (line numbers are offset by 2):\n${log}`);
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

function init(): void {
  const tiles = Array.from(document.querySelectorAll<HTMLElement>('[data-shader]'));
  const stageRoot = document.querySelector<HTMLElement>('[data-stage]');
  if (tiles.length === 0) return;

  const sources = new Map<string, string>();
  for (const code of document.querySelectorAll<HTMLElement>('[data-shader] code[data-shader-source]')) {
    const id = code.dataset.shaderSource;
    const source = code.textContent;
    if (id && source) sources.set(id, source);
  }
  const shaderIds = Array.from(sources.keys());

  const glCanvas = document.createElement('canvas');
  const gl = glCanvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  const programs = new Map<string, Program>();
  const broken = new Map<string, string>();
  const targets: Target[] = [];
  let stage: Target | null = null;
  let stageOpen = false;
  let pendingFrame = 0;

  const getProgram = (id: string): Program => {
    const cached = programs.get(id);
    if (cached) return cached;
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    const source = sources.get(id);
    if (!source) throw new Error(`Unknown shader "${id}"`);
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, PREAMBLE + source + POSTAMBLE);
    const program = link(gl, vertex, fragment);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    const entry: Program = {
      program,
      resolution: gl.getUniformLocation(program, 'iResolution'),
      time: gl.getUniformLocation(program, 'iTime'),
      mouse: gl.getUniformLocation(program, 'iMouse'),
    };
    programs.set(id, entry);
    return entry;
  };

  const showError = (target: Target, message: string): void => {
    target.errorOut.textContent = message;
    target.errorOut.hidden = false;
  };

  const render = (target: Target, seconds: number): void => {
    if (!gl) return;
    const failure = broken.get(target.shaderId);
    if (failure) {
      showError(target, failure);
      return;
    }
    let program: Program;
    try {
      program = getProgram(target.shaderId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      broken.set(target.shaderId, message);
      console.error(`[shader ${target.shaderId}]`, message);
      showError(target, message);
      return;
    }
    target.errorOut.hidden = true;

    const cssWidth = target.canvas.clientWidth || 1;
    const cssHeight = target.canvas.clientHeight || 1;
    const width = Math.min(Math.round(cssWidth * Math.min(devicePixelRatio, MAX_DPR)), target.maxWidth);
    const height = Math.max(1, Math.round((width * cssHeight) / cssWidth));
    if (target.canvas.width !== width || target.canvas.height !== height) {
      target.canvas.width = width;
      target.canvas.height = height;
    }
    if (glCanvas.width < width) glCanvas.width = width;
    if (glCanvas.height < height) glCanvas.height = height;

    gl.viewport(0, 0, width, height);
    gl.useProgram(program.program);
    gl.uniform3f(program.resolution, width, height, 1);
    gl.uniform1f(program.time, seconds);
    gl.uniform4f(program.mouse, target.mouse[0], target.mouse[1], target.mouse[2], target.mouse[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // ponytail: drawImage from a GL canvas is a GPU copy in Chrome/Firefox; if Safari
    // profiles show a readback here, switch to OffscreenCanvas + transferToImageBitmap.
    target.context.drawImage(glCanvas, 0, glCanvas.height - height, width, height, 0, 0, width, height);
  };

  const active = (target: Target): boolean => target.visible && !target.paused;

  const frame = (now: number): void => {
    pendingFrame = 0;
    const seconds = now / 1000;
    const candidates = stageOpen && stage ? [stage] : targets;
    let animating = false;
    for (const target of candidates) {
      if (!target.visible) continue;
      if (!active(target) && !target.needsFrame) continue;
      target.needsFrame = false;
      render(target, seconds);
      if (active(target)) animating = true;
    }
    if (animating && !document.hidden) schedule();
  };

  const schedule = (): void => {
    if (!pendingFrame) pendingFrame = requestAnimationFrame(frame);
  };

  const setPaused = (target: Target, paused: boolean): void => {
    target.paused = paused;
    const { labelPlay = 'Play', labelPause = 'Pause' } = target.playButton.dataset;
    target.playButton.textContent = paused ? labelPlay : labelPause;
    target.playButton.setAttribute('aria-pressed', String(!paused));
    target.root.toggleAttribute('data-paused', paused);
    if (!paused) schedule();
  };

  const createTarget = (root: HTMLElement, shaderId: string, maxWidth: number): Target => {
    const canvas = root.querySelector('canvas');
    const errorOut = root.querySelector<HTMLElement>('[data-error]');
    const playButton = root.querySelector<HTMLButtonElement>('[data-play]');
    const context = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !context || !errorOut || !playButton) {
      throw new Error('Shader target is missing its canvas, error, or play element');
    }
    const target: Target = {
      root,
      canvas,
      context,
      errorOut,
      playButton,
      maxWidth,
      shaderId,
      mouse: [0, 0, 0, 0],
      visible: false,
      paused: reducedMotion || root.hasAttribute('data-paused'),
      needsFrame: !root.hasAttribute('data-paused'),
    };

    playButton.addEventListener('click', () => setPaused(target, !target.paused));

    canvas.addEventListener('pointermove', (event) => {
      const rect = canvas.getBoundingClientRect();
      const scale = canvas.width / (rect.width || 1);
      target.mouse[0] = (event.clientX - rect.left) * scale;
      target.mouse[1] = (rect.height - (event.clientY - rect.top)) * scale;
      if (target.paused && target.mouse[2]) {
        target.needsFrame = true;
        schedule();
      }
    });
    canvas.addEventListener('pointerdown', () => {
      target.mouse[2] = target.mouse[0];
      target.mouse[3] = target.mouse[1];
    });
    const release = (): void => {
      target.mouse[2] = 0;
      target.mouse[3] = 0;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointerleave', release);

    setPaused(target, target.paused);
    return target;
  };

  if (!gl) {
    for (const tile of tiles) {
      const errorOut = tile.querySelector<HTMLElement>('[data-error]');
      if (errorOut) {
        errorOut.textContent = 'WebGL2 is not available in this browser.';
        errorOut.hidden = false;
      }
    }
    return;
  }

  const visibility = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const target = targets.find((candidate) => candidate.canvas === entry.target);
        if (target) target.visible = entry.isIntersecting;
      }
      schedule();
    },
    { threshold: 0.1 },
  );

  for (const tile of tiles) {
    const id = tile.dataset.shader;
    if (!id || !sources.has(id)) continue;
    try {
      const target = createTarget(tile, id, TILE_MAX_WIDTH);
      targets.push(target);
      visibility.observe(target.canvas);
    } catch (error) {
      console.error(error);
    }
  }

  // --- Fullscreen stage -------------------------------------------------------------

  const titles = new Map<string, string>();
  for (const tile of tiles) {
    const id = tile.dataset.shader;
    const title = tile.querySelector('h3')?.textContent?.trim();
    if (id && title) titles.set(id, title);
  }

  let idleTimer = 0;
  const wake = (): void => {
    if (!stageRoot) return;
    stageRoot.removeAttribute('data-idle');
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => stageRoot.setAttribute('data-idle', ''), IDLE_MS);
  };

  const openStage = (id: string): void => {
    if (!stageRoot || !stage) return;
    stage.shaderId = id;
    stage.needsFrame = true;
    stage.visible = true;
    const title = stageRoot.querySelector<HTMLElement>('[data-stage-title]');
    if (title) title.textContent = titles.get(id) ?? id;
    if (!stageOpen) {
      stageOpen = true;
      stageRoot.hidden = false;
      document.body.style.overflow = 'hidden';
      // iOS Safari has no element fullscreen; the fixed overlay already covers the viewport.
      void Promise.resolve(stageRoot.requestFullscreen?.()).catch(() => undefined);
      stageRoot.focus();
    }
    wake();
    schedule();
  };

  const closeStage = (): void => {
    if (!stageRoot || !stageOpen) return;
    stageOpen = false;
    stageRoot.hidden = true;
    document.body.style.overflow = '';
    clearTimeout(idleTimer);
    if (document.fullscreenElement === stageRoot) void Promise.resolve(document.exitFullscreen()).catch(() => undefined);
    schedule();
  };

  const randomShader = (): string => {
    const choices = shaderIds.filter((id) => !broken.has(id) && (!stageOpen || id !== stage?.shaderId));
    const pick = choices[Math.floor(Math.random() * choices.length)];
    return pick ?? shaderIds[0] ?? '';
  };

  if (stageRoot) {
    try {
      stage = createTarget(stageRoot, shaderIds[0] ?? '', STAGE_MAX_WIDTH);
    } catch (error) {
      console.error(error);
    }
  }

  for (const tile of tiles) {
    const id = tile.dataset.shader;
    tile.querySelector<HTMLButtonElement>('[data-fullscreen]')?.addEventListener('click', () => {
      if (id) openStage(id);
    });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-random-shader]')) {
    button.addEventListener('click', () => openStage(randomShader()));
  }
  stageRoot?.querySelector<HTMLButtonElement>('[data-stage-close]')?.addEventListener('click', closeStage);
  stageRoot?.addEventListener('pointermove', wake);
  stageRoot?.addEventListener('pointerdown', wake);

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && stageOpen) closeStage();
  });
  document.addEventListener('keydown', (event) => {
    if (!stageOpen || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape') closeStage();
    else if (event.key === 'r' || event.key === 'R') openStage(randomShader());
    else if (event.key === ' ' && stage) {
      event.preventDefault();
      setPaused(stage, !stage.paused);
    } else return;
    wake();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule();
  });
  window.addEventListener('resize', () => {
    for (const target of targets) target.needsFrame = true;
    if (stage) stage.needsFrame = true;
    schedule();
  });

  glCanvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    programs.clear();
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    pendingFrame = 0;
  });
  glCanvas.addEventListener('webglcontextrestored', () => {
    for (const target of targets) target.needsFrame = true;
    schedule();
  });
}

init();
