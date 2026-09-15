import { exporter } from '@dbml/core';

export type ExportFormat = 'dbml' | 'postgres' | 'mysql' | 'mssql';

const EXTENSIONS: Record<ExportFormat, string> = {
  dbml: 'dbml',
  postgres: 'sql',
  mysql: 'sql',
  mssql: 'sql',
};

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  dbml: 'DBML',
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  mssql: 'SQL Server',
};

/**
 * SQL goes straight through the vendor exporter, so dialect coverage stays
 * whatever `@dbml/core` supports instead of a hand-rolled subset.
 *
 * `includeRecords` only applies to DBML output, so no dialect here emits
 * sample rows as INSERTs — seed data is deliberately not promised in the UI.
 *
 * Throws when the document is invalid; callers export from the last valid
 * source, so a failure here means the vendor rejected input we parsed fine.
 */
export const downloadSchema = (dbml: string, format: ExportFormat, name = 'schema'): void => {
  const content = format === 'dbml' ? dbml : exporter.export(dbml, format);
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.${EXTENSIONS[format]}`;
  a.click();
  URL.revokeObjectURL(url);
};
