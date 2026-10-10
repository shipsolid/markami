import {
  VIEW_PREFERENCES_SCHEMA_VERSION,
  type EffectiveViewPreferences,
  type FileViewOverrideChanges,
  type FileViewOverrides,
  type PreferenceRecord,
  type StoredViewPreferences
} from '../protocol/viewPreferences.js';

export const MAX_VIEW_PREFERENCE_RECORDS = 1000;
export const VIEW_PREFERENCES_STORAGE_KEY = 'markami.viewPreferences.v1';

const preferenceKeys = [
  'appearance',
  'width',
  'maxContentWidth',
  'syntaxReveal',
  'outlineCollapsed'
] as const;

type PreferenceKey = typeof preferenceKeys[number];

export interface ViewPreferencesStorage {
  read(): unknown;
  update(value: StoredViewPreferences | undefined): PromiseLike<void>;
}

export interface ViewPreferencesMemento {
  get(key: string): unknown;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface ViewPreferencesStoreOptions {
  readonly maxRecords?: number;
  readonly now?: () => number;
  readonly rememberPerFile?: () => boolean;
}

export function resolveViewPreferences(
  defaults: EffectiveViewPreferences,
  overrides: FileViewOverrides
): EffectiveViewPreferences {
  return { ...defaults, ...sanitizeOverrides(overrides) };
}

export class ViewPreferencesStore {
  private readonly session = new Map<string, FileViewOverrides>();
  // Reads only note recency here: the extension-host memento replaces its whole value when VS Code echoes an
  // older storage change, so a read that writes can resurrect records a newer write or reset already removed.
  private readonly touched = new Map<string, number>();
  private readonly maxRecords: number;
  private readonly now: () => number;
  private readonly rememberPerFile: () => boolean;
  private queue: Promise<void> = Promise.resolve();
  private lastTimestamp = 0;

  public constructor(
    private readonly storage: ViewPreferencesStorage,
    options: ViewPreferencesStoreOptions = {}
  ) {
    this.maxRecords = options.maxRecords ?? MAX_VIEW_PREFERENCE_RECORDS;
    this.now = options.now ?? Date.now;
    this.rememberPerFile = options.rememberPerFile ?? (() => true);
  }

  public get(uri: string): Promise<FileViewOverrides> {
    return this.serialized(() => {
      if (!this.shouldPersist(uri)) {
        return { ...this.session.get(uri) };
      }
      const state = readState(this.storage.read());
      if (state === undefined) return {};
      const record = readRecord(state.records[uri]);
      if (record === undefined) return {};
      this.touched.set(uri, this.timestamp());
      return sanitizeOverrides(record.overrides);
    });
  }

  public update(uri: string, changes: FileViewOverrideChanges): Promise<void> {
    return this.serialized(async () => {
      if (!this.shouldPersist(uri)) {
        const next = applyChanges(this.session.get(uri) ?? {}, changes);
        if (Object.keys(next).length === 0) this.session.delete(uri);
        else this.session.set(uri, next);
        return;
      }
      const records = { ...(readState(this.storage.read())?.records ?? {}) };
      const next = applyChanges(sanitizeOverrides(readRecord(records[uri])?.overrides), changes);
      if (Object.keys(next).length === 0) Reflect.deleteProperty(records, uri);
      else records[uri] = createRecord(next, this.timestamp());
      await this.writeRecords(records);
    });
  }

  public resetFile(uri: string): Promise<void> {
    return this.serialized(async () => {
      this.session.delete(uri);
      this.touched.delete(uri);
      const state = readState(this.storage.read());
      if (state === undefined || state.records[uri] === undefined) return;
      const records = { ...state.records };
      Reflect.deleteProperty(records, uri);
      await this.writeRecords(records);
    });
  }

  public resetWorkspace(): Promise<void> {
    return this.serialized(async () => {
      this.session.clear();
      this.touched.clear();
      await this.storage.update(undefined);
    });
  }

  public closeSession(uri: string): Promise<void> {
    return this.serialized(() => {
      this.session.delete(uri);
      return Promise.resolve();
    });
  }

