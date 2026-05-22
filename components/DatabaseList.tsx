"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { FileObject } from "@supabase/storage-js";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Minimal valid SQLite database (empty, 1-page, WAL off)
const EMPTY_SQLITE_HEADER = new Uint8Array([
  0x53,0x51,0x4c,0x69,0x74,0x65,0x20,0x66,0x6f,0x72,0x6d,0x61,0x74,0x20,0x33,0x00, // "SQLite format 3\0"
  0x10,0x00, // page size 4096
  0x01,0x01,0x00,0x40,0x20,0x20, // file format versions
  0x00,0x00,0x00,0x00, // reserved space per page
  0x00,0x00,0x00,0x01, // max/min embedded payload, leaf payload, change counter
  0x00,0x00,0x00,0x01, // database size in pages
  0x00,0x00,0x00,0x00, // first trunk page
  0x00,0x00,0x00,0x00, // total free pages
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00, // schema cookie + format
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
]);

async function createEmptyDb(name: string): Promise<File> {
  // Use sql.js WASM to create a valid empty database
  const { default: initSqlJs } = await import("sql.js");
  const SQL = await initSqlJs({ locateFile: (f) => `/${f}` });
  const db = new SQL.Database();
  const data = db.export();
  db.close();
  return new File([data.buffer as ArrayBuffer], name.endsWith(".db") ? name : `${name}.db`, { type: "application/x-sqlite3" });
}

export function DatabaseList({ initialDatabases }: { initialDatabases: FileObject[] }) {
  const [databases, setDatabases] = useState(initialDatabases);
  const [uploading, setUploading] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingBlank, setCreatingBlank] = useState(false);
  const [newDbName, setNewDbName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/databases", { method: "POST", body: form });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg);
      }
      const refreshed = await fetch("/api/databases").then((r) => r.json());
      setDatabases(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingName(name);
    setError(null);
    try {
      const res = await fetch(`/api/databases/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setDatabases((prev) => prev.filter((db) => db.name !== name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingName(null);
    }
  }

  async function handleCreateBlank() {
    const name = newDbName.trim() || "new_database";
    setUploading(true);
    setError(null);
    try {
      const file = await createEmptyDb(name);
      await handleUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create database");
    } finally {
      setUploading(false);
      setCreatingBlank(false);
      setNewDbName("");
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-4 rounded-md bg-red-900/40 px-4 py-3 text-sm text-red-300">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />

      {databases.length === 0 ? (
        <div className="flex flex-col items-center gap-6 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 py-20 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">No databases yet</p>
          <div className="flex gap-3">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Upload a .db file
            </button>
            <button
              onClick={() => setCreatingBlank(true)}
              disabled={uploading}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              Create blank database
            </button>
          </div>
          {creatingBlank && (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={newDbName}
                onChange={(e) => setNewDbName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateBlank(); if (e.key === "Escape") { setCreatingBlank(false); setNewDbName(""); } }}
                placeholder="database_name"
                className="text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-zinc-400 text-sm">.db</span>
              <button onClick={handleCreateBlank} disabled={uploading} className="text-sm text-emerald-600 font-medium hover:text-emerald-500 disabled:opacity-50">
                {uploading ? "Creating…" : "Create"}
              </button>
              <button onClick={() => { setCreatingBlank(false); setNewDbName(""); }} className="text-sm text-zinc-400 hover:text-zinc-600">Cancel</button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {databases.map((db) => (
            <div
              key={db.name}
              className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
            >
              <Link
                href={`/db/${encodeURIComponent(db.name)}`}
                className="flex-1 min-w-0"
              >
                <p className="font-medium truncate">{db.name}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                  {db.metadata?.size ? formatBytes(db.metadata.size) : ""}
                  {db.updated_at ? ` · ${formatDate(db.updated_at)}` : ""}
                </p>
              </Link>
              <button
                onClick={() => handleDelete(db.name)}
                disabled={deletingName === db.name}
                className="ml-4 shrink-0 rounded px-2 py-1 text-xs text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                {deletingName === db.name ? "Deleting…" : "Delete"}
              </button>
            </div>
          ))}

          <div className="pt-4 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-4 py-2 text-sm font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              Upload database
            </button>
            {creatingBlank ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  value={newDbName}
                  onChange={(e) => setNewDbName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateBlank(); if (e.key === "Escape") { setCreatingBlank(false); setNewDbName(""); } }}
                  placeholder="database_name"
                  className="text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <span className="text-zinc-400 text-sm">.db</span>
                <button onClick={handleCreateBlank} disabled={uploading} className="text-sm text-emerald-600 font-medium hover:text-emerald-500">
                  {uploading ? "Creating…" : "Create"}
                </button>
                <button onClick={() => { setCreatingBlank(false); setNewDbName(""); }} className="text-sm text-zinc-400 hover:text-zinc-600">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setCreatingBlank(true)}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Create blank database
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
