"use client";

import { useState, useEffect } from "react";

interface SavedQuery {
  name: string;
  sql: string;
}

interface Props {
  dbName: string;
  currentSql: string;
  onLoad: (sql: string) => void;
}

function storageKey(dbName: string) {
  return `rc-queries-${dbName}`;
}

function load(dbName: string): SavedQuery[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(dbName)) ?? "[]");
  } catch {
    return [];
  }
}

function save(dbName: string, queries: SavedQuery[]) {
  localStorage.setItem(storageKey(dbName), JSON.stringify(queries));
}

export function SavedQueries({ dbName, currentSql, onLoad }: Props) {
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [savingName, setSavingName] = useState("");
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    setQueries(load(dbName));
  }, [dbName]);

  function handleSave() {
    const name = savingName.trim();
    if (!name) return;
    const updated = [...queries.filter((q) => q.name !== name), { name, sql: currentSql }];
    save(dbName, updated);
    setQueries(updated);
    setSavingName("");
    setShowInput(false);
  }

  function handleDelete(name: string) {
    if (!confirm(`Delete query "${name}"?`)) return;
    const updated = queries.filter((q) => q.name !== name);
    save(dbName, updated);
    setQueries(updated);
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
