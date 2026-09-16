import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentMeta } from '@/lib/storage';
import { useStore } from '@/store/useStore';
import { Icon } from './Icon';
import './details.css';

const documentDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

type MenuProps = {
  documents: DocumentMeta[];
  onClose: () => void;
};

const Menu = ({ documents, onClose }: MenuProps) => {
  const activeDocumentId = useStore((s) => s.activeDocumentId);
  const switchDocument = useStore((s) => s.switchDocument);
  const createDocument = useStore((s) => s.createDocument);
  const renameDocument = useStore((s) => s.renameDocument);
  const duplicateDocument = useStore((s) => s.duplicateDocument);
  const deleteDocument = useStore((s) => s.deleteDocument);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{ id: string; action: 'rename' | 'delete'; name: string } | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle
      ? documents.filter((document) => document.name.toLocaleLowerCase().includes(needle))
      : documents;
  }, [documents, query]);

  return (
    <div className="details-menu" role="dialog" aria-label="Local documents">
      <div className="details-menu-header">
        <span className="details-menu-title">Local documents</span>
        <span className="details-menu-count" aria-label={`${documents.length} documents`}>
          {documents.length}
        </span>
      </div>
      <div className="details-menu-search">
        <Icon name="search" size={14} className="details-menu-search-icon" />
        <input
          ref={searchRef}
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search documents"
          aria-label="Search documents"
          className="ui-input"
        />
      </div>
      <div className="details-menu-list">
        {filtered.map((document) => {
          const active = document.id === activeDocumentId;
          return (
            <div key={document.id} className="details-menu-row" data-active={active}>
              <button
                type="button"
                className="details-menu-row-main"
                onClick={() => {
                  switchDocument(document.id);
                  onClose();
                }}
                aria-current={active ? 'true' : undefined}
              >
                <span className="details-menu-row-active" aria-hidden="true">
                  {active ? <Icon name="check" size={14} /> : null}
                </span>
                <Icon name="file" size={15} aria-hidden="true" />
                <span className="details-menu-row-copy">
                  <span className="details-menu-row-name">{document.name}</span>
                  <span className="details-menu-row-meta">
                    Updated {documentDateFormatter.format(document.updatedAt)}
                  </span>
                </span>
              </button>
              <div className="details-menu-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Rename ${document.name}`}
                  title="Rename"
                  onClick={() => setEditing({ id: document.id, action: 'rename', name: document.name })}
                >
                  <Icon name="edit" size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Duplicate ${document.name}`}
                  title="Duplicate"
                  onClick={() => duplicateDocument(document.id)}
                >
                  <Icon name="copy" size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Delete ${document.name}`}
                  title="Delete"
                  onClick={() => setEditing({ id: document.id, action: 'delete', name: document.name })}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
              {editing?.id === document.id && (
                <form className="details-document-edit" onSubmit={(event) => {
                  event.preventDefault();
                  if (editing.action === 'rename') {
                    if (!editing.name.trim()) return;
                    renameDocument(document.id, editing.name.trim());
                  } else deleteDocument(document.id);
                  setEditing(null);
                  searchRef.current?.focus();
                }} onKeyDown={(event) => {
                  if (event.key === 'Escape') { event.stopPropagation(); setEditing(null); searchRef.current?.focus(); }
                }}>
                  {editing.action === 'rename' ? <>
                    <label className="field-label" htmlFor="document-rename">Document name</label>
                    <input id="document-rename" className="ui-input" value={editing.name} autoFocus onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
                  </> : <p>Delete “{document.name}”? This cannot be undone.</p>}
                  <div className="details-document-edit-actions">
                    <button type="button" className="ui-button ui-button-ghost" onClick={() => { setEditing(null); searchRef.current?.focus(); }}>Cancel</button>
                    <button type="submit" className={`ui-button ${editing.action === 'delete' ? 'details-document-delete' : 'ui-button-primary'}`} disabled={editing.action === 'rename' && !editing.name.trim()}>{editing.action === 'rename' ? 'Save name' : 'Delete document'}</button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <div className="details-menu-empty">
            <Icon name="search" size={14} />
            <span>No matching documents</span>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="details-menu-new"
        onClick={() => {
          createDocument();
          onClose();
        }}
      >
        <span className="inline-flex items-center gap-2">
          <Icon name="plus" size={14} />
          New document
        </span>
      </button>
    </div>
  );
};

export const DocumentMenu = () => {
  const documents = useStore((s) => s.documents);
  const activeDocumentId = useStore((s) => s.activeDocumentId);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = documents.find((document) => document.id === activeDocumentId);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('.details-doc-trigger')?.focus();
      }
    };
    window.addEventListener('mousedown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className="details-doc-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Current document: ${active?.name ?? 'Untitled Diagram'}`}
      >
        <Icon name="folder" size={16} aria-hidden="true" />
        <span className="details-doc-trigger-name">{active?.name ?? 'Untitled Diagram'}</span>
        <Icon name="chevron" size={15} aria-hidden="true" />
      </button>
      {open ? <Menu documents={documents} onClose={() => setOpen(false)} /> : null}
    </div>
  );
};
