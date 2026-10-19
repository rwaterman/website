/**
 * Runs the Mod Music File Museum (src/components/TrackerMuseum.astro). The film-strip reel and
 * the transport drive a TrackerPlayer; each animation frame paints the newest position the
 * worklet reported: time, order / pattern / row, speed and tempo, the order list, a level meter
 * with peak hold per channel, the pattern rows around the one being played, and a progress bar
 * along the bottom of the exhibit's frame.
 *
 * The reel is a native horizontal scroller. The chosen frame is centred under the gate, the
 * gate's readout names the year and era of whichever frame sits under it as the reel moves, and
 * a mouse can drag the reel. Arrow keys move focus along the frames; Enter or a click chooses.
 *
 * Under prefers-reduced-motion the meters and the scrolling pattern stay off and the numeric
 * readout still updates. When a piece ends the next exhibit starts, so one press of Play walks
 * the collection in order.
 *
 * Only Play starts a download. While nothing is playing, the list and Prev / Next change the
 * placard and nothing else, which is what the page and the legal notice promise. The one other
 * way a download starts is a `tracker:random` event on document, which the fullscreen shader
 * stage dispatches from its Mod (M) control, inside that click or key press.
 */
import { credit, downloadUrl, eras, exhibits, openingExhibit, pageUrl, yearLabel, type Exhibit } from '../config/tracker-museum';
import { TrackerPlayer } from './tracker-player';
import type { ModuleInfo, Position } from './tracker.worklet';

type State = 'idle' | 'loading' | 'playing' | 'paused';

const TOGGLE_LABELS: Record<State, string> = { idle: 'Play', loading: 'Loading', playing: 'Pause', paused: 'Play' };

/** What the pattern view shows before a file loads: four channels of empty cells. */
const IDLE_CHANNELS = 4;
const EMPTY_CELL = '... .. .. ...';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const VOLUME_KEY = 'tracker-museum:volume';
/** How far a level meter's peak marker falls per millisecond, in meter widths. */
const PEAK_DECAY_PER_MS = 0.0006;
/** Pointer travel, in pixels, before a press on the reel becomes a drag instead of a click. */
const DRAG_THRESHOLD = 5;

function need<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Mod Music File Museum markup is missing ${selector}`);
  return element;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${pad(Math.floor(seconds % 60))}`;
}

function storedVolume(): number | undefined {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const volume = raw === null ? Number.NaN : Number(raw);
    return volume >= 0 && volume <= 1 ? volume : undefined;
  } catch (error) {
    console.warn('Mod Music File Museum could not read the saved volume', error);
    return undefined;
  }
}

function storeVolume(volume: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch (error) {
    console.warn('Mod Music File Museum could not save the volume', error);
  }
}

/** Scrolls `container` along x so `item` sits in its middle, without moving the page. */
function centerIn(container: HTMLElement, item: HTMLElement, smooth: boolean): void {
  if (!container.clientWidth) return;
  const left = item.offsetLeft + item.offsetWidth / 2 - container.clientWidth / 2;
  container.scrollTo({ left, behavior: smooth && !reducedMotion ? 'smooth' : 'instant' });
}

interface Reel {
  /** Centres the frame for `index` under the gate. */
  center(index: number, smooth: boolean): void;
  /** Gives `index` the reel's single tab stop. */
  focusable(index: number): void;
}

/**
 * Wires the film strip: the gate readout follows the frame under it, a mouse drag scrolls the
 * reel and swallows the click that ends it, arrow keys rove focus, and the chosen frame is
 * re-centred whenever the reel changes size (including when its tab is first shown).
 */
