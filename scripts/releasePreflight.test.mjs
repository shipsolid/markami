import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  validateArtifact,
  validateCleanRevision,
  validateReleaseSource,
  validateReleaseTag
} from './releasePreflight.mjs';

const requiredFiles = new Set([
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
]);

function releaseInput(overrides = {}) {
  return {
    version: '0.1.0',
    publish: false,
    publisherInput: undefined,
    repositoryInput: undefined,
    manifest: {
      name: 'markami',
      displayName: 'markami',
      version: '0.1.0',
      publisher: 'markami-dev',
      description: 'Edit Markdown where you read it.',
      license: 'MIT',
      icon: 'media/icon.png',
      repository: { url: 'https://github.com/shipsolid/markami.git' }
    },
    changelog: '# Changelog\n\n## 0.1.0 — 2026-10-09\n',
    readme: '# markami\n\nEdit Markdown where you read it.\n',
    releaseNotes: [
      '---',
      'version: 0.1.0',
      'public_release: blocked',
      'publisher: pending-owner-input',
      'repository: shipsolid/markami',
      'listing_approved: false',
      '---',
      '',
      '## Public release blockers',
      '',
      '- [ ] Native platform gates'
    ].join('\n'),
    notices: 'dependency license notice',
    requiredFiles,
    marketplaceCaptures: [],
    ...overrides
  };
}

test('preparation accepts complete local metadata and reports public blockers', () => {
  const result = validateReleaseSource(releaseInput());

  assert.deepEqual(result.blockers, [
    'package publisher is still the local development identifier',
    'public release notes are not approved',
    'Marketplace publisher identity is pending',
    'public Marketplace listing is not approved',
    'actual Marketplace capture is missing',
    'public release checklist still has unchecked blockers'
  ]);
});

test('public publishing rejects a placeholder publisher and open release gates', () => {
  assert.throws(
    () =>
      validateReleaseSource(
        releaseInput({ publish: true, publisherInput: 'markami-dev', repositoryInput: 'shipsolid/markami' })
      ),
    /public release blocked.*development identifier/iu
  );
});

test('public publishing accepts owner-controlled metadata only after explicit approval', () => {
  const approvedNotes = releaseInput().releaseNotes
    .replace('public_release: blocked', 'public_release: approved')
    .replace('publisher: pending-owner-input', 'publisher: amit-observability')
    .replace('listing_approved: false', 'listing_approved: true')
    .replace('- [ ] Native platform gates', '- [x] Native platform gates');
  const input = releaseInput({
    publish: true,
    publisherInput: 'amit-observability',
    repositoryInput: 'shipsolid/markami',
    manifest: { ...releaseInput().manifest, publisher: 'amit-observability' },
    releaseNotes: approvedNotes,
    marketplaceCaptures: ['media/marketplace/editor.png']
  });

  assert.deepEqual(validateReleaseSource(input).blockers, []);
});

test('rejects version, changelog, tagline, and placeholder repository mismatches', () => {
  assert.throws(() => validateReleaseSource(releaseInput({ version: 'next' })), /semantic version/iu);
  assert.throws(() => validateReleaseSource(releaseInput({ changelog: '# Changelog\n' })), /changelog/iu);
  assert.throws(() => validateReleaseSource(releaseInput({ readme: '# markami\n' })), /tagline/iu);
  assert.throws(
    () =>
      validateReleaseSource(
        releaseInput({ manifest: { ...releaseInput().manifest, repository: { url: 'https://example.com/todo' } } })
      ),
    /placeholder repository/iu
  );
});

test('validates the packaged VSIX checksum and explicit version', () => {
  const artifact = Buffer.from('vsix bytes');
  const digest = createHash('sha256').update(artifact).digest('hex');

  assert.doesNotThrow(() =>
    validateArtifact({
      version: '0.1.0',
      artifactName: 'markami-0.1.0.vsix',
      artifact,
      checksum: `${digest}  markami-0.1.0.vsix\n`
    })
  );
  assert.throws(
    () =>
      validateArtifact({
        version: '0.1.0',
        artifactName: 'markami-0.1.0.vsix',
        artifact,
        checksum: `${'0'.repeat(64)}  markami-0.1.0.vsix\n`
      }),
    /checksum mismatch/iu
  );
});

test('rejects a dirty revision and a release tag that is absent from HEAD', () => {
  assert.doesNotThrow(() => validateCleanRevision(''));
  assert.throws(() => validateCleanRevision(' M package.json'), /not clean/iu);
  assert.doesNotThrow(() => validateReleaseTag('abc123', 'abc123', '0.1.0'));
  assert.throws(() => validateReleaseTag('abc123', '', '0.1.0'), /does not exist/iu);
  assert.throws(() => validateReleaseTag('abc123', 'def456', '0.1.0'), /does not point/iu);
});
