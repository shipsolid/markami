import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  validateArtifact,
  validateCleanRevision,
  validateOidcEnvironment,
  validateReleaseRef,
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
      'artifact_size: 10',
      `artifact_sha256: ${'a'.repeat(64)}`,
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

test('public publishing rejects semantic prerelease versions before provider invocation', () => {
  const input = releaseInput({
    version: '0.1.0-beta.1',
    publish: true,
    manifest: { ...releaseInput().manifest, version: '0.1.0-beta.1' },
    changelog: '# Changelog\n\n## 0.1.0-beta.1\n',
    releaseNotes: releaseInput().releaseNotes.replace('version: 0.1.0', 'version: 0.1.0-beta.1')
  });

  assert.throws(() => validateReleaseSource(input), /prerelease versions/iu);
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
    readme: `${releaseInput().readme}\n![Editor](media/marketplace/editor.png)\n`,
    releaseNotes: approvedNotes,
    marketplaceCaptures: ['media/marketplace/editor.png']
  });

  assert.deepEqual(validateReleaseSource(input).blockers, []);
});

test('public publishing rejects placeholder-shaped publisher identities', () => {
  const approvedNotes = releaseInput().releaseNotes
    .replace('public_release: blocked', 'public_release: approved')
    .replace('publisher: pending-owner-input', 'publisher: example-publisher')
    .replace('listing_approved: false', 'listing_approved: true')
    .replace('- [ ] Native platform gates', '- [x] Native platform gates');
  const input = releaseInput({
    publish: true,
    publisherInput: 'example-publisher',
    repositoryInput: 'shipsolid/markami',
    manifest: { ...releaseInput().manifest, publisher: 'example-publisher' },
    readme: `${releaseInput().readme}\n![Editor](media/marketplace/editor.png)\n`,
    releaseNotes: approvedNotes,
    marketplaceCaptures: ['media/marketplace/editor.png']
  });

  assert.throws(() => validateReleaseSource(input), /publisher.*placeholder/iu);
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
  assert.throws(
    () =>
      validateReleaseSource(
        releaseInput({
          manifest: {
            ...releaseInput().manifest,
            repository: { url: 'https://evilgithub.com/shipsolid/markami.git' }
          }
        })
      ),
    /repository/iu
  );
});

test('public publishing rejects captures that are absent from listing content', () => {
  const approvedNotes = releaseInput().releaseNotes
    .replace('public_release: blocked', 'public_release: approved')
    .replace('publisher: pending-owner-input', 'publisher: amit-observability')
    .replace('listing_approved: false', 'listing_approved: true')
    .replace('- [ ] Native platform gates', '- [x] Native platform gates');

  assert.throws(
    () =>
      validateReleaseSource(
        releaseInput({
          publish: true,
          publisherInput: 'amit-observability',
          repositoryInput: 'shipsolid/markami',
          manifest: { ...releaseInput().manifest, publisher: 'amit-observability' },
          releaseNotes: approvedNotes,
          marketplaceCaptures: ['media/marketplace/orphan.png']
        })
      ),
    /capture.*listing content/iu
  );
});

test('validates the packaged VSIX checksum and explicit version', () => {
  const artifact = Buffer.from('vsix bytes');
  const digest = createHash('sha256').update(artifact).digest('hex');
  const releaseNotes = [
    '---',
    'version: 0.1.0',
    `artifact_size: ${String(artifact.length)}`,
    `artifact_sha256: ${digest}`,
    '---',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Size | ${String(artifact.length)} bytes |`,
    `| SHA-256 | \`${digest}\` |`
  ].join('\n');

  assert.doesNotThrow(() =>
    validateArtifact({
      version: '0.1.0',
      artifactName: 'markami-0.1.0.vsix',
      artifact,
      checksum: `${digest}  markami-0.1.0.vsix\n`,
      releaseNotes
    })
  );
  assert.throws(
    () =>
      validateArtifact({
        version: '0.1.0',
        artifactName: 'markami-0.1.0.vsix',
        artifact,
        checksum: `${'0'.repeat(64)}  markami-0.1.0.vsix\n`,
        releaseNotes
      }),
    /checksum mismatch/iu
  );
  assert.throws(
    () =>
      validateArtifact({
        version: '0.1.0',
        artifactName: 'markami-0.1.0.vsix',
        artifact,
        checksum: `${digest}  markami-0.1.0.vsix\n`,
        releaseNotes: releaseNotes.replace(digest, '0'.repeat(64))
      }),
    /release notes.*SHA-256/iu
  );
  assert.throws(
    () =>
      validateArtifact({
        version: '0.1.0',
        artifactName: 'markami-0.1.0.vsix',
        artifact,
        checksum: `${digest}  markami-0.1.0.vsix\n`,
        releaseNotes: releaseNotes.replace(`\`${digest}\``, `\`${'0'.repeat(64)}\``)
      }),
    /visible release-note SHA-256/iu
  );
});

test('rejects a dirty revision and a release tag that is absent from HEAD', () => {
  assert.doesNotThrow(() => validateCleanRevision(''));
  assert.throws(() => validateCleanRevision(' M package.json'), /not clean/iu);
  assert.doesNotThrow(() => validateReleaseTag('abc123', 'abc123', '0.1.0'));
  assert.throws(() => validateReleaseTag('abc123', '', '0.1.0'), /does not exist/iu);
  assert.throws(() => validateReleaseTag('abc123', 'def456', '0.1.0'), /does not point/iu);
  assert.doesNotThrow(() => validateReleaseRef('refs/tags/v0.1.0', '0.1.0'));
  assert.throws(() => validateReleaseRef('refs/heads/main', '0.1.0'), /must run from refs\/tags\/v0\.1\.0/iu);
});

test('requires both GitHub Actions OIDC request values', () => {
  assert.doesNotThrow(() =>
    validateOidcEnvironment({
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.example',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'masked-token'
    })
  );
  assert.throws(
    () => validateOidcEnvironment({ ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.example' }),
    /OIDC is unavailable/iu
  );
  assert.throws(() => validateOidcEnvironment({}), /OIDC is unavailable/iu);
});
