"use client";

import type { QueryResult } from "@/components/DbViewer";

function exportCsv(result: QueryResult, filename: string) {
  const escape = (v: string | number | null) => {
    if (v === null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
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

export function ResultsGrid({ result, activeTable }: { result: QueryResult; activeTable?: string | null }) {
  if (result.error) {
    return (
      <div className="p-4 text-sm text-red-500 dark:text-red-400 font-mono whitespace-pre-wrap">{result.error}</div>
    );
  }

  if (result.columns.length === 0) {
    return <div className="p-4 text-sm text-zinc-400 dark:text-zinc-500">Query executed successfully (no rows returned)</div>;
  }

  return (
    <div className="relative">
      <div className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900 px-4 py-1.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {result.rows.length} row{result.rows.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => exportCsv(result, activeTable ?? "export")}
          className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 px-2 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          title="Export to CSV (UTF-8 with BOM for Excel)"
        >
          Export CSV
        </button>
      </div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-900 sticky top-9 z-10">
            {result.columns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 whitespace-nowrap"
                title={col}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-1.5 font-mono text-xs whitespace-nowrap max-w-xs truncate ${
                    cell === null ? "text-zinc-400 dark:text-zinc-600 italic" : "text-zinc-700 dark:text-zinc-200"
                  }`}
                  title={cell === null ? "NULL" : String(cell)}
                >
                  {cell === null ? "NULL" : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
