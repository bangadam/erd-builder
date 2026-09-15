import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { useStore } from '@/store/useStore';
import './overlays.css';

type Props = { open: boolean; onClose: () => void; onImport: () => void };

type Item = {
  id: string;
  group: 'TABLES' | 'COLUMNS' | 'DOCUMENTS' | 'ACTIONS';
  label: string;
  hint?: string;
  icon: IconName;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setCursor(0);
    inputRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !paletteRef.current) return;
      const focusable = Array.from(
        paletteRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), button:not([disabled])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previousActiveElementRef.current?.isConnected) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [open, onClose]);

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
        icon: 'table' as const,
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
          icon: 'code' as const,
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
        icon: 'file' as const,
        run: () => switchDocument(document.id),
      }));

    const actions: Item[] = [
      { id: 'action:import', label: 'Import SQL…', icon: 'upload' as const, run: onImport },
      { id: 'action:new', label: 'New document', icon: 'plus' as const, run: () => createDocument() },
      { id: 'action:arrange', label: 'Auto-arrange diagram', icon: 'layout' as const, run: autoArrange },
      {
        id: 'action:theme',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: (theme === 'dark' ? 'sun' : 'moon') as IconName,
        run: () => patchUi({ theme: theme === 'dark' ? 'light' : 'dark' }),
      },
      {
        id: 'action:editor',
        label: editorCollapsed ? 'Show editor' : 'Hide editor',
        icon: 'panel' as const,
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
    <div className="dialog-backdrop command-backdrop" onMouseDown={onClose}>
      <div
        ref={paletteRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        className="ui-dialog command-palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="command-palette__header">
          <span className="command-palette__search-icon" aria-hidden="true">
            <Icon name="search" size={17} />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (items.length > 0) setCursor((value) => Math.min(value + 1, items.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (items.length > 0) setCursor((value) => Math.max(value - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                commit(items[cursor]);
              }
            }}
            placeholder="Search tables, columns, documents, actions"
            aria-label="Search commands"
            aria-controls="command-palette-results"
            aria-activedescendant={items[cursor] ? `command-item-${items[cursor].id.replace(/[^a-zA-Z0-9_-]/g, '-')}` : undefined}
            role="combobox"
            aria-expanded="true"
            autoComplete="off"
            spellCheck={false}
            className="command-palette__input"
          />
          <kbd className="command-palette__esc">esc</kbd>
          <span id="command-palette-title" className="sr-only">
            Command palette
          </span>
        </header>

        <div id="command-palette-results" role="listbox" className="command-palette__results">
          {items.length === 0 ? <p className="command-palette__empty">No matches</p> : null}

          {GROUP_ORDER.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            return (
              <section key={group} className="command-palette__group" aria-labelledby={`command-group-${group}`}>
                <p id={`command-group-${group}`} className="section-label command-palette__group-label">
                  {group}
                </p>
                {groupItems.map((item) => {
                  rendered += 1;
                  const index = rendered;
                  const itemId = `command-item-${item.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                  return (
                    <button
                      key={item.id}
                      id={itemId}
                      type="button"
                      role="option"
                      aria-selected={index === cursor}
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => commit(item)}
                      className={`menu-item command-palette__item${index === cursor ? ' is-selected' : ''}`}
                    >
                      <Icon name={item.icon} size={16} />
                      <span className="command-palette__label">{item.label}</span>
                      {item.hint ? <span className="command-palette__hint">{item.hint}</span> : null}
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
        <footer className="command-palette__footer" aria-label="Keyboard shortcuts">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </footer>
      </div>
    </div>
  );
};
