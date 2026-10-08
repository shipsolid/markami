import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_FILES = [
  'CHANGELOG.md',
  'LICENSE',
  'PRIVACY.md',
  'README.md',
  'SECURITY.md',
  'THIRD_PARTY_NOTICES.txt',
  'docs/delivery/install-smoke.md',
  'docs/delivery/release-notes.md',
  'docs/delivery/verification.md',
  'docs/syntax-support.md',
  'media/icon.png'
];
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const DEVELOPMENT_PUBLISHERS = new Set(['markami-dev', 'publisher', 'todo', 'your-publisher']);

export function validateReleaseSource(input) {
  if (!SEMVER.test(input.version)) throw new Error(`Release version must be an explicit semantic version: ${input.version}`);
  if (input.manifest.version !== input.version) {
    throw new Error(`Manifest version ${String(input.manifest.version)} does not match release ${input.version}.`);
  }
  if (input.manifest.name !== 'markami' || input.manifest.displayName !== 'markami') {
    throw new Error('Manifest product name and display name must both be markami.');
  }
  if (!new RegExp(`^## ${escapeRegExp(input.version)}(?:\\s|$)`, 'mu').test(input.changelog)) {
    throw new Error(`Changelog has no heading for ${input.version}.`);
  }
  if (!input.readme.includes('Edit Markdown where you read it.')) {
    throw new Error('README must contain the locked markami tagline.');
  }
  if (input.manifest.license !== 'MIT') throw new Error('Manifest license must match the established MIT decision.');
  if (input.manifest.icon !== 'media/icon.png') throw new Error('Manifest must reference the packaged markami icon.');
  if (typeof input.manifest.description !== 'string' || input.manifest.description.trim().length < 20) {
    throw new Error('Manifest description is missing or still a placeholder.');
  }

  const repositoryUrl = repositoryUrlFrom(input.manifest.repository);
  if (!repositoryUrl || /(?:example\.com|placeholder|todo)/iu.test(repositoryUrl)) {
    throw new Error('Manifest contains a missing or placeholder repository URL.');
  }
  if (input.notices.trim().length < 20) throw new Error('Third-party dependency notices are missing.');
  for (const required of REQUIRED_FILES) {
    if (!input.requiredFiles.has(required)) throw new Error(`Required release file is missing: ${required}`);
  }

  const notes = parseFrontmatter(input.releaseNotes);
  if (notes.version !== input.version) throw new Error('Release notes version does not match the explicit release version.');

  const blockers = [];
  const publisher = String(input.manifest.publisher ?? '').toLowerCase();
  if (DEVELOPMENT_PUBLISHERS.has(publisher)) {
    blockers.push('package publisher is still the local development identifier');
  }
  if (notes.public_release !== 'approved') blockers.push('public release notes are not approved');
  if (!notes.publisher || notes.publisher === 'pending-owner-input') {
    blockers.push('Marketplace publisher identity is pending');
  }
  if (notes.listing_approved !== 'true') blockers.push('public Marketplace listing is not approved');
  if (!input.marketplaceCaptures?.length) blockers.push('actual Marketplace capture is missing');
  if (/- \[ \]/u.test(input.releaseNotes)) blockers.push('public release checklist still has unchecked blockers');

  if (input.publish) {
    if (!input.publisherInput || input.publisherInput !== input.manifest.publisher || input.publisherInput !== notes.publisher) {
      blockers.push('owner-supplied publisher does not match the manifest and approved release notes');
    }
    if (!input.repositoryInput || input.repositoryInput !== notes.repository) {
      blockers.push('owner-supplied repository target does not match approved release notes');
    }
    const manifestRepository = githubSlug(repositoryUrl);
    if (!manifestRepository || manifestRepository !== input.repositoryInput) {
      blockers.push('manifest repository does not match the owner-supplied release target');
    }
    if (blockers.length > 0) throw new Error(`Public release blocked: ${blockers.join('; ')}.`);
  }

  return { blockers, notes };
}

export function validateArtifact({ version, artifactName, artifact, checksum }) {
  const expectedName = `markami-${version}.vsix`;
  if (artifactName !== expectedName) throw new Error(`Release artifact must be named ${expectedName}.`);
  const match = checksum.match(/^([a-f0-9]{64})  ([^\r\n]+)\r?\n?$/u);
  if (!match || match[2] !== expectedName) throw new Error('Checksum file must name the exact versioned VSIX.');
  const actual = createHash('sha256').update(artifact).digest('hex');
  if (actual !== match[1]) throw new Error(`Artifact checksum mismatch: expected ${match[1]}, received ${actual}.`);
}

