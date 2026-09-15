import { importer } from '@dbml/core';

import { SQL_DIALECT_LABELS } from './sqlOptions';
import type { SqlDialect } from './sqlOptions';

export type SqlImportResult = { ok: true; dbml: string } | { ok: false; message: string };

/**
 * The vendor throws objects carrying `diags` rather than Errors for grammar
 * failures, so every rejection shape is normalized into one message here.
 */
export const importSql = (sql: string, dialect: SqlDialect): SqlImportResult => {
  if (!sql.trim()) return { ok: false, message: 'Paste SQL or drop a .sql file first.' };

  try {
    const dbml = importer.import(sql, dialect).trim();
    if (!dbml) {
      return {
        ok: false,
        message: `No tables were found when reading this as ${SQL_DIALECT_LABELS[dialect]}.`,
      };
    }
    return { ok: true, dbml: `${dbml}\n` };
  } catch (error) {
    const diags = (error as { diags?: { message?: string }[] } | null)?.diags;
    const joined = diags
      ?.map((diagnostic) => diagnostic.message)
      .filter(Boolean)
      .join('\n');
    if (joined) return { ok: false, message: joined };
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : 'The SQL importer rejected this schema.',
    };
  }
};

