import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAssetReferences, validatePackageEntries } from './checkPackage.mjs';

const validEntries = [
  '[Content_Types].xml',
  'extension.vsixmanifest',
  'extension/package.json',
  'extension/readme.md',
  'extension/changelog.md',
  'extension/LICENSE.txt',
  'extension/SECURITY.md',
  'extension/PRIVACY.md',
  'extension/THIRD_PARTY_NOTICES.txt',
  'extension/media/icon.png',
  'extension/dist/extension.js',
  'extension/dist/webview/main.js',
  'extension/dist/webview/assets/main.css',
  'extension/dist/webview/assets/KaTeX_Main-Regular.woff2'
];

test('accepts the minimal production package surface', () => {
  const result = validatePackageEntries(validEntries);

  assert.equal(result.fileCount, validEntries.length);
});

test('rejects missing runtime files', () => {
  assert.throws(
    () => validatePackageEntries(validEntries.filter((entry) => entry !== 'extension/dist/extension.js')),
    /missing required package file.*dist\/extension\.js/iu
  );
});

test('rejects development and sensitive files', () => {
  for (const entry of [
    'extension/src/extension.ts',
    'extension/test/editor.test.ts',
    'extension/scripts/checkPackage.mjs',
    'extension/docs/delivery/progress.md',
    'extension/.github/workflows/ci.yml',
    'extension/.superpowers/plans/task.md',
    'extension/dist/extension.js.map',
    'extension/.env'
  ]) {
    assert.throws(
      () => validatePackageEntries([...validEntries, entry]),
      new RegExp(`forbidden package file.*${entry.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'iu')
    );
  }
});

test('requires packaged CSS asset references to stay relative and resolve', () => {
  const validArchive = new Map([
    ['extension/dist/webview/assets/main.css', Buffer.from('@font-face{src:url(./KaTeX_Main-Regular.woff2)}')],
    ['extension/dist/webview/assets/KaTeX_Main-Regular.woff2', Buffer.from('font')]
  ]);

  assert.doesNotThrow(() => validateAssetReferences(validArchive));
  assert.throws(
    () =>
      validateAssetReferences(
        new Map([
          ['extension/dist/webview/assets/main.css', Buffer.from('src:url(/assets/KaTeX_Main-Regular.woff2)')]
        ])
      ),
    /absolute packaged asset reference/iu
  );
  assert.throws(
    () =>
      validateAssetReferences(
        new Map([
          ['extension/dist/webview/main.js', Buffer.from('import("./assets/missing.js")')]
        ])
      ),
    /missing referenced package asset/iu
  );
});

test('requires static imports and re-exports to resolve inside the package', () => {
  const source = [
    'import"./side-effect.js";',
    'import{x}from"./named-import.js";',
    'export{y}from"./re-export.js";'
  ].join('');
  const archive = new Map([
    ['extension/dist/webview/assets/entry.js', Buffer.from(source)],
    ['extension/dist/webview/assets/side-effect.js', Buffer.from('')],
    ['extension/dist/webview/assets/named-import.js', Buffer.from('')],
    ['extension/dist/webview/assets/re-export.js', Buffer.from('')]
  ]);

  assert.doesNotThrow(() => validateAssetReferences(archive));
  archive.delete('extension/dist/webview/assets/re-export.js');
  assert.throws(() => validateAssetReferences(archive), /missing referenced package asset.*re-export\.js/iu);
});
