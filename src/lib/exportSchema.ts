import { exportInWorker } from './schemaWorkerClient';

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

/** DBML is downloaded unchanged; SQL conversion runs off the rendering thread. */
export const downloadSchema = async (dbml: string, format: ExportFormat, name = 'schema'): Promise<void> => {
  const content = format === 'dbml' ? dbml : await exportInWorker(dbml, format);
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.${EXTENSIONS[format]}`;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
