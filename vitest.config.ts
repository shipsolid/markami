import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/{unit,protocol,fidelity,webview,visual}/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      reporter: ['text', 'json-summary']
    }
  }
});
