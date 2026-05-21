"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { sql, type Database } from "@/lib/sqljs";
import { ResultsGrid } from "@/components/ResultsGrid";
import { TableSidebar } from "@/components/TableSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/components/ThemeProvider";
import { SavedQueries } from "@/components/SavedQueries";

const CodeMirrorEditor = dynamic(() => import("@/components/SqlEditor"), { ssr: false });

export type QueryResult = {
  columns: string[];
  rows: (string | number | null)[][];
  error?: string;
};

export function DbViewer({ dbName }: { dbName: string }) {
  const { theme } = useTheme();
  const [db, setDb] = useState<Database | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<Record<string, string[]>>({});
  const [selectedCols, setSelectedCols] = useState<Record<string, Set<string>>>({});
  const [sqlText, setSqlText] = useState("SELECT * FROM sqlite_master WHERE type='table';");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [rowids, setRowids] = useState<number[] | undefined>(undefined);
  const [isTableView, setIsTableView] = useState(false);
  const [running, setRunning] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const [activeTable, setActiveTable] = useState<string | null>(null);
  const dbRef = useRef<Database | null>(null);
  useEffect(() => { dbRef.current = db; }, [db]);

  function buildQuery(table: string, sel: Set<string>, allCols: string[]) {
    const allSelected = allCols.every((c) => sel.has(c));
    if (allSelected || sel.size === 0) {
      return `SELECT *\nFROM "${table}"\nLIMIT 100;`;
    }
    const ordered = allCols.filter((c) => sel.has(c));
    const colLines = ordered.map((c) => `  "${c}"`).join(",\n");
    return `SELECT\n${colLines}\nFROM "${table}"\nLIMIT 100;`;
  }

  function execQuery(q: string, tableView = false, table?: string) {
    const database = dbRef.current;
    if (!database) return;
    setRunning(true);
    setIsTableView(tableView);
    try {
      const res = database.exec(q);
      if (res.length === 0) {
        setResult({ columns: [], rows: [], error: "Query returned no results" });
        setRowids(undefined);
      } else {
        setResult({ columns: res[0].columns, rows: res[0].values as QueryResult["rows"] });
        // Fetch rowids in parallel so we can do edit/delete
        if (tableView && table) {
          try {
            const rowidRes = database.exec(`SELECT rowid FROM "${table}" LIMIT 10000;`);
            setRowids(rowidRes[0]?.values.map((r) => r[0] as number) ?? undefined);
          } catch {
            setRowids(undefined);
          }
        } else {
          setRowids(undefined);
        }
      }
    } catch (e) {
      setResult({ columns: [], rows: [], error: e instanceof Error ? e.message : String(e) });
      setRowids(undefined);
    } finally {
      setRunning(false);
    }
  }

  function handleEditRow(rowid: number, values: Record<string, string | null>) {
    const database = dbRef.current;
    if (!database || !activeTable) return;
    const sets = Object.entries(values).map(([c]) => `"${c}" = ?`).join(", ");
    const vals = [...Object.values(values), rowid];
    try {
      database.run(`UPDATE "${activeTable}" SET ${sets} WHERE rowid = ?`, vals);
      // Re-run the current table query to refresh
      execQuery(sqlText, true, activeTable);
    } catch (e) {
      setResult({ columns: [], rows: [], error: e instanceof Error ? e.message : String(e) });
    }
  }

  function handleDeleteRow(rowid: number, confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    const database = dbRef.current;
    if (!database || !activeTable) return;
    try {
      database.run(`DELETE FROM "${activeTable}" WHERE rowid = ?`, [rowid]);
      execQuery(sqlText, true, activeTable);
    } catch (e) {
      setResult({ columns: [], rows: [], error: e instanceof Error ? e.message : String(e) });
    }
  }

  function handleCreateRow(values: Record<string, string | null>) {
    const database = dbRef.current;
    if (!database || !activeTable) return;
    const cols = Object.keys(values).map((c) => `"${c}"`).join(", ");
    const placeholders = Object.keys(values).map(() => "?").join(", ");
    try {
      database.run(`INSERT INTO "${activeTable}" (${cols}) VALUES (${placeholders})`, Object.values(values));
      execQuery(sqlText, true, activeTable);
    } catch (e) {
      setResult({ columns: [], rows: [], error: e instanceof Error ? e.message : String(e) });
    }
  }

  function stripComments(q: string) {
    return q
      .split("\n")
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n")
      .trim();
  }

  const runQuery = useCallback(
    (queryOverride?: string) => {
      const raw = queryOverride ?? (selectionRef.current || sqlText);
      if (!stripComments(raw)) {
        setResult({ columns: [], rows: [], error: "Nothing to run — selection contains only comments." });
        return;
      }
      execQuery(raw);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sqlText]
  );

  async function handleSave() {
    const database = dbRef.current;
    if (!database) return;
    setSaving(true);
    try {
      const bytes = database.export();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/x-sqlite3" });
      const form = new FormData();
      form.append("file", blob, dbName);
      await fetch("/api/databases", { method: "POST", body: form });
    } finally {
      setSaving(false);
    }
  }

  function handleDownload() {
    const database = dbRef.current;
    if (!database) return;
    const bytes = database.export();
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/x-sqlite3" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = dbName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

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

  function handleTableSelect(table: string) {
    setActiveTable(table);
    setResult(null);
    const q = buildQuery(table, selectedCols[table] ?? new Set(columns[table]), columns[table] ?? []);
    setSqlText(q);
    execQuery(q, true, table);
  }

  function handleColToggle(table: string, col: string, checked: boolean) {
    const newCols = new Set(selectedCols[table]);
    checked ? newCols.add(col) : newCols.delete(col);
    setSelectedCols((prev) => ({ ...prev, [table]: newCols }));
    if (table === activeTable) {
      const q = buildQuery(table, newCols, columns[table] ?? []);
      setSqlText(q);
      execQuery(q, true, table);
    }
  }

  function handleSchemaAction(action: { type: string; table: string; column?: string; value?: string }) {
    const database = dbRef.current;
    if (!database) return;
    try {
      if (action.type === "addCol") {
        database.run(`ALTER TABLE "${action.table}" ADD COLUMN "${action.column}" ${action.value ?? "TEXT"}`);
      } else if (action.type === "renameCol") {
        database.run(`ALTER TABLE "${action.table}" RENAME COLUMN "${action.column}" TO "${action.value}"`);
      } else if (action.type === "dropCol") {
        // Try direct DROP (SQLite 3.35+); fall back to table rebuild
        try {
          database.run(`ALTER TABLE "${action.table}" DROP COLUMN "${action.column}"`);
        } catch {
          const cols = (columns[action.table] ?? []).filter((c) => c !== action.column);
          const colList = cols.map((c) => `"${c}"`).join(", ");
          database.run(`BEGIN`);
          database.run(`CREATE TABLE "__tmp_${action.table}" AS SELECT ${colList} FROM "${action.table}"`);
          database.run(`DROP TABLE "${action.table}"`);
          database.run(`ALTER TABLE "__tmp_${action.table}" RENAME TO "${action.table}"`);
          database.run(`COMMIT`);
        }
      } else if (action.type === "renameTable") {
        database.run(`ALTER TABLE "${action.table}" RENAME TO "${action.value}"`);
      }
      // Refresh tables + columns
      const tableRes = database.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
      const tableNames = tableRes[0]?.values.map((r) => r[0] as string) ?? [];
      setTables(tableNames);
      const colMap: Record<string, string[]> = {};
      const selMap: Record<string, Set<string>> = {};
      for (const t of tableNames) {
        const info = database.exec(`PRAGMA table_info("${t}");`);
        const cols = info[0]?.values.map((r) => r[1] as string) ?? [];
        colMap[t] = cols;
        selMap[t] = new Set(cols);
      }
      setColumns(colMap);
      setSelectedCols(selMap);
      // Re-run active query if table still exists
      const newName = action.type === "renameTable" ? action.value! : action.table;
      if (tableNames.includes(newName)) {
        const q = buildQuery(newName, selMap[newName], colMap[newName] ?? []);
        setSqlText(q);
        setActiveTable(newName);
        execQuery(q, true, newName);
      }
    } catch (e) {
      setResult({ columns: [], rows: [], error: e instanceof Error ? e.message : String(e) });
    }
  }

  function handleAllColsToggle(table: string, checked: boolean) {
    const allCols = columns[table] ?? [];
    const newCols = checked ? new Set(allCols) : new Set<string>();
    setSelectedCols((prev) => ({ ...prev, [table]: newCols }));
    if (table === activeTable) {
      const q = buildQuery(table, newCols, allCols);
      setSqlText(q);
      execQuery(q, true, table);
    }
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-zinc-950 text-red-500 dark:text-red-400">
        <p>{loadError}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2">
        <Link href="/" className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 text-sm">
          ← Databases
        </Link>
        <span className="text-zinc-300 dark:text-zinc-600">/</span>
        <span className="text-sm font-medium truncate">{dbName}</span>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {hasSelection && (
            <button
              onClick={() => runQuery(selectionRef.current)}
              disabled={!db || running}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              title="Run selected SQL (Ctrl/Cmd+Enter)"
            >
              Run Selected
            </button>
          )}
          <button
            onClick={() => runQuery()}
            disabled={!db || running}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors"
            title="Run query (Ctrl/Cmd+Enter)"
          >
            {running ? "Running…" : "Run"}
          </button>
          <button
            onClick={handleSave}
            disabled={!db || saving}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            title="Save changes back to cloud"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={handleDownload}
            disabled={!db}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            title="Download .db file"
          >
            Download
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <TableSidebar
          tables={tables}
          columns={columns}
          selectedCols={selectedCols}
          activeTable={activeTable}
          onTableSelect={handleTableSelect}
          onColToggle={handleColToggle}
          onAllColsToggle={handleAllColsToggle}
          onSchemaAction={handleSchemaAction}
          loading={!db && !loadError}
        />

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Saved queries toolbar */}
          <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-3 py-1.5 flex items-center">
            <SavedQueries
              dbName={dbName}
              currentSql={sqlText}
              onLoad={(q) => { setSqlText(q); execQuery(q); }}
            />
          </div>

          {/* SQL editor */}
          <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800" style={{ height: "200px" }}>
            <CodeMirrorEditor
              value={sqlText}
              onChange={setSqlText}
              onSelectionChange={(s) => { selectionRef.current = s; setHasSelection(s.length > 0); }}
              tables={tables}
              columns={columns}
              theme={theme}
            />
          </div>

          {/* Results */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {result ? (
              <ResultsGrid
                result={result}
                activeTable={activeTable}
                rowids={isTableView ? rowids : undefined}
                onEditRow={isTableView ? handleEditRow : undefined}
                onDeleteRow={isTableView ? handleDeleteRow : undefined}
                onCreateRow={isTableView ? handleCreateRow : undefined}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-400 dark:text-zinc-600 text-sm">
                {db ? "Run a query to see results" : "Loading database…"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
