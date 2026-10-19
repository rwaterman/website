import { expect, test, type Page } from '@playwright/test';
import { trackErrors } from './helpers';

const stage = '[data-dragon-stage]';

/** Clicks the footer glyph, skips the intro, and waits until the dragon is flying. */
async function wakeTheDragon(page: Page): Promise<void> {
  const glyph = page.locator('[data-dragon-egg]');
  await glyph.scrollIntoViewIfNeeded();
  await glyph.click();
  await expect(page.locator(stage)).toBeAttached();
  await page.waitForTimeout(900);
  await page.locator(stage).click({ position: { x: 300, y: 300 } });
  await expect(page.locator(stage)).toHaveAttribute('data-phase', /^(arrive|flight)$/, { timeout: 90_000 });
}

/** Steps the game by hand: SwiftShader is far too slow for real time, so time is advanced in fixed frames. */
async function fly(page: Page, frames: number, controls: Record<string, number | boolean> = {}): Promise<void> {
  await page.evaluate(
    ({ frames, controls }) => {
      const dragon = window.__dragon;
      if (!dragon) throw new Error('The dragon debug hooks are missing');
      dragon.hold({ steerX: 0, steerY: 0, throttle: 0, fire: false, ...controls });
      dragon.advance(1 / 60, frames);
    },
    { frames, controls },
  );
}

const data = async (page: Page, name: string): Promise<number> => Number(await page.locator(stage).getAttribute(`data-${name}`));

/**
 * Draws a frame and samples it in the same task: the game's canvas does not keep its drawing buffer,
 * so a read in a later task (as `shaderState` does) only ever sees black.
 */
async function paintedNow(page: Page): Promise<boolean> {
  return page.evaluate((selector) => {
    window.__dragon?.advance(1 / 60, 1);
    const canvas = document.querySelector<HTMLCanvasElement>(`${selector} canvas`);
    if (!canvas) return false;
    const probe = document.createElement('canvas');
    probe.width = 32;
    probe.height = 18;
    const context = probe.getContext('2d');
    if (!context) return false;
    context.drawImage(canvas, 0, 0, probe.width, probe.height);
    const { data: pixels } = context.getImageData(0, 0, probe.width, probe.height);
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 30) return true;
    }
    return false;
  }, stage);
}

test.describe('dragon easter egg', () => {
  test('wakes from the footer glyph, flies, and leaves the page as it was', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackErrors(page);
    await page.goto('/legal');
    const scrollBefore = await page.evaluate(() => {
      document.querySelector('[data-dragon-egg]')?.scrollIntoView();
      return scrollY;
    });

    await wakeTheDragon(page);
    await fly(page, 320);
    await expect(page.locator(stage)).toHaveAttribute('data-phase', 'flight');
    expect(await data(page, 'total')).toBeGreaterThan(300);
    await expect(page.locator(`${stage} [data-health]`)).toHaveAttribute('aria-valuenow', '100');
    expect(await paintedNow(page)).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.locator(stage)).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/dragon-active/);
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(scrollBefore, -1);
    await expect(page.locator('[data-dragon-egg]')).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('a fireball razes buildings and they come down in pieces', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackErrors(page);
    await page.goto('/legal');
    await wakeTheDragon(page);
    await fly(page, 320);

    await page.evaluate(() => window.__dragon?.strike());
    await fly(page, 120);
    expect(await data(page, 'razed')).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('flying through a building costs health, and diving into the ground crashes and respawns', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    await page.goto('/legal');
    await wakeTheDragon(page);
    await fly(page, 320);

    expect(await page.evaluate(() => window.__dragon?.approach('hall', 60))).toBe(true);
    await fly(page, 90, { steerY: -0.05 });
    expect(await data(page, 'health')).toBeLessThan(100);
    expect(await data(page, 'razed')).toBeGreaterThan(0);

    await page.evaluate(() => window.__dragon?.place(0, 140, 260, 0, -0.9));
    await expect
      .poll(
        async () => {
          await fly(page, 20, { steerY: -1, throttle: 1 });
          return page.locator(stage).getAttribute('data-phase');
        },
        { timeout: 60_000 },
      )
      .toBe('crash');
    expect(await data(page, 'crashes')).toBe(1);

    await fly(page, 300);
    await expect(page.locator(stage)).toHaveAttribute('data-phase', /^(arrive|flight)$/);
    expect(await data(page, 'health')).toBe(100);
    expect(errors).toEqual([]);
  });
});
