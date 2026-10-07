import { build } from 'esbuild';

await build({
  entryPoints: ['src/extension/extension.ts'],
  bundle: true,
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  outfile: 'dist/extension.js',
  sourcemap: true,
  logLevel: 'info'
});
