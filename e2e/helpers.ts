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
