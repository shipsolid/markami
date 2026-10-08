import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/visual-browser',
  fullyParallel: false,
  forbidOnly: true,
  outputDir: '/tmp/markami-playwright-results',
  reporter: 'list',
  retries: 0,
  use: {
    browserName: 'chromium',
    headless: true
  },
  workers: 1
});
