import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import yauzl from 'yauzl';

const REQUIRED_FILES = [
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
  'extension/media/walkthrough/sample.md',
  'extension/media/walkthrough/open.md',
  'extension/media/walkthrough/edit.md',
  'extension/media/walkthrough/default.md',
  'extension/dist/extension.js',
  'extension/dist/webview/main.js',
  'extension/dist/webview/assets/main.css'
];

const FORBIDDEN_PATTERNS = [
  /(^|\/)\.(?:env|git|github|superpowers)(?:\/|$)/u,
  /(^|\/)(?:artifacts|configs|docs\/delivery|fixtures|node_modules|scripts|src|test|tests)(?:\/|$)/u,
  /\.map$/u,
  /(?:^|\/)AGENTS\.md$/u
];

const ALLOWED_FILES = new Set([
  ...REQUIRED_FILES
]);
const ALLOWED_PREFIXES = ['extension/dist/webview/assets/'];

export function validatePackageEntries(entries) {
  const files = entries.map((entry) => entry.replaceAll('\\', '/')).filter(Boolean);
  const fileSet = new Set(files);

  for (const required of REQUIRED_FILES) {
    if (!fileSet.has(required)) {
      throw new Error(`Missing required package file: ${required}`);
    }
  }

  if (![...fileSet].some((entry) => /\/dist\/webview\/assets\/KaTeX_[^/]+\.woff2$/u.test(entry))) {
    throw new Error('Missing required package file: a local KaTeX WOFF2 font');
  }
  for (const [pattern, name] of [
    [/\/dist\/webview\/assets\/shantell-sans-latin-wght-normal(?:-[^/]+)?\.woff2$/u, 'Shantell Sans'],
    [/\/dist\/webview\/assets\/jetbrains-mono-latin-wght-normal(?:-[^/]+)?\.woff2$/u, 'JetBrains Mono']
  ]) {
    if (![...fileSet].some((entry) => pattern.test(entry))) {
      throw new Error(`Missing required package file: a local ${name} WOFF2 font`);
    }
  }

  for (const entry of files) {
    if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(entry))) {
      throw new Error(`Forbidden package file: ${entry}`);
    }
    if (!ALLOWED_FILES.has(entry) && !ALLOWED_PREFIXES.some((prefix) => entry.startsWith(prefix))) {
      throw new Error(`Unexpected package file: ${entry}`);
    }
  }

  return { fileCount: files.length };
}

export function validateAssetReferences(archive) {
  for (const [entry, contents] of archive) {
    if (!entry.startsWith('extension/dist/webview/') || !/\.(?:css|js)$/u.test(entry)) continue;

    const source = contents.toString('utf8');
    const references = entry.endsWith('.css') ? cssAssetReferences(source) : javaScriptAssetReferences(source);
    for (const reference of references) {
      if (/^(?:data:|https?:|#)/u.test(reference)) continue;
      if (reference.startsWith('/')) {
        throw new Error(`Absolute packaged asset reference in ${entry}: ${reference}`);
      }
      if (!reference.startsWith('./') && !reference.startsWith('../')) continue;

      const withoutSuffix = reference.split(/[?#]/u, 1)[0];
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entry), withoutSuffix));
      if (!resolved.startsWith('extension/dist/webview/') || !archive.has(resolved)) {
        throw new Error(`Missing referenced package asset from ${entry}: ${reference}`);
      }
    }
  }
}

function cssAssetReferences(source) {
  const references = [];
  const pattern = /url\(\s*(?:(['"])(.*?)\1|([^)'"\s]+))\s*\)/gu;
  for (const match of source.matchAll(pattern)) references.push(match[2] ?? match[3]);
  return references;
}

function javaScriptAssetReferences(source) {
  const references = [];
  const patterns = [
    /\bimport\(\s*(['"`])([^'"`$]+)\1\s*\)/gu,
    /\bnew URL\(\s*(['"`])([^'"`$]+)\1\s*,\s*import\.meta\.url\s*\)/gu,
    /\b(?:import|export)\s*[^;"'`]*?\bfrom\s*(['"])([^'"]+)\1/gu,
    /\bimport\s*(['"])([^'"]+)\1/gu
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) references.push(match[2]);
  }
  return references;
}

async function main() {
  const packageManifest = JSON.parse(await readFile('package.json', 'utf8'));
  const vsixPath = process.argv[2] ?? path.join('artifacts', `markami-${packageManifest.version}.vsix`);
  const archive = await readArchive(vsixPath);
  const entries = [...archive.keys()];
  const result = validatePackageEntries(entries);
  validateAssetReferences(archive);
  const archivedManifestBuffer = archive.get('extension/package.json');
  if (!archivedManifestBuffer) throw new Error('Packaged manifest could not be read.');
  const archivedManifest = JSON.parse(archivedManifestBuffer.toString('utf8'));

  for (const [field, expected] of [
    ['name', 'markami'],
    ['version', packageManifest.version],
    ['publisher', packageManifest.publisher],
    ['main', './dist/extension.js'],
    ['icon', 'media/icon.png'],
    ['license', 'MIT']
  ]) {
    if (archivedManifest[field] !== expected) {
      throw new Error(`Packaged manifest ${field} must equal ${JSON.stringify(expected)}.`);
    }
  }

  const artifact = await stat(vsixPath);
  console.log(
    `Package policy passed: ${vsixPath} contains ${String(result.fileCount)} files (${String(artifact.size)} bytes).`
  );
}

async function readArchive(vsixPath) {
  const zip = await new Promise((resolve, reject) => {
    yauzl.open(vsixPath, { lazyEntries: true }, (error, value) =>
      error || !value ? reject(error ?? new Error('VSIX could not be opened.')) : resolve(value)
    );
  });

  return await new Promise((resolve, reject) => {
    const entries = new Map();
    zip.once('error', reject);
    zip.once('close', () => resolve(entries));
    zip.on('entry', (entry) => {
      if (entry.fileName.endsWith('/')) {
        zip.readEntry();
        return;
      }
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          zip.close();
          reject(error ?? new Error(`VSIX entry could not be read: ${entry.fileName}`));
          return;
        }
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.once('error', reject);
        stream.once('end', () => {
          entries.set(entry.fileName, Buffer.concat(chunks));
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
