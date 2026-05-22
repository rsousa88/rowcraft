"use client";

import "@xyflow/react/dist/style.css";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { Database } from "sql.js";
import {
  ErdTableNode,
  NODE_WIDTH,
  collapsedHeight,
  type TableNodeData,
  type ColumnInfo,
} from "@/components/ErdTableNode";
import { useTheme } from "@/components/ThemeProvider";

// ── group colours ─────────────────────────────────────────────────────────────

const GROUP_PALETTES = [
  { bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.35)",  label: "#059669" }, // emerald
  { bg: "rgba(59,130,246,0.08)",  border: "rgba(59,130,246,0.35)",  label: "#2563eb" }, // blue
  { bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.35)",  label: "#7c3aed" }, // violet
  { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.35)",  label: "#d97706" }, // amber
  { bg: "rgba(236,72,153,0.08)", border: "rgba(236,72,153,0.35)",  label: "#db2777" }, // pink
  { bg: "rgba(6,182,212,0.08)",  border: "rgba(6,182,212,0.35)",   label: "#0891b2" }, // cyan
  { bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.35)",   label: "#dc2626" }, // red
  { bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.35)",  label: "#9333ea" }, // purple
];

// ── group background node ─────────────────────────────────────────────────────

interface GroupNodeData {
  label: string;
  palette: typeof GROUP_PALETTES[number];
  [key: string]: unknown;
}

function GroupBackgroundNode({ data }: { data: GroupNodeData }) {
  const { palette } = data;
  return (
    <div
      className="w-full h-full rounded-2xl border-2 pointer-events-none"
      style={{ background: palette.bg, borderColor: palette.border }}
    >
      <div
        className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider select-none"
        style={{ color: palette.label }}
      >
        {data.label}
      </div>
    </div>
  );
}

// ── schema extraction ─────────────────────────────────────────────────────────

interface FkInfo { fromCol: string; toTable: string; toCol: string }
interface TableSchema { name: string; columns: ColumnInfo[]; fks: FkInfo[] }
interface GroupDef { id: string; name: string; tables: string[] }

function extractSchema(db: Database): TableSchema[] {
  const tableNames: string[] =
    db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
      .at(0)?.values.map((r) => r[0] as string) ?? [];

  const referencedCols = new Map<string, Set<string>>();
  for (const name of tableNames) {
    try {
      const fkRows = db.exec(`PRAGMA foreign_key_list("${name}");`).at(0)?.values ?? [];
      for (const row of fkRows) {
        const toTable = row[2] as string;
        const toCol = row[4] as string;
        if (!referencedCols.has(toTable)) referencedCols.set(toTable, new Set());
        referencedCols.get(toTable)!.add(toCol);
      }
    } catch { /* ignore */ }
  }

  return tableNames.map((name) => {
    const colRows = db.exec(`PRAGMA table_info("${name}");`).at(0)?.values ?? [];
    let fkRows: unknown[][] = [];
    try { fkRows = db.exec(`PRAGMA foreign_key_list("${name}");`).at(0)?.values ?? []; } catch { /* ignore */ }

    const fkColNames = new Set(fkRows.map((r) => r[3] as string));
    const fks: FkInfo[] = fkRows.map((r) => ({ fromCol: r[3] as string, toTable: r[2] as string, toCol: r[4] as string }));
    const columns: ColumnInfo[] = colRows.map((row) => ({
      name: row[1] as string,
      type: row[2] as string ?? "",
      isPk: (row[5] as number) > 0,
      isNotNull: (row[3] as number) === 1,
      isFkSource: fkColNames.has(row[1] as string),
      isReferenced: referencedCols.get(name)?.has(row[1] as string) ?? false,
    }));

    return { name, columns, fks };
  });
}

// ── Dagre layout ──────────────────────────────────────────────────────────────

const GRP_PADDING = 28;
const GRP_LABEL_H = 26;

function applyLayout(
  nodes: Node[],
  edges: Edge[],
  groups: GroupDef[]
): { tableNodes: Node[]; groupNodes: Node[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120, edgesep: 20 });

  const h = collapsedHeight();
  const tableIds = new Set(nodes.map((n) => n.id));

  for (const node of nodes) g.setNode(node.id, { width: NODE_WIDTH, height: h });

  // Real FK edges
  for (const edge of edges) g.setEdge(edge.source, edge.target);

  // Weak intra-group edges nudge Dagre to keep group members adjacent
  for (const group of groups) {
    const valid = group.tables.filter((t) => tableIds.has(t));
    for (let i = 0; i < valid.length - 1; i++) {
      // Only add if no real FK edge already exists (avoids duplicate edges)
      if (!g.hasEdge(valid[i], valid[i + 1]) && !g.hasEdge(valid[i + 1], valid[i])) {
        g.setEdge(valid[i], valid[i + 1], { weight: 2, minlen: 1 });
      }
    }
  }

  dagre.layout(g);

  // Compute table node positions
  const positions = new Map<string, { x: number; y: number }>();
  const tableNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const x = pos.x - NODE_WIDTH / 2;
    const y = pos.y - h / 2;
    positions.set(node.id, { x, y });
    return { ...node, position: { x, y } };
  });

  // Build group background nodes from bounding boxes
  const groupNodes: Node[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const members = group.tables.filter((t) => positions.has(t));
    if (members.length === 0) continue;

    const xs = members.map((t) => positions.get(t)!.x);
    const ys = members.map((t) => positions.get(t)!.y);
    const minX = Math.min(...xs) - GRP_PADDING;
    const minY = Math.min(...ys) - GRP_PADDING - GRP_LABEL_H;
    const maxX = Math.max(...xs) + NODE_WIDTH + GRP_PADDING;
    const maxY = Math.max(...ys) + h + GRP_PADDING;

    groupNodes.push({
      id: `__group__${group.id}`,
      type: "groupNode",
      position: { x: minX, y: minY },
      style: { width: maxX - minX, height: maxY - minY, zIndex: -1 },
      selectable: false,
      draggable: false,
      data: { label: group.name, palette: GROUP_PALETTES[gi % GROUP_PALETTES.length] },
    });
  }

  return { tableNodes, groupNodes };
}

