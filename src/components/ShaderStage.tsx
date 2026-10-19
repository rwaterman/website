/**
 * The fullscreen shader stage, on /fun and /fun/shaders. It draws through the page's shared
 * shader engine (src/lib/shader-engine.ts) and is the only thing rendering while open.
 *
 * Openers live in the static page and work through the document: a tile's [data-fullscreen]
 * button opens that tile's shader, [data-random-shader] a random one, [data-daily-shader] one
 * that changes each UTC day, and `#<shader id>` in the URL that shader. Prev, Next, Random, and
 * Tour step through the tiles the grid filter shows, or every shader on a page without a grid.
 *
 * Keys: ←/→ browse, R random, T tour, E edit, S save PNG, C copy link, Space pause, Esc close,
 * and with `music` set, M asks the Mod Music File Museum for a random module by dispatching
 * `tracker:random` on document. The editor recompiles as the GLSL changes; a source that fails
 * to compile leaves the last good program running.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { getShaderEngine, type ShaderEngine, type ShaderView } from '../lib/shader-engine';

export interface StageShader {
  id: string;
  title: string;
  caption: string;
}

interface Props {
  shaders: StageShader[];
  /** The page has a Mod Music File Museum: offer the Mod (M) control. */
  music?: boolean;
}

// ponytail: 1080p is plenty for the heavy raymarchers on an iGPU; raise if desktops want more.
const STAGE_MAX_WIDTH = 1920;
const IDLE_MS = 2500;
const EDIT_DEBOUNCE_MS = 300;
const TOUR_MS = 20_000;
const STATUS_MS = 1800;
const DAY_MS = 86_400_000;

const KEYS: Record<string, Action> = {
  escape: 'close',
  arrowleft: 'prev',
  arrowright: 'next',
  ' ': 'pause',
  r: 'random',
  m: 'mod',
  t: 'tour',
  e: 'edit',
  s: 'save',
  c: 'link',
};

type Action = 'prev' | 'next' | 'random' | 'mod' | 'tour' | 'edit' | 'reset' | 'save' | 'link' | 'close' | 'pause';

/** Pages without a shader grid only have the background source; the rest load on first open. */
async function ensureSource(engine: ShaderEngine, id: string): Promise<void> {
  if (engine.has(id)) return;
  const { shaders } = await import('../config/shaders');
  for (const shader of shaders) engine.register(shader.id, shader.source);
}

async function enterFullscreen(root: HTMLElement): Promise<void> {
  try {
    await root.requestFullscreen?.();
  } catch (error) {
    // The fixed overlay already covers the viewport, so a refusal changes nothing visible.
    console.debug('[shader stage] fullscreen refused', error);
  }
}

async function exitFullscreen(): Promise<void> {
  try {
    await document.exitFullscreen();
  } catch (error) {
    console.debug('[shader stage] exit fullscreen failed', error);
  }
}

