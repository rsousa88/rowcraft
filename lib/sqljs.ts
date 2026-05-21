import initSqlJs from "sql.js";
import type { SqlJsStatic, Database } from "sql.js";

export type { Database };

let _sql: SqlJsStatic | null = null;

async function getSql(): Promise<SqlJsStatic> {
  if (_sql) return _sql;
  _sql = await initSqlJs({
    // sql.js ships its own WASM; load it from the CDN to avoid bundler complexity
    locateFile: (file) => `https://sql.js.org/dist/${file}`,
  });
  return _sql;
}

export async function sql(data?: Uint8Array) {
  const SQL = await getSql();
  return new SQL.Database(data);
}
