import { expect, test, type Page } from '@playwright/test';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const items = [
  { id: '4', createdAt: '2026-10-04T12:00:00.000Z', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'A video' },
  { id: '3', createdAt: '2026-10-03T12:00:00.000Z', image: '/feed-media/3.png', note: 'A picture' },
  { id: '2', createdAt: '2026-10-02T12:00:00.000Z', url: 'https://www.reddit.com/r/aws/comments/1', title: 'A thread' },
  { id: '1', createdAt: '2026-10-01T12:00:00.000Z', url: 'javascript:alert(1)', note: 'Unsafe link' },
];

/** Stubs GET /api/feed (the Lambda only exists behind CloudFront) and keeps the page off the network. */
async function openFeed(page: Page, response: { status: number; json: unknown }): Promise<void> {
  await page.route('**/api/feed', (route) => route.fulfill(response));
  await page.route('**/feed-media/**', (route) => route.fulfill({ contentType: 'image/png', body: png }));
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '' }));
  await page.goto('/feed');
}

test.describe('/feed', () => {
  // The background shader is covered in pages.spec.ts; software GL only slows these down.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('renders videos, images, and links, newest first', async ({ page }) => {
    await openFeed(page, { status: 200, json: { items } });
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.locator('[aria-current="page"]')).toHaveText('Feed');

    const cards = page.locator('#feed-items > li');
    await expect(cards).toHaveCount(items.length);
    await expect(page.locator('#feed-status')).toHaveText('');

    await expect(cards.nth(0).locator('iframe')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    await expect(cards.nth(0).locator('iframe')).toHaveAttribute('title', 'A video');

    await expect(cards.nth(1).getByRole('img', { name: 'A picture' })).toHaveAttribute('src', '/feed-media/3.png');
    await expect(cards.nth(1).getByRole('link')).toHaveCount(0);

    const thread = cards.nth(2).getByRole('link', { name: 'A thread' });
    await expect(thread).toHaveAttribute('href', 'https://www.reddit.com/r/aws/comments/1');
    await expect(thread).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(cards.nth(2)).toContainText('www.reddit.com');

    await expect(cards.nth(3)).toContainText('Unsafe link');
    await expect(cards.nth(3).getByRole('link')).toHaveCount(0);
  });

  test('says so when nothing has been shared', async ({ page }) => {
    await openFeed(page, { status: 200, json: { items: [] } });
    await expect(page.locator('#feed-status')).toHaveText('Nothing shared yet.');
    await expect(page.locator('#feed-items > li')).toHaveCount(0);
  });

  test('reports a failed load', async ({ page }) => {
    await openFeed(page, { status: 500, json: { message: 'Feed request failed' } });
    await expect(page.locator('#feed-status')).toHaveText('The feed could not be loaded — please try again later.');
    await expect(page.locator('#feed-items > li')).toHaveCount(0);
  });
});
