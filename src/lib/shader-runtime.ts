/**
 * Client-side WebGL2 runner for every `[data-shader]` tile on the page.
 *
 * Each tile holds a <canvas>, a <code> with a Shadertoy-style fragment body
 * (`void mainImage(out vec4 fragColor, in vec2 fragCoord)`), a [data-play] button,
 * and a [data-error] element. Uniforms: iResolution, iTime, iMouse. Rendering pauses
 * offscreen, in hidden tabs, and under prefers-reduced-motion (one frame, then Play).
 */

const MAX_DPR = 2;
const MAX_WIDTH = 1280;

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

interface Uniforms {
  resolution: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  mouse: WebGLUniformLocation | null;
}

function initTile(tile: HTMLElement): void {
  const canvas = tile.querySelector('canvas');
  const source = tile.querySelector('code')?.textContent;
  const errorOut = tile.querySelector<HTMLElement>('[data-error]');
  const playButton = tile.querySelector<HTMLButtonElement>('[data-play]');
  if (!canvas || !source || !errorOut || !playButton) {
    throw new Error('Shader tile is missing its canvas, source, error, or play element');
  }

  const fail = (message: string): void => {
    errorOut.textContent = message;
    errorOut.hidden = false;
    console.error(message);
  };

  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
  if (!gl) {
    fail('WebGL2 is not available in this browser.');
    return;
  }

  let program: WebGLProgram | null = null;
  let uniforms: Uniforms = { resolution: null, time: null, mouse: null };
  const mouse = [0, 0, 0, 0];
  let visible = false;
  let userPaused = reducedMotion;
  let pendingFrame = 0;
  // ponytail: time keeps running while paused, so resuming jumps ahead; add an offset if it shows.
  const start = performance.now();

  const setup = (): void => {
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, PREAMBLE + source + POSTAMBLE);
    program = link(gl, vertex, fragment);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    uniforms = {
      resolution: gl.getUniformLocation(program, 'iResolution'),
      time: gl.getUniformLocation(program, 'iTime'),
      mouse: gl.getUniformLocation(program, 'iMouse'),
    };
  };

  const resize = (): void => {
    const cssWidth = canvas.clientWidth || 1;
    const cssHeight = canvas.clientHeight || 1;
    const width = Math.min(Math.round(cssWidth * Math.min(devicePixelRatio, MAX_DPR)), MAX_WIDTH);
    const height = Math.round((width * cssHeight) / cssWidth);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  };

  const running = (): boolean => visible && !document.hidden && !userPaused;

  const schedule = (): void => {
    if (!pendingFrame) pendingFrame = requestAnimationFrame(frame);
  };

  const frame = (now: number): void => {
    pendingFrame = 0;
    if (!program) return;
    resize();
    gl.useProgram(program);
    gl.uniform3f(uniforms.resolution, canvas.width, canvas.height, 1);
    gl.uniform1f(uniforms.time, (now - start) / 1000);
    gl.uniform4f(uniforms.mouse, mouse[0] ?? 0, mouse[1] ?? 0, mouse[2] ?? 0, mouse[3] ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (running()) schedule();
  };

  const setPaused = (paused: boolean): void => {
    userPaused = paused;
    playButton.textContent = paused ? 'Play' : 'Pause';
    playButton.setAttribute('aria-pressed', String(!paused));
    tile.toggleAttribute('data-paused', paused);
    if (!paused) schedule();
  };

  try {
    setup();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }

  new IntersectionObserver(
    (entries) => {
      for (const entry of entries) visible = entry.isIntersecting;
      if (visible) schedule();
    },
    { threshold: 0.1 },
  ).observe(canvas);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule();
  });

  playButton.addEventListener('click', () => setPaused(!userPaused));

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / (rect.width || 1);
    mouse[0] = (event.clientX - rect.left) * scale;
    mouse[1] = (rect.height - (event.clientY - rect.top)) * scale;
    if (userPaused && mouse[2]) schedule();
  });
  canvas.addEventListener('pointerdown', () => {
    mouse[2] = mouse[0] ?? 0;
    mouse[3] = mouse[1] ?? 0;
  });
  const release = (): void => {
    mouse[2] = 0;
    mouse[3] = 0;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointerleave', release);

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    pendingFrame = 0;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      setup();
      schedule();
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  });

  setPaused(userPaused);
  frame(performance.now());
}

// Tiles get their GL context only when they first approach the viewport, so a page
// with many shaders does not open every context (browsers cap them) at load.
const lazyInit = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      lazyInit.unobserve(entry.target);
      try {
        initTile(entry.target as HTMLElement);
      } catch (error) {
        console.error(error);
      }
    }
  },
  { rootMargin: '200px' },
);

for (const tile of document.querySelectorAll<HTMLElement>('[data-shader]')) {
  lazyInit.observe(tile);
}
