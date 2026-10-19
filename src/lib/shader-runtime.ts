/**
 * Binds every `[data-shader]` tile on the page, including the page background, to the shared
 * shader engine (src/lib/shader-engine.ts). The fullscreen stage is its own island,
 * src/components/ShaderStage.tsx.
 *
 * Each tile (`data-shader="id"`) holds a <canvas>, a <code data-shader-source="id"> with the
 * fragment body, a [data-error] element, and optionally a [data-play] button (labels via
 * data-label-play/-pause). A tile that starts with `data-paused` renders nothing until played.
 */
import { getShaderEngine, NO_WEBGL2, type ShaderView } from './shader-engine';

const TILE_MAX_WIDTH = 1280;

function bind(tile: HTMLElement): void {
  const engine = getShaderEngine();
  const id = tile.dataset.shader;
  const canvas = tile.querySelector('canvas');
  const errorOut = tile.querySelector<HTMLElement>('[data-error]');
  if (!id || !canvas || !errorOut) {
    console.error('Shader tile is missing its id, canvas, or error element', tile);
    return;
  }
  if (!engine.available) {
    errorOut.textContent = NO_WEBGL2;
    errorOut.hidden = false;
    return;
  }

  const playButton = tile.querySelector<HTMLButtonElement>('[data-play]');
  const view = engine.view(canvas, {
    shaderId: id,
    maxWidth: TILE_MAX_WIDTH,
    paused: tile.hasAttribute('data-paused'),
    onError(message: string | null): void {
      errorOut.textContent = message ?? '';
      errorOut.hidden = message === null;
    },
  });

  const setPaused = (target: ShaderView, paused: boolean): void => {
    engine.setPaused(target, paused);
    if (playButton) {
      const { labelPlay = 'Play', labelPause = 'Pause' } = playButton.dataset;
      playButton.textContent = paused ? labelPlay : labelPause;
      playButton.setAttribute('aria-pressed', String(!paused));
    }
    tile.toggleAttribute('data-paused', paused);
  };

  playButton?.addEventListener('click', () => setPaused(view, !view.paused));
  setPaused(view, view.paused);
  engine.observe(view);
}

function init(): void {
  const tiles = Array.from(document.querySelectorAll<HTMLElement>('[data-shader]'));
  if (tiles.length === 0) return;
  const engine = getShaderEngine();
  for (const code of document.querySelectorAll<HTMLElement>('[data-shader] code[data-shader-source]')) {
    const id = code.dataset.shaderSource;
    const source = code.textContent;
    if (id && source) engine.register(id, source);
  }
  for (const tile of tiles) bind(tile);
}

init();