  public promoteSessionOverrides(uri: string, overrides: FileViewOverrides): Promise<void> {
    return this.serialized(async () => {
      const sanitized = sanitizeOverrides(overrides);
      if (Object.keys(sanitized).length === 0) return;
      if (!this.shouldPersist(uri)) {
        this.session.set(uri, sanitized);
        return;
      }
      const records = { ...(readState(this.storage.read())?.records ?? {}) };
      records[uri] = createRecord(sanitized, this.timestamp());
      await this.writeRecords(records);
    });
  }

  public rename(oldUri: string, newUri: string): Promise<void> {
    return this.serialized(async () => {
      const sessionMoves = [...this.session.entries()].filter(([uri]) => sameOrDescendant(uri, oldUri));
      for (const [uri] of sessionMoves) this.session.delete(uri);
      for (const uri of this.touched.keys()) {
        if (sameOrDescendant(uri, oldUri)) this.touched.delete(uri);
      }
      const state = readState(this.storage.read());
      const records = { ...(state?.records ?? {}) };
      const recordMoves = Object.entries(records).filter(([uri]) => sameOrDescendant(uri, oldUri));
      for (const [uri] of recordMoves) Reflect.deleteProperty(records, uri);

      for (const [uri, persisted] of recordMoves) {
        const current = readRecord(persisted);
        records[migratePreferenceUri(uri, oldUri, newUri)] = current === undefined
          ? persisted
          : createRecord(sanitizeOverrides(current.overrides), this.timestamp());
      }
      let persistedSession = false;
      for (const [uri, sessionOverrides] of sessionMoves) {
        const migrated = migratePreferenceUri(uri, oldUri, newUri);
        if (uri.startsWith('untitled:') && this.shouldPersist(migrated)) {
          records[migrated] = createRecord(sessionOverrides, this.timestamp());
          persistedSession = true;
        } else {
          this.session.set(migrated, sessionOverrides);
        }
      }
      if (recordMoves.length > 0 || persistedSession) {
        await this.writeRecords(records);
      }
    });
  }

  public delete(uri: string): Promise<void> {
    return this.serialized(async () => {
      for (const key of this.session.keys()) {
        if (sameOrDescendant(key, uri)) this.session.delete(key);
      }
      for (const key of this.touched.keys()) {
        if (sameOrDescendant(key, uri)) this.touched.delete(key);
      }
      const state = readState(this.storage.read());
      if (state === undefined) return;
      const records = { ...state.records };
      let changed = false;
      for (const key of Object.keys(records)) {
        if (sameOrDescendant(key, uri)) {
          Reflect.deleteProperty(records, key);
          changed = true;
        }
      }
      if (changed) await this.writeRecords(records);
    });
  }

  private shouldPersist(uri: string): boolean {
    return this.rememberPerFile() && !uri.startsWith('untitled:');
  }

  private timestamp(): number {
    this.lastTimestamp = Math.max(this.now(), this.lastTimestamp + 1);
    return this.lastTimestamp;
  }

  private withRecency(records: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    const refreshed: Record<string, unknown> = { ...records };
    for (const [uri, touchedAt] of this.touched) {
      const record = readRecord(refreshed[uri]);
      if (record !== undefined && touchedAt > record.updatedAt) {
        refreshed[uri] = createRecord(record.overrides, touchedAt);
      }
    }
    this.touched.clear();
    return refreshed;
  }

  private async writeRecords(records: Readonly<Record<string, unknown>>): Promise<void> {
    const bounded = Object.entries(this.withRecency(records))
      .sort(([leftUri, left], [rightUri, right]) =>
        recordTimestamp(left) - recordTimestamp(right) || leftUri.localeCompare(rightUri))
      .slice(-this.maxRecords);
    if (bounded.length === 0) {
      await this.storage.update(undefined);
      return;
    }
    await this.storage.update({
      schemaVersion: VIEW_PREFERENCES_SCHEMA_VERSION,
      records: Object.fromEntries(bounded)
    });
  }

