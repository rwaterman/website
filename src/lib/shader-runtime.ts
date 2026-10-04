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
 * a [data-error] element, and optionally [data-play] (labels via data-label-play/-pause)
 * and [data-fullscreen] buttons. A tile that starts with `data-paused` renders
 * nothing until played. Uniforms: iResolution, iTime, iMouse. Rendering pauses offscreen,
 * in hidden tabs, and under prefers-reduced-motion (one frame, then Play).
 * [data-random-shader] buttons open the stage on a random shader, [data-daily-shader] on
 * one that changes each UTC day, and `#<shader id>` in the URL on that shader.
 *
 * Stage controls are [data-stage-action] buttons, each with a key: prev/next (arrows),
 * random (R), tour (T), edit (E), save (S), link (C), close (Esc). The editor
 * ([data-stage-editor] with a [data-editor-input] textarea) recompiles the open shader as
 * its source changes; a source that fails to compile leaves the last good program running.
 */

const MAX_DPR = 2;
const TILE_MAX_WIDTH = 1280;
// ponytail: 1080p is plenty for the heavy raymarchers on an iGPU; raise if desktops want more.
const STAGE_MAX_WIDTH = 1920;
const IDLE_MS = 2500;
const EDIT_DEBOUNCE_MS = 300;
const TOUR_MS = 20_000;
const STATUS_MS = 1800;
const DAY_MS = 86_400_000;

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
  playButton: HTMLButtonElement | null;
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

  const build = (source: string): Program => {
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
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
  };

  const getProgram = (id: string): Program => {
    const cached = programs.get(id);
    if (cached) return cached;
    const source = sources.get(id);
    if (!source) throw new Error(`Unknown shader "${id}"`);
    const entry = build(source);
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
    if (target.playButton) {
      const { labelPlay = 'Play', labelPause = 'Pause' } = target.playButton.dataset;
      target.playButton.textContent = paused ? labelPlay : labelPause;
      target.playButton.setAttribute('aria-pressed', String(!paused));
    }
    target.root.toggleAttribute('data-paused', paused);
    if (!paused) schedule();
  };

  const createTarget = (root: HTMLElement, shaderId: string, maxWidth: number): Target => {
    const canvas = root.querySelector('canvas');
    const errorOut = root.querySelector<HTMLElement>('[data-error]');
    const playButton = root.querySelector<HTMLButtonElement>('[data-play]');
    const context = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !context || !errorOut) {
      throw new Error('Shader target is missing its canvas or error element');
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

    playButton?.addEventListener('click', () => setPaused(target, !target.paused));

    const track = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const scale = canvas.width / (rect.width || 1);
      target.mouse[0] = (event.clientX - rect.left) * scale;
      target.mouse[1] = (rect.height - (event.clientY - rect.top)) * scale;
    };
    canvas.addEventListener('pointermove', (event) => {
      track(event);
      if (target.paused && target.mouse[2]) {
        target.needsFrame = true;
        schedule();
      }
    });
    // Touch has no pointermove before the press, so the press position comes from this event.
    canvas.addEventListener('pointerdown', (event) => {
      track(event);
      target.mouse[2] = target.mouse[0];
      target.mouse[3] = target.mouse[1];
      canvas.setPointerCapture(event.pointerId);
    });
    const release = (): void => {
      target.mouse[2] = 0;
      target.mouse[3] = 0;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointerleave', release);
    canvas.addEventListener('pointercancel', release);

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

  const gridTiles = tiles.filter((tile) => !tile.hasAttribute('data-background'));
  const titles = new Map<string, string>();
  const captions = new Map<string, string>();
  for (const tile of gridTiles) {
    const id = tile.dataset.shader;
    if (!id) continue;
    titles.set(id, tile.querySelector('h3')?.textContent?.trim() ?? id);
    captions.set(id, tile.querySelector('[data-caption]')?.textContent?.trim() ?? '');
  }

  const originals = new Map(sources);
  const editor = stageRoot?.querySelector<HTMLElement>('[data-stage-editor]') ?? null;
  const editorInput = stageRoot?.querySelector<HTMLTextAreaElement>('[data-editor-input]') ?? null;
  const editorError = stageRoot?.querySelector<HTMLElement>('[data-editor-error]') ?? null;
  const statusOut = stageRoot?.querySelector<HTMLElement>('[data-stage-status]') ?? null;

  let idleTimer = 0;
  let statusTimer = 0;
  let editTimer = 0;
  let tourTimer = 0;

  const wake = (): void => {
    if (!stageRoot) return;
    stageRoot.removeAttribute('data-idle');
    clearTimeout(idleTimer);
    if (!stageOpen || (editor && !editor.hasAttribute('hidden'))) return;
    idleTimer = window.setTimeout(() => stageRoot.setAttribute('data-idle', ''), IDLE_MS);
  };

  const say = (message: string): void => {
    if (!statusOut) return;
    statusOut.textContent = message;
    clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => (statusOut.textContent = ''), STATUS_MS);
  };

  const setPressed = (action: string, pressed: boolean): void => {
    for (const button of stageRoot?.querySelectorAll(`[data-stage-action="${action}"][aria-pressed]`) ?? []) {
      button.setAttribute('aria-pressed', String(pressed));
    }
  };

  /** Shaders the stage can step through: the tiles the grid filter currently shows. */
  const pool = (): string[] => {
    const ids = gridTiles
      .filter((tile) => !tile.hidden)
      .map((tile) => tile.dataset.shader ?? '')
      .filter((id) => sources.has(id) && !broken.has(id));
    return ids.length > 0 ? ids : shaderIds;
  };

  const showEditorError = (message: string | null): void => {
    if (!editorError) return;
    editorError.textContent = message ?? '';
    editorError.hidden = message === null;
  };

  const openStage = (id: string): void => {
    if (!stageRoot || !stage) return;
    stage.shaderId = id;
    stage.needsFrame = true;
    stage.visible = true;
    const title = stageRoot.querySelector<HTMLElement>('[data-stage-title]');
    const caption = stageRoot.querySelector<HTMLElement>('[data-stage-caption]');
    if (title) title.textContent = titles.get(id) ?? id;
    if (caption) caption.textContent = captions.get(id) ?? '';
    clearTimeout(editTimer);
    if (editorInput) editorInput.value = sources.get(id) ?? '';
    showEditorError(null);
    history.replaceState(null, '', `#${id}`);
    if (!stageOpen) {
      stageOpen = true;
      stageRoot.hidden = false;
      document.body.style.overflow = 'hidden';
      // iOS Safari has no element fullscreen, and a link straight to a shader arrives without the
      // user gesture fullscreen needs; the fixed overlay already covers the viewport in both cases.
      if (navigator.userActivation?.isActive !== false) {
        void Promise.resolve(stageRoot.requestFullscreen?.()).catch(() => undefined);
      }
      stageRoot.focus();
    }
    wake();
    schedule();
  };

  const randomShader = (): string => {
    const choices = pool().filter((id) => !stageOpen || id !== stage?.shaderId);
    const pick = choices[Math.floor(Math.random() * choices.length)];
    return pick ?? shaderIds[0] ?? '';
  };

  const setTour = (on: boolean): void => {
    clearInterval(tourTimer);
    tourTimer = on ? window.setInterval(() => openStage(randomShader()), TOUR_MS) : 0;
    setPressed('tour', on);
  };

  const setEditor = (open: boolean): void => {
    if (!editor || !editorInput) return;
    editor.toggleAttribute('hidden', !open);
    setPressed('edit', open);
    if (open) {
      setTour(false);
      editorInput.focus();
    } else {
      stageRoot?.focus();
    }
    wake();
  };

  const closeStage = (): void => {
    if (!stageRoot || !stageOpen) return;
    stageOpen = false;
    setTour(false);
    setEditor(false);
    stageRoot.hidden = true;
    document.body.style.overflow = '';
    history.replaceState(null, '', location.pathname + location.search);
    if (document.fullscreenElement === stageRoot) void Promise.resolve(document.exitFullscreen()).catch(() => undefined);
    schedule();
  };

  const step = (delta: number): void => {
    if (!stage) return;
    const ids = pool();
    const index = Math.max(ids.indexOf(stage.shaderId), 0);
    openStage(ids[(index + delta + ids.length) % ids.length] ?? stage.shaderId);
  };

  /** Swaps in a new source for a shader everywhere it is drawn; a failed compile changes nothing. */
  const applySource = (id: string, source: string): void => {
    if (!gl) return;
    let next: Program;
    try {
      next = build(source);
    } catch (error) {
      showEditorError(error instanceof Error ? error.message : String(error));
      return;
    }
    const previous = programs.get(id);
    if (previous) gl.deleteProgram(previous.program);
    programs.set(id, next);
    sources.set(id, source);
    broken.delete(id);
    showEditorError(null);
    for (const target of stage ? [...targets, stage] : targets) {
      if (target.shaderId === id) target.needsFrame = true;
    }
    schedule();
  };

  const resetSource = (): void => {
    if (!stage || !editorInput) return;
    const original = originals.get(stage.shaderId);
    if (original === undefined) return;
    editorInput.value = original;
    applySource(stage.shaderId, original);
  };

  const savePng = (): void => {
    if (!stage) return;
    const { canvas, shaderId } = stage;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${shaderId}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
      say(`Saved ${shaderId}.png`);
    });
  };

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(location.href);
      say('Link copied');
    } catch (error) {
      console.error('[shader stage] copy link failed', error);
      say('Copy failed');
    }
  };

  const actions: Record<string, () => void> = {
    prev: () => step(-1),
    next: () => step(1),
    random: () => openStage(randomShader()),
    tour: () => {
      setTour(!tourTimer);
      say(tourTimer ? `Tour on · every ${TOUR_MS / 1000}s` : 'Tour off');
    },
    edit: () => setEditor(editor?.hasAttribute('hidden') ?? false),
    reset: resetSource,
    save: savePng,
    link: () => void copyLink(),
    close: closeStage,
    pause: () => {
      if (stage) setPaused(stage, !stage.paused);
    },
  };
  const keys: Record<string, string> = {
    escape: 'close',
    arrowleft: 'prev',
    arrowright: 'next',
    ' ': 'pause',
    r: 'random',
    t: 'tour',
    e: 'edit',
    s: 'save',
    c: 'link',
  };

  if (stageRoot) {
    try {
      stage = createTarget(stageRoot, shaderIds[0] ?? '', STAGE_MAX_WIDTH);
    } catch (error) {
      console.error(error);
    }
  }

  for (const tile of gridTiles) {
    const id = tile.dataset.shader;
    tile.querySelector<HTMLButtonElement>('[data-fullscreen]')?.addEventListener('click', () => {
      if (id) openStage(id);
    });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-random-shader]')) {
    button.addEventListener('click', () => openStage(randomShader()));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-daily-shader]')) {
    const ids = Array.from(titles.keys());
    button.addEventListener('click', () => openStage(ids[Math.floor(Date.now() / DAY_MS) % ids.length] ?? ''));
  }
  stageRoot?.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-stage-action]');
    const action = actions[button?.dataset.stageAction ?? ''];
    if (action) action();
  });
  stageRoot?.addEventListener('pointermove', wake);
  stageRoot?.addEventListener('pointerdown', wake);

  editorInput?.addEventListener('input', () => {
    const id = stage?.shaderId;
    clearTimeout(editTimer);
    if (id) editTimer = window.setTimeout(() => applySource(id, editorInput.value), EDIT_DEBOUNCE_MS);
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && stageOpen) closeStage();
    // Fullscreen engages asynchronously, so it can land after the stage has already closed.
    else if (document.fullscreenElement === stageRoot && !stageOpen) {
      void Promise.resolve(document.exitFullscreen()).catch(() => undefined);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (!stageOpen || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target === editorInput) {
      if (event.key === 'Escape') closeStage();
      return;
    }
    const action = actions[keys[event.key.toLowerCase()] ?? ''];
    if (!action) return;
    event.preventDefault();
    action();
    wake();
  });

  const openFromHash = (): void => {
    const id = location.hash.slice(1);
    if (titles.has(id)) openStage(id);
    else if (stageOpen) closeStage();
  };
  window.addEventListener('hashchange', openFromHash);
  openFromHash();

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
