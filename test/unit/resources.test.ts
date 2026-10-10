import { mkdtemp, mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { ResourceService, resolveResource } from '../../src/extension/resources.js';
import { findLinks, githubSlug } from '../../src/webview/features/links/links.js';
import { planLinkDestination } from '../../src/webview/features/links/links.js';
import { findImages, planImageField } from '../../src/webview/features/images/images.js';
import { applyPatchSet } from '../../src/core/source/PatchSet.js';
import { webviewContentSecurityPolicy } from '../../src/extension/security.js';

describe('resource policy', () => {
  test('keeps scripts local and only permits remote images when configured', () => {
    const blocked = webviewContentSecurityPolicy('vscode-webview:', 'block', 'nonce-value');
    const allowed = webviewContentSecurityPolicy('vscode-webview:', 'allow', 'nonce-value');

    expect(blocked).toContain("default-src 'none'");
    expect(blocked).toContain("script-src vscode-webview: 'nonce-nonce-value'");
    expect(blocked).not.toContain('https:');
    expect(allowed).toContain('img-src vscode-webview: data: https:');
    expect(allowed).not.toMatch(/(?:script-src|font-src)[^;]*https:/u);
  });

  test('resolves encoded relative files and same-document fragments', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'markami-resources-'));
    const docs = path.join(root, 'docs');
    await mkdir(docs);
    await writeFile(path.join(docs, 'run book.md'), '# Run Book');

    await expect(resolveResource(path.join(docs, 'index.md'), './run%20book.md', [root], 'prompt')).resolves.toMatchObject({
      ok: true,
      kind: 'localFile',
      path: path.join(docs, 'run book.md')
    });
    await expect(resolveResource(path.join(docs, 'index.md'), '#run-book', [root], 'prompt')).resolves.toEqual({
      ok: true,
      kind: 'fragment',
      fragment: 'run-book'
    });
  });

  test('blocks traversal, symlink escape, missing files, and malicious schemes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'markami-root-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'markami-outside-'));
    await writeFile(path.join(root, 'index.md'), 'x');
    await writeFile(path.join(outside, 'secret.png'), 'secret');
    await symlink(path.join(outside, 'secret.png'), path.join(root, 'escape.png'));

    await expect(resolveResource(path.join(root, 'index.md'), '../outside.md', [root], 'prompt')).resolves.toMatchObject({ ok: false });
    await expect(resolveResource(path.join(root, 'index.md'), './escape.png', [root], 'prompt')).resolves.toMatchObject({ ok: false });
    await expect(resolveResource(path.join(root, 'index.md'), './missing.png', [root], 'prompt')).resolves.toEqual({ ok: false, reason: 'resource does not exist' });
    await expect(resolveResource(path.join(root, 'index.md'), 'javascript:alert(1)', [root], 'prompt')).resolves.toEqual({ ok: false, reason: 'resource scheme is blocked' });
    await expect(resolveResource(path.join(root, 'index.md'), '//evil.example/asset', [root], 'prompt')).resolves.toMatchObject({ ok: false });
    await expect(resolveResource(path.join(root, 'index.md'), 'data:text/html,pwned', [root], 'prompt')).resolves.toEqual({ ok: false, reason: 'resource scheme is blocked' });
    await expect(resolveResource(path.join(root, 'index.md'), 'command:%77orkbench.action.closeWindow', [root], 'prompt')).resolves.toEqual({ ok: false, reason: 'resource scheme is blocked' });
  });

  test('enforces remote image block, prompt, and allow policy', async () => {
    const document = '/workspace/doc.md';
    await expect(resolveResource(document, 'https://example.com/a.png', ['/workspace'], 'block')).resolves.toEqual({ ok: false, reason: 'remote resources are blocked' });
    await expect(resolveResource(document, 'https://example.com/a.png', ['/workspace'], 'prompt')).resolves.toMatchObject({ ok: true, kind: 'remote', requiresConfirmation: true });
    await expect(resolveResource(document, 'https://example.com/a.png', ['/workspace'], 'allow')).resolves.toMatchObject({ ok: true, kind: 'remote', requiresConfirmation: false });
  });

  test('image picker keeps in-workspace files relative and copies external files uniquely', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'markami-images-'));
    const external = await mkdtemp(path.join(tmpdir(), 'markami-external-'));
    const document = path.join(root, 'docs', 'guide.md');
    await mkdir(path.dirname(document), { recursive: true });
    await writeFile(document, '# Guide');
    const inside = path.join(root, 'images', 'diagram.png');
    await mkdir(path.dirname(inside));
    await writeFile(inside, 'inside');

    const insideService = new ResourceService({ workspaceRoots: [root], trusted: true, pickFile: () => Promise.resolve(inside) });
    await expect(insideService.pickImage(document)).resolves.toBe('![diagram](../images/diagram.png)');

    const externalFile = path.join(external, 'diagram.png');
    await writeFile(externalFile, 'outside');
    const externalService = new ResourceService({
      workspaceRoots: [root],
      trusted: true,
      pasteDirectory: 'media/${documentBasename}',
      pickFile: () => Promise.resolve(externalFile)
    });
    const first = await externalService.pickImage(document);
    const second = await externalService.pickImage(document);
    expect(first).toBe('![diagram](../media/guide/diagram.png)');
    expect(second).toBe('![diagram](../media/guide/diagram-2.png)');
    await expect(readFile(path.join(root, 'media', 'guide', 'diagram.png'), 'utf8')).resolves.toBe('outside');
  });

  test('preserves inline/reference link forms and creates deterministic duplicate slugs', () => {
    const source = '[Guide](./guide.md) and [Runbook][ops]\n\n[ops]: ./runbook.md';
    expect(findLinks(source)).toEqual(expect.arrayContaining([
      expect.objectContaining({ form: 'inline', destination: './guide.md' }),
      expect.objectContaining({ form: 'reference', destination: './runbook.md', reference: 'ops' })
    ]));
    expect(githubSlug('Hello World', ['hello-world'])).toBe('hello-world-1');
    const reference = findLinks(source).find((link) => link.form === 'reference');
    if (reference === undefined) throw new Error('missing reference link');
    const edit = planLinkDestination(source, reference, '../ops.md');
    expect(edit.ok).toBe(true);
    if (edit.ok) {
      expect(applyPatchSet(source, edit.edit.patches)).toBe('[Guide](./guide.md) and [Runbook][ops]\n\n[ops]: ../ops.md');
    }
  });

  test('maps inline and reference image fields without changing their source form', () => {
    const source = '![Architecture](./arch.png "System") and ![Logo][brand]\n\n[brand]: ./logo.webp';
    const images = findImages(source);
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ form: 'inline', alt: 'Architecture', destination: './arch.png', title: 'System' });
    expect(images[1]).toMatchObject({ form: 'reference', alt: 'Logo', destination: './logo.webp', reference: 'brand' });

    const referenceImage = images[1];
    if (referenceImage === undefined) throw new Error('missing reference image');
    const referenceEdit = planImageField(source, referenceImage, 'destination', '../assets/logo.webp');
    expect(referenceEdit.ok).toBe(true);
    if (referenceEdit.ok) {
      expect(applyPatchSet(source, referenceEdit.edit.patches)).toContain('[brand]: ../assets/logo.webp');
      expect(applyPatchSet(source, referenceEdit.edit.patches)).toContain('![Logo][brand]');
    }
  });

  test('rejects unsupported, oversized, and untrusted external image copies', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'markami-validation-'));
    const external = await mkdtemp(path.join(tmpdir(), 'markami-validation-outside-'));
    const document = path.join(root, 'doc.md');
    await writeFile(document, '# Doc');
    const textFile = path.join(external, 'asset.txt');
    const imageFile = path.join(external, 'asset.png');
    await writeFile(textFile, 'text');
    await writeFile(imageFile, 'too large');

    await expect(new ResourceService({ workspaceRoots: [root], trusted: true, pickFile: () => Promise.resolve(textFile) }).pickImage(document))
      .rejects.toThrow('supported image type');
    await expect(new ResourceService({ workspaceRoots: [root], trusted: true, maxImageBytes: 2, pickFile: () => Promise.resolve(imageFile) }).pickImage(document))
      .rejects.toThrow('size limit');
    await expect(new ResourceService({ workspaceRoots: [root], trusted: false, pickFile: () => Promise.resolve(imageFile) }).pickImage(document))
      .rejects.toThrow('trusted workspace');
  });

  test('rejects a symlinked external-image destination', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'markami-copy-root-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'markami-copy-outside-'));
    const external = await mkdtemp(path.join(tmpdir(), 'markami-copy-source-'));
    const document = path.join(root, 'guide.md');
    const image = path.join(external, 'diagram.png');
    await writeFile(document, '# Guide');
    await writeFile(image, 'image');
    await symlink(outside, path.join(root, 'assets'));
    const service = new ResourceService({ workspaceRoots: [root], trusted: true, pickFile: () => Promise.resolve(image) });

    await expect(service.pickImage(document)).rejects.toThrow('outside the workspace');
    await expect(readFile(path.join(outside, 'guide', 'diagram.png'))).rejects.toThrow();
    await expect(stat(path.join(outside, 'guide'))).rejects.toThrow();
  });

  test('rejects paste-directory traversal even in a trusted workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'markami-copy-root-'));
    const external = await mkdtemp(path.join(tmpdir(), 'markami-copy-source-'));
    const document = path.join(root, 'guide.md');
    const image = path.join(external, 'diagram.png');
    await writeFile(document, '# Guide');
    await writeFile(image, 'image');
    const service = new ResourceService({
      workspaceRoots: [root],
      trusted: true,
      pasteDirectory: '../escape/${documentBasename}',
      pickFile: () => Promise.resolve(image)
    });

    await expect(service.pickImage(document)).rejects.toThrow('workspace-relative');
  });

  test('maps dot-only document basenames to a safe asset segment', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'markami-dot-name-'));
    const external = await mkdtemp(path.join(tmpdir(), 'markami-dot-source-'));
    const document = path.join(root, '...md');
    const image = path.join(external, 'diagram.png');
    await writeFile(document, '# Dot');
    await writeFile(image, 'image');
    const service = new ResourceService({
      workspaceRoots: [root], trusted: true, pickFile: () => Promise.resolve(image)
    });

    await expect(service.pickImage(document)).resolves.toBe('![diagram](assets/document/diagram.png)');
  });

  test('ignores resource-looking Markdown inside code and honors collapsed references', () => {
    const source = [
      '`[inline](https://example.com)`',
      '```md',
      '![fenced](https://example.com/fenced.png)',
      '```',
      '\\[escaped](https://example.com)',
      '[Guide][] and ![Logo][]',
      '',
      '[Guide]: ./guide.md',
      '[Logo]: ./logo.png'
    ].join('\n');

    expect(findLinks(source)).toEqual([
      expect.objectContaining({ form: 'reference', label: 'Guide', destination: './guide.md', reference: 'Guide' })
    ]);
    expect(findImages(source)).toEqual([
      expect.objectContaining({ form: 'reference', alt: 'Logo', destination: './logo.png', reference: 'Logo' })
    ]);
  });
});