function mountReel(root: HTMLElement, list: HTMLElement, frames: HTMLButtonElement[], chosen: () => number): Reel {
  const slots = frames.map((frame) => frame.parentElement ?? frame);
  const year = need<HTMLElement>(root, '[data-tracker-dial-year]');
  const era = need<HTMLElement>(root, '[data-tracker-dial-era]');
  let readoutFrame = 0;

  const paintReadout = (): void => {
    readoutFrame = 0;
    const middle = list.scrollLeft + list.clientWidth / 2;
    let nearest = frames[0];
    let distance = Number.POSITIVE_INFINITY;
    for (const [index, slot] of slots.entries()) {
      const gap = Math.abs(slot.offsetLeft + slot.offsetWidth / 2 - middle);
      if (gap < distance) [nearest, distance] = [frames[index], gap];
    }
    year.textContent = nearest?.dataset.frameYear ?? '';
    era.textContent = nearest?.dataset.eraTitle ?? '';
  };
  list.addEventListener('scroll', () => {
    readoutFrame ||= requestAnimationFrame(paintReadout);
  });

  const center = (index: number, smooth: boolean): void => {
    const slot = slots[index];
    if (slot) centerIn(list, slot, smooth);
  };
  new ResizeObserver(() => center(chosen(), false)).observe(list);

  let press: { x: number; scrollLeft: number; pointer: number } | undefined;
  let dragged = false;
  list.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    press = { x: event.clientX, scrollLeft: list.scrollLeft, pointer: event.pointerId };
    dragged = false;
  });
  list.addEventListener('pointermove', (event) => {
    if (!press || event.pointerId !== press.pointer) return;
    const travel = event.clientX - press.x;
    if (!dragged && Math.abs(travel) < DRAG_THRESHOLD) return;
    if (!dragged) {
      dragged = true;
      list.setPointerCapture(press.pointer);
      list.dataset.dragging = '';
    }
    list.scrollLeft = press.scrollLeft - travel;
  });
  const release = (): void => {
    press = undefined;
    delete list.dataset.dragging;
  };
  list.addEventListener('pointerup', release);
  list.addEventListener('pointercancel', release);
  list.addEventListener(
    'click',
    (event) => {
      if (!dragged) return;
      dragged = false;
      event.stopPropagation();
      event.preventDefault();
    },
    true,
  );

  const focusable = (index: number): void => {
    for (const [other, frame] of frames.entries()) frame.tabIndex = other === index ? 0 : -1;
  };
  list.addEventListener('keydown', (event) => {
    const index = frames.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: frames.length - 1 }[event.key];
    const frame = target === undefined ? undefined : frames[target];
    if (target === undefined || !frame) return;
    event.preventDefault();
    focusable(target);
    frame.focus({ preventScroll: true });
    center(target, true);
  });

  return { center, focusable };
}

/** The composer's sample or instrument names as numbered lines, after the song message if any. */
function linerNotes(info: ModuleInfo): string {
  const names = info.instrumentNames.some((name) => name.trim()) ? info.instrumentNames : info.sampleNames;
  const used = names.findLastIndex((name) => name.trim()) + 1;
  const lines = names.slice(0, used).map((name, index) => `${pad(index + 1)}  ${name}`);
  return [info.message.trim(), lines.join('\n')].filter(Boolean).join('\n\n');
}

