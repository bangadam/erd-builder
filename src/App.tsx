import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@/components/Canvas';
import { CommandPalette } from '@/components/CommandPalette';
import { DocumentMenu } from '@/components/DocumentMenu';
import { Editor } from '@/components/Editor';
import { Icon } from '@/components/Icon';
import { ImportDialog } from '@/components/ImportDialog';
import { Inspector } from '@/components/Inspector';
import { downloadSchema, EXPORT_LABELS, type ExportFormat } from '@/lib/exportSchema';
import { DOCUMENTS_KEY, onExternalStorageChange } from '@/lib/storage';
import { isActiveDocumentStorageKey, useStore } from '@/store/useStore';

const MIN_EDITOR = 300;
const MAX_EDITOR = 900;

const ExportMenu = () => {
  const source = useStore((s) => s.source);
  const hasValidSchema = useStore((s) => s.hasValidSchema);
  const diagnostics = useStore((s) => s.diagnostics);
  const parsePending = useStore((s) => s.parsePending);
  const [exporting, setExporting] = useState(false);
  const documentName = useStore((s) => s.documents.find((document) => document.id === s.activeDocumentId)?.name ?? 'schema');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={root} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
      <button type="button" className="ui-button ui-button-primary" aria-expanded={open} aria-haspopup="menu" onClick={() => { setOpen(!open); setError(''); }}>
        <Icon name="download" /> Export <Icon name="chevron" size={12} />
      </button>
      {open && (
        <div className="popover export-menu" role="menu" aria-label="Export schema">
          <span className="section-label">Take your schema with you</span>
          {(Object.keys(EXPORT_LABELS) as ExportFormat[]).map((format) => (
            <button key={format} type="button" role="menuitem" className="menu-item" disabled={exporting || (format !== 'dbml' && (parsePending || !hasValidSchema || diagnostics.length > 0))} onClick={async () => {
              setExporting(true);
              try {
                await downloadSchema(source, format, documentName);
                setOpen(false);
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : 'Export failed. Check your schema and try again.');
              } finally {
                setExporting(false);
              }
            }}>
              <Icon name={format === 'dbml' ? 'file' : 'code'} />{EXPORT_LABELS[format]}
              <span className="ui-badge" style={{ marginLeft: 'auto' }}>.{format === 'dbml' ? 'dbml' : 'sql'}</span>
            </button>
          ))}
          {exporting && <p className="section-label" role="status">Preparing download…</p>}
          {error && <p role="alert" className="diagnostic-badge" style={{ padding: 8 }}>{error}</p>}
        </div>
      )}
    </div>
  );
};

const EditorStatus = () => {
  const lines = useStore((s) => s.source.split('\n').length);
  return <span>{lines} lines <span aria-hidden="true">·</span> UTF-8</span>;
};

