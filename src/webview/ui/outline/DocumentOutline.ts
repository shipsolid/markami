import { markdownLanguage } from '@codemirror/lang-markdown';
import { githubSlug } from '../../features/links/links.js';
import { visibleDocumentText } from '../find/DocumentFind.js';

export interface OutlineHeading {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
  readonly from: number;
  readonly to: number;
  readonly slug: string;
}

export function extractOutline(source: string): readonly OutlineHeading[] {
  const candidates: Array<Omit<OutlineHeading, 'text' | 'slug'>> = [];
  markdownLanguage.parser.parse(source).cursor().iterate((node) => {
    const level = headingLevel(node.name);
    if (level !== undefined) candidates.push({ level, from: node.from, to: node.to });
  });
  const slugs: string[] = [];
  return candidates.map((candidate) => {
    const text = visibleDocumentText(source.slice(candidate.from, candidate.to)).trim();
    const slug = githubSlug(text, slugs);
    slugs.push(slug);
    return { ...candidate, text, slug };
  });
}

export function activeHeadingIndex(headings: readonly OutlineHeading[], sourceOffset: number): number {
  let active = -1;
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (heading === undefined || heading.from > sourceOffset) break;
    active = index;
  }
  return active;
}

export class DocumentOutline {
  public readonly element: HTMLElement;

  private readonly list: HTMLElement;
  private readonly collapseButton: HTMLButtonElement;
  private headings: readonly OutlineHeading[] = [];
  private collapsed = false;
  private enabled = true;

  public constructor(
    documentRef: Document,
    private readonly navigate: (sourceOffset: number) => void,
    private readonly onCollapsedChange: (collapsed: boolean) => void
  ) {
    this.element = documentRef.createElement('nav');
    this.element.className = 'markami-outline';
    this.element.setAttribute('aria-label', 'Document outline');
    this.collapseButton = documentRef.createElement('button');
    this.collapseButton.type = 'button';
    this.collapseButton.setAttribute('aria-label', 'Collapse document outline');
    this.collapseButton.textContent = 'Outline';
    this.collapseButton.addEventListener('click', () => this.toggleCollapsed());
    this.list = documentRef.createElement('ol');
    this.element.append(this.collapseButton, this.list);
    documentRef.body.append(this.element);
    this.setCollapsed(false);
  }

  public update(source: string, sourceOffset: number): void {
    this.headings = extractOutline(source);
    const active = activeHeadingIndex(this.headings, sourceOffset);
    this.list.replaceChildren();
    this.headings.forEach((heading, index) => {
      const item = this.list.ownerDocument.createElement('li');
      const button = this.list.ownerDocument.createElement('button');
      button.type = 'button';
      button.dataset.headingIndex = String(index);
      button.dataset.level = String(heading.level);
      button.textContent = heading.text;
      button.title = heading.text;
      if (index === active) button.setAttribute('aria-current', 'location');
      button.addEventListener('click', () => this.navigate(heading.from));
      item.append(button);
      this.list.append(item);
    });
  }

  public setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.element.dataset.collapsed = String(collapsed);
    this.list.hidden = collapsed;
    this.collapseButton.setAttribute('aria-expanded', String(!collapsed));
    this.collapseButton.setAttribute('aria-label', collapsed ? 'Expand document outline' : 'Collapse document outline');
  }

  public toggleCollapsed(): void {
    this.setCollapsed(!this.collapsed);
    this.onCollapsedChange(this.collapsed);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.element.hidden = !enabled;
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  public destroy(): void {
    this.element.remove();
  }
}

function headingLevel(name: string): OutlineHeading['level'] | undefined {
  const match = /^(?:ATX|Setext)Heading([1-6])$/u.exec(name);
  if (match === null) return undefined;
  return Number(match[1]) as OutlineHeading['level'];
}
