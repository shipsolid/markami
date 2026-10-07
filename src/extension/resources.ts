import { constants } from 'node:fs';
import { copyFile, mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { classifyResourceScheme, type RemoteResourcePolicy } from './security.js';

export type ResourceResult =
  | { readonly ok: true; readonly kind: 'fragment'; readonly fragment: string }
  | { readonly ok: true; readonly kind: 'remote'; readonly url: string; readonly requiresConfirmation: boolean }
  | { readonly ok: true; readonly kind: 'localFile'; readonly path: string; readonly fragment?: string }
  | { readonly ok: false; readonly reason: string };

export interface ResourceServiceOptions {
  readonly workspaceRoots: readonly string[];
  readonly trusted: boolean;
  readonly pickFile: () => Promise<string | undefined>;
  readonly maxImageBytes?: number;
}

const IMAGE_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);
const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export async function resolveResource(
  documentPath: string,
  rawPath: string,
  workspaceRoots: readonly string[],
  remotePolicy: RemoteResourcePolicy
): Promise<ResourceResult> {
  const trimmed = rawPath.trim();
  if (trimmed.startsWith('#')) {
    return { ok: true, kind: 'fragment', fragment: safeDecode(trimmed.slice(1)) };
  }

  const classified = classifyResourceScheme(trimmed);
  if (classified.kind === 'blocked') {
    return { ok: false, reason: 'resource scheme is blocked' };
  }
  if (classified.kind === 'remote') {
    if (remotePolicy === 'block') {
      return { ok: false, reason: 'remote resources are blocked' };
    }
    return {
      ok: true,
      kind: 'remote',
      url: classified.url.toString(),
      requiresConfirmation: remotePolicy === 'prompt'
    };
  }

  const [encodedPath, encodedFragment] = splitFragment(trimmed);
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(encodedPath);
  } catch {
    return { ok: false, reason: 'resource path is not valid URL encoding' };
  }
  if (decodedPath.length === 0 || path.isAbsolute(decodedPath)) {
    return { ok: false, reason: 'resource path must be relative' };
  }
  const candidate = path.resolve(path.dirname(documentPath), decodedPath);
  const lexicalRoot = workspaceRoots.find((root) => isWithin(root, candidate));
  if (lexicalRoot === undefined) {
    return { ok: false, reason: 'resource is outside the workspace' };
  }

  try {
    const [resolvedCandidate, resolvedRoot] = await Promise.all([realpath(candidate), realpath(lexicalRoot)]);
    if (!isWithin(resolvedRoot, resolvedCandidate)) {
      return { ok: false, reason: 'resource resolves outside the workspace' };
    }
    const metadata = await stat(resolvedCandidate);
    if (!metadata.isFile()) {
      return { ok: false, reason: 'resource is not a file' };
    }
    return {
      ok: true,
      kind: 'localFile',
      path: resolvedCandidate,
      ...(encodedFragment === undefined ? {} : { fragment: safeDecode(encodedFragment) })
    };
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return { ok: false, reason: 'resource does not exist' };
    }
    return { ok: false, reason: 'resource could not be resolved' };
  }
}

export class ResourceService {
  public constructor(private readonly options: ResourceServiceOptions) {}

  public async pickImage(documentPath: string): Promise<string | undefined> {
    const selected = await this.options.pickFile();
    if (selected === undefined) {
      return undefined;
    }
    const selectedPath = await realpath(selected);
    await validateImage(selectedPath, this.options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES);
    const root = await containingRoot(this.options.workspaceRoots, selectedPath);
    const imagePath = root === undefined
      ? await this.copyExternalImage(documentPath, selectedPath)
      : selectedPath;
    const relative = markdownPath(path.relative(path.dirname(documentPath), imagePath));
    const alt = path.basename(selectedPath, path.extname(selectedPath));
    return `![${escapeAlt(alt)}](${encodeMarkdownPath(relative)})`;
  }

  private async copyExternalImage(documentPath: string, selectedPath: string): Promise<string> {
    if (!this.options.trusted) {
      throw new Error('External images require a trusted workspace');
    }
    const documentRoot = await containingRoot(this.options.workspaceRoots, documentPath);
    if (documentRoot === undefined) {
      throw new Error('Document is outside the workspace');
    }
    const documentName = path.basename(documentPath, path.extname(documentPath));
    const destinationDirectory = path.join(path.dirname(documentPath), 'assets', safeSegment(documentName));
    if (!isWithin(documentRoot, destinationDirectory)) {
      throw new Error('Image destination is outside the workspace');
    }
    await mkdir(destinationDirectory, { recursive: true });
    const resolvedDestinationDirectory = await realpath(destinationDirectory);
    if (!isWithin(documentRoot, resolvedDestinationDirectory)) {
      throw new Error('Image destination resolves outside the workspace');
    }
    const extension = path.extname(selectedPath).toLocaleLowerCase();
    const base = path.basename(selectedPath, path.extname(selectedPath));
    for (let suffix = 1; suffix <= 10_000; suffix += 1) {
      const name = suffix === 1 ? `${base}${extension}` : `${base}-${String(suffix)}${extension}`;
      const destination = path.join(resolvedDestinationDirectory, name);
      try {
        await copyFile(selectedPath, destination, constants.COPYFILE_EXCL);
        return destination;
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error;
      }
    }
    throw new Error('Could not allocate a unique image name');
  }
}

async function validateImage(filePath: string, maxBytes: number): Promise<void> {
  if (!IMAGE_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase())) {
    throw new Error('Selected file is not a supported image type');
  }
  const metadata = await stat(filePath);
  if (!metadata.isFile()) throw new Error('Selected image is not a file');
  if (metadata.size > maxBytes) throw new Error('Selected image exceeds the size limit');
}

async function containingRoot(roots: readonly string[], candidate: string, resolveCandidate = true): Promise<string | undefined> {
  const resolvedCandidate = resolveCandidate ? await realpath(candidate) : path.resolve(candidate);
  for (const root of roots) {
    try {
      const resolvedRoot = await realpath(root);
      if (isWithin(resolvedRoot, resolvedCandidate)) return resolvedRoot;
    } catch {
      // A missing workspace root is not an allowed root.
    }
  }
  return undefined;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function splitFragment(value: string): readonly [string, string | undefined] {
  const index = value.indexOf('#');
  return index < 0 ? [value, undefined] : [value.slice(0, index), value.slice(index + 1)];
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function markdownPath(value: string): string {
  const normalized = value.split(path.sep).join('/');
  return normalized === '' ? '.' : normalized;
}

function encodeMarkdownPath(value: string): string {
  return value.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function escapeAlt(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]');
}

function safeSegment(value: string): string {
  const result = value.replaceAll(/[^a-z0-9._-]+/giu, '-').replaceAll(/^-+|-+$/gu, '');
  return result === '' ? 'document' : result;
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}
