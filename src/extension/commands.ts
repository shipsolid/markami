export interface MarkamiCommand {
  readonly id: string;
  readonly title: string;
}

export function isMarkamiCustomEditorInput(input: unknown): input is { readonly viewType: 'markami.editor' } {
  return typeof input === 'object' && input !== null && 'viewType' in input && input.viewType === 'markami.editor';
}

export const REQUIRED_COMMANDS: readonly MarkamiCommand[] = [
  command('markami.openRendered', 'Open Rendered Editor'),
  command('markami.openSource', 'Open Source Editor'),
  command('markami.toggleSourceReveal', 'Toggle Source Reveal for Current Block'),
  command('markami.revealCurrentBlock', 'Reveal Current Block as Markdown'),
  command('markami.bold', 'Toggle Bold'),
  command('markami.italic', 'Toggle Italic'),
  command('markami.inlineCode', 'Toggle Inline Code'),
  command('markami.link', 'Create or Edit Link'),
  command('markami.insertHeading', 'Insert Heading'),
  command('markami.insertBulletList', 'Insert Bullet List'),
  command('markami.insertNumberedList', 'Insert Numbered List'),
  command('markami.insertTaskList', 'Insert Task List'),
  command('markami.insertCodeBlock', 'Insert Code Block'),
  command('markami.insertMermaidBlock', 'Insert Mermaid Block'),
  command('markami.insertTable', 'Insert Table'),
  command('markami.refreshRenderedBlocks', 'Refresh Rendered Blocks'),
  command('markami.copyCurrentBlockMarkdown', 'Copy Current Block as Markdown'),
  command('markami.showSelectionToolbar', 'Show Selection Toolbar'),
  command('markami.strikethrough', 'Toggle Strikethrough'),
  command('markami.clearFormatting', 'Clear Inline Formatting'),
  command('markami.openSlashCommands', 'Open Slash Commands'),
  command('markami.moveBlockUp', 'Move Block Up'),
  command('markami.moveBlockDown', 'Move Block Down'),
  command('markami.moveBlockTo', 'Move Block To…'),
  command('markami.setDocumentAppearance', 'Set Document Appearance'),
  command('markami.setDocumentWidth', 'Set Document Width'),
  command('markami.resetFileViewPreferences', 'Reset File View Preferences'),
  command('markami.resetWorkspaceViewPreferences', 'Reset Workspace View Preferences'),
  command('markami.insertImage', 'Insert Image'),
  command('markami.insertMathBlock', 'Insert Math Block'),
  command('markami.insertDivider', 'Insert Divider'),
  command('markami.showDiagnostics', 'Show Diagnostics'),
  command('markami.find', 'Find in Document Text'),
  command('markami.findSource', 'Find in Markdown Source')
];

const SPECIAL_HOST_COMMANDS = new Set(['markami.openRendered', 'markami.openSource']);

export const FORWARDED_COMMANDS: readonly MarkamiCommand[] = [
  ...REQUIRED_COMMANDS.filter((descriptor) => !SPECIAL_HOST_COMMANDS.has(descriptor.id)),
  command('markami.paragraph', 'Paragraph'),
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => command(
    `markami.heading${String(level)}`,
    `Heading ${String(level)}`
  ))
];

function command(id: string, label: string): MarkamiCommand {
  return { id, title: `markami: ${label}` };
}
