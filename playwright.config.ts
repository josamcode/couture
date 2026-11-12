import { defineConfig, devices } from '@playwright/test';

// Tests run against the PRODUCTION build, served by scripts/serve.mjs, which applies the same
// response headers as the production host (public/_headers), including caching and the CSP.
// Build first:  npm run build     Then:  npm test
const PORT = 4321;

// Headless Chromium has no GPU. This flag lets it use its software WebGL without a deprecation warning,
// so the painting effect can be tested for real.
const chromiumArgs = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  // The painting effect runs in software WebGL in headless browsers, which is CPU-hungry:
  // more than a few parallel browsers starve each other and make timing-based checks unreliable.
  workers: 3,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 45_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node scripts/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /perf\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { args: chromiumArgs } },
    },
    {
      name: 'firefox',
      testIgnore: /perf\.spec\.ts/,
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit',
      testIgnore: /perf\.spec\.ts/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chrome',
      testIgnore: /perf\.spec\.ts/,
      use: { ...devices['Pixel 7'], launchOptions: { args: chromiumArgs } },
    },
    {
      // Narrow mobile WebKit: the closest thing to Instagram's in-app browser on an iPhone.
      name: 'mobile-safari',
      testIgnore: /perf\.spec\.ts/,
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { args: chromiumArgs } },
    },
  ],
});
