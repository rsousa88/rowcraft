"use client";

import { Handle, Position, useReactFlow } from "@xyflow/react";

export const NODE_WIDTH = 230;
export const HEADER_HEIGHT = 38;
export const ROW_HEIGHT = 26;
export const PADDING_BOTTOM = 4;

export function collapsedHeight() { return HEADER_HEIGHT + 2; }
export function expandedHeight(colCount: number) { return HEADER_HEIGHT + colCount * ROW_HEIGHT + PADDING_BOTTOM; }

export interface ColumnInfo {
  name: string;
  type: string;
  isPk: boolean;
  isNotNull: boolean;
  isFkSource: boolean;
  isReferenced: boolean;
}

export interface TableNodeData {
  label: string;
  columns: ColumnInfo[];
  rowCount?: number;
  collapsed?: boolean;
  isDesignMode?: boolean;
  [key: string]: unknown;
}

// When collapsed, all handles sit at the header midpoint so edges still render
function handleTop(colIndex: number, collapsed: boolean): number {
  if (collapsed) return HEADER_HEIGHT / 2;
  return HEADER_HEIGHT + colIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
}

function handleStyle(colIndex: number, collapsed: boolean): React.CSSProperties {
  return {
    top: handleTop(colIndex, collapsed),
    width: 8,
    height: 8,
    background: "#10b981",
    border: "2px solid white",
    borderRadius: "50%",
    transition: "top 0.15s ease",
  };
}

export function ErdTableNode({
  id,
  data,
  selected,
}: {
  id: string;
  data: TableNodeData;
  selected?: boolean;
}) {
  const { updateNodeData } = useReactFlow();
  const collapsed = data.collapsed ?? true;

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    updateNodeData(id, { collapsed: !collapsed });
  }

  return (
    <div
      className={[
        "rounded-lg overflow-hidden shadow-md border transition-shadow select-none",
        selected
          ? "border-emerald-500 shadow-lg shadow-emerald-200 dark:shadow-emerald-900"
          : "border-zinc-200 dark:border-zinc-700 shadow-zinc-100 dark:shadow-zinc-900",
      ].join(" ")}
      style={{ width: NODE_WIDTH }}
    >
      {/* Header — click to collapse / expand */}
      <div
        className="bg-emerald-600 px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-emerald-700 transition-colors"
        onClick={toggle}
        title={collapsed ? "Click to expand columns" : "Click to collapse"}
      >
        {/* Chevron */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-emerald-200 transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>

        <span className="flex-1 text-white text-xs font-bold truncate">{data.label}</span>

        {data.rowCount != null && (
          <span className="text-emerald-200 text-[10px] tabular-nums shrink-0">
            {data.rowCount.toLocaleString()}
          </span>
        )}

        {/* Column count badge when collapsed */}
        {collapsed && data.columns.length > 0 && (
          <span className="text-emerald-300 text-[10px] tabular-nums shrink-0">
            {data.columns.length} col{data.columns.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* FK handles — always rendered, not connectable (display only) */}
      {data.columns.map((col, i) => (
        <span key={col.name}>
          {col.isReferenced && (
            <Handle type="target" position={Position.Left} id={`tgt-${col.name}`} style={handleStyle(i, collapsed)} isConnectable={false} />
          )}
          {col.isFkSource && (
            <Handle type="source" position={Position.Right} id={`src-${col.name}`} style={handleStyle(i, collapsed)} isConnectable={false} />
          )}
        </span>
      ))}

      {/* Sequence Designer handles — large blue dots, only visible and connectable in design mode */}
      {data.isDesignMode && (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="seq-tgt"
            style={{ top: "50%", left: -8, width: 16, height: 16, background: "#3b82f6", border: "2.5px solid white", borderRadius: "50%", cursor: "crosshair", zIndex: 10 }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="seq-src"
            style={{ top: "50%", right: -8, width: 16, height: 16, background: "#3b82f6", border: "2.5px solid white", borderRadius: "50%", cursor: "crosshair", zIndex: 10 }}
          />
        </>
      )}

      {/* Column rows — only rendered when expanded */}
      {!collapsed && (
        <div className="bg-white dark:bg-zinc-900" style={{ paddingBottom: PADDING_BOTTOM }}>
          {data.columns.map((col) => (
            <div
              key={col.name}
              className="relative flex items-center px-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0"
              style={{ height: ROW_HEIGHT }}
            >
              {/* PK / FK badge */}
              <span className="shrink-0 w-7 text-[9px] font-bold mr-1.5">
                {col.isPk ? (
                  <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1 py-0.5 rounded">PK</span>
                ) : col.isFkSource ? (
                  <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1 py-0.5 rounded">FK</span>
                ) : null}
              </span>

              <span className="flex-1 text-xs text-zinc-700 dark:text-zinc-200 truncate font-mono">
                {col.name}
              </span>

              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 ml-1 shrink-0 font-mono uppercase">
                {col.type?.split("(")[0] || "—"}
              </span>

              {col.isNotNull && !col.isPk && (
                <span className="ml-1 shrink-0 w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" title="NOT NULL" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
