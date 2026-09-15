import { useEffect, useMemo, useRef, useState } from 'react';
import {
  detectSqlDialect,
  documentNameFromFile,
  DUMP_COMMANDS,
  importSql,
  SQL_DIALECT_LABELS,
  type SqlDialect,
} from '@/lib/importSql';
import { useStore } from '@/store/useStore';

type Props = { onClose: () => void };

const DIALECTS = Object.keys(SQL_DIALECT_LABELS) as SqlDialect[];

/**
 * Import is destructive against work the user did not write themselves, so the
 * converted DBML is always previewed before anything is applied. The primary
 * action creates a new document; replace and append stay secondary.
 */
export const ImportDialog = ({ onClose }: Props) => {
  const createDocument = useStore((s) => s.createDocument);
  const replaceActiveDocument = useStore((s) => s.replaceActiveDocument);
  const appendToActiveDocument = useStore((s) => s.appendToActiveDocument);

  const [sql, setSql] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dialect, setDialect] = useState<SqlDialect>('postgres');
  // Null until the user edits the selector; detection drives it before that.
  const [chosenDialect, setChosenDialect] = useState<SqlDialect | null>(null);
  const [dragging, setDragging] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const effectiveDialect = chosenDialect ?? dialect;
  const result = useMemo(
    () => (sql.trim() ? importSql(sql, effectiveDialect) : null),
    [sql, effectiveDialect],
  );

  const readSql = (text: string, name?: string) => {
    setSql(text);
    if (name) setFileName(name);
    if (!chosenDialect) setDialect(detectSqlDialect(text));
  };

  const apply = (action: 'new' | 'replace' | 'append') => {
    if (!result?.ok) return;
    if (action === 'new') {
      createDocument({
        name: fileName ? documentNameFromFile(fileName) : 'Imported schema',
        dbml: result.dbml,
      });
    } else if (action === 'replace') {
      replaceActiveDocument(result.dbml);
    } else {
      appendToActiveDocument(result.dbml);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(e) => {
        if (!dialogRef.current?.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Import SQL"
        className="flex max-h-full w-[900px] flex-col overflow-hidden rounded-lg border shadow-2xl"
        style={{ background: 'var(--card)' }}
      >
        <header className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="font-semibold">Import SQL</span>
          <button type="button" onClick={onClose} className="px-1 text-[15px] leading-none">
            ×
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-4">
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              <label htmlFor="sql-dialect" className="text-[13px]">
                Dialect
              </label>
              <select
                id="sql-dialect"
                value={effectiveDialect}
                onChange={(e) => setChosenDialect(e.target.value as SqlDialect)}
                className="rounded-md border px-2 py-1 text-[13px]"
                style={{ background: 'var(--background)' }}
              >
                {DIALECTS.map((value) => (
                  <option key={value} value={value}>
                    {SQL_DIALECT_LABELS[value]}
                  </option>
                ))}
              </select>
              {chosenDialect === null && sql.trim() ? (
                <span className="text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
                  detected
                </span>
              ) : null}
            </div>

            <textarea
              value={sql}
              onChange={(e) => readSql(e.target.value)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) readSql(await file.text(), file.name);
              }}
              spellCheck={false}
              placeholder="Paste CREATE TABLE statements, or drop a .sql file here"
              className="min-h-0 flex-1 resize-none rounded-md border p-2 font-mono text-[12px] outline-none"
              style={{
                background: 'var(--background)',
                borderColor: dragging ? 'var(--highlight)' : 'var(--border)',
              }}
            />

            <details className="text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
              <summary className="cursor-pointer">How do I get this file?</summary>
              <code className="mt-1 block rounded-md border p-2 font-mono">
                {DUMP_COMMANDS[effectiveDialect]}
              </code>
              <p className="mt-1">
                Nothing is uploaded — the conversion runs entirely in this browser tab.
              </p>
            </details>
          </div>

          <div className="flex min-h-0 flex-col gap-2">
            <span className="text-[13px]">Preview</span>
            <pre
              className="min-h-0 flex-1 overflow-auto rounded-md border p-2 font-mono text-[12px] whitespace-pre-wrap"
              style={{
                background: 'var(--background)',
                color: result && !result.ok ? 'var(--destructive)' : 'var(--foreground)',
              }}
            >
              {result ? (result.ok ? result.dbml : result.message) : 'Nothing to preview yet.'}
            </pre>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t px-4 py-2.5">
          <button
            type="button"
            onClick={() => apply('append')}
            disabled={!result?.ok}
            className="rounded-md border px-2.5 py-1 text-[13px] hover:bg-[var(--accent)] disabled:opacity-40"
          >
            Append here
          </button>
          <button
            type="button"
            onClick={() => apply('replace')}
            disabled={!result?.ok}
            className="rounded-md border px-2.5 py-1 text-[13px] hover:bg-[var(--accent)] disabled:opacity-40"
          >
            Replace this document
          </button>
          <button
            type="button"
            onClick={() => apply('new')}
            disabled={!result?.ok}
            className="rounded-md px-3 py-1 text-[13px] font-medium disabled:opacity-40"
            style={{ background: 'var(--table-header)', color: 'var(--table-header-fg)' }}
          >
            Create new document
          </button>
        </footer>
      </div>
    </div>
  );
};