function mount(root: HTMLElement): void {
  const opening = openingExhibit();

  const field = (name: string): HTMLElement => need(root, `[data-tracker-field="${name}"]`);
  const live = (name: string): HTMLElement => need(root, `[data-tracker-live="${name}"]`);
  const placard = {
    era: field('era'),
    title: field('title'),
    credit: field('credit'),
    origin: field('origin'),
    blurb: field('blurb'),
    file: field('file'),
  };
  const readout = {
    order: live('order'),
    pattern: live('pattern'),
    row: live('row'),
    speed: live('speed'),
    tempo: live('tempo'),
    channels: live('channels'),
  };
  const source = need<HTMLAnchorElement>(root, '[data-tracker-source]');
  const toggle = need<HTMLButtonElement>(root, '[data-tracker-toggle]');
  const seek = need<HTMLInputElement>(root, '[data-tracker-seek]');
  const time = need<HTMLElement>(root, '[data-tracker-time]');
  const remaining = need<HTMLElement>(root, '[data-tracker-remaining]');
  const exhibitIndex = need<HTMLElement>(root, '[data-tracker-index]');
  const volume = need<HTMLInputElement>(root, '[data-tracker-volume]');
  const orders = need<HTMLElement>(root, '[data-tracker-orders]');
  const idleOrders = orders.children.length;
  const status = need<HTMLElement>(root, '[data-tracker-status]');
  const idleHint = status.textContent?.trim() ?? '';
  const pattern = need<HTMLElement>(root, '[data-tracker-pattern]');
  const head = need<HTMLElement>(root, '[data-tracker-head]');
  const meters = need<HTMLElement>(root, '[data-tracker-meters]');
  const notes = need<HTMLDetailsElement>(root, '[data-tracker-notes]');
  const samples = need<HTMLElement>(root, '[data-tracker-samples]');
  const list = need<HTMLElement>(root, '[data-tracker-list]');
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-tracker-rows] > *'));
  const steps = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-tracker-step]'));
  const exhibitButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-tracker-exhibit]'));

  let current = opening;
  const reel = mountReel(root, list, exhibitButtons, () => exhibits.indexOf(current));
  let state: State = 'idle';
  let info: ModuleInfo | undefined;
  let position: Position | undefined;
  let fills: HTMLElement[] = [];
  let peakMarkers: HTMLElement[] = [];
  let peaks: number[] = [];
  let lastPaint = 0;
  let paintedOrder = -1;
  let orderCells: HTMLElement[] = [];
  let progress: HTMLElement | undefined;
  let gutter = 2;
  let paintedRow = '';
  let seeking = false;
  let frame = 0;

  const setState = (next: State, message: string): void => {
    state = next;
    document.documentElement.toggleAttribute('data-tracker-playing', next === 'playing');
    toggle.textContent = TOGGLE_LABELS[next];
    status.textContent = message;
  };

  const neighbor = (delta: number): Exhibit | undefined => exhibits[exhibits.indexOf(current) + delta];

  const setFacts = (facts: string[]): void => {
    placard.file.replaceChildren(
      ...facts.filter(Boolean).map((fact) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = fact;
        return chip;
      }),
    );
  };

  /** Lays out the channel header and one level meter per channel. */
  const setChannels = (channels: number, digits: number): void => {
    gutter = digits;
    pattern.style.setProperty('--tracker-gutter', String(digits));
    const numbers = Array.from({ length: channels }, (_, channel) => channel + 1);
    head.textContent = `${' '.repeat(digits)} | ${numbers.map((channel) => `CH ${pad(channel)}`.padEnd(EMPTY_CELL.length)).join(' | ')}`;
    fills = numbers.map(() => document.createElement('i'));
    peakMarkers = numbers.map(() => document.createElement('b'));
    peaks = numbers.map(() => 0);
    meters.replaceChildren(
      ...numbers.map((_, channel) => {
        const meter = document.createElement('span');
        meter.append(fills[channel] ?? '', peakMarkers[channel] ?? '');
        return meter;
      }),
    );
  };

  /** Fills the order list with one cell per position, or placeholder cells before a file loads. */
  const setOrders = (patterns: number[] | undefined): void => {
    paintedOrder = -1;
    orderCells = (patterns ?? Array.from({ length: idleOrders }, () => -1)).map((pattern) => {
      const cell = document.createElement('li');
      cell.textContent = pattern < 0 ? '--' : pad(pattern);
      return cell;
    });
    orders.replaceChildren(...orderCells);
    orders.scrollLeft = 0;
  };

  const clearProgress = (): void => {
    if (progress) progress.style.transform = '';
  };

  const clearLive = (): void => {
    info = undefined;
    position = undefined;
    paintedRow = '';
    for (const element of Object.values(readout)) element.textContent = '--';
    setChannels(IDLE_CHANNELS, 2);
    setOrders(undefined);
    const emptyRow = Array.from({ length: IDLE_CHANNELS }, () => EMPTY_CELL).join(' | ');
    for (const [index, row] of rows.entries()) row.textContent = `${pad(index)} | ${emptyRow}`;
    time.textContent = '0:00 / 0:00';
    remaining.textContent = '\u00a0';
    clearProgress();
    seek.value = '0';
    seek.disabled = true;
    notes.hidden = true;
  };

  /** Puts an exhibit on the placard and marks it in the list, without playing it. */
  const show = (exhibit: Exhibit): void => {
    clearProgress();
    current = exhibit;
    clearLive();
    const era = eras.find((candidate) => candidate.id === exhibit.era);
    placard.era.textContent = `${yearLabel(exhibit)} · ${era?.title ?? exhibit.era}`;
    placard.title.textContent = exhibit.title;
    placard.credit.textContent = credit(exhibit);
    placard.origin.textContent = exhibit.origin;
    placard.blurb.textContent = exhibit.blurb;
    setFacts([exhibit.format]);
    source.href = pageUrl(exhibit);
    for (const step of steps) step.disabled = !neighbor(Number(step.dataset.trackerStep));

    const index = exhibits.indexOf(exhibit);
    exhibitIndex.textContent = `Exhibit ${pad(index + 1)} of ${exhibits.length}`;
    for (const [other, button] of exhibitButtons.entries()) {
      if (other === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
    progress = exhibitButtons[index]?.querySelector<HTMLElement>('.reel-frame__progress > i') ?? undefined;
    // Scroll the reel only: scrollIntoView would also drag the page back from the shaders.
    reel.focusable(index);
    reel.center(index, true);
  };

  const play = async (exhibit: Exhibit): Promise<void> => {
    show(exhibit);
    setState('loading', `Fetching ${exhibit.title} from The Mod Archive…`);
    try {
      await player.play(downloadUrl(exhibit));
    } catch (error) {
      console.error(error);
      // A newer request owns the display now; its outcome is the one to report.
      if (exhibit !== current) return;
      const reason = error instanceof Error ? error.message : String(error);
      setState('idle', `Could not load ${exhibit.title} (${reason}). Press Play to retry, or open it on The Mod Archive.`);
    }
  };

  const paintRows = (loaded: ModuleInfo, at: Position): void => {
    const lines = loaded.patterns[at.pattern] ?? [];
    const middle = (rows.length - 1) / 2;
    for (const [index, element] of rows.entries()) {
      const row = at.row + index - middle;
      const line = lines[row];
      element.textContent = line === undefined ? '' : `${pad(row, gutter)} | ${line}`;
    }
  };

  const paintOrder = (order: number): void => {
    if (order === paintedOrder) return;
    paintedOrder = order;
    for (const [index, cell] of orderCells.entries()) {
      cell.toggleAttribute('data-current', index === order);
      cell.toggleAttribute('data-played', index < order);
    }
    const cell = orderCells[order];
    if (cell) centerIn(orders, cell, false);
  };

  const paintMeters = (levels: number[], now: number): void => {
    const decay = (now - (lastPaint || now)) * PEAK_DECAY_PER_MS;
    lastPaint = now;
    for (const [channel, fill] of fills.entries()) {
      const level = Math.min(1, levels[channel] ?? 0);
      const peak = Math.max(level, (peaks[channel] ?? 0) - decay);
      peaks[channel] = peak;
      fill.style.setProperty('--level', String(level));
      peakMarkers[channel]?.style.setProperty('--peak', String(peak));
    }
  };

  const paint = (now: number): void => {
    frame = 0;
    if (!info || !position) return;
    time.textContent = `${clock(position.seconds)} / ${clock(info.durationSeconds)}`;
    remaining.textContent = `-${clock(Math.max(0, info.durationSeconds - position.seconds))}`;
    if (progress) progress.style.transform = `scaleX(${Math.min(1, position.seconds / (info.durationSeconds || 1))})`;
    if (!seeking) seek.value = String(position.seconds);
    readout.order.textContent = `${pad(position.order)}/${pad(info.orders.length - 1)}`;
    readout.pattern.textContent = pad(position.pattern);
    readout.row.textContent = `${pad(position.row)}/${pad((info.patterns[position.pattern]?.length ?? 1) - 1)}`;
    readout.speed.textContent = String(position.speed);
    readout.tempo.textContent = String(Math.round(position.tempo));
    paintOrder(position.order);
    if (reducedMotion) return;

    paintMeters(position.levels, now);
    const row = `${position.pattern}:${position.row}`;
    if (row === paintedRow) return;
    paintedRow = row;
    paintRows(info, position);
  };

  // ponytail: positions are painted as rendered, ahead of the speakers by the output latency
  // (tens of milliseconds). Queue them against AudioContext.outputLatency if the playhead ever
  // visibly leads the sound.
  const player = new TrackerPlayer({
    onLoaded(loaded) {
      info = loaded;
      seek.max = String(loaded.durationSeconds);
      seek.disabled = false;

      setFacts([
        loaded.format,
        count(loaded.channels, 'channel'),
        count(loaded.patterns.length, 'pattern'),
        count(loaded.sampleNames.length, 'sample'),
        loaded.tracker,
      ]);
      const longestPattern = Math.max(...loaded.patterns.map((lines) => lines.length));
      setChannels(loaded.channels, Math.max(2, String(longestPattern - 1).length));
      setOrders(loaded.orders);
      readout.channels.textContent = String(loaded.channels);

      const liner = current.withholdSampleText ? '' : linerNotes(loaded);
      samples.textContent = liner;
      notes.hidden = !liner;
      setState('playing', 'Playing.');
    },
    onPosition(next) {
      position = next;
      frame ||= requestAnimationFrame(paint);
    },
    onEnded() {
      const next = neighbor(1);
      if (next) {
        void play(next);
        return;
      }
      clearLive();
      setState('idle', 'That was the last exhibit.');
    },
    onError(message) {
      clearLive();
      setState('idle', `${current.title} would not play: ${message}`);
    },
  });

  const onToggle = async (): Promise<void> => {
    if (state === 'idle') {
      await play(current);
    } else if (state === 'playing') {
      await player.pause();
      setState('paused', 'Paused.');
    } else if (state === 'paused') {
      await player.resume();
      setState('playing', 'Playing.');
    }
  };

  /** Switches to an exhibit: plays it if the player is running, otherwise only shows it. */
  const choose = (exhibit: Exhibit | undefined): void => {
    if (!exhibit) return;
    if (state !== 'idle') {
      void play(exhibit);
      return;
    }
    show(exhibit);
    setState('idle', idleHint);
  };

  toggle.addEventListener('click', () => void onToggle());
  for (const step of steps) {
    step.addEventListener('click', () => choose(neighbor(Number(step.dataset.trackerStep))));
  }
  for (const button of exhibitButtons) {
    button.addEventListener('click', () =>
      choose(exhibits.find((candidate) => String(candidate.modarchiveId) === button.dataset.trackerExhibit)),
    );
  }
  seek.addEventListener('input', () => {
    seeking = true;
    if (info) time.textContent = `${clock(Number(seek.value))} / ${clock(info.durationSeconds)}`;
  });
  const savedVolume = storedVolume();
  if (savedVolume !== undefined) volume.value = String(savedVolume);
  player.setVolume(Number(volume.value));
  volume.addEventListener('input', () => {
    player.setVolume(Number(volume.value));
    storeVolume(Number(volume.value));
  });
  seek.addEventListener('change', () => {
    seeking = false;
    void player.seek(Number(seek.value));
  });
  document.addEventListener('tracker:random', () => {
    const others = exhibits.filter((exhibit) => exhibit !== current);
    void play(others[Math.floor(Math.random() * others.length)] ?? current);
  });

  if (reducedMotion) {
    pattern.hidden = true;
    need<HTMLElement>(root, '[data-tracker-still]').hidden = false;
  }
  show(opening);
}

const root = document.querySelector<HTMLElement>('[data-tracker]');
if (root) mount(root);
