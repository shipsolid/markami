import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WIDTH = 1440;
const HEIGHT = 900;
const GALLERY_START = '<!-- marketplace-gallery:start -->';
const GALLERY_END = '<!-- marketplace-gallery:end -->';

const GIF_MAX_BYTES = 3 * 1024 * 1024;

export const MARKETPLACE_CAPTURES = Object.freeze([
  Object.freeze({
    path: 'media/marketplace/demo.gif',
    format: 'gif',
    width: 960,
    height: 600,
    heading: 'Edit, save, and check the diff',
    alt: 'Animation: a paragraph promoted to a heading in markami, saved, then shown as a one-line Git diff',
    copy: 'Promote a paragraph to a heading in the rendered document, save, and Git shows the single line that changed.'
  }),
  Object.freeze({
    path: 'media/marketplace/rendered-editor.png',
    width: WIDTH,
    height: HEIGHT,
    heading: 'Edit in the rendered document',
    alt: 'markami rendered Markdown editor showing headings, tasks, a table, and document controls in VS Code',
    copy: 'Read and edit Markdown in one rendered surface while VS Code keeps the source document canonical.'
  }),
  Object.freeze({
    path: 'media/marketplace/source-preserving-editing.png',
    width: WIDTH,
    height: HEIGHT,
    heading: 'Reveal source only when you need it',
    alt: 'markami showing local Markdown source reveal and editing controls inside the rendered editor',
    copy: 'Reveal exact syntax for the active block without switching the whole document away from rendered editing.'
  }),
  Object.freeze({
    path: 'media/marketplace/technical-markdown.png',
    width: WIDTH,
    height: HEIGHT,
    heading: 'Keep technical content local',
    alt: 'markami rendering Mermaid, math, highlighted code, and a GitHub Flavored Markdown table in VS Code',
    copy: 'Mermaid, math, syntax highlighting, and table editing ship locally and continue to work offline.'
  }),
  Object.freeze({
    path: 'media/marketplace/git-diff.png',
    width: WIDTH,
    height: HEIGHT,
    heading: 'Keep your Git diffs small',
    alt: 'markami beside a Git diff in which promoting one paragraph to a heading changed exactly one line',
    copy: 'Promote a paragraph to a heading in the rendered document and the diff shows that one line. Line endings, trailing spaces, and table alignment stay as written.'
  })
]);

export function updateMarketplaceGallery(readme) {
  if (typeof readme !== 'string' || !readme.includes('Edit Markdown where you read it.')) {
    throw new Error('README must contain the locked markami tagline before adding the Marketplace gallery.');
  }

  const gallery = marketplaceGallery();
  const start = readme.indexOf(GALLERY_START);
  const end = readme.indexOf(GALLERY_END);
  if ((start < 0) !== (end < 0) || (start >= 0 && end < start)) {
    throw new Error('README contains an incomplete Marketplace gallery marker pair.');
  }
  if (start >= 0) {
    return `${readme.slice(0, start)}${gallery}${readme.slice(end + GALLERY_END.length)}`;
  }

  const tagline = 'Edit Markdown where you read it.';
  const insertion = readme.indexOf(tagline) + tagline.length;
  return `${readme.slice(0, insertion)}\n\n${gallery}${readme.slice(insertion)}`;
}

export function validateMarketplaceCapture(name, bytes) {
  const expected = MARKETPLACE_CAPTURES.find((capture) => capture.path === name);
  if (expected === undefined) throw new Error(`Unexpected Marketplace capture: ${name}`);
  if (expected.format === 'gif') validateGif(name, expected, bytes);
  else validatePng(name, expected, bytes);
}

function validatePng(name, expected, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 24) throw new Error(`${name} must be a PNG image.`);

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (
    !bytes.subarray(0, signature.length).equals(signature) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new Error(`${name} must be a PNG image.`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== expected.width || height !== expected.height) {
    throw new Error(`${name} must be ${String(expected.width)} by ${String(expected.height)} pixels; received ${String(width)} by ${String(height)}.`);
  }

  let offset = 8;
  let complete = false;
  let hasImageData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const next = offset + 12 + length;
    if (next > bytes.length) break;
    if (type === 'IDAT' && length > 0) hasImageData = true;
    if (type === 'IEND') {
      complete = length === 0 && next === bytes.length;
      break;
    }
    offset = next;
  }
  if (!complete) throw new Error(`${name} must be a complete PNG ending in an IEND chunk.`);
  if (!hasImageData) throw new Error(`${name} must contain PNG image data.`);
}

