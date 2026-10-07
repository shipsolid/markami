import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

export function parseSemanticMarkdown(source: string): unknown {
  return unified().use(remarkParse).use(remarkGfm).parse(source);
}
