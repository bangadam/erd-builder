import { detectSqlDialect, documentNameFromFile } from './src/lib/sqlOptions';
import { importSql } from './src/lib/importSql';

let failed = 0;
const check = (label: string, cond: boolean, detail?: unknown) => {
  if (!cond) {
    failed++;
    console.log('FAIL', label, detail === undefined ? '' : JSON.stringify(detail));
  } else console.log('ok  ', label);
};

check('backticks detect MySQL', detectSqlDialect('CREATE TABLE `users` (`id` INT)') === 'mysql');
check('ENGINE detects MySQL', detectSqlDialect('CREATE TABLE users (id INT) ENGINE=InnoDB') === 'mysql');
check('dbo detects SQL Server', detectSqlDialect('CREATE TABLE [dbo].[users] ([id] INT)') === 'mssql');
check('NVARCHAR detects SQL Server', detectSqlDialect('CREATE TABLE x (name NVARCHAR(255))') === 'mssql');
check('VARCHAR2 detects Oracle', detectSqlDialect('CREATE TABLE x (name VARCHAR2(255))') === 'oracle');
check('VARIANT detects Snowflake', detectSqlDialect('CREATE TABLE x (payload VARIANT)') === 'snowflake');
check('generic SQL defaults to PostgreSQL', detectSqlDialect('CREATE TABLE x (id INTEGER)') === 'postgres');

const postgres = importSql('CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(50));', 'postgres');
check('PostgreSQL import succeeds', postgres.ok, postgres);
check('imported DBML includes the table', postgres.ok && postgres.dbml.includes('Table "users"'), postgres);
check('imported DBML preserves PK', postgres.ok && postgres.dbml.includes('[pk]'), postgres);

const mysql = importSql('CREATE TABLE `users` (`id` INT PRIMARY KEY);', 'mysql');
check('MySQL import succeeds', mysql.ok, mysql);

const empty = importSql('   ', 'postgres');
check('blank SQL returns actionable error', !empty.ok && empty.message.includes('Paste SQL'));

const junk = importSql('this is not a create table statement', 'postgres');
check('invalid SQL never throws', !junk.ok);
check('invalid SQL provides a message', !junk.ok && junk.message.length > 0, junk);

check('file name strips .sql', documentNameFromFile('billing-schema.sql') === 'billing-schema');
check('file name strips final extension only', documentNameFromFile('billing.schema.sql') === 'billing.schema');
check('empty file name falls back', documentNameFromFile('.sql') === 'Imported schema');

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