// ── build React Flow graph ────────────────────────────────────────────────────

function buildGraph(
  schema: TableSchema[],
  rowCounts: Record<string, number>,
  groups: GroupDef[]
) {
  const tableNodes: Node<TableNodeData>[] = schema.map((table) => ({
    id: table.name,
    type: "tableNode",
    position: { x: 0, y: 0 },
    data: { label: table.name, columns: table.columns, rowCount: rowCounts[table.name], collapsed: true },
    zIndex: 1,
  }));

  const edges: Edge[] = [];
  for (const table of schema) {
    for (const fk of table.fks) {
      if (fk.toTable === table.name) continue;
      if (!schema.find((t) => t.name === fk.toTable)) continue;
      edges.push({
        id: `${table.name}-${fk.fromCol}->${fk.toTable}-${fk.toCol}`,
        source: table.name,
        sourceHandle: `src-${fk.fromCol}`,
        target: fk.toTable,
        targetHandle: `tgt-${fk.toCol}`,
        type: "smoothstep",
        animated: false,
        style: { stroke: "#10b981", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981", width: 14, height: 14 },
        zIndex: 2,
      });
    }
  }

  const { tableNodes: laidOut, groupNodes } = applyLayout(tableNodes, edges, groups);
  // Group background nodes go first so table nodes render on top
  return { nodes: [...groupNodes, ...laidOut], edges };
}

// ── component ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: Record<string, any> = { tableNode: ErdTableNode, groupNode: GroupBackgroundNode };

interface Props {
  db: Database | null;
  dbName: string;
  rowCounts: Record<string, number>;
}

export function ErdDiagram({ db, dbName, rowCounts }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark" || (theme === "auto" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [tableCount, setTableCount] = useState(0);
  const [fkCount, setFkCount] = useState(0);
  const [groups, setGroups] = useState<GroupDef[]>([]);

  // Fetch groups from server (same endpoint as TableSidebar)
  useEffect(() => {
    if (!dbName) return;
    fetch(`/api/databases/${encodeURIComponent(dbName)}/groups`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setGroups(Array.isArray(data) ? data : []))
      .catch(() => setGroups([]));
  }, [dbName]);

  // Rebuild diagram when db, rowCounts, or groups change
  useEffect(() => {
    if (!db) return;
    const schema = extractSchema(db);
    const { nodes: n, edges: e } = buildGraph(schema, rowCounts, groups);
    setNodes(n);
    setEdges(e);
    setTableCount(schema.length);
    setFkCount(e.filter((e) => !e.id.startsWith("__group__")).length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, rowCounts, groups]);

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);
  const onInit = useCallback((instance: { fitView: () => void }) => {
    setTimeout(() => instance.fitView(), 50);
  }, []);

  if (!db) return (
    <div className="flex h-full items-center justify-center text-zinc-400 dark:text-zinc-600 text-sm">
      Loading database…
    </div>
  );

  const groupCount = groups.filter((g) => g.tables.some((t) => nodes.find((n) => n.id === t))).length;

  return (
    <div className="h-full w-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.15}
        maxZoom={2}
        proOptions={proOptions}
        onInit={onInit as never}
        colorMode={isDark ? "dark" : "light"}
        edgesFocusable={false}
        nodesDraggable
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={isDark ? "#3f3f46" : "#d4d4d8"} />
        <Controls className="[&>button]:border-zinc-200 dark:[&>button]:border-zinc-700 [&>button]:bg-white dark:[&>button]:bg-zinc-900" showInteractive={false} />
        <MiniMap nodeColor={(n) => n.type === "groupNode" ? "transparent" : "#10b981"} maskColor={isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.5)"} className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden" />

        {/* Info panel */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-md px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-700 shadow-sm select-none flex-wrap max-w-xs">
          <span>{tableCount} table{tableCount !== 1 ? "s" : ""}</span>
          {fkCount > 0 && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span>{fkCount} relationship{fkCount !== 1 ? "s" : ""}</span></>}
          {groupCount > 0 && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span>{groupCount} group{groupCount !== 1 ? "s" : ""}</span></>}
          {fkCount === 0 && tableCount > 0 && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span className="italic">no FK constraints</span></>}
        </div>
      </ReactFlow>
    </div>
  );
}
