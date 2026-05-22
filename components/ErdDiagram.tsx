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
  HEADER_HEIGHT,
  ROW_HEIGHT,
  PADDING_BOTTOM,
  type TableNodeData,
  type ColumnInfo,
} from "@/components/ErdTableNode";
import { useTheme } from "@/components/ThemeProvider";

// ── schema extraction ─────────────────────────────────────────────────────────

interface FkInfo {
  fromCol: string;
  toTable: string;
  toCol: string;
}

interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  fks: FkInfo[];
}

function extractSchema(db: Database): TableSchema[] {
  const tableNames: string[] = db
    .exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
    .at(0)
    ?.values.map((r) => r[0] as string) ?? [];

  // Collect all referenced columns across the whole schema first
  const referencedCols = new Map<string, Set<string>>(); // tableName → Set<colName>
  for (const name of tableNames) {
    try {
      const fkRows = db.exec(`PRAGMA foreign_key_list("${name}");`).at(0)?.values ?? [];
      for (const row of fkRows) {
        const toTable = row[2] as string;
        const toCol = row[4] as string;
        if (!referencedCols.has(toTable)) referencedCols.set(toTable, new Set());
        referencedCols.get(toTable)!.add(toCol);
      }
    } catch { /* ignore tables with parse errors */ }
  }

  return tableNames.map((name) => {
    const colRows = db.exec(`PRAGMA table_info("${name}");`).at(0)?.values ?? [];
    let fkRows: unknown[][] = [];
    try {
      fkRows = db.exec(`PRAGMA foreign_key_list("${name}");`).at(0)?.values ?? [];
    } catch { /* ignore */ }

    const fkColNames = new Set(fkRows.map((r) => r[3] as string));

    const fks: FkInfo[] = fkRows.map((r) => ({
      fromCol: r[3] as string,
      toTable: r[2] as string,
      toCol: r[4] as string,
    }));

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

function nodeHeight(colCount: number) {
  return HEADER_HEIGHT + colCount * ROW_HEIGHT + PADDING_BOTTOM;
}

function applyLayout(nodes: Node[], edges: Edge[], schema: TableSchema[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 100, edgesep: 30 });

  const heightMap = new Map(schema.map((t) => [t.name, nodeHeight(t.columns.length)]));

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: heightMap.get(node.id) ?? 120 });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const h = heightMap.get(node.id) ?? 120;
    return { ...node, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - h / 2 } };
  });
}

// ── build React Flow graph ────────────────────────────────────────────────────

function buildGraph(schema: TableSchema[], rowCounts: Record<string, number>) {
  const nodes: Node<TableNodeData>[] = schema.map((table) => ({
    id: table.name,
    type: "tableNode",
    position: { x: 0, y: 0 }, // overwritten by Dagre
    data: {
      label: table.name,
      columns: table.columns,
      rowCount: rowCounts[table.name],
    },
  }));

  const edges: Edge[] = [];
  for (const table of schema) {
    for (const fk of table.fks) {
      // Skip self-referential FKs for now (avoid loops)
      if (fk.toTable === table.name) continue;
      // Only create edge if target table is in our schema
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
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#10b981",
          width: 14,
          height: 14,
        },
      });
    }
  }

  const laidOutNodes = applyLayout(nodes, edges, schema);
  return { nodes: laidOutNodes, edges };
}

// ── component ─────────────────────────────────────────────────────────────────

const nodeTypes = { tableNode: ErdTableNode };

interface Props {
  db: Database | null;
  rowCounts: Record<string, number>;
}

export function ErdDiagram({ db, rowCounts }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark" || (theme === "auto" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [tableCount, setTableCount] = useState(0);
  const [fkCount, setFkCount] = useState(0);

  useEffect(() => {
    if (!db) return;
    const schema = extractSchema(db);
    const { nodes: n, edges: e } = buildGraph(schema, rowCounts);
    setNodes(n);
    setEdges(e);
    setTableCount(schema.length);
    setFkCount(e.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, rowCounts]);

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  const onInit = useCallback((instance: { fitView: () => void }) => {
    setTimeout(() => instance.fitView(), 50);
  }, []);

  if (!db) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400 dark:text-zinc-600 text-sm">
        Loading database…
      </div>
    );
  }

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
        minZoom={0.2}
        maxZoom={2}
        proOptions={proOptions}
        onInit={onInit as never}
        colorMode={isDark ? "dark" : "light"}
        edgesFocusable={false}
        nodesDraggable
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={isDark ? "#3f3f46" : "#d4d4d8"}
        />
        <Controls
          className="[&>button]:border-zinc-200 dark:[&>button]:border-zinc-700 [&>button]:bg-white dark:[&>button]:bg-zinc-900"
          showInteractive={false}
        />
        <MiniMap
          nodeColor={() => "#10b981"}
          maskColor={isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.5)"}
          className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden"
        />

        {/* Info panel */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-md px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-700 shadow-sm select-none">
          <span>{tableCount} table{tableCount !== 1 ? "s" : ""}</span>
          {fkCount > 0 && (
            <>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span>{fkCount} relationship{fkCount !== 1 ? "s" : ""}</span>
            </>
          )}
          {fkCount === 0 && tableCount > 0 && (
            <>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span className="text-zinc-400 dark:text-zinc-500 italic">no FK constraints defined</span>
            </>
          )}
        </div>
      </ReactFlow>
    </div>
  );
}
