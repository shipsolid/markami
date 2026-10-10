import type { RemoteResourcePolicy } from './security.js';

export const DEFAULT_ASSET_PASTE_DIRECTORY = 'assets/${documentBasename}';

export interface ConfigurationReader {
  get(section: string): unknown;
}

export interface WebviewConfiguration {
  readonly selectionToolbarEnabled: boolean;
  readonly slashCommandsEnabled: boolean;
  readonly mathEnabled: boolean;
  readonly blockHandlesEnabled: boolean;
  readonly outlineEnabled: boolean;
  readonly renderMermaid: boolean;
  readonly renderSafeHtml: boolean;
  readonly showSourceIslandLabels: boolean;
  readonly debugShowSourceRanges: boolean;
  readonly codeBlockWrap: boolean;
  readonly useEditorFont: boolean;
  readonly documentPalette: 'catppuccin-mocha' | 'vscode';
}

export function readWebviewConfiguration(configuration: ConfigurationReader): WebviewConfiguration {
  return {
    selectionToolbarEnabled: readBoolean(configuration, 'selectionToolbar.enabled', true),
    slashCommandsEnabled: readBoolean(configuration, 'slashCommands.enabled', true),
    mathEnabled: readBoolean(configuration, 'renderMath', true),
    blockHandlesEnabled: readBoolean(configuration, 'blockHandles.enabled', true),
    outlineEnabled: readBoolean(configuration, 'outline.enabled', true),
    renderMermaid: readBoolean(configuration, 'renderMermaid', true),
    renderSafeHtml: readBoolean(configuration, 'renderSafeHtml', true),
    showSourceIslandLabels: readBoolean(configuration, 'sourceIslands.showLabel', true),
    debugShowSourceRanges: readBoolean(configuration, 'debug.showSourceRanges', false),
    codeBlockWrap: readBoolean(configuration, 'codeBlock.wrap', true),
    useEditorFont: readBoolean(configuration, 'theme.useEditorFont', true),
    documentPalette: configuration.get('document.palette') === 'vscode' ? 'vscode' : 'catppuccin-mocha'
  };
}

export function readRemoteImagePolicy(configuration: ConfigurationReader): RemoteResourcePolicy {
  const policy = configuration.get('remoteImages');
  return policy === 'block' || policy === 'prompt' || policy === 'allow' ? policy : 'prompt';
}

export function readAssetPasteDirectory(configuration: ConfigurationReader): string {
  const value = configuration.get('assets.pasteDirectory');
  return isAssetPasteDirectoryTemplate(value) ? value : DEFAULT_ASSET_PASTE_DIRECTORY;
}

export function isAssetPasteDirectoryTemplate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 || value.trim() !== value) {
    return false;
  }
  const portable = value.replaceAll('\\', '/');
  if (portable.startsWith('/') || /^[a-z]:\//iu.test(portable)) return false;
  return portable.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function readBoolean(configuration: ConfigurationReader, section: string, fallback: boolean): boolean {
  const value = configuration.get(section);
  return typeof value === 'boolean' ? value : fallback;
}
