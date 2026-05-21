"use client";

import { useEffect, useRef, useState } from "react";

export interface HistoryEntry {
  sql: string;
  ts: number;
}

function storageKey(dbName: string) {
  return `rc-history-${dbName}`;
}

export function loadHistory(dbName: string): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(dbName)) ?? "[]");
  } catch {
    return [];
  }
}

export function pushHistory(dbName: string, sql: string) {
  const existing = loadHistory(dbName);
  if (existing[0]?.sql === sql) return; // no consecutive duplicates
  const updated = [{ sql, ts: Date.now() }, ...existing].slice(0, 50);
  localStorage.setItem(storageKey(dbName), JSON.stringify(updated));
}

interface Props {
  dbName: string;
  onLoad: (sql: string) => void;
}

export function QueryHistory({ dbName, onLoad }: Props) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  function refresh() {
    setEntries(loadHistory(dbName));
  }

  useEffect(() => {
    if (open) refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dbName]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function fmt(ts: number) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        History
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-96 max-h-80 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl z-30">
          {entries.length === 0 ? (
            <p className="px-4 py-3 text-xs text-zinc-400 dark:text-zinc-500">No history yet</p>
          ) : (
            <>
              <div className="px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Recent queries ({entries.length})
                </span>
                <button
                  onClick={() => {
                    localStorage.removeItem(storageKey(dbName));
                    setEntries([]);
                  }}
                  className="text-[10px] text-zinc-400 hover:text-red-500"
                >
                  Clear
                </button>
              </div>
              {entries.map((entry, i) => (
                <button
                  key={i}
                  onClick={() => { onLoad(entry.sql); setOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-50 dark:border-zinc-800/50 last:border-0"
                >
                  <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-0.5">{fmt(entry.ts)}</div>
                  <div className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">{entry.sql.replace(/\s+/g, " ").trim()}</div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
