import * as vscode from 'vscode';
import { applyPatchSet, validatePatchSet, type TextPatch } from '../core/source/PatchSet.js';
import type { CanonicalDocument, DocumentApplyResult } from './DocumentSession.js';

export class VscodeCanonicalDocument implements CanonicalDocument {
  public constructor(private readonly document: vscode.TextDocument) {}

  public get uri(): string {
    return this.document.uri.toString();
  }

  public get version(): number {
    return this.document.version;
  }

  public get eol(): '\n' | '\r\n' {
    return this.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  }

  public getText(): string {
    return this.document.getText();
  }

  public async save(): Promise<boolean> {
    return await this.document.save();
  }

  public async apply(baseVersion: number, patches: readonly TextPatch[]): Promise<DocumentApplyResult> {
    const source = this.document.getText();
    if (this.document.version !== baseVersion) {
      return this.failure('stale version');
    }
    const validation = validatePatchSet(source, patches);
    if (!validation.ok) {
      return this.failure(validation.reason);
    }
    const expected = applyPatchSet(source, patches);
    await Promise.resolve();
    if (this.document.version !== baseVersion || this.document.getText() !== source) {
      return this.failure('document changed before apply');
    }

    const edit = new vscode.WorkspaceEdit();
    for (const patch of patches) {
      edit.replace(
        this.document.uri,
        new vscode.Range(this.document.positionAt(Number(patch.from)), this.document.positionAt(Number(patch.to))),
        patch.insert
      );
    }
    if (!(await vscode.workspace.applyEdit(edit))) {
      return this.failure('workspace edit rejected');
    }
    if (this.document.getText() !== expected) {
      return this.failure('canonical result mismatch');
    }
    return { ok: true, version: this.document.version, text: this.document.getText() };
  }

  private failure(reason: string): DocumentApplyResult {
    return { ok: false, reason, version: this.document.version, text: this.document.getText() };
  }
}
