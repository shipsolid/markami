import { spawnSync } from 'node:child_process';
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
  if (input.publish && input.version.includes('-')) {
    throw new Error('Visual Studio Marketplace publishing does not accept semantic prerelease versions.');
  }
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
  const manifestRepository = repositoryUrl ? githubSlug(repositoryUrl) : undefined;
  if (!repositoryUrl || !manifestRepository || /(?:example\.com|placeholder|todo)/iu.test(repositoryUrl)) {
    throw new Error('Manifest contains a missing or placeholder repository URL.');
  }
  if (input.notices.trim().length < 20) throw new Error('Third-party dependency notices are missing.');
  for (const required of REQUIRED_FILES) {
    if (!input.requiredFiles.has(required)) throw new Error(`Required release file is missing: ${required}`);
  }

  const notes = parseFrontmatter(input.releaseNotes);
  if (notes.version !== input.version) throw new Error('Release notes version does not match the explicit release version.');
  if (!/^\d+$/u.test(notes.artifact_size ?? '') || Number(notes.artifact_size) < 1) {
    throw new Error('Release notes require a positive artifact_size value.');
  }
  if (!/^[a-f0-9]{64}$/u.test(notes.artifact_sha256 ?? '')) {
    throw new Error('Release notes require a lowercase artifact_sha256 value.');
  }

  const blockers = [];
  const publisher = String(input.manifest.publisher ?? '').toLowerCase();
  if (DEVELOPMENT_PUBLISHERS.has(publisher)) {
    blockers.push('package publisher is still the local development identifier');
  } else if (!publisher || /(?:^|[-_.])(?:example|placeholder|todo)(?:$|[-_.])/u.test(publisher)) {
    blockers.push('package publisher is missing or contains a placeholder identifier');
  }
  if (notes.public_release !== 'approved') blockers.push('public release notes are not approved');
  if (!notes.publisher || notes.publisher === 'pending-owner-input') {
    blockers.push('Marketplace publisher identity is pending');
  }
  if (notes.listing_approved !== 'true') blockers.push('public Marketplace listing is not approved');
  if (!input.marketplaceCaptures?.length) blockers.push('actual Marketplace capture is missing');
  else if (input.marketplaceCaptures.some((capture) => !input.readme.includes(capture))) {
    blockers.push('Marketplace capture is not referenced by README listing content');
  }
  if (/- \[ \]/u.test(input.releaseNotes)) blockers.push('public release checklist still has unchecked blockers');

  if (input.publish) {
    if (!input.publisherInput || input.publisherInput !== input.manifest.publisher || input.publisherInput !== notes.publisher) {
      blockers.push('owner-supplied publisher does not match the manifest and approved release notes');
    }
    if (!input.repositoryInput || input.repositoryInput !== notes.repository) {
      blockers.push('owner-supplied repository target does not match approved release notes');
    }
    if (manifestRepository !== input.repositoryInput) {
      blockers.push('manifest repository does not match the owner-supplied release target');
    }
    if (blockers.length > 0) throw new Error(`Public release blocked: ${blockers.join('; ')}.`);
  }

  return { blockers, notes };
}

