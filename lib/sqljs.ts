import initSqlJs from "sql.js";
import type { SqlJsStatic, Database } from "sql.js";

export type { Database };

let _sql: SqlJsStatic | null = null;

async function getSql(): Promise<SqlJsStatic> {
  if (_sql) return _sql;
  _sql = await initSqlJs({
    locateFile: (file) => `/${file}`,
  });
  return _sql;
}

export async function sql(data?: Uint8Array) {
  const SQL = await getSql();
  return new SQL.Database(data);
}