export default function ShaderStage({ shaders, music = false }: Props): ReactElement {
  const titles = new Map(shaders.map((shader) => [shader.id, shader]));
  const allIds = shaders.map((shader) => shader.id);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const engineRef = useRef<ShaderEngine | null>(null);
  const viewRef = useRef<ShaderView | null>(null);
  const openRef = useRef<string | null>(null);
  const editingRef = useRef(false);
  const timers = useRef({ idle: 0, status: 0, edit: 0 });

  const [ready, setReady] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [paused, setPausedState] = useState(false);
  const [editing, setEditingState] = useState(false);
  const [touring, setTouring] = useState(false);
  const [idle, setIdle] = useState(false);
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [editorError, setEditorError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const wake = (): void => {
    setIdle(false);
    clearTimeout(timers.current.idle);
    if (!openRef.current || editingRef.current) return;
    timers.current.idle = window.setTimeout(() => setIdle(true), IDLE_MS);
  };

  const say = (message: string): void => {
    setStatus(message);
    clearTimeout(timers.current.status);
    timers.current.status = window.setTimeout(() => setStatus(''), STATUS_MS);
  };

  /** Shaders the stage steps through: the tiles the grid filter shows, else every shader. */
  const pool = (): string[] => {
    const engine = engineRef.current;
    const tiles = Array.from(document.querySelectorAll<HTMLElement>('li[data-shader]'));
    const ids = tiles.length ? tiles.filter((tile) => !tile.hidden).map((tile) => tile.dataset.shader ?? '') : allIds;
    const usable = ids.filter((id) => titles.has(id) && !engine?.isBroken(id));
    return usable.length > 0 ? usable : allIds;
  };

  const randomShader = (): string => {
    const choices = pool().filter((id) => id !== openRef.current);
    return choices[Math.floor(Math.random() * choices.length)] ?? allIds[0] ?? '';
  };

  const open = async (id: string): Promise<void> => {
    const engine = engineRef.current;
    const view = viewRef.current;
    const root = rootRef.current;
    if (!engine || !view || !root || !titles.has(id)) return;
    try {
      await ensureSource(engine, id);
    } catch (error) {
      console.error('[shader stage] could not load the shader sources', error);
      say('Could not load the shaders — reload the page and try again');
      return;
    }
    const wasOpen = openRef.current !== null;
    openRef.current = id;
    clearTimeout(timers.current.edit);
    // Unhidden before fullscreen is requested, while the opening click still counts as a gesture.
    flushSync(() => {
      setOpenId(id);
      setSource(engine.source(id) ?? '');
      setEditorError(null);
    });
    engine.show(view, id);
    engine.setVisible(view, true);
    engine.solo(view);
    history.replaceState(null, '', `#${id}`);
    if (!wasOpen) {
      document.body.style.overflow = 'hidden';
      // iOS Safari has no element fullscreen, and a link straight to a shader arrives without the
      // user gesture fullscreen needs; the fixed overlay already covers the viewport in both cases.
      if (navigator.userActivation?.isActive !== false) void enterFullscreen(root);
      root.focus();
    }
    wake();
  };

  const setEditing = (next: boolean): void => {
    editingRef.current = next;
    setEditingState(next);
    if (next) setTouring(false);
    else rootRef.current?.focus();
    wake();
  };

  const close = (): void => {
    const engine = engineRef.current;
    const view = viewRef.current;
    if (!engine || !view || openRef.current === null) return;
    openRef.current = null;
    setOpenId(null);
    setTouring(false);
    editingRef.current = false;
    setEditingState(false);
    engine.setVisible(view, false);
    engine.solo(null);
    document.body.style.overflow = '';
    history.replaceState(null, '', location.pathname + location.search);
    if (document.fullscreenElement === rootRef.current) void exitFullscreen();
    wake();
  };

  const step = (delta: number): void => {
    const current = openRef.current;
    if (!current) return;
    const ids = pool();
    const index = Math.max(ids.indexOf(current), 0);
    void open(ids[(index + delta + ids.length) % ids.length] ?? current);
  };

  const apply = (id: string, next: string): void => {
    const engine = engineRef.current;
    if (engine) setEditorError(engine.replaceSource(id, next));
  };

  const setPaused = (next: boolean): void => {
    const engine = engineRef.current;
    const view = viewRef.current;
    if (engine && view) engine.setPaused(view, next);
    setPausedState(next);
  };

  const savePng = (): void => {
    const canvas = canvasRef.current;
    const id = openRef.current;
    if (!canvas || !id) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${id}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
      say(`Saved ${id}.png`);
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

  const actions: Record<Action, () => void> = {
    prev: () => step(-1),
    next: () => step(1),
    random: () => void open(randomShader()),
    mod: () => {
      if (!music) return;
      document.dispatchEvent(new CustomEvent('tracker:random'));
      // The museum puts the new piece on its placard before its download starts.
      const title = document.querySelector('[data-tracker-field="title"]')?.textContent?.trim();
      // ponytail: reports only the piece this key started; when it ends and the museum moves on,
      // the stage says nothing. Listen for a museum event here if that readout is wanted.
      say(title ? `♪ ${title}` : 'No museum on this page');
    },
    tour: () => {
      setTouring(!touring);
      say(touring ? 'Tour off' : `Tour on · every ${TOUR_MS / 1000}s`);
    },
    edit: () => setEditing(!editingRef.current),
    reset: () => {
      const id = openRef.current;
      const original = id ? engineRef.current?.original(id) : undefined;
      if (!id || original === undefined) return;
      clearTimeout(timers.current.edit);
      setSource(original);
      apply(id, original);
    },
    save: savePng,
    link: () => void copyLink(),
    close,
    pause: () => setPaused(!(viewRef.current?.paused ?? false)),
  };

  // Document listeners are bound once; this ref hands them the current render's handlers.
  const latest = useRef({ actions, open, close, randomShader, wake });
  useLayoutEffect(() => {
    latest.current = { actions, open, close, randomShader, wake };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const engine = getShaderEngine();
    const view = engine.view(canvas, {
      shaderId: allIds[0] ?? '',
      maxWidth: STAGE_MAX_WIDTH,
      paused: false,
      onError: setRenderError,
    });
    engineRef.current = engine;
    viewRef.current = view;
    setPausedState(view.paused);

    const onClick = (event: MouseEvent): void => {
      const target = event.target as Element;
      const { open: openShader, randomShader: pick } = latest.current;
      const tileButton = target.closest('[data-fullscreen]');
      if (tileButton) {
        const id = tileButton.closest<HTMLElement>('[data-shader]')?.dataset.shader;
        if (id) void openShader(id);
      } else if (target.closest('[data-random-shader]')) {
        void openShader(pick());
      } else if (target.closest('[data-daily-shader]')) {
        void openShader(allIds[Math.floor(Date.now() / DAY_MS) % allIds.length] ?? '');
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (!openRef.current || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target === editorRef.current) {
        if (event.key === 'Escape') latest.current.close();
        return;
      }
      const action = KEYS[event.key.toLowerCase()];
      if (!action || (action === 'mod' && !music)) return;
      event.preventDefault();
      latest.current.actions[action]();
      latest.current.wake();
    };
    const onFullscreen = (): void => {
      if (!document.fullscreenElement && openRef.current) latest.current.close();
      // Fullscreen engages asynchronously, so it can land after the stage has already closed.
      else if (document.fullscreenElement === root && !openRef.current) void exitFullscreen();
    };
    const onHash = (): void => {
      const id = location.hash.slice(1);
      if (titles.has(id)) void latest.current.open(id);
      else if (openRef.current) latest.current.close();
    };

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('hashchange', onHash);
    onHash();
    setReady(true);

    // Loaded ahead of the first open, so the opening click still counts as a gesture for fullscreen.
    const preload = async (): Promise<void> => {
      try {
        await ensureSource(engine, allIds[0] ?? '');
      } catch (error) {
        console.warn('[shader stage] shader sources failed to preload; the first open will retry', error);
      }
    };
    void preload();
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('hashchange', onHash);
      engine.release(view);
      for (const timer of Object.values(timers.current)) clearTimeout(timer);
    };
    // The shader list is static page data; listeners read everything else through `latest`.
  }, []);

  useEffect(() => {
    if (!touring) return;
    const timer = window.setInterval(() => void latest.current.open(latest.current.randomShader()), TOUR_MS);
    return () => clearInterval(timer);
  }, [touring]);

  useEffect(() => {
    if (editing) editorRef.current?.focus();
  }, [editing]);

  const onEdit = (next: string): void => {
    setSource(next);
    const id = openRef.current;
    clearTimeout(timers.current.edit);
    if (id) timers.current.edit = window.setTimeout(() => apply(id, next), EDIT_DEBOUNCE_MS);
  };

  const shown = openId ? titles.get(openId) : undefined;
  const button = (
    action: Action,
    label: ReactElement | string,
    extra: ButtonHTMLAttributes<HTMLButtonElement> = {},
  ): ReactElement => (
    <button type="button" className="stage-button" data-stage-action={action} onClick={actions[action]} {...extra}>
      {label}
    </button>
  );

  return (
    <div
      ref={rootRef}
      data-stage
      data-ready={ready ? '' : undefined}
      data-idle={idle ? '' : undefined}
      data-paused={paused ? '' : undefined}
      hidden={openId === null}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen shader"
      className="fixed inset-0 z-50 bg-black text-white outline-none"
      onPointerMove={wake}
      onPointerDown={wake}
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-none" aria-label="Fullscreen shader" />
      <p
        data-error
        hidden={renderError === null}
        className="absolute inset-x-0 top-0 m-4 bg-black/80 p-4 font-mono text-[0.8rem] leading-[1.5] whitespace-pre-wrap text-accent"
      >
        {renderError}
      </p>
      <div
        data-stage-editor
        hidden={!editing}
        className="absolute top-0 left-0 flex h-[60%] w-[min(44rem,100%)] flex-col bg-black/75 lg:h-[calc(100%-4.5rem)]"
      >
        <div className="flex items-center gap-2 border-b border-white/20 p-3">
          <span className="label mr-auto text-white/80">GLSL · recompiles as you type</span>
          {button('reset', 'Reset')}
          {button('edit', 'Hide')}
        </div>
        <textarea
          ref={editorRef}
          data-editor-input
          aria-label="GLSL fragment source"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          wrap="off"
          value={source}
          onChange={(event) => onEdit(event.target.value)}
          className="min-h-0 flex-auto resize-none bg-transparent p-4 font-mono text-[0.78rem] leading-[1.5] text-white outline-none"
        />
        <p
          data-editor-error
          hidden={editorError === null}
          role="status"
          className="max-h-[35%] overflow-y-auto border-t border-accent bg-black/80 p-3 font-mono text-[0.75rem] leading-[1.5] whitespace-pre-wrap text-accent"
        >
          {editorError}
        </p>
      </div>
      <div data-stage-bar className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 p-4 transition-opacity">
        <p className="mr-auto min-w-0">
          <span className="label text-white" data-stage-title>
            {shown?.title ?? openId}
          </span>
          <span className="label ml-2 hidden text-white/60 normal-case tracking-normal lg:inline" data-stage-caption>
            {shown?.caption}
          </span>
          <span className="label ml-2 text-accent" role="status" data-stage-status>
            {status}
          </span>
        </p>
        {button('prev', <kbd>←</kbd>, { 'aria-label': 'Previous shader' })}
        {button('next', <kbd>→</kbd>, { 'aria-label': 'Next shader' })}
        <button type="button" className="stage-button" data-play aria-pressed={!paused} onClick={actions.pause}>
          {paused ? 'Play' : 'Pause'}
        </button>
        {button('random', <>Random <kbd>R</kbd></>)}
        {music && button('mod', <>Mod <kbd>M</kbd></>)}
        {button('tour', <>Tour <kbd>T</kbd></>, { 'aria-pressed': touring })}
        {button('edit', <>Edit <kbd>E</kbd></>, { 'aria-pressed': editing })}
        {button('save', <>PNG <kbd>S</kbd></>)}
        {button('link', <>Link <kbd>C</kbd></>)}
        {button('close', <>Close <kbd>Esc</kbd></>)}
      </div>
    </div>
  );
}
