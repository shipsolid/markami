import { createHash } from 'node:crypto';
import type * as vscode from 'vscode';

export const RECOVERY_SCOPE_LIMIT_BYTES = 10 * 1024 * 1024;

export interface RecoveryRecord {
  readonly uri: string;
  readonly baseVersion: number;
  readonly canonicalBaseHash: string;
  readonly draftText: string;
  readonly timestamp: number;
}

export interface RecoveryStorage {
  get(): readonly RecoveryRecord[];
  update(records: readonly RecoveryRecord[]): PromiseLike<void>;
}

export type RecoveryPutResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'capacity exceeded'; readonly draft: RecoveryRecord };

export class RecoveryStore {
  private mutation: Promise<void> = Promise.resolve();

  public constructor(
    private readonly storage: RecoveryStorage,
    private readonly maxBytes = RECOVERY_SCOPE_LIMIT_BYTES
  ) {}

  public get(uri: string): RecoveryRecord | undefined {
    return this.storage.get().find((record) => record.uri === uri);
  }

  public put(record: RecoveryRecord): Promise<RecoveryPutResult> {
    return this.mutate(async () => {
      const records = [...this.storage.get().filter((item) => item.uri !== record.uri), record];
      const bytes = records.reduce((total, item) => total + new TextEncoder().encode(item.draftText).byteLength, 0);
      if (bytes > this.maxBytes) {
        return { ok: false, reason: 'capacity exceeded', draft: record };
      }
      await this.storage.update(records.sort((left, right) => left.timestamp - right.timestamp));
      return { ok: true };
    });
  }

  public clear(uri: string): Promise<void> {
    return this.mutate(() => this.storage.update(this.storage.get().filter((record) => record.uri !== uri)));
  }

  public rename(oldUri: string, newUri: string): Promise<void> {
    return this.mutate(() => this.storage.update(this.storage.get().map((record) => {
      if (!sameOrDescendantUri(record.uri, oldUri)) return record;
      return { ...record, uri: `${newUri}${record.uri.slice(oldUri.length)}` };
    })));
  }

  public delete(uri: string): Promise<void> {
    return this.mutate(() => this.storage.update(
      this.storage.get().filter((record) => !sameOrDescendantUri(record.uri, uri))
    ));
  }

  public static hashCanonical(text: string): string {
    return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
  }

  private mutate<T>(operation: () => PromiseLike<T>): Promise<T> {
    const next = this.mutation.then(() => operation());
    this.mutation = next.then(() => undefined, () => undefined);
    return next;
  }
}

function sameOrDescendantUri(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(root.endsWith('/') ? root : `${root}/`);
}

export class MementoRecoveryStorage implements RecoveryStorage {
  private static readonly key = 'markami.recovery.v1';

  public constructor(private readonly memento: vscode.Memento) {}

  public get(): readonly RecoveryRecord[] {
    return this.memento.get<readonly RecoveryRecord[]>(MementoRecoveryStorage.key, []);
  }

  public update(records: readonly RecoveryRecord[]): PromiseLike<void> {
    return this.memento.update(MementoRecoveryStorage.key, records);
  }
}
