import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  MARKETPLACE_CAPTURES,
  updateMarketplaceGallery,
  validateMarketplaceCapture,
  validateMarketplaceMetadata
} from './marketplaceListing.mjs';

const capturePaths = [
  'media/marketplace/rendered-editor.png',
  'media/marketplace/source-preserving-editing.png',
  'media/marketplace/technical-markdown.png',
  'media/marketplace/git-diff.png'
];

test('defines the complete ordered Marketplace capture contract', () => {
  assert.deepEqual(MARKETPLACE_CAPTURES.map(({ path }) => path), capturePaths);
  assert.ok(MARKETPLACE_CAPTURES.every(({ width, height }) => width === 1440 && height === 900));
});

test('generates an idempotent gallery while preserving unrelated README content', () => {
  const readme = [
    '# markami',
    '',
    'Edit Markdown where you read it.',
    '',
    '> **Release status:** candidate',
    '',
    '## What ships',
    '',
    'Keep this content.'
  ].join('\n');

  const once = updateMarketplaceGallery(readme);
  const twice = updateMarketplaceGallery(once);

  assert.equal(twice, once);
  assert.match(once, /Edit Markdown where you read it\.\n\n<!-- marketplace-gallery:start -->/u);
  assert.match(once, /<!-- marketplace-gallery:end -->\n\n> \*\*Release status:/u);
  assert.match(once, /Keep this content\./u);
  for (const capturePath of capturePaths) assert.equal(once.split(capturePath).length - 1, 1);
});

test('replaces only an existing generated gallery block', () => {
  const readme = [
    '# markami',
    '',
    'Edit Markdown where you read it.',
    '',
    '<!-- marketplace-gallery:start -->',
    'stale gallery',
    '<!-- marketplace-gallery:end -->',
    '',
    'After gallery.'
  ].join('\n');

  const updated = updateMarketplaceGallery(readme);

  assert.doesNotMatch(updated, /stale gallery/u);
  assert.match(updated, /After gallery\./u);
  assert.equal(updated.split('<!-- marketplace-gallery:start -->').length - 1, 1);
});

test('accepts only the named 1440 by 900 PNG captures', () => {
  const valid = pngFile(1440, 900);

  assert.doesNotThrow(() => validateMarketplaceCapture(capturePaths[0], valid));
  assert.throws(() => validateMarketplaceCapture('media/marketplace/other.png', valid), /unexpected Marketplace capture/iu);
  assert.throws(() => validateMarketplaceCapture(capturePaths[0], pngFile(1280, 720)), /1440.*900/iu);
  assert.throws(() => validateMarketplaceCapture(capturePaths[0], pngWithoutImageData(1440, 900)), /image data/iu);
  assert.throws(() => validateMarketplaceCapture(capturePaths[0], pngHeader(1440, 900)), /complete PNG/iu);
  assert.throws(() => validateMarketplaceCapture(capturePaths[0], Buffer.from('not a PNG')), /PNG/iu);
});

test('repository manifest exposes the approved Marketplace metadata', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  assert.doesNotThrow(() => validateMarketplaceMetadata(manifest));
  assert.equal(manifest.displayName, 'markami — Rendered Markdown Editor');
  assert.equal(manifest.description, 'Edit Markdown directly in a rendered, source-preserving VS Code editor.');
  assert.equal(manifest.preview, true);
  assert.deepEqual(manifest.galleryBanner, { color: '#071D49', theme: 'dark' });
  assert.equal(manifest.pricing, 'Free');
});

function pngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function pngFile(width, height) {
  const bytes = Buffer.alloc(58);
  pngHeader(width, height).copy(bytes);
  bytes.writeUInt32BE(1, 33);
  bytes.write('IDAT', 37, 'ascii');
  bytes.writeUInt8(0, 41);
  bytes.writeUInt32BE(0, 46);
  bytes.write('IEND', 50, 'ascii');
  return bytes;
}

function pngWithoutImageData(width, height) {
  const bytes = Buffer.alloc(45);
  pngHeader(width, height).copy(bytes);
  bytes.writeUInt32BE(0, 33);
  bytes.write('IEND', 37, 'ascii');
  return bytes;
}
