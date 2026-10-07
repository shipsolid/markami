import * as vscode from 'vscode';

export type HistoryAction = 'undo' | 'redo';

export class HistoryRouter {
  private readonly views = new Map<string, vscode.Uri>();

  public register(viewId: string, uri: vscode.Uri): void {
    this.views.set(viewId, uri);
  }

  public unregister(viewId: string): void {
    this.views.delete(viewId);
  }

  public async requestHistoryAction(viewId: string, action: HistoryAction): Promise<void> {
    const uri = this.views.get(viewId);
    const activeInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    if (uri === undefined || !(activeInput instanceof vscode.TabInputCustom) || activeInput.uri.toString() !== uri.toString()) {
      throw new Error('markami history action rejected because its custom editor is not active');
    }
    await vscode.commands.executeCommand(action);
  }
}
