import { expect, test } from '@playwright/test';
import { expectShaderPainted, trackErrors } from './helpers';

interface PageCase {
  path: string;
  title: string;
  heading: string;
  background: string;
  /** Primary nav label carrying aria-current="page", if the page is in the nav. */
  current?: string;
}

// Hardcoded on purpose: importing src/config would make these assertions tautological.
const pages: PageCase[] = [
  { path: '/', title: 'Rick Waterman', heading: 'Rick Waterman', background: 'plasma', current: 'Bio' },
  { path: '/resume', title: 'Resume · Rick Waterman', heading: 'Resume', background: 'aurora', current: 'Resume' },
  { path: '/links', title: 'Links · Rick Waterman', heading: 'Links', background: 'waves', current: 'Links' },
  { path: '/contact', title: 'Contact · Rick Waterman', heading: 'Contact', background: 'mountains', current: 'Contact' },
  { path: '/legal', title: 'Legal · Rick Waterman', heading: 'Legal', background: 'clouds' },
  { path: '/fun', title: 'Fun · Rick Waterman', heading: 'Fun', background: 'hex' },
];
const notFound: PageCase = { path: '/no-such-page', title: '404 · Rick Waterman', heading: 'Not found', background: 'blackhole' };

const navLabels = ['Bio', 'Resume', 'Notes', 'AI Blog', 'Links', 'Contact'];
const subdomainSuffix = process.env.SITE === 'https://rickwaterman.com' ? '' : '-dev';

test('webgl2 is available to the test browser', async ({ page }) => {
  await page.goto('/');
  const hasWebgl2 = await page.evaluate(() => document.createElement('canvas').getContext('webgl2') !== null);
  expect(hasWebgl2, 'every shader assertion in this suite depends on WebGL2').toBe(true);
});

test('each page has its own background shader', () => {
  const backgrounds = [...pages, notFound].map((entry) => entry.background);
  expect(new Set(backgrounds).size).toBe(backgrounds.length);
});

for (const entry of pages) {
  test(`${entry.path} renders with the ${entry.background} background`, async ({ page }) => {
    const errors = trackErrors(page);
    const response = await page.goto(entry.path);
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle(entry.title);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.heading);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S/);

    const background = page.locator('[data-background]');
    await expect(background).toHaveAttribute('data-shader', entry.background);
    await expectShaderPainted(background, entry.background);

    const nav = page.getByRole('navigation', { name: 'Primary' });
    const current = nav.locator('[aria-current="page"]');
    if (entry.current) await expect(current).toHaveText(entry.current);
    else await expect(current).toHaveCount(0);

    const duplicateIds = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('[id]'), (element) => element.id);
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    });
    expect(duplicateIds).toEqual([]);

    expect(errors).toEqual([]);
  });
}

test.describe('navigation and content', () => {
  // Backgrounds are asserted above; software GL only slows these down.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('unknown paths serve the 404 page', async ({ page }) => {
    const response = await page.goto(notFound.path);
    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle(notFound.title);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(notFound.heading);
    await expect(page.locator('[data-background]')).toHaveAttribute('data-shader', notFound.background);
    await page.getByRole('link', { name: 'Go home' }).click();
    await expect(page).toHaveURL('/');
  });

  test('primary nav lists the sections and labels the blog as AI Blog', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const labels = await nav.getByRole('link').allTextContents();
    expect(labels.map((label) => label.replace('↗', '').trim())).toEqual(navLabels);

    const blog = nav.getByRole('link', { name: 'AI Blog' });
    await expect(blog).toHaveAttribute('href', `https://blog${subdomainSuffix}.rickwaterman.com`);
    await expect(blog).toHaveAttribute('target', '_blank');
    await expect(blog).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(nav.getByRole('link', { name: 'Notes' })).toHaveAttribute(
      'href',
      `https://notes${subdomainSuffix}.rickwaterman.com`,
    );
  });

  test('nav and footer links navigate between pages', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Contact' }).click();
    await expect(page).toHaveURL(/\/contact\/?$/);
    await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Legal' }).click();
    await expect(page).toHaveURL(/\/legal\/?$/);
    await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Links' }).click();
    await expect(page).toHaveURL(/\/links\/?$/);
  });

  test('links page lists the blog feed as AI Blog', async ({ page }) => {
    await page.goto('/links');
    await expect(page.getByRole('link', { name: 'AI Blog' }).first()).toBeVisible();
  });

  test('resume page links to the PDF, and the PDF is served', async ({ page, request }) => {
    await page.goto('/resume');
    await expect(page.getByRole('link', { name: /Download PDF/ })).toHaveAttribute('href', '/resume.pdf');
    const pdf = await request.get('/resume.pdf');
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
  });
});

test('background shader stays off under prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('[data-background]')).toHaveAttribute('data-paused', '');
  await expect(page.locator('[data-background] canvas')).toBeHidden();
});