function validateGif(name, expected, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 14 || bytes.toString('ascii', 0, 6) !== 'GIF89a') {
    throw new Error(`${name} must be a GIF89a image.`);
  }
  if (bytes.length > GIF_MAX_BYTES) throw new Error(`${name} must stay under 3 MiB; received ${String(bytes.length)} bytes.`);
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  if (width !== expected.width || height !== expected.height) {
    throw new Error(`${name} must be ${String(expected.width)} by ${String(expected.height)} pixels; received ${String(width)} by ${String(height)}.`);
  }

  let offset = 13;
  if (bytes[10] & 0x80) offset += 3 * (2 ** ((bytes[10] & 0x07) + 1));
  let frames = 0;
  let loops = false;
  let complete = false;
  while (offset < bytes.length) {
    const marker = bytes[offset];
    if (marker === 0x3b) {
      complete = offset === bytes.length - 1;
      break;
    }
    if (marker === 0x21) {
      const label = bytes[offset + 1];
      if (label === 0xff && bytes.toString('ascii', offset + 3, offset + 14) === 'NETSCAPE2.0') loops = true;
      offset = skipSubBlocks(bytes, offset + 2);
    } else if (marker === 0x2c) {
      const packed = bytes[offset + 9];
      offset += 10;
      if (packed & 0x80) offset += 3 * (2 ** ((packed & 0x07) + 1));
      offset = skipSubBlocks(bytes, offset + 1);
      frames += 1;
    } else {
      break;
    }
    if (offset < 0) break;
  }
  if (!complete) throw new Error(`${name} must be a complete GIF ending in a trailer.`);
  if (frames < 2) throw new Error(`${name} must contain at least two frames.`);
  if (!loops) throw new Error(`${name} must loop (NETSCAPE2.0 extension).`);
}

function skipSubBlocks(bytes, start) {
  let offset = start;
  while (offset < bytes.length) {
    const size = bytes[offset];
    offset += 1 + size;
    if (size === 0) return offset;
  }
  return -1;
}

export function validateMarketplaceMetadata(manifest) {
  if (manifest?.name !== 'markami') throw new Error('Manifest product name must be markami.');
  if (manifest.displayName !== 'markami — Rendered Markdown Editor') {
    throw new Error('Manifest display name must use the approved Marketplace title.');
  }
  if (manifest.description !== 'Edit Markdown directly in a rendered, source-preserving VS Code editor.') {
    throw new Error('Manifest description must use the approved Marketplace copy.');
  }
  if (manifest.preview !== true) throw new Error('The 0.1.0 Marketplace release must be marked Preview.');
  if (manifest.pricing !== 'Free') throw new Error('Marketplace pricing must be Free.');
  if (manifest.galleryBanner?.color !== '#071D49' || manifest.galleryBanner?.theme !== 'dark') {
    throw new Error('Manifest gallery banner must use the approved markami color and dark theme.');
  }
  for (const category of ['Other', 'Visualization']) {
    if (!Array.isArray(manifest.categories) || !manifest.categories.includes(category)) {
      throw new Error(`Manifest categories must include ${category}.`);
    }
  }
  for (const keyword of ['markdown', 'markdown-editor', 'gfm', 'source-preserving', 'mermaid']) {
    if (!Array.isArray(manifest.keywords) || !manifest.keywords.includes(keyword)) {
      throw new Error(`Manifest keywords must include ${keyword}.`);
    }
  }
}

function marketplaceGallery() {
  const sections = MARKETPLACE_CAPTURES.flatMap((capture) => [
    `### ${capture.heading}`,
    '',
    capture.copy,
    '',
    `![${capture.alt}](${capture.path})`
  ]);
  return [GALLERY_START, '## See markami in action', '', ...sections, GALLERY_END].join('\n');
}

async function main(arguments_) {
  const [command, target] = arguments_;
  if (command === '--apply') {
    const readmePath = target ?? 'README.md';
    const current = await readFile(readmePath, 'utf8');
    await writeFile(readmePath, updateMarketplaceGallery(current), 'utf8');
    console.log(`Updated Marketplace gallery in ${readmePath}.`);
    return;
  }
  if (command === '--validate') {
    const root = target ?? '.';
    for (const capture of MARKETPLACE_CAPTURES) {
      const bytes = await readFile(path.join(root, capture.path));
      validateMarketplaceCapture(capture.path, bytes);
    }
    console.log(`Validated ${String(MARKETPLACE_CAPTURES.length)} Marketplace captures.`);
    return;
  }
  throw new Error('Usage: node scripts/marketplaceListing.mjs --apply [README] | --validate [root]');
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
