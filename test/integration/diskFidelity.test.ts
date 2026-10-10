import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { removeDirectory } from './support.js';

suite('disk fidelity', function () {
  this.timeout(30_000);
  let directory: string;

  setup(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'markami-disk-'));
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await removeDirectory(directory);
  });

  for (const [name, source] of [
    ['bom-crlf', '\uFEFF# Heading\r\n\r\nTrailing  \r\nEmoji 😀 e\u0301\r\n'],
    ['lf-no-final', '# Heading\n\nTrailing  \nEmoji 😀 e\u0301']
  ] as const) {
    test(`open and close does not rewrite ${name}`, async () => {
      const filePath = path.join(directory, `${name}.md`);
      await writeFile(filePath, source, 'utf8');
      const uri = vscode.Uri.file(filePath);

      await vscode.workspace.openTextDocument(uri);
      await vscode.commands.executeCommand('vscode.openWith', uri, 'markami.editor');
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

      assert.equal(await readFile(filePath, 'utf8'), source);
    });

    test(`bounded host edit preserves untouched ${name} bytes`, async () => {
      const filePath = path.join(directory, `${name}-edit.md`);
      await writeFile(filePath, source, 'utf8');
      const document = await vscode.workspace.openTextDocument(filePath);
      // VS Code strips the BOM from document text, so offsets must come from the document, not the disk bytes.
      const offset = document.getText().indexOf('Heading');
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(offset), document.positionAt(offset + 'Heading'.length)),
        'Edited'
      );

      assert.equal(await vscode.workspace.applyEdit(edit), true);
      assert.equal(await document.save(), true);
      assert.equal(await readFile(filePath, 'utf8'), source.replace('Heading', 'Edited'));
    });
  }

  test('oversized rendered open falls back to the complete source document', async () => {
    const source = `# large\n${'x'.repeat((4 * 1024 * 1024) + 1)}`;
    const filePath = path.join(directory, 'large.md');
    await writeFile(filePath, source, 'utf8');
    const uri = vscode.Uri.file(filePath);

    await vscode.commands.executeCommand('vscode.openWith', uri, 'markami.editor');
    await new Promise((resolve) => setTimeout(resolve, 250));

    const active = vscode.window.activeTextEditor?.document;
    assert.equal(active?.uri.toString(), uri.toString());
    assert.equal(active.getText(), source);
    assert.equal(await readFile(filePath, 'utf8'), source);
  });

  test('Save All persists canonical edits without normalizing neighboring bytes', async () => {
    const source = '\uFEFF# One\r\n\r\nTwo  \r\n';
    const filePath = path.join(directory, 'save-all.md');
    await writeFile(filePath, source, 'utf8');
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, document.positionAt(document.getText().indexOf('Two') + 3), ' edited');

    assert.equal(await vscode.workspace.applyEdit(edit), true);
    await vscode.commands.executeCommand('workbench.action.files.saveAll');
    assert.equal(await readFile(filePath, 'utf8'), source.replace('Two', 'Two edited'));
  });

  test('non-file workspace documents open and close without resource rewrites', async () => {
    const source = new TextEncoder().encode('# Remote\n\nSource 😀');
    const uri = vscode.Uri.parse('markami-memory:/docs/remote.md');
    const emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    const provider: vscode.FileSystemProvider = {
      onDidChangeFile: emitter.event,
      watch: () => new vscode.Disposable(() => undefined),
      stat: () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: source.byteLength }),
      readDirectory: () => [],
      createDirectory: () => undefined,
      readFile: () => source,
      writeFile: () => { throw vscode.FileSystemError.NoPermissions('read only'); },
      delete: () => undefined,
      rename: () => undefined
    };
    const registration = vscode.workspace.registerFileSystemProvider('markami-memory', provider, { isCaseSensitive: true });
    try {
      await vscode.workspace.openTextDocument(uri);
      await vscode.commands.executeCommand('vscode.openWith', uri, 'markami.editor');
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      assert.equal(new TextDecoder().decode(source), '# Remote\n\nSource 😀');
    } finally {
      registration.dispose();
      emitter.dispose();
    }
  });
});
