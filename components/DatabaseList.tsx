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

export function DatabaseList({ initialDatabases }: { initialDatabases: FileObject[] }) {
  const [databases, setDatabases] = useState(initialDatabases);
  const [uploading, setUploading] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-700 py-20 text-center">
          <p className="text-zinc-400">No databases yet</p>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload your first .db file"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {databases.map((db) => (
            <div
              key={db.name}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 hover:border-zinc-600 transition-colors"
            >
              <Link
                href={`/db/${encodeURIComponent(db.name)}`}
                className="flex-1 min-w-0"
              >
                <p className="font-medium truncate">{db.name}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {db.metadata?.size ? formatBytes(db.metadata.size) : ""}
                  {db.updated_at ? ` · ${formatDate(db.updated_at)}` : ""}
                </p>
              </Link>
              <button
                onClick={() => handleDelete(db.name)}
                disabled={deletingName === db.name}
                className="ml-4 shrink-0 rounded px-2 py-1 text-xs text-zinc-500 hover:text-red-400 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                {deletingName === db.name ? "Deleting…" : "Delete"}
              </button>
            </div>
          ))}

          <div className="pt-4">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? "Uploading…" : "Upload database"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
