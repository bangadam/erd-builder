import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@/components/Canvas';
import { Editor } from '@/components/Editor';
import { downloadSchema, EXPORT_LABELS, type ExportFormat } from '@/lib/exportSchema';
import { onExternalDocChange } from '@/lib/storage';
import { useStore } from '@/store/useStore';

const MIN_EDITOR = 320;
const MAX_EDITOR = 900;

const ExportMenu = () => {
  const source = useStore((s) => s.source);
  const hasValidSchema = useStore((s) => s.hasValidSchema);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!hasValidSchema}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className="rounded-md border px-2.5 py-1 text-[13px] hover:bg-[var(--accent)] disabled:opacity-40"
      >
        Export
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-md border shadow-lg"
          style={{ background: 'var(--card)' }}
        >
          {(Object.keys(EXPORT_LABELS) as ExportFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[var(--accent)]"
              onMouseDown={() => {
                downloadSchema(source, format);
                setOpen(false);
              }}
            >
              {EXPORT_LABELS[format]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const App = () => {
  const ui = useStore((s) => s.ui);
  const patchUi = useStore((s) => s.patchUi);
  const diagnostics = useStore((s) => s.diagnostics);
  const hasValidSchema = useStore((s) => s.hasValidSchema);
  const tableCount = useStore((s) => s.schema.tables.length);
  const autoArrange = useStore((s) => s.autoArrange);
  const externallyChanged = useStore((s) => s.externallyChanged);
  const reloadFromStorage = useStore((s) => s.reloadFromStorage);
  const dragging = useRef(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', ui.theme === 'dark');
  }, [ui.theme]);

  useEffect(() => onExternalDocChange(useStore.getState().markExternalChange), []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      patchUi({ editorWidth: Math.min(MAX_EDITOR, Math.max(MIN_EDITOR, e.clientX)) });
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [patchUi]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <span className="font-semibold">ERD Builder</span>
        <span className="text-[13px]" style={{ color: 'var(--muted-foreground)' }}>
          {tableCount} tables
        </span>

        <div className="ml-auto flex items-center gap-2">
          {diagnostics.length > 0 ? (
            <span
              className="rounded-md px-2 py-0.5 text-[12px] font-medium"
              style={{ background: 'var(--destructive)', color: 'white' }}
              title={diagnostics.map((d) => `Line ${d.span.start.line}: ${d.message}`).join('\n')}
            >
              {diagnostics.length} error{diagnostics.length > 1 ? 's' : ''}
              {hasValidSchema ? ' · showing last valid' : ''}
            </span>
          ) : null}
          <button
            type="button"
            onClick={autoArrange}
            className="rounded-md border px-2.5 py-1 text-[13px] hover:bg-[var(--accent)]"
          >
            Auto-arrange
          </button>
          <button
            type="button"
            onClick={() => patchUi({ editorCollapsed: !ui.editorCollapsed })}
            className="rounded-md border px-2.5 py-1 text-[13px] hover:bg-[var(--accent)]"
          >
            {ui.editorCollapsed ? 'Show editor' : 'Hide editor'}
          </button>
          <button
            type="button"
            onClick={() => patchUi({ theme: ui.theme === 'dark' ? 'light' : 'dark' })}
            className="rounded-md border px-2.5 py-1 text-[13px] hover:bg-[var(--accent)]"
          >
            {ui.theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <ExportMenu />
        </div>
      </header>

      {externallyChanged ? (
        <div className="flex shrink-0 items-center gap-3 border-b px-3 py-1.5 text-[13px]" style={{ background: 'var(--muted)' }}>
          <span>This document was changed in another tab.</span>
          <button type="button" onClick={reloadFromStorage} className="underline">
            Reload
          </button>
        </div>
      ) : null}

      <main className="flex min-h-0 flex-1">
        {ui.editorCollapsed ? null : (
          <>
            <div style={{ width: ui.editorWidth }} className="min-w-0 shrink-0">
              <Editor />
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => {
                dragging.current = true;
                document.body.style.cursor = 'col-resize';
              }}
              className="w-1 shrink-0 cursor-col-resize border-x hover:bg-[var(--highlight)]"
            />
          </>
        )}
        <div className="min-w-0 flex-1">
          {hasValidSchema ? (
            <Canvas />
          ) : (
            <div
              className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center"
              style={{ background: 'var(--canvas-bg)' }}
            >
              <p className="font-medium">Nothing to draw yet</p>
              {diagnostics.map((d) => (
                <p key={`${d.span.start.offset}-${d.message}`} className="text-[13px]" style={{ color: 'var(--muted-foreground)' }}>
                  Line {d.span.start.line}: {d.message}
                </p>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
