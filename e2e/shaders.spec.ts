import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { expectShaderPainted, trackErrors, waitForStage } from './helpers';

const shaderFiles = readdirSync('src/shaders')
  .filter((file) => file.endsWith('.frag'))
  .map((file) => file.replace(/\.frag$/, ''))
  .sort();

test.describe('/fun/shaders gallery', () => {
  test('every shader file is registered, compiles, and paints', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    await page.goto('/fun/shaders');

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
    await page.goto('/fun/shaders');
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
    await page.goto('/fun/shaders');
    await waitForStage(page);
    const stage = page.locator('[data-stage]');
    await expect(stage).toBeHidden();

    const tile = page.locator('li[data-shader="mountains"]');
    await tile.locator('[data-fullscreen]').click();
    await expect(stage).toBeVisible();
    await expect(stage.locator('[data-stage-title]')).toHaveText('Ridgelines');
    await expectShaderPainted(stage, 'stage');

    await stage.locator('[data-stage-action="close"]').click();
    await expect(stage).toBeHidden();
  });

  test('stage keyboard controls: R picks another shader, Space pauses, Esc closes', async ({ page }) => {
    await page.goto('/fun/shaders');
    await waitForStage(page);
    const stage = page.locator('[data-stage]');
    const title = stage.locator('[data-stage-title]');

    await page.locator('[data-random-shader]').click();
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

  test('a key press brings the idle control bar back', async ({ page }) => {
    await page.goto('/fun/shaders#plasma');
    const stage = page.locator('[data-stage]');
    await expect(stage).toBeVisible();
    await expect(stage).toHaveAttribute('data-idle', '', { timeout: 5_000 });
    await page.keyboard.press('Space');
    await expect(stage).not.toHaveAttribute('data-idle');
    await expect(stage.locator('[data-play]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('the editor keeps the last good program through a failed compile, and Reset restores the source', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/fun/shaders#plasma');
    const stage = page.locator('[data-stage]');
    await expect(stage).toBeVisible();
    const editor = stage.locator('[data-editor-input]');
    const editorError = stage.locator('[data-editor-error]');

    await page.keyboard.press('e');
    await expect(editor).toBeFocused();
    const original = await editor.inputValue();
    expect(original).toContain('mainImage');

    await editor.fill('void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(1.0, 0.0, 0.0, 1.0) }');
    await expect(editorError).toBeVisible();
    await expect(editorError).toContainText('compile failed');
    await expectShaderPainted(stage, 'stage after a failed edit');

    await editor.fill('void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(1.0, 0.0, 0.0, 1.0); }');
    await expect(editorError).toBeHidden();

    await stage.locator('[data-stage-action="reset"]').click();
    await expect(editor).toHaveValue(original);
    await editor.focus();
    await page.keyboard.press('Escape');
    await expect(stage).toBeHidden();
    // The failed compile is reported in the editor; nothing else may log an error.
    expect(errors).toEqual([]);
  });
});
