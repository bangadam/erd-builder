import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';

type Props = { open: boolean; onClose: () => void; onImport: () => void };

type Item = {
  id: string;
  group: 'TABLES' | 'COLUMNS' | 'DOCUMENTS' | 'ACTIONS';
  label: string;
  hint?: string;
  run: () => void;
};

const GROUP_ORDER: Item['group'][] = ['TABLES', 'COLUMNS', 'DOCUMENTS', 'ACTIONS'];
const MAX_PER_GROUP = 8;

/**
 * The palette navigates and runs commands; it never edits the document text.
 * That keeps DBML the single source of truth even as the toolbar grows.
 */
export const CommandPalette = ({ open, onClose, onImport }: Props) => {
  const schema = useStore((s) => s.schema);
  const documents = useStore((s) => s.documents);
  const activeDocumentId = useStore((s) => s.activeDocumentId);
  const select = useStore((s) => s.select);
  const switchDocument = useStore((s) => s.switchDocument);
  const createDocument = useStore((s) => s.createDocument);
  const autoArrange = useStore((s) => s.autoArrange);
  const patchUi = useStore((s) => s.patchUi);
  const theme = useStore((s) => s.ui.theme);
  const editorCollapsed = useStore((s) => s.ui.editorCollapsed);

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const needle = query.trim().toLocaleLowerCase();
    const matches = (text: string) => !needle || text.toLocaleLowerCase().includes(needle);

    const tables: Item[] = schema.tables
      .filter((table) => matches(table.id))
      .slice(0, MAX_PER_GROUP)
      .map((table) => ({
        id: `table:${table.id}`,
        group: 'TABLES',
        label: table.id,
        hint: `${table.columns.length} columns`,
        run: () => select({ tableId: table.id, origin: 'palette' }),
      }));

    const columns: Item[] = [];
    for (const table of schema.tables) {
      for (const column of table.columns) {
        if (columns.length >= MAX_PER_GROUP) break;
        if (needle && !matches(column.name)) continue;
        if (!needle) break;
        columns.push({
          id: `column:${table.id}.${column.name}`,
          group: 'COLUMNS',
          label: `${table.id}.${column.name}`,
          hint: column.type,
          run: () => select({ tableId: table.id, column: column.name, origin: 'palette' }),
        });
      }
    }

    const docs: Item[] = documents
      .filter((document) => matches(document.name))
      .slice(0, MAX_PER_GROUP)
      .map((document) => ({
        id: `doc:${document.id}`,
        group: 'DOCUMENTS',
        label: document.name,
        hint: document.id === activeDocumentId ? 'current' : undefined,
        run: () => switchDocument(document.id),
      }));

    const actions: Item[] = [
      { id: 'action:import', label: 'Import SQL…', run: onImport },
      { id: 'action:new', label: 'New document', run: () => createDocument() },
      { id: 'action:arrange', label: 'Auto-arrange diagram', run: autoArrange },
      {
        id: 'action:theme',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        run: () => patchUi({ theme: theme === 'dark' ? 'light' : 'dark' }),
      },
      {
        id: 'action:editor',
        label: editorCollapsed ? 'Show editor' : 'Hide editor',
        run: () => patchUi({ editorCollapsed: !editorCollapsed }),
      },
    ]
      .filter((action) => matches(action.label))
      .map((action) => ({ ...action, group: 'ACTIONS' as const }));

    return [...tables, ...columns, ...docs, ...actions];
  }, [
    query,
    schema,
    documents,
    activeDocumentId,
    select,
    switchDocument,
    createDocument,
    autoArrange,
    patchUi,
    theme,
    editorCollapsed,
    onImport,
  ]);

  if (!open) return null;

  const commit = (item: Item | undefined) => {
    if (!item) return;
    item.run();
    onClose();
  };

  let rendered = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-[560px] overflow-hidden rounded-lg border shadow-2xl"
        style={{ background: 'var(--card)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((value) => Math.min(value + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((value) => Math.max(value - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              commit(items[cursor]);
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          placeholder="Search tables, columns, documents, actions"
          className="w-full border-b px-4 py-3 outline-none"
          style={{ background: 'var(--card)' }}
        />

        <div className="max-h-[52vh] overflow-auto py-1">
          {items.length === 0 ? (
            <p className="px-4 py-3 text-[13px]" style={{ color: 'var(--muted-foreground)' }}>
              No matches
            </p>
          ) : null}

          {GROUP_ORDER.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group}>
                <p
                  className="px-4 pb-1 pt-2 text-[10px] font-semibold tracking-wider"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  {group}
                </p>
                {groupItems.map((item) => {
                  rendered += 1;
                  const index = rendered;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => commit(item)}
                      className="flex w-full items-center justify-between gap-4 px-4 py-1.5 text-left text-[13px]"
                      style={{
                        background: index === cursor ? 'var(--accent)' : 'transparent',
                      }}
                    >
                      <span className="truncate">{item.label}</span>
                      {item.hint ? (
                        <span
                          className="shrink-0 text-[11px]"
                          style={{ color: 'var(--muted-foreground)' }}
                        >
                          {item.hint}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
