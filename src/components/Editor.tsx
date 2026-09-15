import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { forceLinting, linter, lintGutter, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { dbmlCompletions } from '@/lib/dbmlComplete';
import { dbmlHighlight, dbmlLanguage } from '@/lib/dbmlLanguage';
import { useStore } from '@/store/useStore';

const PARSE_DEBOUNCE_MS = 300;

/**
 * Offsets reported by the parser are byte-identical to CodeMirror's, so
 * diagnostics map straight onto the document without re-scanning lines.
 */
const toCmDiagnostics = (view: EditorView): CmDiagnostic[] => {
  const max = view.state.doc.length;
  return useStore.getState().diagnostics.map((d) => ({
    from: Math.min(d.span.start.offset, max),
    to: Math.min(Math.max(d.span.end.offset, d.span.start.offset + 1), max),
    severity: 'error',
    message: d.message,
  }));
};

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '12px', background: 'var(--editor-bg)', color: 'var(--foreground)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.8' },
  '.cm-content': { padding: '16px 0 28px', caretColor: 'var(--foreground)' },
  '.cm-line': { padding: '0 16px 0 8px' },
  '.cm-gutters': { background: 'var(--editor-bg)', border: 'none', color: 'var(--muted-foreground)', fontSize: '10px', paddingRight: '6px' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '32px' },
  '.cm-activeLine': { background: 'var(--editor-active-line)' },
  '.cm-activeLineGutter': { background: 'var(--editor-active-line)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-tooltip.cm-tooltip-autocomplete': { background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'none', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-mono)', maxHeight: '16em' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '5px 10px', display: 'flex', justifyContent: 'space-between', gap: '12px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { background: 'var(--primary)', color: 'var(--primary-foreground)' },
  '.cm-completionDetail': { fontStyle: 'normal', opacity: 0.8, fontSize: '11px' },
});

export const Editor = () => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!host.current) return;

    const state = EditorState.create({
      doc: useStore.getState().source,
      extensions: [
        EditorView.contentAttributes.of({ 'aria-label': 'DBML schema editor', spellcheck: 'false' }),
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        lintGutter(),
        // Completion sources read the live schema, so suggestions reflect the
        // last valid parse rather than a snapshot taken at mount.
        autocompletion({
          override: [dbmlCompletions(() => useStore.getState().schema)],
          activateOnTyping: true,
          icons: false,
        }),
        keymap.of([...closeBracketsKeymap, ...completionKeymap, ...defaultKeymap, ...historyKeymap]),
        dbmlLanguage,
        dbmlHighlight,
        // Re-linting is driven by the store, not by CodeMirror's own timer,
        // so squiggles appear exactly when the parse that produced them lands.
        linter((v) => toCmDiagnostics(v), { delay: 0 }),
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            useStore.getState().setSource(update.state.doc.toString());
            window.clearTimeout(debounce.current);
            debounce.current = window.setTimeout(
              () => useStore.getState().commitParse(),
              PARSE_DEBOUNCE_MS,
            );
          }
          if (update.selectionSet) {
            // Cursor inside a table block highlights that node on the canvas.
            const offset = update.state.selection.main.head;
            const { schema, selection, select } = useStore.getState();
            const table = schema.tables.find(
              (t) => offset >= t.span.start.offset && offset <= t.span.end.offset,
            );
            const nextId = table?.id ?? null;
            if (nextId !== (selection?.tableId ?? null)) {
              select(nextId ? { tableId: nextId, origin: 'editor' } : null);
            }
          }
        }),
      ],
    });

    view.current = new EditorView({ state, parent: host.current });
    return () => {
      window.clearTimeout(debounce.current);
      view.current?.destroy();
      view.current = null;
    };
  }, []);

  // Canvas clicks scroll the editor to the table's block. Editor-origin
  // selections are skipped, or the cursor would fight the user's typing.
  useEffect(
    () =>
      useStore.subscribe((state, prev) => {
        if (!state.selection || state.selection === prev.selection || !view.current) return;
        if (state.selection.origin !== 'canvas' && state.selection.origin !== 'palette') return;
        const table = state.schema.tables.find((t) => t.id === state.selection?.tableId);
        if (!table) return;
        const column = state.selection.column
          ? table.columns.find((item) => item.name === state.selection?.column)
          : undefined;
        const pos = Math.min(column?.span.start.offset ?? table.span.start.offset, view.current.state.doc.length);
        view.current.dispatch({
          selection: { anchor: pos },
          effects: EditorView.scrollIntoView(pos, { y: 'center' }),
        });
      }),
    [],
  );

  // External reload (another tab) replaces the document wholesale.
  useEffect(
    () =>
      useStore.subscribe((state, prev) => {
        if (state.source === prev.source || !view.current) return;
        if (state.source === view.current.state.doc.toString()) return;
        view.current.dispatch({
          changes: { from: 0, to: view.current.state.doc.length, insert: state.source },
        });
      }),
    [],
  );

  // The linter reads diagnostics from the store, so a new parse result must
  // kick it; otherwise squiggles lag a keystroke behind the canvas.
  useEffect(
    () =>
      useStore.subscribe((state, prev) => {
        if (state.diagnostics !== prev.diagnostics && view.current) forceLinting(view.current);
      }),
    [],
  );

  return <div ref={host} className="h-full overflow-hidden" />;
};
