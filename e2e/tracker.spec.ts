import { expect, test, type Page } from '@playwright/test';
import { MOD_ARCHIVE, stubModArchive, tinyModule, trackErrors } from './helpers';

test.describe('/fun mod music file museum', () => {
  // Reduced motion turns the page's fifty software-rendered shaders off, which is what keeps these
  // fast. The readout still runs; one test below turns motion back on for the pattern display.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('no module downloads until Play, then it loads and the readout runs', async ({ page }) => {
    const errors = trackErrors(page);
    const downloads: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('modarchive')) downloads.push(request.url());
    });
    await stubModArchive(page);
    await page.goto('/fun');

    const museum = page.locator('[data-tracker]');
    const toggle = museum.locator('[data-tracker-toggle]');
    const status = museum.locator('[data-tracker-status]');
    const firstExhibit = museum.locator('[data-tracker-exhibit]').first();
    await expect(firstExhibit).toHaveAttribute('aria-current', 'true');
    await expect(toggle).toHaveText('Play');
    await page.waitForLoadState('networkidle');
    expect(downloads).toEqual([]);

    await toggle.click();
    await expect(status).toHaveText('Playing.', { timeout: 20_000 });
    await expect(toggle).toHaveText('Pause');
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/^https:\/\/api\.modarchive\.org\/downloads\.php\?moduleid=\d+$/);

    await expect(museum.locator('[data-tracker-field="file"] .chip')).toHaveText([
      'ProTracker MOD (M.K.)',
      '4 channels',
      '1 pattern',
      '31 samples',
      /\S/,
    ]);
    await expect(museum.locator('[data-tracker-live="tempo"]')).toHaveText('125');
    await expect(museum.locator('[data-tracker-live="speed"]')).toHaveText('3');
    await expect(museum.locator('[data-tracker-samples]')).toContainText('01  square wave');

    const row = museum.locator('[data-tracker-live="row"]');
    await expect(row).toHaveText(/^\d\d\/63$/);
    const before = await row.textContent();
    await expect(row).not.toHaveText(before ?? '');
    await expect(museum.locator('[data-tracker-seek]')).toBeEnabled();

    await expect(museum.locator('[data-tracker-pattern]')).toBeHidden();
    await expect(museum.locator('[data-tracker-still]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('before Play, the list and Next only change the placard; after Play they switch pieces', async ({ page }) => {
    const downloads: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('modarchive')) downloads.push(new URL(request.url()).searchParams.get('moduleid') ?? '');
    });
    await stubModArchive(page);
    await page.goto('/fun');
    const museum = page.locator('[data-tracker]');
    const toggle = museum.locator('[data-tracker-toggle]');
    const status = museum.locator('[data-tracker-status]');
    const title = museum.locator('[data-tracker-field="title"]');
    const exhibitButtons = museum.locator('[data-tracker-exhibit]');
    const openingTitle = (await title.textContent()) ?? '';

    await museum.locator('[data-tracker-step="1"]').click();
    await expect(exhibitButtons.nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(title).not.toHaveText(openingTitle);
    await exhibitButtons.nth(3).click();
    await expect(exhibitButtons.nth(3)).toHaveAttribute('aria-current', 'true');
    await expect(toggle).toHaveText('Play');
    await expect(status).toHaveText('Nothing downloads until you press play.');
    await page.waitForLoadState('networkidle');
    expect(downloads).toEqual([]);

    const chosen = (await exhibitButtons.nth(3).getAttribute('data-tracker-exhibit')) ?? '';
    await toggle.click();
    await expect(status).toHaveText('Playing.', { timeout: 20_000 });
    expect(downloads).toEqual([chosen]);

    await museum.locator('[data-tracker-step="1"]').click();
    await expect(exhibitButtons.nth(4)).toHaveAttribute('aria-current', 'true');
    await expect(status).toHaveText('Playing.', { timeout: 20_000 });
    expect(downloads).toEqual([chosen, (await exhibitButtons.nth(4).getAttribute('data-tracker-exhibit')) ?? '']);
  });

  test('with motion allowed, the pattern scrolls under a level meter per channel', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await stubModArchive(page);
    await page.goto('/fun');
    const museum = page.locator('[data-tracker]');
    await expect(museum.locator('[data-tracker-still]')).toBeHidden();

    await museum.locator('[data-tracker-toggle]').click();
    await expect(museum.locator('[data-tracker-status]')).toHaveText('Playing.', { timeout: 20_000 });
    await expect(museum.locator('[data-tracker-head]')).toContainText('CH 01');
    await expect(museum.locator('[data-tracker-meters] > *')).toHaveCount(4);

    const playhead = museum.locator('[data-tracker-rows] > [data-current]');
    await expect(playhead).toHaveText(/^\d\d \| .{13} \| .{13} \| .{13} \| .{13}$/);
    const before = (await playhead.textContent()) ?? '';
    await expect(playhead).not.toHaveText(before);
  });

  test('pause holds the position and play resumes it', async ({ page }) => {
    await stubModArchive(page);
    await page.goto('/fun');
    const museum = page.locator('[data-tracker]');
    const toggle = museum.locator('[data-tracker-toggle]');
    const status = museum.locator('[data-tracker-status]');
    const row = museum.locator('[data-tracker-live="row"]');

    await toggle.click();
    await expect(status).toHaveText('Playing.', { timeout: 20_000 });
    await expect(row).toHaveText(/^\d\d\/63$/);
    await toggle.click();
    await expect(status).toHaveText('Paused.');
    await expect(toggle).toHaveText('Play');
    const held = (await row.textContent()) ?? '';
    await page.waitForTimeout(500);
    await expect(row).toHaveText(held);

    await toggle.click();
    await expect(status).toHaveText('Playing.');
    await expect(row).not.toHaveText(held);
  });

  test('moving the position slider seeks, and the readout follows', async ({ page }) => {
    // Speed 31 stretches the fixture to about forty seconds, so only a seek reaches its last quarter this fast.
    await stubModArchive(page, tinyModule(31));
    await page.goto('/fun');
    const museum = page.locator('[data-tracker]');
    const seek = museum.locator('[data-tracker-seek]');
    const row = museum.locator('[data-tracker-live="row"]');

    await museum.locator('[data-tracker-toggle]').click();
    await expect(museum.locator('[data-tracker-status]')).toHaveText('Playing.', { timeout: 20_000 });
    await expect(museum.locator('[data-tracker-time]')).toHaveText(/^0:0\d \/ 0:39$/);
    await expect(row).toHaveText(/^0\d\/63$/);

    await seek.fill('30');
    await expect(museum.locator('[data-tracker-time]')).toHaveText(/^0:3\d \/ 0:39$/);
    await expect.poll(async () => Number(((await row.textContent()) ?? '').slice(0, 2))).toBeGreaterThanOrEqual(48);
  });

  test('when a piece ends the next exhibit starts', async ({ page }) => {
    await stubModArchive(page);
    await page.goto('/fun');
    const museum = page.locator('[data-tracker]');
    const exhibitButtons = museum.locator('[data-tracker-exhibit]');
    test.skip((await exhibitButtons.count()) < 2, 'needs two exhibits');
    const title = museum.locator('[data-tracker-field="title"]');
    const firstTitle = (await title.textContent()) ?? '';

    await museum.locator('[data-tracker-toggle]').click();
    await expect(museum.locator('[data-tracker-status]')).toHaveText('Playing.', { timeout: 20_000 });
    await expect(exhibitButtons.nth(1)).toHaveAttribute('aria-current', 'true', { timeout: 15_000 });
    await expect(title).not.toHaveText(firstTitle);
    await expect(exhibitButtons.first()).not.toHaveAttribute('aria-current', 'true');
    await expect(museum.locator('[data-tracker-status]')).toHaveText('Playing.', { timeout: 20_000 });
  });

  test('a failed download says so and leaves Play ready to retry', async ({ page }) => {
    await page.route(MOD_ARCHIVE, (route) =>
      route.fulfill({ status: 503, body: 'down', headers: { 'access-control-allow-origin': '*' } }),
    );
    await page.goto('/fun');
    const museum = page.locator('[data-tracker]');
    await museum.locator('[data-tracker-toggle]').click();
    await expect(museum.locator('[data-tracker-status]')).toContainText('(HTTP 503)', { timeout: 20_000 });
    await expect(museum.locator('[data-tracker-toggle]')).toHaveText('Play');
  });

  test('a retired module id, which The Mod Archive answers with an HTML page, is reported as missing', async ({ page }) => {
    await page.route(MOD_ARCHIVE, (route) =>
      route.fulfill({ body: 'Invalid ID Error', contentType: 'text/html', headers: { 'access-control-allow-origin': '*' } }),
    );
    await page.goto('/fun');
    const museum = page.locator('[data-tracker]');
    await museum.locator('[data-tracker-toggle]').click();
    await expect(museum.locator('[data-tracker-status]')).toContainText('(no module at that address)', { timeout: 20_000 });
    await expect(museum.locator('[data-tracker-toggle]')).toHaveText('Play');
  });

  test('the museum tab opens first; tabs switch rooms and a shader link opens the collection', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/fun');
    const museumTab = page.getByRole('tab', { name: 'Mod Music File Museum' });
    const shadersTab = page.getByRole('tab', { name: 'Shader Collection' });
    const museum = page.locator('[data-tracker]');
    const firstTile = page.locator('li[data-shader]').first();
    await expect(museumTab).toHaveAttribute('aria-selected', 'true');
    await expect(museum).toBeVisible();
    await expect(firstTile).toBeHidden();

    await shadersTab.click();
    await expect(shadersTab).toHaveAttribute('aria-selected', 'true');
    await expect(museumTab).toHaveAttribute('aria-selected', 'false');
    await expect(firstTile).toBeVisible();
    await expect(museum).toBeHidden();
    await expect(page).toHaveURL(/#shaders$/);

    await page.keyboard.press('ArrowLeft');
    await expect(museumTab).toHaveAttribute('aria-selected', 'true');
    await expect(museumTab).toBeFocused();
    await expect(page).toHaveURL(/#museum$/);

    await page.goto('/fun#mountains');
    await expect(page.locator('[data-stage-title]')).toHaveText('Ridgelines');
    await page.locator('[data-stage-action="close"]').click();
    await expect(shadersTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('li[data-shader="mountains"]')).toBeVisible();
    await expect(page).toHaveURL(/#shaders$/);
    await page.reload();
    await expect(shadersTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('li[data-shader="mountains"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the stage’s M key starts a random module, and the museum’s Random shader opens the stage over it', async ({ page }) => {
    const downloads: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('modarchive')) downloads.push(request.url());
    });
    // Speed 31 keeps the fixture playing for about forty seconds, so it never ends mid-test.
    await stubModArchive(page, tinyModule(31));
    await page.goto('/fun#shaders');
    const stage = page.locator('[data-stage]');
    const status = page.locator('[data-tracker-status]');
    const title = page.locator('[data-tracker-field="title"]');

    await page.locator('#shaders [data-random-shader]').click();
    await expect(stage).toBeVisible();
    await page.keyboard.press('m');
    await expect(status).toHaveText('Playing.', { timeout: 20_000 });
    expect(downloads).toHaveLength(1);
    const playing = (await title.textContent()) ?? '';

    await page.keyboard.press('Escape');
    await expect(stage).toBeHidden();
    await expect(status).toHaveText('Playing.');

    await page.getByRole('tab', { name: 'Mod Music File Museum' }).click();
    await page.locator('[data-tracker] [data-random-shader]').click();
    await expect(stage).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(stage).toBeHidden();
    await expect(page).toHaveURL(/#museum$/);
    await expect(status).toHaveText('Playing.');
    await expect(title).toHaveText(playing);
    expect(downloads).toHaveLength(1);
  });

  test('a file libopenmpt cannot read reports an error instead of playing', async ({ page }) => {
    await page.route(MOD_ARCHIVE, (route) =>
      route.fulfill({
        body: Buffer.alloc(2048, 0x55),
        contentType: 'application/octet-stream',
        headers: { 'access-control-allow-origin': '*' },
      }),
    );
    await page.goto('/fun');
    const museum = page.locator('[data-tracker]');
    await museum.locator('[data-tracker-toggle]').click();
    await expect(museum.locator('[data-tracker-status]')).toContainText('would not play', { timeout: 20_000 });
    await expect(museum.locator('[data-tracker-toggle]')).toHaveText('Play');
  });
});
