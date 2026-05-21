"use client";

import { useState } from "react";

interface Props {
  tables: string[];
  columns: Record<string, string[]>;
  selectedCols: Record<string, Set<string>>;
  activeTable: string | null;
  onTableSelect: (table: string) => void;
  onColToggle: (table: string, col: string, checked: boolean) => void;
  onAllColsToggle: (table: string, checked: boolean) => void;
  loading: boolean;
}

export function TableSidebar({
  tables,
  columns,
  selectedCols,
  activeTable,
  onTableSelect,
  onColToggle,
  onAllColsToggle,
  loading,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(table: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(table) ? next.delete(table) : next.add(table);
      return next;
    });
  }

  function toggleAllCols(table: string, check: boolean) {
    onAllColsToggle(table, check);
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
        const cols = columns[table] ?? [];
        const sel = selectedCols[table] ?? new Set();
        const allChecked = cols.every((c) => sel.has(c));
        const someChecked = cols.some((c) => sel.has(c));

        return (
          <div key={table}>
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
                ref={(el) => {
                  if (el) el.indeterminate = !allChecked && someChecked;
                }}
                onChange={(e) => toggleAllCols(table, e.target.checked)}
                className="accent-emerald-500"
              />
              <button
                className="ml-1 flex-1 text-left text-sm truncate text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white"
                onClick={() => onTableSelect(table)}
              >
                {table}
              </button>
            </div>

            {isExpanded && (
              <div className="pl-8 pb-1">
                {cols.map((col) => (
                  <label
                    key={col}
                    className="flex items-center gap-2 py-0.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                  >
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
          </div>
        );
      })}
    </aside>
  );
}
