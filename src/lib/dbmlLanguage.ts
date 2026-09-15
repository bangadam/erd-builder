import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/**
 * Regex tokenizer rather than a Lezer grammar: highlighting only needs to tell
 * keywords, names, types, settings and literals apart, and the real grammar
 * already lives in `@dbml/core`. Upgrade to Lezer only if precise folding or
 * context-sensitive colouring is ever needed.
 */
const KEYWORDS = /^(Table|TablePartial|Ref|Enum|Project|Note|Records|records|indexes|checks|as)\b/i;
const SETTING_KEYS = /^(pk|primary key|not null|null|unique|increment|default|note|ref|name|type|headercolor|delete|update)\b/i;

export const dbmlLanguage = StreamLanguage.define<{ inSettings: boolean }>({
  name: 'dbml',
  startState: () => ({ inSettings: false }),
  token(stream, state) {
    if (stream.eatSpace()) return null;

    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('/*')) {
      while (!stream.eol() && !stream.match('*/')) stream.next();
      return 'comment';
    }
    if (stream.match(/^'[^']*'?/) || stream.match(/^"[^"]*"?/)) return 'string';
    if (stream.match(/^`[^`]*`?/)) return 'string2';

    if (stream.match('[')) {
      state.inSettings = true;
      return 'punctuation';
    }
    if (stream.match(']')) {
      state.inSettings = false;
      return 'punctuation';
    }
    if (state.inSettings && stream.match(SETTING_KEYS)) return 'attribute';

    // Relationship operators, including the `?` optional modifiers.
    if (stream.match(/^(<>|[<>-]\??|\?[<>-])/)) return 'operator';
    if (stream.match(KEYWORDS)) return 'keyword';
    if (stream.match(/^-?\d+(\.\d+)?\b/)) return 'number';
    if (stream.match(/^(true|false|null)\b/i)) return 'atom';
    if (stream.match(/^[A-Za-z_][\w]*(\(\s*[\w,\s]*\))?/)) return 'variableName';

    stream.next();
    return null;
  },
  tokenTable: {
    comment: tags.comment,
    string: tags.string,
    string2: tags.special(tags.string),
    keyword: tags.keyword,
    attribute: tags.attributeName,
    operator: tags.operator,
    number: tags.number,
    atom: tags.atom,
    variableName: tags.variableName,
    punctuation: tags.punctuation,
  },
});

/** Colours are resolved from theme CSS variables so dark mode needs no second style. */
export const dbmlHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.comment, color: 'var(--cm-comment)', fontStyle: 'italic' },
    { tag: tags.keyword, color: 'var(--cm-keyword)', fontWeight: '600' },
    { tag: tags.string, color: 'var(--cm-string)' },
    { tag: tags.special(tags.string), color: 'var(--cm-expr)' },
    { tag: tags.attributeName, color: 'var(--cm-attr)' },
    { tag: tags.operator, color: 'var(--cm-operator)', fontWeight: '600' },
    { tag: tags.number, color: 'var(--cm-number)' },
    { tag: tags.atom, color: 'var(--cm-number)' },
    { tag: tags.variableName, color: 'var(--cm-name)' },
  ]),
);
