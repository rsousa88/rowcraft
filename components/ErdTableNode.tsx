"use client";

import { Handle, Position } from "@xyflow/react";

export const NODE_WIDTH = 230;
export const HEADER_HEIGHT = 38;
export const ROW_HEIGHT = 26;
export const PADDING_BOTTOM = 4;

export interface ColumnInfo {
  name: string;
  type: string;
  isPk: boolean;
  isNotNull: boolean;
  isFkSource: boolean;   // this column references another table
  isReferenced: boolean; // this column is referenced by another table's FK
}

export interface TableNodeData {
  label: string;
  columns: ColumnInfo[];
  rowCount?: number;
  [key: string]: unknown;
}

function handleStyle(rowIndex: number): React.CSSProperties {
  return {
    top: HEADER_HEIGHT + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
    width: 8,
    height: 8,
    background: "#10b981",
    border: "2px solid white",
    borderRadius: "50%",
  };
}

export function ErdTableNode({ data, selected }: { data: TableNodeData; selected?: boolean }) {
  return (
    <div
      className={[
        "rounded-lg overflow-hidden shadow-md border transition-shadow",
        selected
          ? "border-emerald-500 shadow-emerald-200 dark:shadow-emerald-900 shadow-lg"
          : "border-zinc-200 dark:border-zinc-700 shadow-zinc-100 dark:shadow-zinc-900",
      ].join(" ")}
      style={{ width: NODE_WIDTH }}
    >
      {/* Table header */}
      <div className="bg-emerald-600 px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-white text-xs font-bold truncate">{data.label}</span>
        {data.rowCount != null && (
          <span className="text-emerald-200 text-[10px] tabular-nums shrink-0">
            {data.rowCount.toLocaleString()}
          </span>
        )}
      </div>

      {/* Columns */}
      <div className="bg-white dark:bg-zinc-900" style={{ paddingBottom: PADDING_BOTTOM }}>
        {data.columns.map((col, i) => (
          <div
            key={col.name}
            className="relative flex items-center px-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0"
            style={{ height: ROW_HEIGHT }}
          >
            {/* Target handle (left) — this column is referenced by FKs in other tables */}
            {col.isReferenced && (
              <Handle
                type="target"
                position={Position.Left}
                id={`tgt-${col.name}`}
                style={handleStyle(i)}
                isConnectable={false}
              />
            )}

            {/* Source handle (right) — this column references another table */}
            {col.isFkSource && (
              <Handle
                type="source"
                position={Position.Right}
                id={`src-${col.name}`}
                style={handleStyle(i)}
                isConnectable={false}
              />
            )}

            {/* PK / FK badge */}
            <span className="shrink-0 w-7 text-[9px] font-bold mr-1.5">
              {col.isPk ? (
                <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1 py-0.5 rounded">PK</span>
              ) : col.isFkSource ? (
                <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1 py-0.5 rounded">FK</span>
              ) : null}
            </span>

            {/* Column name */}
            <span className="flex-1 text-xs text-zinc-700 dark:text-zinc-200 truncate font-mono">
              {col.name}
            </span>

            {/* Type */}
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 ml-1 shrink-0 font-mono uppercase">
              {col.type?.split("(")[0] || "—"}
            </span>

            {/* NOT NULL dot */}
            {col.isNotNull && !col.isPk && (
              <span className="ml-1 shrink-0 w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" title="NOT NULL" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
