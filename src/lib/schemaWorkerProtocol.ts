import type { SqlDialect } from './sqlOptions';
import type { SqlImportResult } from './importSql';
import type { ParseResult } from './schema';

export type SchemaExportFormat = 'postgres' | 'mysql' | 'mssql';

export type SchemaWorkerRequestPayload =
  | { type: 'parse'; source: string }
  | { type: 'import'; sql: string; dialect: SqlDialect }
  | { type: 'export'; source: string; format: SchemaExportFormat };

export type SchemaWorkerRequest = SchemaWorkerRequestPayload & { id: number };
export type SchemaWorkerResponse =
  | { id: number; type: 'parse'; result: ParseResult }
  | { id: number; type: 'import'; result: SqlImportResult }
  | { id: number; type: 'export'; result: string }
  | { id: number; type: 'error'; error: { message: string; name?: string; stack?: string } };
