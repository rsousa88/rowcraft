"use client";

import { useState, useEffect, useRef } from "react";

interface SavedQuery {
  name: string;
  sql: string;
}

// Full map stored server-side: { [tableKey]: SavedQuery[] }
// tableKey = table name, or "__global__" for queries saved without an active table
type QueriesMap = Record<string, SavedQuery[]>;

const GLOBAL_KEY = "__global__";

interface Props {
  dbName: string;
  activeTable: string | null;
  currentSql: string;
  onLoad: (sql: string) => void;
}

// ── localStorage helpers ───────────────────────────────────────────────────────

function fullMapLsKey(dbName: string) {
  return `rc-queries-v2-${dbName}`;
}

function loadFullMapFromLs(dbName: string): QueriesMap {
  try {
    const stored = localStorage.getItem(fullMapLsKey(dbName));
    if (stored) return JSON.parse(stored);

    // Migrate from old per-table keys (rc-queries-{dbName} and rc-queries-{dbName}-{table})
    const map: QueriesMap = {};
    const globalOld = localStorage.getItem(`rc-queries-${dbName}`);
    if (globalOld) {
      const q = JSON.parse(globalOld);
      if (q.length) map[GLOBAL_KEY] = q;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`rc-queries-${dbName}-`)) continue;
      const tableKey = key.slice(`rc-queries-${dbName}-`.length);
      const q = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (q.length) map[tableKey] = q;
    }
    return map;
  } catch {
    return {};
  }
}

function persistFullMap(dbName: string, map: QueriesMap) {
  localStorage.setItem(fullMapLsKey(dbName), JSON.stringify(map));
}

// ── component ─────────────────────────────────────────────────────────────────

export function savedQueriesKey(dbName: string, table: string | null) {
  return table ? `rc-queries-${dbName}-${table}` : `rc-queries-${dbName}`;
}

export function SavedQueries({ dbName, activeTable, currentSql, onLoad }: Props) {
  const tableKey = activeTable ?? GLOBAL_KEY;
  const [fullMap, setFullMap] = useState<QueriesMap>({});
  const savePendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queries = fullMap[tableKey] ?? [];

  // Fetch full map from server when dbName changes; fall back to localStorage
  useEffect(() => {
    let cancelled = false;

    async function fetch_() {
      // Instant display from localStorage cache
      const local = loadFullMapFromLs(dbName);
      if (!cancelled) setFullMap(local);

      try {
        const res = await fetch(`/api/databases/${encodeURIComponent(dbName)}/queries`);
        if (cancelled) return;
        if (res.ok) {
          const data: QueriesMap = await res.json();
          const merged = { ...local, ...data }; // server wins per key
          setFullMap(merged);
          persistFullMap(dbName, merged);
        } else if (Object.keys(local).length > 0) {
          // Nothing on server yet — upload the local data to migrate it
          saveToServer(dbName, local);
        }
      } catch {
        // Network error — stay with localStorage
      }
    }

    fetch_();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbName]);

  function saveToServer(db: string, map: QueriesMap) {
    window.fetch(`/api/databases/${encodeURIComponent(db)}/queries`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(map),
    }).catch(() => {});
  }

  function updateQueries(newQueries: SavedQuery[]) {
    const newMap = { ...fullMap, [tableKey]: newQueries };
    setFullMap(newMap);
    persistFullMap(dbName, newMap);
    if (savePendingRef.current) clearTimeout(savePendingRef.current);
    savePendingRef.current = setTimeout(() => saveToServer(dbName, newMap), 600);
  }

  // ── UI state ──────────────────────────────────────────────────────────────

  const [savingName, setSavingName] = useState("");
  const [showInput, setShowInput] = useState(false);

  function handleSave() {
    const name = savingName.trim();
    if (!name) return;
    updateQueries([...queries.filter((q) => q.name !== name), { name, sql: currentSql }]);
    setSavingName("");
    setShowInput(false);
  }

  function handleDelete(name: string) {
    if (!confirm(`Delete query "${name}"?`)) return;
    updateQueries(queries.filter((q) => q.name !== name));
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {queries.length > 0 && (
        <select
          className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 max-w-[180px] truncate"
          defaultValue=""
          onChange={(e) => {
            const q = queries.find((q) => q.name === e.target.value);
            if (q) onLoad(q.sql);
            e.target.value = "";
          }}
        >
          <option value="" disabled>Load query…</option>
          {queries.map((q) => (
            <option key={q.name} value={q.name}>{q.name}</option>
          ))}
        </select>
      )}

      {queries.length > 0 && (
        <select
          className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 max-w-[160px]"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) handleDelete(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="" disabled>Delete query…</option>
          {queries.map((q) => (
            <option key={q.name} value={q.name}>{q.name}</option>
          ))}
        </select>
      )}

      {showInput ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type="text"
            value={savingName}
            onChange={(e) => setSavingName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setShowInput(false); }}
            placeholder="Query name…"
            className="text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 w-36"
          />
          <button onClick={handleSave} className="text-xs text-emerald-600 hover:text-emerald-500 px-1">Save</button>
          <button onClick={() => setShowInput(false)} className="text-xs text-zinc-400 hover:text-zinc-600 px-1">✕</button>
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Save query…
        </button>
      )}
    </div>
  );
}
