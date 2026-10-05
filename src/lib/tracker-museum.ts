/**
 * Runs the Tracker Museum section (src/components/TrackerMuseum.astro). The exhibit list and
 * the transport drive a TrackerPlayer; each animation frame paints the newest position the
 * worklet reported: time, order / pattern / row, speed and tempo, a level meter per channel,
 * and the pattern rows around the one being played.
 *
 * Under prefers-reduced-motion the meters and the scrolling pattern stay off and the numeric
 * readout still updates. When a piece ends the next exhibit starts, so one press of Play walks
 * the collection in order.
 *
 * Only Play starts a download. While nothing is playing, the list and Prev / Next change the
 * placard and nothing else, which is what the page and the legal notice promise.
 */
import { credit, downloadUrl, eras, exhibits, pageUrl, yearLabel, type Exhibit } from '../config/tracker-museum';
import { TrackerPlayer } from './tracker-player';
import type { ModuleInfo, Position } from './tracker.worklet';

type State = 'idle' | 'loading' | 'playing' | 'paused';

const TOGGLE_LABELS: Record<State, string> = { idle: 'Play', loading: 'Loading', playing: 'Pause', paused: 'Play' };

/** What the pattern view shows before a file loads: four channels of empty cells. */
const IDLE_CHANNELS = 4;
const EMPTY_CELL = '... .. .. ...';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function need<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Tracker Museum markup is missing ${selector}`);
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

/** The composer's sample or instrument names as numbered lines, after the song message if any. */
function linerNotes(info: ModuleInfo): string {
  const names = info.instrumentNames.some((name) => name.trim()) ? info.instrumentNames : info.sampleNames;
  const used = names.findLastIndex((name) => name.trim()) + 1;
  const lines = names.slice(0, used).map((name, index) => `${pad(index + 1)}  ${name}`);
  return [info.message.trim(), lines.join('\n')].filter(Boolean).join('\n\n');
}

function mount(root: HTMLElement): void {
  const opening = exhibits[0];
  if (!opening) return;

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
  const readout = { order: live('order'), pattern: live('pattern'), row: live('row'), speed: live('speed'), tempo: live('tempo') };
  const source = need<HTMLAnchorElement>(root, '[data-tracker-source]');
  const toggle = need<HTMLButtonElement>(root, '[data-tracker-toggle]');
  const seek = need<HTMLInputElement>(root, '[data-tracker-seek]');
  const time = need<HTMLElement>(root, '[data-tracker-time]');
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
  let state: State = 'idle';
  let info: ModuleInfo | undefined;
  let position: Position | undefined;
  let fills: HTMLElement[] = [];
  let gutter = 2;
  let paintedRow = '';
  let seeking = false;
  let frame = 0;

  const setState = (next: State, message: string): void => {
    state = next;
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
    meters.replaceChildren(
      ...fills.map((fill) => {
        const meter = document.createElement('span');
        meter.append(fill);
        return meter;
      }),
    );
  };

  const clearLive = (): void => {
    info = undefined;
    position = undefined;
    paintedRow = '';
    for (const element of Object.values(readout)) element.textContent = '--';
    setChannels(IDLE_CHANNELS, 2);
    const emptyRow = Array.from({ length: IDLE_CHANNELS }, () => EMPTY_CELL).join(' | ');
    for (const [index, row] of rows.entries()) row.textContent = `${pad(index)} | ${emptyRow}`;
    time.textContent = '0:00 / 0:00';
    seek.value = '0';
    seek.disabled = true;
    notes.hidden = true;
  };

  /** Puts an exhibit on the placard and marks it in the list, without playing it. */
  const show = (exhibit: Exhibit): void => {
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

    for (const button of exhibitButtons) {
      if (button.dataset.trackerExhibit !== String(exhibit.modarchiveId)) {
        button.removeAttribute('aria-current');
        continue;
      }
      button.setAttribute('aria-current', 'true');
      // Scroll the list only: scrollIntoView would also drag the page back from the shaders.
      const box = list.getBoundingClientRect();
      const item = button.getBoundingClientRect();
      if (item.top < box.top + item.height || item.bottom > box.bottom) {
        list.scrollTop += item.top - box.top - (box.height - item.height) / 2;
      }
    }
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

  const paint = (): void => {
    frame = 0;
    if (!info || !position) return;
    time.textContent = `${clock(position.seconds)} / ${clock(info.durationSeconds)}`;
    if (!seeking) seek.value = String(position.seconds);
    readout.order.textContent = `${pad(position.order)}/${pad(info.orders.length - 1)}`;
    readout.pattern.textContent = pad(position.pattern);
    readout.row.textContent = `${pad(position.row)}/${pad((info.patterns[position.pattern]?.length ?? 1) - 1)}`;
    readout.speed.textContent = String(position.speed);
    readout.tempo.textContent = String(Math.round(position.tempo));
    if (reducedMotion) return;

    for (const [channel, fill] of fills.entries()) {
      fill.style.transform = `scaleX(${Math.min(1, position.levels[channel] ?? 0)})`;
    }
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
  seek.addEventListener('change', () => {
    seeking = false;
    void player.seek(Number(seek.value));
  });

  if (reducedMotion) {
    pattern.hidden = true;
    need<HTMLElement>(root, '[data-tracker-still]').hidden = false;
  }
  show(opening);
}

const root = document.querySelector<HTMLElement>('[data-tracker]');
if (root) mount(root);