const App = () => {
  const ui = useStore((s) => s.ui);
  const patchUi = useStore((s) => s.patchUi);
  const diagnostics = useStore((s) => s.diagnostics);
  const hasValidSchema = useStore((s) => s.hasValidSchema);
  const tableCount = useStore((s) => s.schema.tables.length);
  const relationCount = useStore((s) => s.schema.refs.length);
  const documentName = useStore((s) => s.documents.find((document) => document.id === s.activeDocumentId)?.name ?? 'Untitled Diagram');
  const autoArrange = useStore((s) => s.autoArrange);
  const externallyChanged = useStore((s) => s.externallyChanged);
  const reloadFromStorage = useStore((s) => s.reloadFromStorage);
  const parsePending = useStore((s) => s.parsePending);
  const parseFailure = useStore((s) => s.parseFailure);
  const dragging = useRef<{ x: number; width: number } | null>(null);
  const workArea = useRef<HTMLElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const valid = diagnostics.length === 0 && !parseFailure;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', ui.theme === 'dark');
  }, [ui.theme]);

  useEffect(() => onExternalStorageChange((key) => {
    if (key === DOCUMENTS_KEY) useStore.getState().syncExternalIndex();
    else if (isActiveDocumentStorageKey(key)) useStore.getState().markExternalChange();
  }), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="workbench">
      <header className="app-header">
        <div className="brand" aria-label="ERD Builder">
          <img src="/art/schema-mark.svg" width="32" height="32" alt="" />
          <span className="brand-name">erd<span style={{ fontWeight: 400 }}> / </span>builder</span>
        </div>
        <span className="brand-divider" aria-hidden="true" />
        <DocumentMenu />
        <div className="header-actions">
          <button type="button" className="ui-button header-search" aria-label="Jump to anything… ⌘ K — Search tables, columns, documents and actions" onClick={() => setPaletteOpen(true)}>
            <Icon name="search" /><span>Jump to anything…</span><kbd aria-hidden="true">⌘ K</kbd>
          </button>
          <a className="ui-button header-github" href="https://github.com/bangadam/erd-builder" target="_blank" rel="noreferrer"><Icon name="github" /> GitHub <Icon name="external" size={11} /></a>
          <button type="button" className="icon-button" title={ui.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={ui.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => patchUi({ theme: ui.theme === 'dark' ? 'light' : 'dark' })}>
            <Icon name={ui.theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
      </header>

      {externallyChanged && <div className="external-banner" role="status"><Icon name="info" /> This document changed in another tab. <button type="button" className="ui-button" onClick={reloadFromStorage}>Reload document</button></div>}

      <section className="workspace-heading" aria-label="Workspace overview">
        <div className="heading-identity">
          <div>
            <div className="workspace-eyebrow"><Icon name="folder" size={12} /> LOCAL WORKSPACE <span>/</span> SCHEMA DESIGN</div>
            <h1>Your schema, connected.</h1>
            <p>A little less SQL. A little more clarity.</p>
          </div>
          <img className="heading-note" src="/art/schema-note.svg" width="178" height="50" alt="Make connections" />
        </div>
        <div className="workspace-actions">
          <span className="local-status"><Icon name="lock" size={13} /> Browser only</span>
          <button type="button" className="ui-button" onClick={() => setImportOpen(true)}><Icon name="upload" /> Import SQL</button>
          <ExportMenu />
        </div>
      </section>

      <main className="work-area" ref={workArea}>
        {!ui.editorCollapsed && <>
          <section className="work-panel editor-panel" aria-label="DBML source" style={{ width: ui.editorWidth, maxWidth: 'calc(100% - 334px)' }}>
            <header className="panel-header"><Icon name="code" /><span className="panel-heading">Schema</span><span className="ui-badge">DBML</span><div className="panel-header-end"><button type="button" className="icon-button" title="Hide editor" aria-label="Hide editor" onClick={() => patchUi({ editorCollapsed: true })}><Icon name="panel" size={14} /></button></div></header>
            <div className="panel-body"><Editor /></div>
            <footer className="panel-footer"><span><Icon name="file" size={11} />{documentName.length > 20 ? `${documentName.slice(0, 20)}…` : documentName}.dbml</span><EditorStatus /></footer>
          </section>
          <div role="separator" tabIndex={0} aria-label="Resize schema editor" aria-orientation="vertical" aria-valuenow={ui.editorWidth} aria-valuemin={MIN_EDITOR} aria-valuemax={MAX_EDITOR} className="editor-grip"
            onPointerDown={(event) => {
              dragging.current = { x: event.clientX, width: event.currentTarget.previousElementSibling?.getBoundingClientRect().width ?? ui.editorWidth };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!dragging.current) return;
              const max = Math.min(MAX_EDITOR, (workArea.current?.clientWidth ?? 1200) - 334);
              patchUi({ editorWidth: Math.max(MIN_EDITOR, Math.min(max, dragging.current.width + event.clientX - dragging.current.x)) });
            }}
            onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const max = Math.min(MAX_EDITOR, (workArea.current?.clientWidth ?? 1200) - 334);
              patchUi({ editorWidth: Math.max(MIN_EDITOR, Math.min(max, ui.editorWidth + (event.key === 'ArrowRight' ? 20 : -20))) });
            }} />
        </>}
        <section className="work-panel diagram-panel" aria-label="Entity relationship diagram">
          <header className="panel-header"><Icon name="layout" /><span className="panel-heading">Diagram</span><span className="ui-badge">{tableCount} tables</span><div className="panel-header-end">
            {!ui.editorCollapsed ? null : <button type="button" className="ui-button ui-button-ghost" onClick={() => patchUi({ editorCollapsed: false })}><Icon name="panel" size={13} /> Show editor</button>}
            <button type="button" className="ui-button ui-button-ghost" onClick={autoArrange}><Icon name="layout" size={13} /> Auto-arrange</button>
          </div></header>
          <div className="panel-body">
            {hasValidSchema && tableCount > 0 ? <><Canvas /><Inspector /></> : <div className="empty-canvas">
              <img src="/art/rainwork.svg" alt="Two little rainwork creatures connecting schema cards" width="360" height="140" />
              <h2>{parseFailure ? 'The schema engine could not load.' : parsePending ? 'Connecting your schema…' : valid ? 'Good things start with a table.' : 'A little syntax needs attention.'}</h2>
              <p>{parseFailure ?? (parsePending ? 'You can keep writing. The diagram will appear as soon as parsing finishes.' : valid ? 'Write a Table block on the left, or bring an existing schema with Import SQL.' : 'Fix the highlighted code to bring your diagram to life.')}</p>
              {diagnostics.map((diagnostic) => <p key={`${diagnostic.span.start.offset}-${diagnostic.message}`}>Line {diagnostic.span.start.line}: {diagnostic.message}</p>)}
              {parseFailure ? <button type="button" className="ui-button" onClick={() => void useStore.getState().commitParse()}>Retry schema engine</button> : !parsePending && valid && <button type="button" className="ui-button" onClick={() => setImportOpen(true)}><Icon name="upload" /> Import SQL</button>}
            </div>}
          </div>
          <footer className="panel-footer"><span className={valid ? '' : 'diagnostic-badge'} role="status"><Icon name={valid ? 'check' : 'info'} size={12} />{parseFailure ? 'Schema engine unavailable' : parsePending ? 'Parsing schema…' : valid ? 'Schema is valid' : `${diagnostics.length} errors${hasValidSchema ? ' · showing last valid schema' : ''}`}</span><span>{relationCount} relationships <span aria-hidden="true">·</span> Crow’s foot</span></footer>
        </section>
      </main>
      <footer className="app-footer"><span><Icon name="lock" size={11} /> Your schema stays in this browser. Always.</span><span>Text to tables. Nothing in between.</span></footer>
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onImport={() => setImportOpen(true)} />
    </div>
  );
};

export default App;
