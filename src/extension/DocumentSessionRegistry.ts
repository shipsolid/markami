import * as vscode from 'vscode';
import { createTextPatch } from '../core/source/Patch.js';
import { DocumentSession } from './DocumentSession.js';
import { VscodeCanonicalDocument } from './applyPatch.js';
import type { RecoveryStore } from './RecoveryStore.js';

export class DocumentSessionRegistry implements vscode.Disposable {
  private readonly sessions = new Map<string, DocumentSession>();
  private readonly changes: vscode.Disposable;

  public constructor(private readonly recovery?: RecoveryStore) {
    this.changes = vscode.workspace.onDidChangeTextDocument((event) => {
      const session = this.sessions.get(event.document.uri.toString());
      if (session === undefined || session.isApplying) {
        return;
      }
      const patches = event.contentChanges.map((change) =>
        createTextPatch(change.rangeOffset, change.rangeOffset + change.rangeLength, change.text)
      );
      session.handleDocumentChanged(event.document.version - 1, event.document.version, patches);
    });
  }

  public get(document: vscode.TextDocument): DocumentSession {
    const key = document.uri.toString();
    let session = this.sessions.get(key);
    if (session === undefined) {
      session = new DocumentSession(new VscodeCanonicalDocument(document), this.recovery);
      this.sessions.set(key, session);
    }
    return session;
  }

  public dispose(): void {
    this.changes.dispose();
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
  }
}
