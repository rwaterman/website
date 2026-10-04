import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { expectShaderPainted, trackErrors } from './helpers';

const shaderFiles = readdirSync('src/shaders')
  .filter((file) => file.endsWith('.frag'))
  .map((file) => file.replace(/\.frag$/, ''))
  .sort();

test.describe('/fun shader gallery', () => {
  test('every shader file is registered, compiles, and paints', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    await page.goto('/fun');

    const tiles = page.locator('li[data-shader]');
    const ids = await tiles.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-shader') ?? ''));
    expect([...ids].sort()).toEqual(shaderFiles);

    for (const id of ids) {
      const tile = page.locator(`li[data-shader="${id}"]`);
      await tile.scrollIntoViewIfNeeded();
      await expectShaderPainted(tile, id, true);
    }
    expect(errors).toEqual([]);
  });

  test('a tile pauses and resumes', async ({ page }) => {
    await page.goto('/fun');
    const tile = page.locator('li[data-shader]').first();
    const toggle = tile.locator('[data-play]');
    await expect(toggle).toHaveText('Pause');
    await toggle.click();
    await expect(toggle).toHaveText('Play');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(tile).toHaveAttribute('data-paused', '');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('a tile opens the fullscreen stage on its own shader', async ({ page }) => {
    await page.goto('/fun');
    const stage = page.locator('[data-stage]');
    await expect(stage).toBeHidden();

    const tile = page.locator('li[data-shader="mountains"]');
    await tile.locator('[data-fullscreen]').click();
    await expect(stage).toBeVisible();
    await expect(stage.locator('[data-stage-title]')).toHaveText('Ridgelines');
    await expectShaderPainted(stage, 'stage');

    await stage.locator('[data-stage-close]').click();
    await expect(stage).toBeHidden();
  });

  test('stage keyboard controls: R picks another shader, Space pauses, Esc closes', async ({ page }) => {
    await page.goto('/fun');
    const stage = page.locator('[data-stage]');
    const title = stage.locator('[data-stage-title]');

    await page.locator('[data-random-shader]').first().click();
    await expect(stage).toBeVisible();
    await expect(title).toHaveText(/\S/);
    const first = await title.textContent();

    await page.keyboard.press('r');
    await expect(title).not.toHaveText(first ?? '');

    const toggle = stage.locator('[data-play]');
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Escape');
    await expect(stage).toBeHidden();
  });
});
