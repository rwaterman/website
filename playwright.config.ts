import { defineConfig, devices } from '@playwright/test';

// Not 4321: a running `npm run dev` or a leftover preview must never be mistaken for this build.
const port = 4399;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 720 },
        deviceScaleFactor: 1,
        launchOptions: {
          // Headless Chromium has no GPU; SwiftShader gives the shader runtime a WebGL2 context.
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
  webServer: {
    // --ignore-lock keeps the server in the foreground: under an AI coding agent, astro preview
    // otherwise detaches into the background and outlives the test run.
    command: `npm run build && npm run preview -- --port ${port} --ignore-lock`,
    port,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
