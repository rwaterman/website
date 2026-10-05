import { expect, test, type Page } from '@playwright/test';
import { trackErrors } from './helpers';

const MOD_ARCHIVE = 'https://api.modarchive.org/**';

/**
 * A one-pattern, four-channel ProTracker module built in memory, so the suite neither downloads
 * anyone's music nor depends on The Mod Archive being up. Speed 3 makes its 64 rows last about
 * four seconds: long enough to watch the row counter move, short enough to wait for the end.
 */
function tinyModule(): Buffer {
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
  cell(0, 0, 428, 0xf, 3);
  for (let row = 4; row < 64; row += 4) cell(row, (row / 4) % 4, row % 8 ? 214 : 428, 0, 0);

  const sample = Buffer.alloc(sampleBytes, 0x40);
  sample.fill(0xc0, sampleBytes / 2);
  return Buffer.concat([header, pattern, sample]);
}

async function stubModArchive(page: Page): Promise<void> {
  await page.route(MOD_ARCHIVE, (route) =>
    route.fulfill({
      body: tinyModule(),
      contentType: 'application/octet-stream',
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
}

test.describe('/fun tracker museum', () => {
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

  test('a file that is not a module reports an error instead of playing', async ({ page }) => {
    await page.route(MOD_ARCHIVE, (route) =>
      route.fulfill({ body: 'not a module', contentType: 'text/html', headers: { 'access-control-allow-origin': '*' } }),
    );
    await page.goto('/fun');
    const museum = page.locator('[data-tracker]');
    await museum.locator('[data-tracker-toggle]').click();
    await expect(museum.locator('[data-tracker-status]')).toContainText('would not play', { timeout: 20_000 });
    await expect(museum.locator('[data-tracker-toggle]')).toHaveText('Play');
  });
});
