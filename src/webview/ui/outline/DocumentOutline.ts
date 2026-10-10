import { markdownLanguage } from '@codemirror/lang-markdown';
import { findFrontmatter } from '../../../core/markdown/frontmatter.js';
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
  // The Markdown parser reads `key: value` lines above the closing `---` of frontmatter as a Setext heading.
  const frontmatterEnd = findFrontmatter(source)?.to ?? 0;
  markdownLanguage.parser.parse(source).cursor().iterate((node) => {
    const level = headingLevel(node.name);
    if (level !== undefined && node.from >= frontmatterEnd) candidates.push({ level, from: node.from, to: node.to });
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

const OUTLINE_COLUMN = 260;
const OUTLINE_COLUMN_WIDE = 300;
const OUTLINE_WIDE_FROM = 1760;
const OUTLINE_GAP = 40;
const OUTLINE_INSET = 24;
const OUTLINE_MIN_CONTENT = 880;

/**
 * The outline docks as a column only while a readable content column is left beside it; otherwise it is a pill that
 * opens a drawer. The reserved width matches app.css: the column, a 40px gap, and a 24px inset.
 */
export function shouldDockOutline(paneWidth: number, contentCap: number): boolean {
  if (paneWidth <= 0) return false;
  const column = paneWidth >= OUTLINE_WIDE_FROM ? OUTLINE_COLUMN_WIDE : OUTLINE_COLUMN;
  return paneWidth - (column + OUTLINE_GAP + OUTLINE_INSET) >= Math.min(contentCap, OUTLINE_MIN_CONTENT);
}

export class DocumentOutline {
  public readonly element: HTMLElement;

  private readonly list: HTMLElement;
  private readonly collapseButton: HTMLButtonElement;
  private headings: readonly OutlineHeading[] = [];
  private source = '';
  private activeIndex = -1;
  // The collapsed state the user saved for this file; a narrow pane never reads or writes it.
  private savedCollapsed = false;
  private drawerOpen = false;
  private enabled = true;
  private narrow = false;

  public constructor(
    private readonly documentRef: Document,
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
    this.render();
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
        if (this.narrow && this.drawerOpen) {
          this.drawerOpen = false;
          this.render();
        }
      });
      item.append(button);
      this.list.append(item);
    });
  }

  /** Applies the collapsed state saved for the file; a narrow pane keeps showing its own drawer state. */
  public setCollapsed(collapsed: boolean): void {
    this.savedCollapsed = collapsed;
    this.render();
  }

  public toggleCollapsed(): void {
    if (this.narrow) {
      this.drawerOpen = !this.drawerOpen;
      this.render();
      return;
    }
    this.savedCollapsed = !this.savedCollapsed;
    this.render();
    this.onCollapsedChange(this.savedCollapsed);
  }

  public setNarrow(narrow: boolean): void {
    if (this.narrow === narrow) return;
    this.narrow = narrow;
    this.drawerOpen = false;
    this.element.dataset.narrow = String(narrow);
    this.render();
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.element.hidden = !enabled;
    this.render();
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  public destroy(): void {
    this.element.remove();
    delete this.documentRef.documentElement.dataset.markamiOutline;
  }

  private render(): void {
    const collapsed = this.narrow ? !this.drawerOpen : this.savedCollapsed;
    this.element.dataset.collapsed = String(collapsed);
    this.element.dataset.layout = this.narrow ? 'overlay' : 'docked';
    this.list.hidden = collapsed;
    this.collapseButton.setAttribute('aria-expanded', String(!collapsed));
    this.collapseButton.setAttribute('aria-label', collapsed ? 'Expand document outline' : 'Collapse document outline');
    // The document reserves the column only while the outline is docked, visible, and open.
    this.documentRef.documentElement.dataset.markamiOutline = !this.narrow && this.enabled && !collapsed ? 'docked' : 'none';
  }
}

function headingLevel(name: string): OutlineHeading['level'] | undefined {
  const match = /^(?:ATX|Setext)Heading([1-6])$/u.exec(name);
  if (match === null) return undefined;
  return Number(match[1]) as OutlineHeading['level'];
}
