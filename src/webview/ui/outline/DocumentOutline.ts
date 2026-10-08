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

export function sourceOffsetForHeadingFragment(source: string, fragment: string): number | undefined {
  return extractOutline(source).find((heading) => heading.slug === fragment)?.from;
}

export class DocumentOutline {
  public readonly element: HTMLElement;

  private readonly list: HTMLElement;
  private readonly collapseButton: HTMLButtonElement;
  private headings: readonly OutlineHeading[] = [];
  private source = '';
  private activeIndex = -1;
  private collapsed = false;
  private enabled = true;
  private narrow = false;

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
    if (source !== this.source) {
      this.source = source;
      this.headings = extractOutline(source);
      this.renderHeadings();
    }
    const active = activeHeadingIndex(this.headings, sourceOffset);
    if (active === this.activeIndex) return;
    this.activeIndex = active;
    this.list.querySelector('[aria-current="location"]')?.removeAttribute('aria-current');
    this.list.querySelector(`[data-heading-index="${String(active)}"]`)?.setAttribute('aria-current', 'location');
  }

  private renderHeadings(): void {
    this.activeIndex = -1;
    this.list.replaceChildren();
    this.headings.forEach((heading, index) => {
      const item = this.list.ownerDocument.createElement('li');
      const button = this.list.ownerDocument.createElement('button');
      button.type = 'button';
      button.dataset.headingIndex = String(index);
      button.dataset.level = String(heading.level);
      button.textContent = heading.text;
      button.title = heading.text;
      button.addEventListener('click', () => {
        this.navigate(heading.from);
        if (this.narrow && !this.collapsed) {
          this.setCollapsed(true);
          this.onCollapsedChange(true);
        }
      });
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

  public setNarrow(narrow: boolean): void {
    if (this.narrow === narrow) return;
    this.narrow = narrow;
    this.element.dataset.narrow = String(narrow);
    if (narrow && !this.collapsed) this.setCollapsed(true);
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
