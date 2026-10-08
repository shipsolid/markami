import type { RemoteResourcePolicy } from './security.js';

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
    codeBlockWrap: readBoolean(configuration, 'codeBlock.wrap', false),
    useEditorFont: readBoolean(configuration, 'theme.useEditorFont', true)
  };
}

export function readRemoteImagePolicy(configuration: ConfigurationReader): RemoteResourcePolicy {
  const policy = configuration.get('remoteImages');
  return policy === 'block' || policy === 'prompt' || policy === 'allow' ? policy : 'prompt';
}

function readBoolean(configuration: ConfigurationReader, section: string, fallback: boolean): boolean {
  const value = configuration.get(section);
  return typeof value === 'boolean' ? value : fallback;
}
