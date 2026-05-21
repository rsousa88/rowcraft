"use client";

import { useState, useCallback } from "react";
import type { QueryResult } from "@/components/DbViewer";

const PAGE_SIZES = [25, 50, 100, 500];
const NULL_SENTINEL = "\x00__NULL__\x00";

// ── helpers ──────────────────────────────────────────────────────────────────

function exportCsv(result: QueryResult, filename: string) {
  const esc = (v: string | number | null) => {
    if (v === null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [result.columns, ...result.rows.map((r) => r.map(esc))];
  const csv = "﻿" + rows.map((r) => r.join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

type SortCol = { col: number; dir: "asc" | "desc" };

function applySortFilter(
  rows: QueryResult["rows"],
  filter: string,
  sort: SortCol[]
): QueryResult["rows"] {
  let result = rows;

  if (filter) {
    const f = filter.toLowerCase();
    result = result.filter((row) =>
      row.some((cell) => cell !== null && String(cell).toLowerCase().includes(f))
    );
  }

  if (sort.length > 0) {
    result = [...result].sort((a, b) => {
      for (const { col, dir } of sort) {
        const av = a[col], bv = b[col];
        if (av === bv) continue;
        if (av === null) return dir === "asc" ? -1 : 1;
        if (bv === null) return dir === "asc" ? 1 : -1;
        const cmp = av < bv ? -1 : 1;
        return dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }

  return result;
}

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  result: QueryResult;
  activeTable?: string | null;
  tableTotal?: number;     // total rows in the table (from COUNT(*), ignores LIMIT)
  rowids?: number[];
  onEditRow?: (rowid: number, values: Record<string, string | null>) => void;
  onDeleteRow?: (rowid: number, msg: string) => void;
  onCreateRow?: (values: Record<string, string | null>) => void;
}

export function ResultsGrid({
  result, activeTable, tableTotal, rowids, onEditRow, onDeleteRow, onCreateRow,
}: Props) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortCol[]>([]);
  const [freezeCols, setFreezeCols] = useState(0);
  const [editingRowid, setEditingRowid] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showNewRow, setShowNewRow] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>({});

  const editableMode = !!(rowids && onEditRow && onDeleteRow && onCreateRow);

  const filtered = applySortFilter(result.rows, filter, sort);
  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // Map filtered rows back to original indices to get correct rowids
  const filteredOriginalIndices = result.rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) =>
      !filter || row.some((cell) => cell !== null && String(cell).toLowerCase().includes(filter.toLowerCase()))
    )
    .map(({ i }) => i);

  const pageRowids = rowids
    ? filteredOriginalIndices.slice(safePage * pageSize, (safePage + 1) * pageSize).map((i) => rowids[i])
    : undefined;

  function handleSortClick(colIdx: number, shift: boolean) {
    setSort((prev) => {
      const existing = prev.find((s) => s.col === colIdx);
      if (shift) {
        if (!existing) return [...prev, { col: colIdx, dir: "asc" }];
        if (existing.dir === "asc") return prev.map((s) => s.col === colIdx ? { ...s, dir: "desc" } : s);
        return prev.filter((s) => s.col !== colIdx);
      }
      if (!existing) return [{ col: colIdx, dir: "asc" }];
      if (existing.dir === "asc") return [{ col: colIdx, dir: "desc" }];
      return [];
    });
    setPage(0);
  }

  function startEdit(rowIdx: number, rowid: number) {
    const absIdx = safePage * pageSize + rowIdx;
    const originalIdx = filteredOriginalIndices[absIdx];
    const row = result.rows[originalIdx];
    const vals: Record<string, string> = {};
    result.columns.forEach((col, ci) => {
      vals[col] = row[ci] === null ? NULL_SENTINEL : String(row[ci]);
    });
    setEditingRowid(rowid);
    setEditValues(vals);
  }

  function commitEdit(rowid: number) {
    const vals: Record<string, string | null> = {};
    result.columns.forEach((col) => {
      vals[col] = editValues[col] === NULL_SENTINEL ? null : editValues[col];
    });
    onEditRow!(rowid, vals);
    setEditingRowid(null);
  }

  // Column header cell — handles sort, sticky freeze
  const Th = useCallback(({ col, idx }: { col: string; idx: number }) => {
    const sortEntry = sort.find((s) => s.col === idx);
    const isFrozen = idx < freezeCols;
    // frozen left offset: account for action col (64px) when editable
    const leftPx = editableMode ? 64 + idx * 120 : idx * 120;
    return (
      <th
        onClick={(e) => handleSortClick(idx, e.shiftKey)}
        className={[
          "px-3 py-2 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400",
          "border-b border-zinc-200 dark:border-zinc-800 whitespace-nowrap cursor-pointer select-none",
          "hover:text-zinc-700 dark:hover:text-zinc-200",
          isFrozen ? "sticky z-20 bg-zinc-50 dark:bg-zinc-900 shadow-[2px_0_0_0_rgba(0,0,0,0.06)]" : "",
        ].join(" ")}
        style={isFrozen ? { left: leftPx } : undefined}
        title={`${col} — click to sort, Shift+click to multi-sort`}
      >
        <span className="flex items-center gap-1">
          {col}
          {sortEntry && <span className="text-[10px]">{sortEntry.dir === "asc" ? "↑" : "↓"}</span>}
          {!sortEntry && sort.length > 0 && <span className="text-zinc-300 dark:text-zinc-700 text-[10px]">↕</span>}
        </span>
      </th>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, freezeCols, editableMode]);

  if (result.error) return (
    <div className="p-4 text-sm text-red-500 dark:text-red-400 font-mono whitespace-pre-wrap">{result.error}</div>
  );

  if (result.columns.length === 0) return (
    <div className="p-4 text-sm text-zinc-400 dark:text-zinc-500">Query executed successfully (no rows returned)</div>
  );

  const frozenLeftAction = 0; // action col always at left-0
  const frozenLeftData = (idx: number) => editableMode ? 64 + idx * 120 : idx * 120;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex-wrap">
        {/* Filter */}
        <input
          type="text"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(0); }}
          placeholder="Filter rows…"
          className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 w-40 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <span className="text-xs text-zinc-400 dark:text-zinc-500 tabular-nums">
          {filter
            ? `${totalFiltered.toLocaleString()} matching / ${result.rows.length.toLocaleString()} loaded`
            : result.rows.length.toLocaleString() + " rows"}
          {tableTotal != null && tableTotal > result.rows.length && (
            <span className="ml-1 text-zinc-300 dark:text-zinc-600">
              ({tableTotal.toLocaleString()} total in table)
            </span>
          )}
        </span>

        {/* Freeze */}
        <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
          <span>Freeze</span>
          <select
            value={freezeCols}
            onChange={(e) => setFreezeCols(Number(e.target.value))}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1 py-0.5 text-xs"
          >
            {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n === 0 ? "none" : `${n} col${n > 1 ? "s" : ""}`}</option>)}
          </select>
        </div>

        {sort.length > 0 && (
          <button onClick={() => setSort([])} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 px-1">
            Clear sort
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {editableMode && (
            <button
              onClick={() => { setShowNewRow(true); setNewRowValues({}); }}
              className="text-xs text-emerald-600 hover:text-emerald-500 font-medium"
            >
              + New row
            </button>
          )}
          <button
            onClick={() => exportCsv(result, activeTable ?? "export")}
            className="text-xs px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Scrollable table ─────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="text-sm border-collapse" style={{ minWidth: "100%" }}>
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-900 sticky top-0 z-10">
              {editableMode && (
                <th
                  className={[
                    "w-16 px-2 border-b border-zinc-200 dark:border-zinc-800",
                    "sticky z-20 bg-zinc-50 dark:bg-zinc-900",
                  ].join(" ")}
                  style={{ left: frozenLeftAction }}
                />
              )}
              {result.columns.map((col, idx) => <Th key={col + idx} col={col} idx={idx} />)}
            </tr>
          </thead>
          <tbody>
            {/* New row form */}
            {showNewRow && editableMode && (
              <tr className="border-b border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30">
                <td className="sticky left-0 z-10 px-2 py-1 bg-emerald-50 dark:bg-emerald-950/30 whitespace-nowrap">
                  <div className="flex gap-1">
                    <button onClick={() => {
                      onCreateRow!(Object.fromEntries(result.columns.map((c) => [c, newRowValues[c] === NULL_SENTINEL ? null : (newRowValues[c] ?? null)])));
                      setShowNewRow(false);
                    }} className="text-xs text-emerald-600 font-medium">Save</button>
                    <button onClick={() => setShowNewRow(false)} className="text-xs text-zinc-400 hover:text-zinc-600">✕</button>
                  </div>
                </td>
                {result.columns.map((col) => (
                  <td key={col} className="px-1 py-0.5">
                    <NullableInput
                      value={newRowValues[col] ?? NULL_SENTINEL}
                      onChange={(v) => setNewRowValues((p) => ({ ...p, [col]: v }))}
                      placeholder={col}
                    />
                  </td>
                ))}
              </tr>
            )}

            {pageRows.map((row, rowIdx) => {
              const rowid = pageRowids?.[rowIdx];
              const isEditing = editingRowid === rowid && rowid != null;
              return (
                <tr
                  key={rowIdx}
                  className={[
                    "group border-b border-zinc-100 dark:border-zinc-800/50",
                    isEditing ? "bg-blue-50 dark:bg-blue-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30",
                  ].join(" ")}
                >
                  {editableMode && (
                    <td
                      className={[
                        "sticky z-10 px-2 py-1 w-16 whitespace-nowrap",
                        isEditing ? "bg-blue-50 dark:bg-blue-950/20" : "bg-white dark:bg-zinc-950 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/30",
                      ].join(" ")}
                      style={{ left: frozenLeftAction }}
                    >
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button onClick={() => commitEdit(rowid!)} className="text-xs text-emerald-600 font-medium">Save</button>
                          <button onClick={() => setEditingRowid(null)} className="text-xs text-zinc-400 hover:text-zinc-600">✕</button>
                        </div>
                      ) : (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(rowIdx, rowid!)} className="text-xs text-zinc-400 hover:text-blue-500" title="Edit">✎</button>
                          <button onClick={() => onDeleteRow!(rowid!, `Delete this row from "${activeTable}"?`)} className="text-xs text-zinc-400 hover:text-red-500" title="Delete">✕</button>
                        </div>
                      )}
                    </td>
                  )}
                  {row.map((cell, ci) => {
                    const isFrozen = ci < freezeCols;
                    const colName = result.columns[ci];
                    return (
                      <td
                        key={ci}
                        className={[
                          "px-1 py-0.5",
                          isFrozen ? "sticky z-10 shadow-[2px_0_0_0_rgba(0,0,0,0.06)]" : "",
                          isFrozen && !isEditing ? "bg-white dark:bg-zinc-950 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/30" : "",
                          isFrozen && isEditing ? "bg-blue-50 dark:bg-blue-950/20" : "",
                        ].join(" ")}
                        style={isFrozen ? { left: frozenLeftData(ci) } : undefined}
                      >
                        {isEditing ? (
                          <NullableInput
                            value={editValues[colName] ?? NULL_SENTINEL}
                            onChange={(v) => setEditValues((p) => ({ ...p, [colName]: v }))}
                          />
                        ) : (
                          <span
                            className={[
                              "block px-2 py-1 font-mono text-xs whitespace-nowrap max-w-[240px] truncate",
                              cell === null ? "text-zinc-400 dark:text-zinc-600 italic" : "text-zinc-700 dark:text-zinc-200",
                            ].join(" ")}
                            title={cell === null ? "NULL" : String(cell)}
                          >
                            {cell === null ? "NULL" : String(cell)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination bar ───────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1 py-0.5 text-xs"
          >
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 tabular-nums">
          <span>{Math.min(safePage * pageSize + 1, totalFiltered)}–{Math.min((safePage + 1) * pageSize, totalFiltered)} of {totalFiltered.toLocaleString()}</span>
          <button onClick={() => setPage(0)} disabled={safePage === 0} className="px-1 disabled:opacity-30 hover:text-zinc-700 dark:hover:text-zinc-200">«</button>
          <button onClick={() => setPage(safePage - 1)} disabled={safePage === 0} className="px-1 disabled:opacity-30 hover:text-zinc-700 dark:hover:text-zinc-200">‹</button>
          <span>Page {safePage + 1} / {totalPages}</span>
          <button onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages - 1} className="px-1 disabled:opacity-30 hover:text-zinc-700 dark:hover:text-zinc-200">›</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={safePage >= totalPages - 1} className="px-1 disabled:opacity-30 hover:text-zinc-700 dark:hover:text-zinc-200">»</button>
        </div>
      </div>
    </div>
  );
}

// ── NullableInput ─────────────────────────────────────────────────────────────

function NullableInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const isNull = value === NULL_SENTINEL;
  return (
    <div className="flex items-center gap-0.5 min-w-[80px]">
      {isNull ? (
        <button
          onClick={() => onChange("")}
          className="flex-1 text-left text-xs italic text-zinc-400 dark:text-zinc-600 px-1.5 py-0.5 rounded border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-400 font-mono"
          title="Click to set a value"
        >
          NULL
        </button>
      ) : (
        <input
          autoFocus
          type="text"
          value={value}
          placeholder={placeholder ?? "value"}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 font-mono text-xs px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      )}
      <button
        onClick={() => onChange(isNull ? "" : NULL_SENTINEL)}
        className={[
          "text-[10px] px-1 py-0.5 rounded font-mono transition-colors",
          isNull ? "text-zinc-400 hover:text-zinc-600" : "text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400",
        ].join(" ")}
        title={isNull ? "Set to empty string" : "Set to NULL"}
      >
        ∅
      </button>
    </div>
  );
}
