import { expect, test, type Page } from '@playwright/test';
import { trackErrors } from './helpers';

const MOD_ARCHIVE = 'https://api.modarchive.org/**';

/**
 * A one-pattern, four-channel ProTracker module built in memory, so the suite neither downloads
 * anyone's music nor depends on The Mod Archive being up. Speed 3 makes its 64 rows last about
 * four seconds: long enough to watch the row counter move, short enough to wait for the end.
 * `speed` is ticks per row, at 20 ms a tick.
 */
function tinyModule(speed = 3): Buffer {
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

async function stubModArchive(page: Page, body: Buffer = tinyModule()): Promise<void> {
  await page.route(MOD_ARCHIVE, (route) =>
    route.fulfill({
      body,
      contentType: 'application/octet-stream',
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
}

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

  test('the reel centres the chosen frame under the gate, which names its year and era', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/fun');
    const museum = page.locator('[data-tracker]');
    const reel = museum.locator('[data-tracker-list]');
    const frames = museum.locator('[data-tracker-exhibit]');
    const dialYear = museum.locator('[data-tracker-dial-year]');
    const dialEra = museum.locator('[data-tracker-dial-era]');
    const offCentre = async (index: number): Promise<number> => {
      const box = await reel.boundingBox();
      const frame = await frames.nth(index).boundingBox();
      if (!box || !frame) throw new Error('reel or frame has no box');
      return Math.abs(frame.x + frame.width / 2 - (box.x + box.width / 2));
    };

    await frames.nth(6).click();
    await expect(frames.nth(6)).toHaveAttribute('aria-current', 'true');
    await expect.poll(() => offCentre(6)).toBeLessThan(2);
    await expect(dialYear).toHaveText((await frames.nth(6).getAttribute('data-frame-year')) ?? '');
    await expect(dialEra).toHaveText((await frames.nth(6).getAttribute('data-era-title')) ?? '');
    await expect(museum.locator('[data-tracker-index]')).toHaveText(/^Exhibit 07 of \d+$/);

    // Arrow keys and End move focus along the reel without choosing; Enter chooses.
    const last = (await frames.count()) - 1;
    await page.keyboard.press('End');
    await expect(frames.nth(last)).toBeFocused();
    await expect.poll(() => offCentre(last)).toBeLessThan(2);
    await expect(dialYear).toHaveText((await frames.nth(last).getAttribute('data-frame-year')) ?? '');
    await expect(frames.nth(6)).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(frames.nth(last - 1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(frames.nth(last - 1)).toHaveAttribute('aria-current', 'true');
    expect(errors).toEqual([]);
  });

  test('a loaded module fills the song order, channel count, and time remaining', async ({ page }) => {
    await stubModArchive(page);
    await page.goto('/fun');
    const museum = page.locator('[data-tracker]');
    const orders = museum.locator('[data-tracker-orders] > li');
    await expect(orders.first()).toHaveText('--');

    await museum.locator('[data-tracker-toggle]').click();
    await expect(museum.locator('[data-tracker-status]')).toHaveText('Playing.', { timeout: 20_000 });
    await expect(orders).toHaveText(['00']);
    await expect(orders.first()).toHaveAttribute('data-current', '');
    await expect(museum.locator('[data-tracker-live="channels"]')).toHaveText('4');
    await expect(museum.locator('[data-tracker-remaining]')).toHaveText(/^-0:0\d$/);
  });

  test('the volume setting survives a reload', async ({ page }) => {
    await page.goto('/fun');
    const volume = page.locator('[data-tracker-volume]');
    await expect(volume).toHaveAccessibleName('Volume');
    await volume.fill('0.3');
    await page.reload();
    await expect(volume).toHaveValue('0.3');
  });
});
