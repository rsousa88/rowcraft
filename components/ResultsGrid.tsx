"use client";

import type { QueryResult } from "@/components/DbViewer";

export function ResultsGrid({ result }: { result: QueryResult }) {
  if (result.error) {
    return (
      <div className="p-4 text-sm text-red-400 font-mono whitespace-pre-wrap">{result.error}</div>
    );
  }

  if (result.columns.length === 0) {
    return <div className="p-4 text-sm text-zinc-500">Query executed successfully (no rows returned)</div>;
  }

  return (
    <div className="relative">
      <div className="sticky top-0 z-10 bg-zinc-900 px-4 py-1.5 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          {result.rows.length} row{result.rows.length !== 1 ? "s" : ""}
        </span>
      </div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-zinc-900 sticky top-9 z-10">
            {result.columns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-left text-xs font-semibold text-zinc-400 border-b border-zinc-800 whitespace-nowrap"
                title={col}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-1.5 font-mono text-xs whitespace-nowrap max-w-xs truncate ${
                    cell === null ? "text-zinc-600 italic" : "text-zinc-200"
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