describe('symlinked workspace roots', () => {
  async function symlinkedWorkspace(): Promise<{ readonly link: string; readonly document: string }> {
    const base = await mkdtemp(path.join(tmpdir(), 'markami-symlink-'));
    const real = path.join(base, 'real');
    await mkdir(path.join(real, 'docs'), { recursive: true });
    await mkdir(path.join(real, 'images'));
    await writeFile(path.join(real, 'docs', 'a.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(real, 'images', 'diagram.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const link = path.join(base, 'link');
    await symlink(real, link, 'junction');
    return { link, document: path.join(link, 'docs', 'index.md') };
  }

  test('resolved images stay inside the lexical root that the webview is allowed to load', async () => {
    const { link, document } = await symlinkedWorkspace();

    await expect(resolveResource(document, './a.png', [link], 'block')).resolves.toEqual({
      ok: true,
      kind: 'localFile',
      path: path.join(link, 'docs', 'a.png')
    });
  });

  test('an image picked inside a symlinked workspace is linked relative to the document', async () => {
    const { link, document } = await symlinkedWorkspace();
    const service = new ResourceService({
      workspaceRoots: [link],
      trusted: true,
      pickFile: () => Promise.resolve(path.join(link, 'images', 'diagram.png'))
    });

    await expect(service.pickImage(document)).resolves.toBe('![diagram](../images/diagram.png)');
  });
});

