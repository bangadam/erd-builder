import type { XY } from './layout';

export type Doc = { dbml: string; positions: Record<string, XY> };
export type UiState = { editorWidth: number; editorCollapsed: boolean; theme: 'light' | 'dark' };

export const DOC_KEY = 'erd:doc';
const UI_KEY = 'erd:ui';

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    // Corrupt JSON, or storage unavailable in private mode: never block startup.
    return fallback;
  }
};

export const loadDoc = (): Doc | null => read<Doc | null>(DOC_KEY, null);
export const loadUi = (): UiState | null => read<UiState | null>(UI_KEY, null);
export const saveDoc = (doc: Doc): void => localStorage.setItem(DOC_KEY, JSON.stringify(doc));
export const saveUi = (ui: UiState): void => localStorage.setItem(UI_KEY, JSON.stringify(ui));

/** Fires only in *other* tabs, which is exactly what makes cross-tab clobbering visible. */
export const onExternalDocChange = (handler: () => void): (() => void) => {
  const listener = (e: StorageEvent) => {
    if (e.key === DOC_KEY || e.key === null) handler();
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
};
