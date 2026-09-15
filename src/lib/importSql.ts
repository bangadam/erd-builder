import { importer } from '@dbml/core';

export type SqlDialect = 'postgres' | 'mysql' | 'mssql' | 'snowflake' | 'oracle';

/**
 * `bigquery` is deliberately absent: the vendor importer returns an empty
 * string for standard CREATE TABLE input, which would look like a silent
 * success to the user.
 */
export const SQL_DIALECT_LABELS: Record<SqlDialect, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  mssql: 'SQL Server',
  snowflake: 'Snowflake',
  oracle: 'Oracle',
};

export const DUMP_COMMANDS: Record<SqlDialect, string> = {
  postgres: 'pg_dump --schema-only "$DATABASE_URL" > schema.sql',
  mysql: 'mysqldump --no-data <database> > schema.sql',
  mssql: 'Script the database as CREATE TO… in SQL Server Management Studio',
  snowflake: 'snowsql -q "SELECT GET_DDL(\'DATABASE\', \'<database>\')" -o output_file=schema.sql',
  oracle: "expdp <user>/<password> content=metadata_only directory=<dir> dumpfile=schema.dmp",
};

/**
 * Picks the initial dialect without ever hiding the selector. Checks run from
 * most distinctive marker to least: backticks and ENGINE= are unambiguous
 * MySQL, while SERIAL also appears in other dialects and so is tested last.
 */
export const detectSqlDialect = (sql: string): SqlDialect => {
  if (/`[^`]+`|\bAUTO_INCREMENT\b|\bENGINE\s*=/i.test(sql)) return 'mysql';
  if (/\[dbo\]|\bNVARCHAR\b|\bIDENTITY\s*\(/i.test(sql)) return 'mssql';
  if (/\bVARCHAR2\b|\bNUMBER\s*\(\d/i.test(sql)) return 'oracle';
  if (/\bVARIANT\b|\bCLUSTER\s+BY\b/i.test(sql)) return 'snowflake';
  return 'postgres';
};

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

/** Strips the extension so an imported file names its document sensibly. */
export const documentNameFromFile = (fileName: string): string =>
  fileName.replace(/\.[^.]+$/, '').trim() || 'Imported schema';
