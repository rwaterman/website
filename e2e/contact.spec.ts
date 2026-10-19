import { expect, test, type Page, type Route } from '@playwright/test';

const message = { name: 'Ada Lovelace', email: 'ada@example.com', message: 'Hello from the test suite.' };
const genericError = 'Message could not be sent — please try again later.';

async function fillForm(page: Page, values: typeof message = message): Promise<void> {
  await page.getByRole('textbox', { name: 'Name' }).fill(values.name);
  await page.getByRole('textbox', { name: 'Email' }).fill(values.email);
  await page.getByRole('textbox', { name: 'Message' }).fill(values.message);
}

/** Stubs POST /api/contact (the Lambda only exists behind CloudFront) and counts the calls. */
async function stubApi(page: Page, handler: (route: Route) => Promise<void>): Promise<{ calls: number }> {
  const counter = { calls: 0 };
  await page.route('**/api/contact', async (route) => {
    counter.calls += 1;
    await handler(route);
  });
  return counter;
}

test.describe('/contact form', () => {
  // The background shader is covered in pages.spec.ts; software GL only slows these down.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/contact');
  });

  test('labels its fields and hides the honeypot', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
    await expect(page.locator('#company')).toBeHidden();
    await expect(page.locator('#company')).toHaveAttribute('tabindex', '-1');
    await page.locator('label[for="message"]').click();
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeFocused();
  });

  test('an empty form sends nothing', async ({ page }) => {
    const api = await stubApi(page, (route) => route.fulfill({ status: 200, json: {} }));
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused();
    await expect(page.getByRole('status')).toHaveText('');
    expect(api.calls).toBe(0);
  });

  test('an invalid email sends nothing', async ({ page }) => {
    const api = await stubApi(page, (route) => route.fulfill({ status: 200, json: {} }));
    await fillForm(page, { ...message, email: 'not-an-email' });
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('status')).toHaveText('');
    expect(api.calls).toBe(0);
  });

  test('a valid form posts JSON, confirms, and resets', async ({ page }) => {
    await stubApi(page, (route) => route.fulfill({ status: 200, json: { ok: true } }));
    await fillForm(page);
    const [request] = await Promise.all([
      page.waitForRequest('**/api/contact'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    expect(request.method()).toBe('POST');
    expect(request.headers()['content-type']).toBe('application/json');
    expect(request.postDataJSON()).toEqual({ ...message, company: '' });

    await expect(page.getByRole('status')).toHaveText('Sent — thanks. I’ll get back to you.');
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('');
  });

  test('the button is disabled while sending', async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await stubApi(page, async (route) => {
      await held;
      await route.fulfill({ status: 200, json: {} });
    });
    await fillForm(page);
    const button = page.getByRole('button', { name: 'Send message' });
    await button.click();

    await expect(button).toBeDisabled();
    await expect(page.getByRole('status')).toHaveText('Sending…');
    release();
    await expect(button).toBeEnabled();
  });

  test('an API error message is shown and the form keeps its values', async ({ page }) => {
    await stubApi(page, (route) =>
      route.fulfill({ status: 429, json: { message: 'Too many messages — try again in a minute.' } }),
    );
    await fillForm(page);
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByRole('status')).toHaveText('Too many messages — try again in a minute.');
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue(message.message);
    await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
  });

  test('a non-JSON error falls back to the generic message', async ({ page }) => {
    await stubApi(page, (route) => route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>Oops</h1>' }));
    await fillForm(page);
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('status')).toHaveText(genericError);
  });

  test('a WAF 202 challenge is not treated as sent', async ({ page }) => {
    await stubApi(page, (route) => route.fulfill({ status: 202, contentType: 'text/html', body: '' }));
    await fillForm(page);
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('status')).toHaveText(genericError);
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue(message.message);
  });

  test('a network failure is reported', async ({ page }) => {
    await stubApi(page, (route) => route.abort());
    await fillForm(page);
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('status')).toHaveText('Network error — please try again.');
    await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
  });
});
