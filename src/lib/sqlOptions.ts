export type SqlDialect = 'postgres' | 'mysql' | 'mssql' | 'snowflake' | 'oracle';

export const SQL_DIALECT_LABELS: Record<SqlDialect, string> = {
  postgres: 'PostgreSQL', mysql: 'MySQL', mssql: 'SQL Server', snowflake: 'Snowflake', oracle: 'Oracle',
};

export const DUMP_COMMANDS: Record<SqlDialect, string> = {
  postgres: 'pg_dump --schema-only "$DATABASE_URL" > schema.sql',
  mysql: 'mysqldump --no-data <database> > schema.sql',
  mssql: 'Script the database as CREATE TO… in SQL Server Management Studio',
  snowflake: 'snowsql -q "SELECT GET_DDL(\'DATABASE\', \'<database>\')" -o output_file=schema.sql',
  oracle: 'Use SQL Developer: Tools → Database Export → DDL only → SQL file.',
};

/** Suggest a dialect; the user can always override ambiguous SQL. */
export const detectSqlDialect = (sql: string): SqlDialect => {
  if (/`[^`]+`|\bAUTO_INCREMENT\b|\bENGINE\s*=/i.test(sql)) return 'mysql';
  if (/\[dbo\]|\bNVARCHAR\b|\bIDENTITY\s*\(/i.test(sql)) return 'mssql';
  if (/\bVARCHAR2\b|\bNUMBER\s*\(\d/i.test(sql)) return 'oracle';
  if (/\bVARIANT\b|\bCLUSTER\s+BY\b/i.test(sql)) return 'snowflake';
  return 'postgres';
};

export const documentNameFromFile = (fileName: string): string =>
  fileName.replace(/\.[^.]+$/, '').trim() || 'Imported schema';
