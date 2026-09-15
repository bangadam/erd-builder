import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentMeta } from '@/lib/storage';
import { useStore } from '@/store/useStore';

const Menu = ({ documents }: { documents: DocumentMeta[] }) => {
  const activeDocumentId = useStore((s) => s.activeDocumentId);
  const switchDocument = useStore((s) => s.switchDocument);
  const createDocument = useStore((s) => s.createDocument);
  const renameDocument = useStore((s) => s.renameDocument);
  const duplicateDocument = useStore((s) => s.duplicateDocument);
  const deleteDocument = useStore((s) => s.deleteDocument);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle
      ? documents.filter((document) => document.name.toLocaleLowerCase().includes(needle))
      : documents;
  }, [documents, query]);

  return (
    <div
      className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-md border shadow-xl"
      style={{ background: 'var(--card)' }}
    >
      <div className="border-b p-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents"
          className="w-full rounded-md border px-2 py-1 text-[13px] outline-none"
          style={{ background: 'var(--background)' }}
        />
      </div>
      <div className="max-h-64 overflow-auto py-1">
        {filtered.map((document) => (
          <div
            key={document.id}
            className="group flex items-center gap-1 px-1 hover:bg-[var(--accent)]"
          >
            <button
              type="button"
              onClick={() => switchDocument(document.id)}
              className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-[13px]"
              style={{ fontWeight: document.id === activeDocumentId ? 600 : 400 }}
            >
              {document.name}
            </button>
            <button
              type="button"
              title="Rename"
              className="px-1 text-[12px] opacity-60 hover:opacity-100"
              onClick={() => {
                const next = window.prompt('Document name', document.name);
                if (next !== null) renameDocument(document.id, next);
              }}
            >
              ✎
            </button>
            <button
              type="button"
              title="Duplicate"
              className="px-1 text-[12px] opacity-60 hover:opacity-100"
              onClick={() => duplicateDocument(document.id)}
            >
              ⧉
            </button>
            <button
              type="button"
              title="Delete"
              className="px-1 text-[12px] opacity-60 hover:opacity-100"
              onClick={() => {
                if (window.confirm(`Delete “${document.name}”?`)) deleteDocument(document.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
            No matching documents
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => createDocument()}
        className="block w-full border-t px-3 py-2 text-left text-[13px] hover:bg-[var(--accent)]"
      >
        + New document
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
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="max-w-64 truncate rounded-md px-2 py-1 text-left font-semibold hover:bg-[var(--accent)]"
      >
        {active?.name ?? 'Untitled Diagram'} <span aria-hidden>⌄</span>
      </button>
      {open ? <Menu documents={documents} /> : null}
    </div>
  );
};
