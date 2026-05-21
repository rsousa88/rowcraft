"use client";

import { useState } from "react";

interface SchemaAction {
  type: "addCol" | "renameCol" | "dropCol" | "renameTable";
  table: string;
  column?: string;
  value?: string;
}

interface Props {
  tables: string[];
  columns: Record<string, string[]>;
  selectedCols: Record<string, Set<string>>;
  activeTable: string | null;
  onTableSelect: (table: string) => void;
  onColToggle: (table: string, col: string, checked: boolean) => void;
  onAllColsToggle: (table: string, checked: boolean) => void;
  onSchemaAction: (action: SchemaAction) => void;
  loading: boolean;
}

export function TableSidebar({
  tables, columns, selectedCols, activeTable,
  onTableSelect, onColToggle, onAllColsToggle, onSchemaAction, loading,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [schemaOpen, setSchemaOpen] = useState<string | null>(null);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState("TEXT");
  const [renamingCol, setRenamingCol] = useState<{ table: string; col: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingTable, setRenamingTable] = useState<string | null>(null);
  const [renameTableValue, setRenameTableValue] = useState("");

  function toggleExpand(table: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(table) ? next.delete(table) : next.add(table);
      return next;
    });
  }

  if (loading) {
    return (
      <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 p-4 text-xs text-zinc-400 dark:text-zinc-500">
        Loading…
      </aside>
    );
  }

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
      <div className="p-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        Tables
      </div>

      {tables.map((table) => {
        const isExpanded = expanded.has(table);
        const isSchemaOpen = schemaOpen === table;
        const cols = columns[table] ?? [];
        const sel = selectedCols[table] ?? new Set();
        const allChecked = cols.every((c) => sel.has(c));
        const someChecked = cols.some((c) => sel.has(c));

        return (
          <div key={table}>
            {/* Table row */}
            <div className={`flex items-center gap-1 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 group ${table === activeTable ? "bg-zinc-100 dark:bg-zinc-800/60" : ""}`}>
              <button
                className="mr-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-xs"
                onClick={() => toggleExpand(table)}
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? "▾" : "▸"}
              </button>
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
                onChange={(e) => onAllColsToggle(table, e.target.checked)}
                className="accent-emerald-500"
              />
              <button
                className="ml-1 flex-1 text-left text-sm truncate text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white"
                onClick={() => onTableSelect(table)}
              >
                {table}
              </button>
              {/* Schema gear icon */}
              <button
                onClick={() => setSchemaOpen(isSchemaOpen ? null : table)}
                className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xs px-0.5"
                title="Edit schema"
              >
                ⚙
              </button>
            </div>

            {/* Column checkboxes */}
            {isExpanded && (
              <div className="pl-8 pb-1">
                {cols.map((col) => (
                  <label key={col} className="flex items-center gap-2 py-0.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sel.has(col)}
                      onChange={(e) => onColToggle(table, col, e.target.checked)}
                      className="accent-emerald-500"
                    />
                    <span className="truncate">{col}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Schema editor panel */}
            {isSchemaOpen && (
              <div className="mx-2 mb-2 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs">
                {/* Rename table */}
                <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
                  {renamingTable === table ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        type="text"
                        value={renameTableValue}
                        onChange={(e) => setRenameTableValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && renameTableValue.trim()) {
                            onSchemaAction({ type: "renameTable", table, value: renameTableValue.trim() });
                            setRenamingTable(null);
                            setSchemaOpen(null);
                          }
                          if (e.key === "Escape") setRenamingTable(null);
                        }}
                        className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-xs"
                        placeholder="New table name"
                      />
                      <button onClick={() => { if (renameTableValue.trim()) { onSchemaAction({ type: "renameTable", table, value: renameTableValue.trim() }); setRenamingTable(null); setSchemaOpen(null); }}} className="text-emerald-600 font-medium px-1">✓</button>
                      <button onClick={() => setRenamingTable(null)} className="text-zinc-400 px-1">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => { setRenamingTable(table); setRenameTableValue(table); }} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200">
                      Rename table…
                    </button>
                  )}
                </div>

                {/* Columns list with rename/drop */}
                <div className="px-3 py-1 text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Columns</div>
                {cols.map((col) => (
                  <div key={col} className="px-3 py-1 flex items-center gap-1 group/col hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    {renamingCol?.table === table && renamingCol.col === col ? (
                      <div className="flex items-center gap-1 w-full">
                        <input
                          autoFocus
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && renameValue.trim()) {
                              onSchemaAction({ type: "renameCol", table, column: col, value: renameValue.trim() });
                              setRenamingCol(null);
                            }
                            if (e.key === "Escape") setRenamingCol(null);
                          }}
                          className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-xs"
                        />
                        <button onClick={() => { if (renameValue.trim()) { onSchemaAction({ type: "renameCol", table, column: col, value: renameValue.trim() }); setRenamingCol(null); }}} className="text-emerald-600 font-medium">✓</button>
                        <button onClick={() => setRenamingCol(null)} className="text-zinc-400">✕</button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 truncate text-zinc-600 dark:text-zinc-300">{col}</span>
                        <button
                          onClick={() => { setRenamingCol({ table, col }); setRenameValue(col); }}
                          className="opacity-0 group-hover/col:opacity-100 text-zinc-400 hover:text-blue-500 px-0.5"
                          title="Rename column"
                        >✎</button>
                        <button
                          onClick={() => { if (confirm(`Drop column "${col}" from "${table}"? This cannot be undone.`)) onSchemaAction({ type: "dropCol", table, column: col }); }}
                          className="opacity-0 group-hover/col:opacity-100 text-zinc-400 hover:text-red-500 px-0.5"
                          title="Drop column"
                        >✕</button>
                      </>
                    )}
                  </div>
                ))}

                {/* Add column */}
                <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
                  <div className="text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Add column</div>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newColName}
                      onChange={(e) => setNewColName(e.target.value)}
                      placeholder="Name"
                      className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-xs"
                    />
                    <select
                      value={newColType}
                      onChange={(e) => setNewColType(e.target.value)}
                      className="px-1 py-0.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-xs"
                    >
                      {["TEXT", "INTEGER", "REAL", "BLOB", "NUMERIC"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      if (!newColName.trim()) return;
                      onSchemaAction({ type: "addCol", table, column: newColName.trim(), value: newColType });
                      setNewColName("");
                    }}
                    className="w-full text-center py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-medium"
                  >
                    Add column
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
