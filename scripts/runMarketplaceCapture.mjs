import { execFileSync } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

import { MARKETPLACE_CAPTURES, validateMarketplaceCapture } from './marketplaceListing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function validateCaptureArguments(arguments_) {
  if (arguments_.length !== 1) throw new Error('Marketplace capture requires one explicit VSIX artifact path.');
  const artifact = path.resolve(arguments_[0]);
  if (path.extname(artifact).toLowerCase() !== '.vsix') throw new Error('Marketplace capture input must be a .vsix artifact.');
  return artifact;
}

export async function validateExtractedExtension(extractRoot) {
  const extensionRoot = path.join(extractRoot, 'extension');
  const manifestPath = path.join(extensionRoot, 'package.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Extracted VSIX is missing a readable extension/package.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (manifest.name !== 'markami' || manifest.publisher !== 'shipsolid') {
    throw new Error('Extracted VSIX must identify shipsolid.markami.');
  }
  try {
    await access(path.join(extensionRoot, 'dist', 'extension.js'));
  } catch {
    throw new Error('Extracted VSIX is missing extension/dist/extension.js.');
  }
  return extensionRoot;
}

export function validateCaptureOutputs(captures) {
  const expected = MARKETPLACE_CAPTURES.map((capture) => capture.path);
  for (const capture of expected) {
    if (!captures.includes(capture)) throw new Error(`Marketplace capture output is missing ${capture}.`);
  }
  for (const capture of captures) {
    if (!expected.includes(capture)) throw new Error(`Unexpected Marketplace capture output: ${capture}.`);
  }
}

async function main(arguments_) {
  const artifact = validateCaptureArguments(arguments_);
  await access(artifact);
  if (!process.env.DISPLAY) throw new Error('Marketplace capture requires an X11 DISPLAY, normally provided by xvfb-run.');

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'markami-marketplace-capture-'));
  try {
    const extractedRoot = path.join(temporaryRoot, 'vsix');
    const stagedCaptureRoot = path.join(temporaryRoot, 'captures');
    await mkdir(extractedRoot, { recursive: true });
    await mkdir(stagedCaptureRoot, { recursive: true });
    execFileSync('unzip', ['-q', artifact, '-d', extractedRoot], { stdio: 'inherit' });
    const extensionRoot = await validateExtractedExtension(extractedRoot);

    const extensionTestsPath = path.join(root, 'out', 'marketplace-capture', 'suite', 'index.js');
    await access(extensionTestsPath);
    await runTests({
      version: process.env.VSCODE_VERSION ?? 'stable',
      extensionDevelopmentPath: extensionRoot,
      extensionTestsPath,
      extensionTestsEnv: {
        MARKETPLACE_CAPTURE_DIR: stagedCaptureRoot,
        MARKETPLACE_CAPTURE_TOOL: process.env.MARKETPLACE_CAPTURE_TOOL ?? 'import'
      },
      launchArgs: [
        path.join(root, 'fixtures', 'marketplace'),
        '--disable-extensions',
        '--disable-gpu',
        '--no-sandbox',
        '--skip-welcome',
        '--skip-release-notes',
        '--start-maximized',
        '--user-data-dir',
        path.join(temporaryRoot, 'user-data'),
        '--extensions-dir',
        path.join(temporaryRoot, 'extensions')
      ]
    });

    const produced = (await readdir(stagedCaptureRoot))
      .filter((name) => name.toLowerCase().endsWith('.png'))
      .map((name) => path.posix.join('media', 'marketplace', name));
    validateCaptureOutputs(produced);

    const destination = path.join(root, 'media', 'marketplace');
    await mkdir(destination, { recursive: true });
    for (const capture of MARKETPLACE_CAPTURES) {
      const name = path.basename(capture.path);
      const staged = path.join(stagedCaptureRoot, name);
      const bytes = await readFile(staged);
      validateMarketplaceCapture(capture.path, bytes);
      await copyFile(staged, path.join(destination, name));
    }
    console.log(`Captured ${String(MARKETPLACE_CAPTURES.length)} Marketplace images from ${path.basename(artifact)}.`);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
