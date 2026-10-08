import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';

suite('frontmatter and unsafe document syntax', function () {
  this.timeout(20_000);
  let directory: string;

  setup(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'markami-document-syntax-'));
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await rm(directory, { force: true, recursive: true });
  });

  test('csp_editor_preserves_frontmatter_unsafe_html_and_unknown_syntax', async () => {
    const filePath = path.join(directory, 'syntax.md');
    const original = Buffer.from([
      '---',
      '# keep this comment',
      'title: "Exact"',
      '---',
      '',
      '<script>globalThis.markamiPwned = true</script>',
      '',
      ':::repository-directive',
      '**literal source**',
      ':::',
      ''
    ].join('\r\n'), 'utf8');
    await writeFile(filePath, original);

    await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(filePath), 'markami.editor');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

    assert.deepEqual(await readFile(filePath), original);
  });
});
