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
import { QueryHistory, pushHistory } from "@/components/QueryHistory";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { Logo } from "@/components/Logo";
import { ErdDiagram } from "@/components/ErdDiagram";

const CodeMirrorEditor = dynamic(() => import("@/components/SqlEditor"), { ssr: false });

export type QueryResult = {
  columns: string[];
  rows: (string | number | null)[][];
  error?: string;
};

export function DbViewer({ dbName }: { dbName: string }) {
  const { theme } = useTheme();
  const editorTheme: "light" | "dark" = theme === "auto"
    ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  const [db, setDb] = useState<Database | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<Record<string, string[]>>({});
  const [selectedCols, setSelectedCols] = useState<Record<string, Set<string>>>({});
  const [sqlText, setSqlText] = useState("SELECT * FROM sqlite_master WHERE type='table';");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [rowids, setRowids] = useState<number[] | undefined>(undefined);
  const [isTableView, setIsTableView] = useState(false);
  const [rowCounts, setRowCounts] = useState<Record<string, number>>({});
  const [running, setRunning] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [view, setView] = useState<"query" | "schema">("query");
  const [editorHeight, setEditorHeight] = useState(200);
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const [groupsVersion, setGroupsVersion] = useState(0);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const sidebarDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const selectionRef = useRef<string>("");

  // ── column selection persistence ──────────────────────────────────────────
  function colsKey(table: string) { return `rc-cols-${dbName}-${table}`; }

  function loadPersistedCols(table: string, allCols: string[]): Set<string> {
    try {
      const stored = localStorage.getItem(colsKey(table));
      if (!stored) return new Set(allCols);
      const arr: string[] = JSON.parse(stored);
      const valid = arr.filter((c) => allCols.includes(c));
      return valid.length > 0 ? new Set(valid) : new Set(allCols);
    } catch { return new Set(allCols); }
  }

  function persistCols(table: string, cols: Set<string>, allCols: string[]) {
    if (cols.size === allCols.length && allCols.every((c) => cols.has(c))) {
      localStorage.removeItem(colsKey(table));
    } else {
      localStorage.setItem(colsKey(table), JSON.stringify([...cols]));
    }
  }

  // ── sidebar resize ────────────────────────────────────────────────────────
  function onSidebarDragStart(e: React.MouseEvent) {
    e.preventDefault();
    sidebarDragRef.current = { startX: e.clientX, startW: sidebarWidth };
    function onMove(ev: MouseEvent) {
      if (!sidebarDragRef.current) return;
      setSidebarWidth(Math.max(150, Math.min(400, sidebarDragRef.current.startW + ev.clientX - sidebarDragRef.current.startX)));
    }
    function onUp() {
      sidebarDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

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

        // Row count badges — non-blocking, best-effort
        const counts: Record<string, number> = {};
        for (const t of tableNames) {
          try {
            const r = database.exec(`SELECT COUNT(*) FROM "${t}";`);
            counts[t] = r[0]?.values[0][0] as number ?? 0;
          } catch { counts[t] = 0; }
        }
        setRowCounts(counts);
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
    pushHistory(dbName, q.trim());
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
      // Preserve table-view mode (edit/delete/create) if the query still targets the active table
      const fromMatch = raw.match(/FROM\s+"?([^"\s;,()\n]+)"?/i);
      const queryTable = fromMatch?.[1];
      const keepTableView = activeTable != null && queryTable === activeTable;
      execQuery(raw, keepTableView, keepTableView ? activeTable : undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sqlText, activeTable]
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

  // Ctrl/Cmd+Enter → run; ? → shortcuts overlay
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runQuery();
      }
      if (e.key === "?" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        setShowShortcuts((s) => !s);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runQuery]);

  // Drag-resize editor/results split
  function onDragStart(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: editorHeight };
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      setEditorHeight(Math.max(80, Math.min(600, dragRef.current.startH + ev.clientY - dragRef.current.startY)));
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Import CSV → create new table in the in-memory db
  function handleImportCsv(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const database = dbRef.current;
      if (!database) return;
      const text = e.target?.result as string;
      const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
      if (lines.length < 2) return;

      function parseLine(line: string): string[] {
        const result: string[] = [];
        let i = 0;
        while (i < line.length) {
          if (line[i] === '"') {
            let field = ""; i++;
            while (i < line.length) {
              if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2; }
              else if (line[i] === '"') { i++; break; }
              else { field += line[i++]; }
            }
            if (line[i] === ",") i++;
            result.push(field);
          } else {
            let field = "";
            while (i < line.length && line[i] !== ",") field += line[i++];
            if (line[i] === ",") i++;
            result.push(field);
          }
        }
        return result;
      }

      const headers = parseLine(lines[0]);
      const rows = lines.slice(1).map(parseLine);
      const tableName = file.name.replace(/\.csv$/i, "").replace(/[^a-zA-Z0-9_]/g, "_");
      const colDefs = headers.map((h) => `"${h.replace(/"/g, "")}" TEXT`).join(", ");

      try {
        database.run(`DROP TABLE IF EXISTS "${tableName}"`);
        database.run(`CREATE TABLE "${tableName}" (${colDefs})`);
        const placeholders = headers.map(() => "?").join(", ");
        const colNames = headers.map((h) => `"${h.replace(/"/g, "")}"`).join(", ");
        for (const row of rows) {
          if (row.every((c) => c === "")) continue;
          const vals = headers.map((_, i) => row[i] ?? null);
          database.run(`INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`, vals);
        }
        // Refresh schema
        const tableRes = database.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
        const tableNames = tableRes[0]?.values.map((r) => r[0] as string) ?? [];
        setTables(tableNames);
        const colMap: Record<string, string[]> = {};
        const selMap: Record<string, Set<string>> = {};
        const counts: Record<string, number> = {};
        for (const t of tableNames) {
          const info = database.exec(`PRAGMA table_info("${t}");`);
          const cols = info[0]?.values.map((r) => r[1] as string) ?? [];
          colMap[t] = cols;
          selMap[t] = new Set(cols);
          try { counts[t] = database.exec(`SELECT COUNT(*) FROM "${t}";`)[0]?.values[0][0] as number ?? 0; } catch { counts[t] = 0; }
        }
        setColumns(colMap);
        setSelectedCols(selMap);
        setRowCounts(counts);
        // Navigate to the new table
        const q = buildQuery(tableName, selMap[tableName], colMap[tableName] ?? []);
        setSqlText(q);
        setActiveTable(tableName);
        execQuery(q, true, tableName);
      } catch (err) {
        setResult({ columns: [], rows: [], error: err instanceof Error ? err.message : String(err) });
      }
    };
    reader.readAsText(file);
  }

  function handleTableSelect(table: string) {
    setActiveTable(table);
    setResult(null);
    const allCols = columns[table] ?? [];
    const cols = loadPersistedCols(table, allCols); // restore last column selection
    setSelectedCols((prev) => ({ ...prev, [table]: cols }));
    const q = buildQuery(table, cols, allCols);
    setSqlText(q);
    execQuery(q, true, table);
  }

  function handleColToggle(table: string, col: string, checked: boolean) {
    const newCols = new Set(selectedCols[table]);
    checked ? newCols.add(col) : newCols.delete(col);
    setSelectedCols((prev) => ({ ...prev, [table]: newCols }));
    persistCols(table, newCols, columns[table] ?? []);
    if (table === activeTable) {
      const q = buildQuery(table, newCols, columns[table] ?? []);
      setSqlText(q);
      execQuery(q, true, table);
    }
  }

  function handleAllColsToggle(table: string, checked: boolean) {
    const allCols = columns[table] ?? [];
    const newCols = checked ? new Set(allCols) : new Set<string>();
    setSelectedCols((prev) => ({ ...prev, [table]: newCols }));
    persistCols(table, newCols, allCols);
    if (table === activeTable) {
      const q = buildQuery(table, newCols, allCols);
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
      } else if (action.type === "renameTable" && action.value) {
        database.run(`ALTER TABLE "${action.table}" RENAME TO "${action.value}"`);
        // Keep group membership and saved queries in sync
        const gKey = `rc-table-groups-${dbName}`;
        try {
          const stored = JSON.parse(localStorage.getItem(gKey) ?? "[]");
          const updated = stored.map((g: { tables: string[] }) => ({
            ...g,
            tables: g.tables.map((t: string) => t === action.table ? action.value : t),
          }));
          localStorage.setItem(gKey, JSON.stringify(updated));
          // Also persist to server so other machines see the updated name immediately
          fetch(`/api/databases/${encodeURIComponent(dbName)}/groups`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated),
          }).catch(() => {});
          setGroupsVersion((v) => v + 1);
        } catch { /* non-fatal */ }
        // Migrate saved queries key
        const oldQKey = `rc-queries-${dbName}-${action.table}`;
        const newQKey = `rc-queries-${dbName}-${action.value}`;
        const existingQ = localStorage.getItem(oldQKey);
        if (existingQ) { localStorage.setItem(newQKey, existingQ); localStorage.removeItem(oldQKey); }
        // Migrate persisted column selection key
        const oldCKey = colsKey(action.table);
        const newCKey = colsKey(action.value);
        const existingC = localStorage.getItem(oldCKey);
        if (existingC) { localStorage.setItem(newCKey, existingC); localStorage.removeItem(oldCKey); }
      }
      // Refresh schema
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

  // Load a query from saved/history, syncing column checkboxes from the SELECT list
  function loadQuery(q: string) {
    setSqlText(q);
    const fromMatch = q.match(/FROM\s+"?([^"\s;]+)"?/i);
    const table = fromMatch?.[1];
    if (!table || !columns[table]) { execQuery(q); return; }
    setActiveTable(table);
    const selectPart = q.match(/^SELECT\s+([\s\S]+?)\s+FROM/i)?.[1]?.trim();
    if (!selectPart || selectPart === "*") {
      setSelectedCols((p) => ({ ...p, [table]: new Set(columns[table]) }));
    } else {
      const parsed = new Set<string>();
      for (const m of selectPart.matchAll(/"([^"]+)"/g)) parsed.add(m[1]);
      if (parsed.size > 0) setSelectedCols((p) => ({ ...p, [table]: parsed }));
    }
    execQuery(q, true, table);
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
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2">
        {/* Breadcrumb */}
        <Link href="/" className="hover:opacity-80 transition-opacity shrink-0">
          <Logo size={22} />
        </Link>
        <span className="text-zinc-300 dark:text-zinc-600">/</span>
        <span className="text-sm font-medium truncate text-zinc-600 dark:text-zinc-400 min-w-0">{dbName}</span>

        {/* View toggle */}
        {db && (
          <div className="flex rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs shrink-0">
            <button
              onClick={() => setView("query")}
              className={`px-3 py-1 transition-colors ${view === "query" ? "bg-zinc-100 dark:bg-zinc-800 font-semibold text-zinc-800 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}
            >
              Query
            </button>
            <button
              onClick={() => setView("schema")}
              className={`px-3 py-1 border-l border-zinc-200 dark:border-zinc-700 transition-colors ${view === "schema" ? "bg-zinc-100 dark:bg-zinc-800 font-semibold text-zinc-800 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}
            >
              Schema
            </button>
          </div>
        )}

        {/* File actions */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <label
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
            title="Import CSV as a new table"
          >
            Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportCsv(f); e.target.value = ""; }} />
          </label>
          <button onClick={handleSave} disabled={!db || saving} className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors">
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={handleDownload} disabled={!db} className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors">
            Download
          </button>

          {/* Divider */}
          <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-700 shrink-0" />

          {/* Utility buttons */}
          <ThemeToggle />
          <button
            onClick={() => setShowShortcuts(true)}
            className="rounded-md p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Keyboard shortcuts (?)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
            </svg>
          </button>
        </div>
      </header>

      <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <TableSidebar
          dbName={dbName}
          width={sidebarWidth}
          groupsVersion={groupsVersion}
          tables={tables}
          columns={columns}
          selectedCols={selectedCols}
          activeTable={activeTable}
          rowCounts={rowCounts}
          onTableSelect={handleTableSelect}
          onColToggle={handleColToggle}
          onAllColsToggle={handleAllColsToggle}
          onSchemaAction={handleSchemaAction}
          loading={!db && !loadError}
        />

        {/* Sidebar resize handle */}
        <div
          onMouseDown={onSidebarDragStart}
          className="w-1 shrink-0 cursor-col-resize bg-zinc-200 dark:bg-zinc-800 hover:bg-emerald-400 dark:hover:bg-emerald-600 transition-colors"
          title="Drag to resize sidebar"
        />

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {view === "schema" ? (
            /* ── Schema / ER diagram view ── */
            <ErdDiagram db={db} rowCounts={rowCounts} />
          ) : (
            /* ── Query view ── */
            <>
              {/* Editor toolbar */}
              <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-3 py-1.5 flex items-center gap-2">
                <SavedQueries dbName={dbName} activeTable={activeTable} currentSql={sqlText} onLoad={loadQuery} />
                <QueryHistory dbName={dbName} onLoad={loadQuery} />
                <div className="ml-auto flex items-center gap-1.5 shrink-0">
                  {hasSelection && (
                    <button
                      onClick={() => runQuery(selectionRef.current)}
                      disabled={!db || running}
                      className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                      title="Run selected SQL (Ctrl/Cmd+Enter)"
                    >
                      Run Selected
                    </button>
                  )}
                  <button
                    onClick={() => runQuery()}
                    disabled={!db || running}
                    className="rounded-md bg-emerald-600 px-4 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors"
                    title="Run query (Ctrl/Cmd+Enter)"
                  >
                    {running ? "Running…" : "▶ Run"}
                  </button>
                </div>
              </div>

              {/* SQL editor */}
              <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 overflow-hidden" style={{ height: editorHeight }}>
                <CodeMirrorEditor
                  value={sqlText}
                  onChange={setSqlText}
                  onSelectionChange={(s) => { selectionRef.current = s; setHasSelection(s.length > 0); }}
                  tables={tables}
                  columns={columns}
                  theme={editorTheme}
                />
              </div>

              {/* Resize handle */}
              <div
                onMouseDown={onDragStart}
                className="shrink-0 h-1.5 cursor-row-resize bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors border-b border-zinc-200 dark:border-zinc-800"
                title="Drag to resize editor"
              />

              {/* Results */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {result ? (
                  <ResultsGrid
                    result={result}
                    activeTable={activeTable}
                    tableTotal={activeTable ? rowCounts[activeTable] : undefined}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
