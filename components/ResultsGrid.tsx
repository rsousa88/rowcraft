"use client";

import { useState, useRef } from "react";
import type { QueryResult } from "@/components/DbViewer";

const PAGE_SIZES = [25, 50, 100, 500];

function exportCsv(result: QueryResult, filename: string) {
  const escape = (v: string | number | null) => {
    if (v === null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [result.columns, ...result.rows.map((r) => r.map(escape))];
  const csv = "﻿" + rows.map((r) => r.join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

interface Props {
  result: QueryResult;
  activeTable?: string | null;
  rowids?: number[];
  onEditRow?: (rowid: number, values: Record<string, string | null>) => void;
  onDeleteRow?: (rowid: number, confirmMsg: string) => void;
  onCreateRow?: (values: Record<string, string | null>) => void;
}

export function ResultsGrid({ result, activeTable, rowids, onEditRow, onDeleteRow, onCreateRow }: Props) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [editingRowid, setEditingRowid] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showNewRow, setShowNewRow] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>({});
  const editableMode = !!(rowids && onEditRow && onDeleteRow && onCreateRow);

  const totalRows = result.rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = result.rows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const pageRowids = rowids?.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function startEdit(rowIdx: number, rowid: number) {
    const vals: Record<string, string> = {};
    result.columns.forEach((col, ci) => {
      vals[col] = result.rows[safePage * pageSize + rowIdx][ci] == null
        ? "" : String(result.rows[safePage * pageSize + rowIdx][ci]);
    });
    setEditingRowid(rowid);
    setEditValues(vals);
  }

  function commitEdit(rowid: number) {
    const vals: Record<string, string | null> = {};
    result.columns.forEach((col) => { vals[col] = editValues[col] === "" ? null : editValues[col]; });
    onEditRow!(rowid, vals);
    setEditingRowid(null);
  }

  if (result.error) {
    return <div className="p-4 text-sm text-red-500 dark:text-red-400 font-mono whitespace-pre-wrap">{result.error}</div>;
  }

  if (result.columns.length === 0) {
    return <div className="p-4 text-sm text-zinc-400 dark:text-zinc-500">Query executed successfully (no rows returned)</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Toolbar (never scrolls) ── */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
        <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
          <span>{totalRows.toLocaleString()} row{totalRows !== 1 ? "s" : ""}</span>
          {editableMode && (
            <button
              onClick={() => { setShowNewRow(true); setNewRowValues({}); }}
              className="flex items-center gap-1 text-emerald-600 hover:text-emerald-500 font-medium"
            >
              + New row
            </button>
          )}
        </div>
        <button
          onClick={() => exportCsv(result, activeTable ?? "export")}
          className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 px-2 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* ── Scrollable table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-900 sticky top-0 z-10">
              {editableMode && <th className="w-16 px-2" />}
              {result.columns.map((col) => (
                <th key={col} className="px-3 py-2 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 whitespace-nowrap" title={col}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* New row form */}
            {showNewRow && editableMode && (
              <tr className="border-b border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30">
                <td className="px-2 py-1 whitespace-nowrap">
                  <div className="flex gap-1">
                    <button onClick={() => { onCreateRow!(Object.fromEntries(result.columns.map((c) => [c, newRowValues[c] ?? null]))); setShowNewRow(false); }} className="text-xs text-emerald-600 hover:text-emerald-500 font-medium">Save</button>
                    <button onClick={() => setShowNewRow(false)} className="text-xs text-zinc-400 hover:text-zinc-600">✕</button>
                  </div>
                </td>
                {result.columns.map((col) => (
                  <td key={col} className="px-1 py-0.5">
                    <input
                      type="text"
                      placeholder="NULL"
                      value={newRowValues[col] ?? ""}
                      onChange={(e) => setNewRowValues((p) => ({ ...p, [col]: e.target.value }))}
                      className="w-full min-w-[80px] text-xs px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </td>
                ))}
              </tr>
            )}

            {pageRows.map((row, rowIdx) => {
              const rowid = pageRowids?.[rowIdx];
              const isEditing = editingRowid === rowid && rowid != null;
              return (
                <tr key={rowIdx} className={`border-b border-zinc-100 dark:border-zinc-800/50 ${isEditing ? "bg-blue-50 dark:bg-blue-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"}`}>
                  {editableMode && (
                    <td className="px-2 py-1 whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button onClick={() => commitEdit(rowid!)} className="text-xs text-emerald-600 hover:text-emerald-500 font-medium">Save</button>
                          <button onClick={() => setEditingRowid(null)} className="text-xs text-zinc-400 hover:text-zinc-600">✕</button>
                        </div>
                      ) : (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={() => startEdit(rowIdx, rowid!)}
                            className="text-xs text-zinc-400 hover:text-blue-500 px-1"
                            title="Edit row"
                          >✎</button>
                          <button
                            onClick={() => onDeleteRow!(rowid!, `Delete this row?`)}
                            className="text-xs text-zinc-400 hover:text-red-500 px-1"
                            title="Delete row"
                          >✕</button>
                        </div>
                      )}
                    </td>
                  )}
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-1 py-0.5">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValues[result.columns[ci]] ?? ""}
                          onChange={(e) => setEditValues((p) => ({ ...p, [result.columns[ci]]: e.target.value }))}
                          className="w-full min-w-[80px] font-mono text-xs px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <span
                          className={`block px-2 py-1 font-mono text-xs whitespace-nowrap max-w-xs truncate ${cell === null ? "text-zinc-400 dark:text-zinc-600 italic" : "text-zinc-700 dark:text-zinc-200"}`}
                          title={cell === null ? "NULL" : String(cell)}
                        >
                          {cell === null ? "NULL" : String(cell)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination bar (never scrolls) ── */}
      {totalRows > 0 && (
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
          <div className="flex items-center gap-2">
            <span>
              {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, totalRows)} of {totalRows.toLocaleString()}
            </span>
            <button onClick={() => setPage(0)} disabled={safePage === 0} className="px-1 disabled:opacity-30 hover:text-zinc-700 dark:hover:text-zinc-200">«</button>
            <button onClick={() => setPage(safePage - 1)} disabled={safePage === 0} className="px-1 disabled:opacity-30 hover:text-zinc-700 dark:hover:text-zinc-200">‹</button>
            <span>Page {safePage + 1} of {totalPages}</span>
            <button onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages - 1} className="px-1 disabled:opacity-30 hover:text-zinc-700 dark:hover:text-zinc-200">›</button>
            <button onClick={() => setPage(totalPages - 1)} disabled={safePage >= totalPages - 1} className="px-1 disabled:opacity-30 hover:text-zinc-700 dark:hover:text-zinc-200">»</button>
          </div>
        </div>
      )}
    </div>
  );
}
