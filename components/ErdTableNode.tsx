"use client";

import { Handle, Position, useReactFlow } from "@xyflow/react";

export const NODE_WIDTH = 230;
export const HEADER_HEIGHT = 38;
export const ROW_HEIGHT = 26;
export const PADDING_BOTTOM = 4;

// Layout constants used by both ErdTableNode and ErdDiagram
export const COLS_PER_ROW = 5;
export const H_GAP = 40;
export const V_GAP = 40;
export const GRP_PAD_X = 32;
export const GRP_PAD_TOP = 44;
export const GRP_PAD_BOTTOM = 28;

export function collapsedHeight() { return HEADER_HEIGHT + 2; }
export function expandedHeight(colCount: number) { return HEADER_HEIGHT + colCount * ROW_HEIGHT + PADDING_BOTTOM; }

/** Compute the height a group needs given its children's collapsed states. */
export function groupHeightForChildren(children: { collapsed?: boolean; colCount: number }[]): number {
  if (children.length === 0) return GRP_PAD_TOP + collapsedHeight() + GRP_PAD_BOTTOM;
  const numRows = Math.ceil(children.length / COLS_PER_ROW);
  const maxH = Math.max(...children.map(c =>
    c.collapsed !== false ? collapsedHeight() : expandedHeight(c.colCount)
  ));
  return GRP_PAD_TOP + numRows * maxH + (numRows - 1) * V_GAP + GRP_PAD_BOTTOM;
}

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
  parentGroupId?: string; // group node ID if this table is inside a group
  [key: string]: unknown;
}

function handleTop(colIndex: number, collapsed: boolean): number {
  if (collapsed) return HEADER_HEIGHT / 2;
  return HEADER_HEIGHT + colIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
}

function handleStyle(colIndex: number, collapsed: boolean): React.CSSProperties {
  return {
    top: handleTop(colIndex, collapsed),
    width: 6, height: 6,        // smaller dots
    background: "#10b981", border: "1.5px solid white", borderRadius: "50%",
    transition: "top 0.15s ease",
  };
}

export function ErdTableNode({ id, data, selected }: { id: string; data: TableNodeData; selected?: boolean }) {
  const { setNodes } = useReactFlow();
  const collapsed = data.collapsed ?? true;

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const newCollapsed = !collapsed;
    // Update collapsed state and bring expanded nodes to the front.
    // Group size is NOT changed here — it is set once at initial layout and only
    // changed when the user manually resizes the group (not on every expand/collapse).
    setNodes(nds => nds.map(n =>
      n.id !== id ? n
        : { ...n, zIndex: newCollapsed ? 1 : 20, data: { ...n.data, collapsed: newCollapsed } }
    ));
  }

  return (
    <div
      className={[
        "rounded-lg overflow-visible shadow-md border transition-shadow select-none",
        selected
          ? "border-emerald-500 shadow-lg shadow-emerald-200 dark:shadow-emerald-900"
          : "border-zinc-200 dark:border-zinc-700 shadow-zinc-100 dark:shadow-zinc-900",
      ].join(" ")}
      style={{ width: NODE_WIDTH }}
    >
      {/* Header */}
      <div
        className="bg-emerald-600 px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-emerald-700 transition-colors rounded-t-lg"
        onClick={toggle}
        title={`${data.label}${collapsed ? " — click to expand" : " — click to collapse"}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 text-emerald-200 transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
        <span className="flex-1 text-white text-xs font-bold truncate">{data.label}</span>
        {data.rowCount != null && <span className="text-emerald-200 text-[10px] tabular-nums shrink-0">{data.rowCount.toLocaleString()}</span>}
        {collapsed && data.columns.length > 0 && <span className="text-emerald-300 text-[10px] tabular-nums shrink-0">{data.columns.length} col{data.columns.length !== 1 ? "s" : ""}</span>}
      </div>

      {/* FK handles — always present, position animates */}
      {data.columns.map((col, i) => (
        <span key={col.name}>
          {col.isReferenced && <Handle type="target" position={Position.Left} id={`tgt-${col.name}`} style={handleStyle(i, collapsed)} isConnectable={false} />}
          {col.isFkSource && <Handle type="source" position={Position.Right} id={`src-${col.name}`} style={handleStyle(i, collapsed)} isConnectable={false} />}
        </span>
      ))}

      {/* Sequence Designer handles — always in the DOM so edge routing works in view mode too.
          Visible + connectable only when isDesignMode; invisible + pointer-events-none otherwise. */}
      {/* Sequence Designer handles — always in DOM for edge routing.
          In view mode: no positional overrides so React Flow places them at the node edge (Position.Left/Right).
          In design mode: sized and coloured as visible interactive dots on the border. */}
      <Handle
        type="target" position={Position.Left} id="seq-tgt"
        isConnectable={!!data.isDesignMode}
        style={data.isDesignMode ? {
          top: "50%", left: -4,
          width: 8, height: 8,
          background: "#3b82f6", border: "2px solid white",
          borderRadius: "50%", cursor: "crosshair",
          opacity: 1, pointerEvents: "all", zIndex: 10, transform: "translateY(-50%)",
        } : {
          // Invisible, minimal — let React Flow place at the left edge for correct routing
          width: 1, height: 1, opacity: 0, pointerEvents: "none", zIndex: 10,
        }}
      />
      <Handle
        type="source" position={Position.Right} id="seq-src"
        isConnectable={!!data.isDesignMode}
        style={data.isDesignMode ? {
          top: "50%", right: -4,
          width: 8, height: 8,
          background: "#3b82f6", border: "2px solid white",
          borderRadius: "50%", cursor: "crosshair",
          opacity: 1, pointerEvents: "all", zIndex: 10, transform: "translateY(-50%)",
        } : {
          width: 1, height: 1, opacity: 0, pointerEvents: "none", zIndex: 10,
        }}
      />

      {/* Column rows */}
      {!collapsed && (
        <div className="bg-white dark:bg-zinc-900 rounded-b-lg" style={{ paddingBottom: PADDING_BOTTOM }}>
          {data.columns.map((col) => (
            <div
              key={col.name}
              className="relative flex items-center px-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0"
              style={{ height: ROW_HEIGHT }}
              title={`${col.name}${col.type ? ` · ${col.type}` : ""}${col.isPk ? " · Primary Key" : ""}${col.isFkSource ? " · Foreign Key" : ""}${col.isNotNull && !col.isPk ? " · NOT NULL" : ""}`}
            >
              <span className="shrink-0 w-6 text-[9px] font-bold mr-1">
                {col.isPk ? <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1 py-0.5 rounded">PK</span>
                  : col.isFkSource ? <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1 py-0.5 rounded">FK</span>
                  : null}
              </span>
              {/* Reduced font for column names */}
              <span className="flex-1 text-[10px] text-zinc-700 dark:text-zinc-200 truncate font-mono">{col.name}</span>
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 ml-1 shrink-0 font-mono uppercase">{col.type?.split("(")[0] || "—"}</span>
              {col.isNotNull && !col.isPk && <span className="ml-1 shrink-0 w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" title="NOT NULL" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
