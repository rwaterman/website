import { expect, type Locator, type Page } from '@playwright/test';

export type ShaderState = 'painted' | 'blank' | `error: ${string}`;

/** Collects uncaught exceptions and console errors; assert the returned array is empty. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

/**
 * State of one shader target (a `[data-shader]` tile, the page background, or the stage).
 * The error element starts hidden, so "no error" alone proves nothing: a target only counts
 * as working once its canvas holds a non-black pixel.
 */
export async function shaderState(target: Locator): Promise<ShaderState> {
  return target.evaluate((root): ShaderState => {
    const errorOut = root.querySelector<HTMLElement>(':scope > [data-error], :scope [data-error]');
    if (errorOut && !errorOut.hidden) return `error: ${errorOut.textContent ?? ''}`;
    const canvas = root.querySelector('canvas');
    if (!canvas || canvas.width === 0 || canvas.height === 0) return 'blank';
    const probe = document.createElement('canvas');
    probe.width = 32;
    probe.height = 18;
    const context = probe.getContext('2d');
    if (!context) return 'blank';
    context.drawImage(canvas, 0, 0, probe.width, probe.height);
    const { data } = context.getImageData(0, 0, probe.width, probe.height);
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] + data[index + 1] + data[index + 2] > 0) return 'painted';
    }
    return 'blank';
  });
}

export async function expectShaderPainted(target: Locator, label: string, soft = false): Promise<void> {
  const assertion = soft ? expect.soft : expect;
  await assertion.poll(() => shaderState(target), { message: `shader ${label}`, timeout: 20_000 }).toBe('painted');
}

export const MOD_ARCHIVE = 'https://api.modarchive.org/**';

/**
 * A one-pattern, four-channel ProTracker module built in memory, so the suite neither downloads
 * anyone's music nor depends on The Mod Archive being up. Speed 3 makes its 64 rows last about
 * four seconds: long enough to watch the row counter move, short enough to wait for the end.
 * `speed` is ticks per row, at 20 ms a tick.
 */
export function tinyModule(speed = 3): Buffer {
  const sampleBytes = 64;
  const header = Buffer.alloc(1084);
  header.write('e2e fixture', 0, 'latin1');
  // Sample 1 header starts at byte 20: 22-byte name, then length, finetune, volume, loop start, loop length.
  header.write('square wave', 20, 'latin1');
  header.writeUInt16BE(sampleBytes / 2, 42);
  header.writeUInt8(64, 45);
  header.writeUInt16BE(sampleBytes / 2, 48);
  for (let sample = 1; sample < 31; sample++) header.writeUInt16BE(1, 20 + sample * 30 + 28);
  header.writeUInt8(1, 950);
  header.writeUInt8(127, 951);
  header.write('M.K.', 1080, 'latin1');

  const pattern = Buffer.alloc(64 * 4 * 4);
  const cell = (row: number, channel: number, period: number, effect: number, parameter: number): void => {
    const sample = period ? 1 : 0;
    pattern.set([(sample & 0xf0) | (period >> 8), period & 0xff, ((sample & 0x0f) << 4) | effect, parameter], (row * 4 + channel) * 4);
  };
  cell(0, 0, 428, 0xf, speed);
  for (let row = 4; row < 64; row += 4) cell(row, (row / 4) % 4, row % 8 ? 214 : 428, 0, 0);

  const sample = Buffer.alloc(sampleBytes, 0x40);
  sample.fill(0xc0, sampleBytes / 2);
  return Buffer.concat([header, pattern, sample]);
}

export async function stubModArchive(page: Page, body: Buffer = tinyModule()): Promise<void> {
  await page.route(MOD_ARCHIVE, (route) =>
    route.fulfill({
      body,
      contentType: 'application/octet-stream',
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
}