export function validateCleanRevision(status) {
  const normalized = status.trim();
  if (normalized) throw new Error(`Release source revision is not clean:\n${normalized}`);
}

export function validateReleaseTag(head, tagged, version) {
  if (!tagged) throw new Error(`Release tag v${version} does not exist.`);
  if (head !== tagged) throw new Error(`Release tag v${version} does not point at the checked-out revision.`);
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match) throw new Error('Release notes require machine-readable frontmatter.');
  const result = {};
  for (const line of match[1].split(/\r?\n/u)) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/u, '$2');
  }
  return result;
}

function repositoryUrlFrom(repository) {
  if (typeof repository === 'string') return repository;
  if (repository && typeof repository === 'object' && typeof repository.url === 'string') return repository.url;
  return undefined;
}

function githubSlug(repositoryUrl) {
  const match = repositoryUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/iu);
  return match ? `${match[1]}/${match[2]}` : undefined;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function parseArguments(arguments_) {
  const options = { phase: 'source', publish: false, requireTag: false, requireOidc: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--publish') options.publish = true;
    else if (argument === '--require-tag') options.requireTag = true;
    else if (argument === '--require-oidc') options.requireOidc = true;
    else if (['--version', '--phase', '--publisher', '--repository', '--artifact'].includes(argument)) {
      const value = arguments_[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      options[argument.slice(2)] = value;
      index += 1;
    } else throw new Error(`Unknown release preflight argument: ${argument}`);
  }
  if (!options.version) throw new Error('--version is required.');
  if (!['source', 'artifact'].includes(options.phase)) throw new Error('--phase must be source or artifact.');
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const requiredFiles = new Set();
  for (const required of REQUIRED_FILES) {
    try {
      await access(required);
      requiredFiles.add(required);
    } catch {
      // Validation reports every missing required path consistently.
    }
  }
  const [changelog, readme, releaseNotes, notices] = await Promise.all([
    readFile('CHANGELOG.md', 'utf8'),
    readFile('README.md', 'utf8'),
    readFile('docs/delivery/release-notes.md', 'utf8'),
    readFile('THIRD_PARTY_NOTICES.txt', 'utf8')
  ]);
  const marketplaceCaptures = await findMarketplaceCaptures();
  const result = validateReleaseSource({
    version: options.version,
    publish: options.publish,
    publisherInput: options.publisher,
    repositoryInput: options.repository,
    manifest,
    changelog,
    readme,
    releaseNotes,
    notices,
    requiredFiles,
    marketplaceCaptures
  });

  if (options.phase === 'source') {
    requireCleanRevision();
    if (options.requireTag) requireReleaseTag(options.version);
  } else {
    const artifactPath = options.artifact ?? path.join('artifacts', `markami-${options.version}.vsix`);
    const [artifact, checksum] = await Promise.all([
      readFile(artifactPath),
      readFile(`${artifactPath}.sha256`, 'utf8')
    ]);
    validateArtifact({ version: options.version, artifactName: path.basename(artifactPath), artifact, checksum });
  }

  if (options.requireOidc && options.publish && !process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
    throw new Error('Public release blocked: GitHub Actions OIDC is unavailable in the protected environment.');
  }

  if (options.publish) {
    console.log(`Public release preflight passed for ${manifest.publisher}.markami@${options.version}.`);
  } else {
    console.log(`Local release preparation passed for markami@${options.version}.`);
    for (const blocker of result.blockers) console.log(`Marketplace blocker: ${blocker}.`);
  }
}

async function findMarketplaceCaptures() {
  try {
    const entries = await readdir(path.join('media', 'marketplace'), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /\.(?:gif|jpe?g|png|webp)$/iu.test(entry.name))
      .map((entry) => path.posix.join('media', 'marketplace', entry.name));
  } catch {
    return [];
  }
}

function requireCleanRevision() {
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' });
  validateCleanRevision(status);
}

function requireReleaseTag(version) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  let tagged;
  try {
    tagged = execFileSync('git', ['rev-list', '-n', '1', `refs/tags/v${version}`], { encoding: 'utf8' }).trim();
  } catch {
    tagged = '';
  }
  validateReleaseTag(head, tagged, version);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) await main();
