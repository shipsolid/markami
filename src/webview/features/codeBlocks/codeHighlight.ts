import { commonmarkLanguage, markdownLanguage } from '@codemirror/lang-markdown';
import { languageDataProp, syntaxHighlighting } from '@codemirror/language';
import { tagHighlighter, tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

// Markdown's own tokens (headings, emphasis, links) are styled by the projection, so highlighting is scoped to the
// languages mounted inside fenced code; the colors come from theme-aware CSS variables, never from the language.
const markdownData = new Set([markdownLanguage.data, commonmarkLanguage.data]);

const codeHighlighter = tagHighlighter([
  { tag: [t.keyword, t.controlKeyword, t.modifier, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], class: 'markami-tok-keyword' },
  { tag: [t.atom, t.bool, t.null, t.self, t.constant(t.name), t.standard(t.name)], class: 'markami-tok-atom' },
  { tag: [t.string, t.character, t.special(t.string), t.docString, t.attributeValue], class: 'markami-tok-string' },
  { tag: [t.regexp, t.escape], class: 'markami-tok-regexp' },
  { tag: [t.number, t.integer, t.float], class: 'markami-tok-number' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: 'markami-tok-comment' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], class: 'markami-tok-function' },
  { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)], class: 'markami-tok-type' },
  { tag: [t.tagName], class: 'markami-tok-tag' },
  { tag: [t.propertyName, t.attributeName, t.labelName, t.definition(t.propertyName)], class: 'markami-tok-property' },
  { tag: [t.variableName, t.definition(t.variableName), t.special(t.variableName)], class: 'markami-tok-variable' },
  {
    tag: [t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator, t.bitwiseOperator, t.updateOperator,
      t.derefOperator, t.definitionOperator, t.controlOperator],
    class: 'markami-tok-operator'
  },
  { tag: [t.meta, t.annotation, t.macroName, t.documentMeta, t.processingInstruction], class: 'markami-tok-meta' },
  { tag: [t.punctuation, t.separator, t.bracket, t.angleBracket, t.squareBracket, t.paren, t.brace], class: 'markami-tok-punctuation' },
  { tag: [t.url, t.link], class: 'markami-tok-link' },
  { tag: t.inserted, class: 'markami-tok-inserted' },
  { tag: t.deleted, class: 'markami-tok-deleted' },
  { tag: t.invalid, class: 'markami-tok-invalid' }
], { scope: (top) => !markdownData.has(top.prop(languageDataProp) as typeof markdownLanguage.data) });

export const codeHighlighting: Extension = syntaxHighlighting(codeHighlighter);
