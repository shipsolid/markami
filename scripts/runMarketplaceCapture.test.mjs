import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  validateCaptureArguments,
  validateCaptureOutputs,
  validateExtractedExtension
} from './runMarketplaceCapture.mjs';

const allCaptures = [
  'media/marketplace/rendered-editor.png',
  'media/marketplace/source-preserving-editing.png',
  'media/marketplace/technical-markdown.png',
  'media/marketplace/git-diff.png'
];

test('accepts only one explicit VSIX artifact argument', () => {
  assert.equal(validateCaptureArguments(['artifacts/markami-0.1.0.vsix']), path.resolve('artifacts/markami-0.1.0.vsix'));
  assert.throws(() => validateCaptureArguments([]), /one.*VSIX/iu);
  assert.throws(() => validateCaptureArguments(['artifact.zip']), /VSIX/iu);
  assert.throws(() => validateCaptureArguments(['one.vsix', 'two.vsix']), /one.*VSIX/iu);
});

test('rejects extracted archives without the packaged extension manifest', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'markami-capture-test-'));
  try {
    await assert.rejects(() => validateExtractedExtension(directory), /extension.*package\.json/iu);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('accepts only an extracted shipsolid markami package with its runtime bundle', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'markami-capture-test-'));
  try {
    await mkdir(path.join(directory, 'extension', 'dist'), { recursive: true });
    await writeFile(path.join(directory, 'extension', 'package.json'), JSON.stringify({
      name: 'markami',
      publisher: 'shipsolid'
    }));
    await writeFile(path.join(directory, 'extension', 'dist', 'extension.js'), 'runtime');

    assert.equal(await validateExtractedExtension(directory), path.join(directory, 'extension'));

    await writeFile(path.join(directory, 'extension', 'package.json'), JSON.stringify({
      name: 'markami',
      publisher: 'someone-else'
    }));
    await assert.rejects(() => validateExtractedExtension(directory), /shipsolid\.markami/iu);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('requires every named Marketplace capture and rejects extras', () => {
  assert.doesNotThrow(() => validateCaptureOutputs(allCaptures));
  assert.throws(() => validateCaptureOutputs(allCaptures.slice(0, 2)), /missing.*technical-markdown/iu);
  assert.throws(() => validateCaptureOutputs([...allCaptures, 'media/marketplace/extra.png']), /unexpected.*extra/iu);
});
