import { useEffect, useRef, useState } from 'react';
import {
  detectSqlDialect,
  documentNameFromFile,
  DUMP_COMMANDS,
  SQL_DIALECT_LABELS,
  type SqlDialect,
} from '@/lib/sqlOptions';
import type { SqlImportResult } from '@/lib/importSql';
import { importInWorker } from '@/lib/schemaWorkerClient';
import { useStore } from '@/store/useStore';
import { Icon } from '@/components/Icon';
import './overlays.css';

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
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sourceRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea, select, summary, input:not([disabled])',
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
  }, [onClose]);

  const effectiveDialect = chosenDialect ?? dialect;
  const [conversion, setConversion] = useState<{ source: string; dialect: SqlDialect; result: SqlImportResult } | null>(null);
  const result = conversion?.source === sql && conversion.dialect === effectiveDialect ? conversion.result : null;
  const pending = Boolean(sql.trim()) && result === null;
  useEffect(() => {
    if (!sql.trim()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void importInWorker(sql, effectiveDialect).then((next) => {
        if (!cancelled) setConversion({ source: sql, dialect: effectiveDialect, result: next });
      }).catch((failure: unknown) => {
        if (!cancelled) setConversion({ source: sql, dialect: effectiveDialect, result: { ok: false, message: failure instanceof Error ? failure.message : 'Conversion failed. Try again.' } });
      });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [sql, effectiveDialect]);

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
      className="dialog-backdrop import-backdrop"
      onMouseDown={(e) => {
        if (!dialogRef.current?.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
        aria-describedby="import-dialog-subtitle"
        className="ui-dialog import-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="dialog-header import-dialog__header">
          <div className="import-dialog__heading">
            <span className="import-dialog__heading-icon" aria-hidden="true">
              <Icon name="upload" size={18} />
            </span>
            <div>
              <h2 id="import-dialog-title" className="dialog-title">
                Import SQL
              </h2>
              <p id="import-dialog-subtitle" className="dialog-subtitle">
                Convert a schema dump into editable DBML
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Close import dialog">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="dialog-body import-dialog__body">
          <section className="import-dialog__pane" aria-labelledby="import-source-label">
            <div className="import-dialog__pane-header">
              <div>
                <label id="import-source-label" htmlFor="import-source" className="field-label">
                  Source SQL
                </label>
                <p className="import-dialog__pane-hint">Paste SQL or drop a .sql file</p>
              </div>
              <label className="import-dialog__dialect">
                <span className="field-label">Dialect</span>
                <select
                  aria-label="SQL dialect"
                  value={effectiveDialect}
                  onChange={(e) => setChosenDialect(e.target.value as SqlDialect)}
                  className="ui-input import-dialog__select"
                >
                  {DIALECTS.map((value) => (
                    <option key={value} value={value}>
                      {SQL_DIALECT_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={`import-dialog__source-wrap${dragging ? ' is-dragging' : ''}`}>
              <textarea
                id="import-source"
                ref={sourceRef}
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
                aria-label="Source SQL to import"
                placeholder="CREATE TABLE accounts (&#10;  id integer primary key&#10;);"
                className="ui-input import-dialog__textarea mono"
              />
              {!sql.trim() ? (
                <div className="import-dialog__drop-note" aria-hidden="true">
                  <Icon name="file" size={16} />
                  <span>Drop a SQL file here</span>
                </div>
              ) : null}
            </div>

            {fileName ? (
              <div className="import-dialog__file" title={fileName}>
                <Icon name="file" size={14} />
                <span className="truncate">{fileName}</span>
              </div>
            ) : null}

            <details className="import-dialog__help">
              <summary>How do I get this file?</summary>
              <code className="import-dialog__command mono">{DUMP_COMMANDS[effectiveDialect]}</code>
            </details>
            <p className="import-dialog__privacy">
              <Icon name="lock" size={13} />
              Nothing is uploaded. Conversion runs entirely in this browser tab.
            </p>
          </section>

          <section className="import-dialog__pane" aria-labelledby="import-preview-label">
            <div className="import-dialog__pane-header">
              <div>
                <p id="import-preview-label" className="field-label">
                  DBML preview
                </p>
                <p className="import-dialog__pane-hint">
                  {pending ? 'Converting in the background…' : result?.ok ? 'Ready to apply' : result ? 'Check the source SQL' : 'Output appears here'}
                </p>
              </div>
              {chosenDialect === null && sql.trim() ? <span className="ui-badge">detected</span> : null}
            </div>
            {result ? (
              <pre
                className={`import-dialog__preview mono${result.ok ? '' : ' is-error'}`}
                aria-label="Converted DBML preview"
                role={result.ok ? undefined : 'alert'}
              >
                {result.ok ? result.dbml : result.message}
              </pre>
            ) : pending ? (
              <div className="import-dialog__preview" role="status" aria-label="Converting SQL to DBML">
                <div className="preview-skeleton" aria-hidden="true"><span /><span /><span /><span /><span /></div>
                <p className="preview-loading-label">Reading your schema…</p>
              </div>
            ) : (
              <div className="import-dialog__preview import-dialog__preview--empty">
                <Icon name="code" size={20} />
                <strong>Nothing to preview yet</strong>
                <span>Paste SQL or drop a file to see converted DBML.</span>
              </div>
            )}
          </section>
        </div>

        <footer className="dialog-footer import-dialog__footer">
          <button type="button" onClick={() => apply('append')} disabled={!result?.ok} className="ui-button ui-button-ghost">
            <Icon name="plus" size={15} />
            Append here
          </button>
          <button type="button" onClick={() => apply('replace')} disabled={!result?.ok} className="ui-button ui-button-ghost">
            <Icon name="edit" size={15} />
            Replace this document
          </button>
          <button type="button" onClick={() => apply('new')} disabled={!result?.ok} className="ui-button ui-button-primary">
            <Icon name="file" size={15} />
            Create new document
          </button>
        </footer>
      </div>
    </div>
  );
};
