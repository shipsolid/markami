import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/webview',
    emptyOutDir: false,
    rollupOptions: {
      input: 'src/webview/main.ts',
      output: {
        entryFileNames: 'main.js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
});
