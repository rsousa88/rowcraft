"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { sql, type Database } from "@/lib/sqljs";
import { ResultsGrid } from "@/components/ResultsGrid";
import { TableSidebar } from "@/components/TableSidebar";

const CodeMirrorEditor = dynamic(() => import("@/components/SqlEditor"), { ssr: false });

export type QueryResult = {
  columns: string[];
  rows: (string | number | null)[][];
  error?: string;
};

export function DbViewer({ dbName }: { dbName: string }) {
  const [db, setDb] = useState<Database | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<Record<string, string[]>>({});
  const [selectedCols, setSelectedCols] = useState<Record<string, Set<string>>>({});
  const [sqlText, setSqlText] = useState("SELECT * FROM sqlite_master WHERE type='table';");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const selectionRef = useRef<string>("");

  // Load the database file via signed URL
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/databases/${encodeURIComponent(dbName)}`);
        if (!res.ok) throw new Error("Could not fetch database URL");
        const { url } = await res.json();

        const fileRes = await fetch(url);
        const buffer = await fileRes.arrayBuffer();
        const database = await sql(new Uint8Array(buffer));
        setDb(database);

        // Enumerate tables and columns
        const tableRes = database.exec(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
        );
        const tableNames: string[] = tableRes[0]?.values.map((r) => r[0] as string) ?? [];
        setTables(tableNames);

        const colMap: Record<string, string[]> = {};
        const selMap: Record<string, Set<string>> = {};
        for (const t of tableNames) {
          const info = database.exec(`PRAGMA table_info("${t}");`);
          const cols = info[0]?.values.map((r) => r[1] as string) ?? [];
          colMap[t] = cols;
          selMap[t] = new Set(cols); // all selected by default
        }
        setColumns(colMap);
        setSelectedCols(selMap);
        setSqlText(`SELECT * FROM "${tableNames[0] ?? "sqlite_master"}" LIMIT 100;`);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load database");
      }
    }
    load();
  }, [dbName]);

  const runQuery = useCallback(
    (queryOverride?: string) => {
      if (!db) return;
      const query = queryOverride ?? (selectionRef.current || sqlText);
      setRunning(true);
      try {
        const res = db.exec(query);
        if (res.length === 0) {
          setResult({ columns: [], rows: [], error: "Query returned no results" });
        } else {
          setResult({ columns: res[0].columns, rows: res[0].values as QueryResult["rows"] });
        }
      } catch (e) {
        setResult({ columns: [], rows: [], error: e instanceof Error ? e.message : String(e) });
      } finally {
        setRunning(false);
      }
    },
    [db, sqlText]
  );

  // Ctrl/Cmd+Enter runs query
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runQuery();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runQuery]);

  function handleColToggle(table: string, col: string, checked: boolean) {
    setSelectedCols((prev) => {
      const next = { ...prev, [table]: new Set(prev[table]) };
      checked ? next[table].add(col) : next[table].delete(col);
      return next;
    });
  }

  function handleTableSelect(table: string) {
    const cols = [...(selectedCols[table] ?? columns[table] ?? [])];
    const select = cols.length ? cols.map((c) => `"${c}"`).join(", ") : "*";
    const q = `SELECT ${select} FROM "${table}" LIMIT 100;`;
    setSqlText(q);
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-red-400">
        <p>{loadError}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 px-4 py-2">
        <Link href="/" className="text-zinc-400 hover:text-zinc-200 text-sm">
          ← Databases
        </Link>
        <span className="text-zinc-600">/</span>
        <span className="text-sm font-medium truncate">{dbName}</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => runQuery()}
            disabled={!db || running}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-40 transition-colors"
          >
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <TableSidebar
          tables={tables}
          columns={columns}
          selectedCols={selectedCols}
          onTableSelect={handleTableSelect}
          onColToggle={handleColToggle}
          loading={!db && !loadError}
        />

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* SQL editor */}
          <div className="shrink-0 border-b border-zinc-800" style={{ height: "200px" }}>
            <CodeMirrorEditor
              value={sqlText}
              onChange={setSqlText}
              onSelectionChange={(s) => { selectionRef.current = s; }}
              tables={tables}
              columns={columns}
            />
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto">
            {result ? (
              <ResultsGrid result={result} />
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-600 text-sm">
                {db ? "Run a query to see results" : "Loading database…"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