export function validateArtifact({ version, artifactName, artifact, checksum, releaseNotes }) {
  const expectedName = `markami-${version}.vsix`;
  if (artifactName !== expectedName) throw new Error(`Release artifact must be named ${expectedName}.`);
  const match = checksum.match(/^([a-f0-9]{64})  ([^\r\n]+)\r?\n?$/u);
  if (!match || match[2] !== expectedName) throw new Error('Checksum file must name the exact versioned VSIX.');
  const actual = createHash('sha256').update(artifact).digest('hex');
  if (actual !== match[1]) throw new Error(`Artifact checksum mismatch: expected ${match[1]}, received ${actual}.`);
  const notes = parseFrontmatter(releaseNotes);
  if (notes.version !== version) throw new Error('Release notes version does not match the artifact version.');
  if (notes.artifact_size !== String(artifact.length)) {
    throw new Error(`Release notes artifact size does not match ${String(artifact.length)} bytes.`);
  }
  if (notes.artifact_sha256 !== actual) throw new Error('Release notes artifact SHA-256 does not match the VSIX.');
  const visibleSize = releaseNotes.match(/^\| Size \| ([\d,]+) bytes \|$/mu)?.[1]?.replaceAll(',', '');
  if (visibleSize !== String(artifact.length)) {
    throw new Error(`Visible release-note size does not match ${String(artifact.length)} bytes.`);
  }
  const visibleDigest = releaseNotes.match(/^\| SHA-256 \| `([a-f0-9]{64})` \|$/mu)?.[1];
  if (visibleDigest !== actual) throw new Error('Visible release-note SHA-256 does not match the VSIX.');
}

export function validateCleanRevision(status) {
  const normalized = status.trim();
  if (normalized) throw new Error(`Release source revision is not clean:\n${normalized}`);
}

export function validateReleaseTag(head, tagged, version) {
  if (!tagged) throw new Error(`Release tag v${version} does not exist.`);
  if (head !== tagged) throw new Error(`Release tag v${version} does not point at the checked-out revision.`);
}

export function validateReleaseRef(ref, version) {
  const expected = `refs/tags/v${version}`;
  if (ref !== expected) throw new Error(`Release workflow must run from ${expected}, received ${ref}.`);
}

export function validateOidcEnvironment(environment) {
  if (!environment.ACTIONS_ID_TOKEN_REQUEST_URL || !environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    throw new Error('Public release blocked: GitHub Actions OIDC is unavailable in the protected environment.');
  }
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
  const scp = repositoryUrl.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/iu);
  if (scp) return `${scp[1]}/${scp[2]}`;

  try {
    const parsed = new URL(repositoryUrl.replace(/^git\+/u, ''));
    if (!['https:', 'ssh:'].includes(parsed.protocol) || parsed.hostname.toLowerCase() !== 'github.com') return undefined;
    if (parsed.search || parsed.hash) return undefined;
    const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/u);
    return match ? `${match[1]}/${match[2]}` : undefined;
  } catch {
    return undefined;
  }
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
    else if (['--version', '--phase', '--publisher', '--repository', '--artifact', '--ref', '--notes'].includes(argument)) {
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
  const releaseNotesPath = options.notes ?? path.join('docs', 'delivery', 'release-notes.md');
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
    readFile(releaseNotesPath, 'utf8'),
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
    if (options.requireTag) {
      requireReleaseTag(options.version);
      if (options.ref) validateReleaseRef(options.ref, options.version);
    }
  } else {
    const artifactPath = options.artifact ?? path.join('artifacts', `markami-${options.version}.vsix`);
    const [artifact, checksum] = await Promise.all([
      readFile(artifactPath),
      readFile(`${artifactPath}.sha256`, 'utf8')
    ]);
    validateArtifact({
      version: options.version,
      artifactName: path.basename(artifactPath),
      artifact,
      checksum,
      releaseNotes
    });
  }

  if (options.requireOidc && options.publish) validateOidcEnvironment(process.env);

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
  const status = runGit(['status', '--porcelain', '--untracked-files=all']);
  validateCleanRevision(status);
}

function requireReleaseTag(version) {
  const head = runGit(['rev-parse', 'HEAD']).trim();
  const tagged = runGit(['rev-list', '-n', '1', `refs/tags/v${version}`], true).trim();
  validateReleaseTag(head, tagged, version);
}

function runGit(arguments_, allowNonzero = false) {
  const result = spawnSync('git', arguments_, { encoding: 'utf8' });
  if (result.status === 0) return result.stdout;
  if (allowNonzero && result.status !== null) return '';
  if (result.error) throw result.error;
  throw new Error(`git ${arguments_.join(' ')} failed: ${result.stderr.trim()}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) await main();