  private serialized<T>(operation: () => T | PromiseLike<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

export class MementoViewPreferencesStorage implements ViewPreferencesStorage {
  public constructor(private readonly memento: ViewPreferencesMemento) {}

  public read(): unknown {
    return this.memento.get(VIEW_PREFERENCES_STORAGE_KEY);
  }

  public update(value: StoredViewPreferences | undefined): PromiseLike<void> {
    return this.memento.update(VIEW_PREFERENCES_STORAGE_KEY, value);
  }
}

export class ScopedMementoViewPreferencesStorage implements ViewPreferencesStorage {
  public constructor(
    private readonly workspaceState: ViewPreferencesMemento,
    private readonly globalState: ViewPreferencesMemento,
    private readonly hasWorkspace: () => boolean
  ) {}

  public read(): unknown {
    return this.current().get(VIEW_PREFERENCES_STORAGE_KEY);
  }

  public update(value: StoredViewPreferences | undefined): PromiseLike<void> {
    return this.current().update(VIEW_PREFERENCES_STORAGE_KEY, value);
  }

  private current(): ViewPreferencesMemento {
    return this.hasWorkspace() ? this.workspaceState : this.globalState;
  }
}

function readState(value: unknown): StoredViewPreferences | undefined {
  if (!isRecord(value) || value.schemaVersion !== VIEW_PREFERENCES_SCHEMA_VERSION || !isRecord(value.records)) {
    return undefined;
  }
  return { schemaVersion: VIEW_PREFERENCES_SCHEMA_VERSION, records: { ...value.records } };
}

function readRecord(value: unknown): PreferenceRecord | undefined {
  if (!isRecord(value) || value.schemaVersion !== VIEW_PREFERENCES_SCHEMA_VERSION ||
    typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt) ||
    !isRecord(value.overrides)) return undefined;
  const overrides = sanitizeOverrides(value.overrides);
  return Object.keys(overrides).length === 0 ? undefined : createRecord(overrides, value.updatedAt);
}

function applyChanges(current: FileViewOverrides, changes: FileViewOverrideChanges): FileViewOverrides {
  const next: Record<string, unknown> = { ...current };
  const raw = changes as Record<string, unknown>;
  for (const key of preferenceKeys) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const value = raw[key];
    if (value === undefined) Reflect.deleteProperty(next, key);
    else if (validPreference(key, value)) next[key] = value;
  }
  return sanitizeOverrides(next);
}

function sanitizeOverrides(value: unknown): FileViewOverrides {
  if (!isRecord(value)) return {};
  const result: Record<string, unknown> = {};
  for (const key of preferenceKeys) {
    const candidate = value[key];
    if (validPreference(key, candidate)) result[key] = candidate;
  }
  return result;
}

function validPreference(key: PreferenceKey, value: unknown): boolean {
  if (key === 'appearance') return value === 'vscode' || value === 'document';
  if (key === 'width') return value === 'auto' || value === 'readable' || value === 'full';
  if (key === 'maxContentWidth') {
    return typeof value === 'number' && Number.isInteger(value) && value >= 480 && value <= 2400;
  }
  if (key === 'syntaxReveal') return value === 'activeBlock' || value === 'selection' || value === 'manual';
  return typeof value === 'boolean';
}

function createRecord(overrides: FileViewOverrides, updatedAt: number): PreferenceRecord {
  return { schemaVersion: VIEW_PREFERENCES_SCHEMA_VERSION, overrides, updatedAt };
}

function recordTimestamp(value: unknown): number {
  return isRecord(value) && typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
    ? value.updatedAt
    : Number.MAX_SAFE_INTEGER;
}

function sameOrDescendant(candidate: string, root: string): boolean {
  if (candidate === root) return true;
  const boundary = root.endsWith('/') ? root : `${root}/`;
  return candidate.startsWith(boundary);
}

function migratePreferenceUri(candidate: string, oldRoot: string, newRoot: string): string {
  return candidate === oldRoot ? newRoot : `${newRoot}${candidate.slice(oldRoot.length)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
