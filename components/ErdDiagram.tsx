"use client";

import "@xyflow/react/dist/style.css";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, MarkerType, Panel,
  useNodesState, useEdgesState,
  BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Handle, Position,
  type Node, type Edge, type EdgeProps, type Connection, BackgroundVariant,
} from "@xyflow/react";
import type { Database } from "sql.js";
import {
  ErdTableNode, NODE_WIDTH, collapsedHeight,
  COLS_PER_ROW, H_GAP, V_GAP, GRP_PAD_X, GRP_PAD_TOP, GRP_PAD_BOTTOM,
  groupHeightForChildren,
  type TableNodeData, type ColumnInfo,
} from "@/components/ErdTableNode";
import { useTheme } from "@/components/ThemeProvider";

// ── group colours ─────────────────────────────────────────────────────────────

const GROUP_PALETTES = [
  { bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.35)",  label: "#059669" },
  { bg: "rgba(59,130,246,0.08)",  border: "rgba(59,130,246,0.35)",  label: "#2563eb" },
  { bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.35)",  label: "#7c3aed" },
  { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.35)",  label: "#d97706" },
  { bg: "rgba(236,72,153,0.08)", border: "rgba(236,72,153,0.35)",  label: "#db2777" },
  { bg: "rgba(6,182,212,0.08)",  border: "rgba(6,182,212,0.35)",   label: "#0891b2" },
];

// ── group background node ─────────────────────────────────────────────────────

interface GroupNodeData { label: string; palette: typeof GROUP_PALETTES[number]; isDesignMode?: boolean; [key: string]: unknown }

function GroupBackgroundNode({ data }: { data: GroupNodeData }) {
  const { palette } = data;
  return (
    <div className="w-full h-full relative">
      {/* Visual background — pointer-events-none so child table nodes receive all events */}
      <div className="absolute inset-0 rounded-2xl border-2 pointer-events-none" style={{ background: palette.bg, borderColor: palette.border }}>
        <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider select-none" style={{ color: palette.label }}>
          {data.label}
        </div>
      </div>
      {/* Sequence Designer handles — always in DOM for edge routing; visible only in design mode */}
      <Handle
        type="target" position={Position.Left} id="grp-seq-tgt"
        isConnectable={!!data.isDesignMode}
        style={{
          top: "50%", left: data.isDesignMode ? -8 : "50%",
          width: data.isDesignMode ? 16 : 4, height: data.isDesignMode ? 16 : 4,
          background: data.isDesignMode ? "#3b82f6" : "transparent",
          border: data.isDesignMode ? "2.5px solid white" : "none",
          borderRadius: "50%", cursor: data.isDesignMode ? "crosshair" : "default",
          opacity: data.isDesignMode ? 1 : 0, pointerEvents: data.isDesignMode ? "all" : "none",
          zIndex: 10, transform: "translateY(-50%)",
        }}
      />
      <Handle
        type="source" position={Position.Right} id="grp-seq-src"
        isConnectable={!!data.isDesignMode}
        style={{
          top: "50%", right: data.isDesignMode ? -8 : "50%",
          width: data.isDesignMode ? 16 : 4, height: data.isDesignMode ? 16 : 4,
          background: data.isDesignMode ? "#3b82f6" : "transparent",
          border: data.isDesignMode ? "2.5px solid white" : "none",
          borderRadius: "50%", cursor: data.isDesignMode ? "crosshair" : "default",
          opacity: data.isDesignMode ? 1 : 0, pointerEvents: data.isDesignMode ? "all" : "none",
          zIndex: 10, transform: "translateY(-50%)",
        }}
      />
    </div>
  );
}

// ── dependency edge ───────────────────────────────────────────────────────────

function DependencyEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd as string} style={style as React.CSSProperties} />
      {data?.isDesignMode && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan absolute" style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all" }}>
            <button onClick={() => (data.onDelete as (id: string) => void)?.(id)}
              className="w-5 h-5 rounded-full bg-white dark:bg-zinc-900 border border-red-300 dark:border-red-700 text-red-500 text-[10px] flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors shadow-sm"
              title="Remove dependency">✕</button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// ── types ─────────────────────────────────────────────────────────────────────

interface FkInfo { fromCol: string; toTable: string; toCol: string }
interface TableSchema { name: string; columns: ColumnInfo[]; fks: FkInfo[] }
interface GroupDef { id: string; name: string; tables: string[] }
interface DepEdge { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }
interface LayoutData { positions?: Record<string, { x: number; y: number }>; display?: { groups: boolean; tables: boolean } }

// ── schema extraction ─────────────────────────────────────────────────────────

function extractSchema(db: Database): TableSchema[] {
  const tableNames: string[] =
    db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
      .at(0)?.values.map((r) => r[0] as string) ?? [];

  const referencedCols = new Map<string, Set<string>>();
  for (const name of tableNames) {
    try {
      for (const row of db.exec(`PRAGMA foreign_key_list("${name}");`).at(0)?.values ?? []) {
        const toTable = row[2] as string; const toCol = row[4] as string;
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
      name: row[1] as string, type: row[2] as string ?? "",
      isPk: (row[5] as number) > 0, isNotNull: (row[3] as number) === 1,
      isFkSource: fkColNames.has(row[1] as string),
      isReferenced: referencedCols.get(name)?.has(row[1] as string) ?? false,
    }));
    return { name, columns, fks };
  });
}

// ── grid layout ───────────────────────────────────────────────────────────────

const GRP_MARGIN = 60;

function gridLayout(schema: TableSchema[], groups: GroupDef[], isDesignMode: boolean, rowCounts: Record<string, number>): { nodes: Node[]; groupNodes: Node[] } {
  const tableH = collapsedHeight();
  const tableIds = new Set(schema.map(t => t.name));
  const allNodes: Node[] = [];
  const groupNodes: Node[] = [];
  let cursorY = 0;

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const members = group.tables.filter(t => tableIds.has(t));
    if (members.length === 0) continue;

    const palette = GROUP_PALETTES[gi % GROUP_PALETTES.length];
    const numCols = Math.min(members.length, COLS_PER_ROW);
    const innerW = numCols * NODE_WIDTH + (numCols - 1) * H_GAP;
    const groupW = innerW + GRP_PAD_X * 2;
    // Initial height uses collapsed table size; resizes dynamically when children expand
    const children = members.map(() => ({ collapsed: true, colCount: 0 }));
    const groupH = groupHeightForChildren(children);
    const groupId = `__group__${group.id}`;

    groupNodes.push({
      id: groupId, type: "groupNode",
      position: { x: 0, y: cursorY },
      style: { width: groupW, height: groupH, zIndex: -1 },
      draggable: true, selectable: false,
      data: { label: group.name, palette, isDesignMode },
    });

    members.forEach((tableName, idx) => {
      const col = idx % COLS_PER_ROW;
      const row = Math.floor(idx / COLS_PER_ROW);
      const tbl = schema.find(t => t.name === tableName)!;
      allNodes.push({
        id: tableName, type: "tableNode",
        parentId: groupId, extent: "parent" as const,
        position: { x: GRP_PAD_X + col * (NODE_WIDTH + H_GAP), y: GRP_PAD_TOP + row * (tableH + V_GAP) },
        zIndex: 1,
        data: { label: tableName, columns: tbl.columns, rowCount: rowCounts[tableName], collapsed: true, isDesignMode, parentGroupId: groupId },
      });
    });

    cursorY += groupH + GRP_MARGIN;
  }

  // Ungrouped tables
  const assignedTables = new Set(groups.flatMap(g => g.tables));
  const ungrouped = schema.filter(t => !assignedTables.has(t.name));
  ungrouped.forEach((tbl, idx) => {
    const col = idx % COLS_PER_ROW;
    const row = Math.floor(idx / COLS_PER_ROW);
    allNodes.push({
      id: tbl.name, type: "tableNode",
      position: { x: col * (NODE_WIDTH + H_GAP), y: cursorY + row * (tableH + V_GAP) },
      zIndex: 1,
      data: { label: tbl.name, columns: tbl.columns, rowCount: rowCounts[tbl.name], collapsed: true, isDesignMode },
    });
  });

  return { nodes: allNodes, groupNodes };
}

// ── edge helpers ──────────────────────────────────────────────────────────────

function buildFkEdges(schema: TableSchema[]): Edge[] {
  const edges: Edge[] = [];
  for (const table of schema) {
    for (const fk of table.fks) {
      if (fk.toTable === table.name || !schema.find(t => t.name === fk.toTable)) continue;
      edges.push({
        id: `fk-${table.name}-${fk.fromCol}->${fk.toTable}-${fk.toCol}`,
        source: table.name, sourceHandle: `src-${fk.fromCol}`,
        target: fk.toTable, targetHandle: `tgt-${fk.toCol}`,
        type: "smoothstep", animated: false,
        style: { stroke: "#10b981", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981", width: 14, height: 14 },
        zIndex: 2,
      });
    }
  }
  return edges;
}

function depToEdge(dep: DepEdge, isDesignMode: boolean, onDelete?: (id: string) => void): Edge {
  return {
    id: dep.id,
    source: dep.source, sourceHandle: dep.sourceHandle ?? "seq-src",
    target: dep.target, targetHandle: dep.targetHandle ?? "seq-tgt",
    type: "dependencyEdge", animated: true,
    style: { stroke: "#3b82f6", strokeWidth: 2, strokeDasharray: "8 4" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6", width: 14, height: 14 },
    data: { isDesignMode, onDelete },
    zIndex: 3,
  };
}

// ── component ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: Record<string, any> = { tableNode: ErdTableNode, groupNode: GroupBackgroundNode };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edgeTypes: Record<string, any> = { dependencyEdge: DependencyEdge };

interface Props { db: Database | null; dbName: string; rowCounts: Record<string, number> }

export function ErdDiagram({ db, dbName, rowCounts }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark" || (theme === "auto" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [tableCount, setTableCount] = useState(0);
  const [fkCount, setFkCount] = useState(0);
  const [groups, setGroups] = useState<GroupDef[]>([]);
  const [isDesignMode, setIsDesignMode] = useState(false);
  const [storedDeps, setStoredDeps] = useState<DepEdge[]>([]);
  const [showGroups, setShowGroups] = useState(true);
  const [showTables, setShowTables] = useState(true);

  const savePendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveLayoutPendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storedDepsRef = useRef<DepEdge[]>([]);
  const schemaRef = useRef<TableSchema[]>([]);
  const isDesignModeRef = useRef(false);
  const savedLayoutRef = useRef<LayoutData | null>(null);
  const showGroupsRef = useRef(true);
  const showTablesRef = useRef(true);

  useEffect(() => { storedDepsRef.current = storedDeps; }, [storedDeps]);
  useEffect(() => { isDesignModeRef.current = isDesignMode; }, [isDesignMode]);
  useEffect(() => { showGroupsRef.current = showGroups; }, [showGroups]);
  useEffect(() => { showTablesRef.current = showTables; }, [showTables]);

  // ── persistence helpers ──────────────────────────────────────────────────────

  function putLayout(data: LayoutData) {
    fetch(`/api/databases/${encodeURIComponent(dbName)}/layout`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {});
  }

  function saveLayout(positions: Record<string, { x: number; y: number }>) {
    const payload: LayoutData = {
      positions,
      display: { groups: showGroupsRef.current, tables: showTablesRef.current },
    };
    savedLayoutRef.current = payload;
    if (saveLayoutPendingRef.current) clearTimeout(saveLayoutPendingRef.current);
    saveLayoutPendingRef.current = setTimeout(() => putLayout(payload), 800);
  }

  function saveDisplayPrefs(grps: boolean, tbls: boolean) {
    const current = savedLayoutRef.current ?? {};
    const payload: LayoutData = { ...current, display: { groups: grps, tables: tbls } };
    savedLayoutRef.current = payload;
    putLayout(payload);
  }

  function saveDeps(deps: DepEdge[]) {
    if (savePendingRef.current) clearTimeout(savePendingRef.current);
    savePendingRef.current = setTimeout(() => {
      fetch(`/api/databases/${encodeURIComponent(dbName)}/deps`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deps),
      }).catch(() => {});
    }, 600);
  }

  // ── load everything on dbName change ─────────────────────────────────────────

  useEffect(() => {
    if (!dbName) return;
    savedLayoutRef.current = null;
    const enc = encodeURIComponent(dbName);
    Promise.all([
      fetch(`/api/databases/${enc}/groups`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/databases/${enc}/deps`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/databases/${enc}/layout`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([g, d, l]) => {
      const layout = l as LayoutData;
      setGroups(Array.isArray(g) ? g : []);
      setStoredDeps(Array.isArray(d) ? d : []);
      savedLayoutRef.current = layout;
      // Restore display prefs
      if (layout?.display) {
        setShowGroups(layout.display.groups ?? true);
        setShowTables(layout.display.tables ?? true);
        showGroupsRef.current = layout.display.groups ?? true;
        showTablesRef.current = layout.display.tables ?? true;
      }
    });
  }, [dbName]);

  // ── apply saved positions helper ──────────────────────────────────────────────

  function applyPositions(nodes: Node[]): Node[] {
    const saved = savedLayoutRef.current?.positions;
    if (!saved) return nodes;
    return nodes.map(n => { const p = saved[n.id]; return p ? { ...n, position: p } : n; });
  }

  // ── rebuild layout (no storedDeps dependency — prevents rerender on dep add) ──

  useEffect(() => {
    if (!db) return;
    const schema = extractSchema(db);
    schemaRef.current = schema;
    const fkEdges = buildFkEdges(schema);
    const depEdges = storedDepsRef.current
      .filter(d => schema.find(t => t.name === d.source) || groups.find(g => `__group__${g.id}` === d.source))
      .filter(d => schema.find(t => t.name === d.target) || groups.find(g => `__group__${g.id}` === d.target))
      .map(d => depToEdge(d, isDesignModeRef.current, handleDepDelete));

    const { nodes: tableNodes, groupNodes } = gridLayout(schema, groups, isDesignModeRef.current, rowCounts);
    setNodes(applyPositions([...groupNodes, ...tableNodes]));
    setEdges([...fkEdges, ...depEdges]);
    setTableCount(schema.length);
    setFkCount(fkEdges.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, rowCounts, groups]);

  // ── dep-only sync (no node rebuild) ──────────────────────────────────────────

  useEffect(() => {
    if (schemaRef.current.length === 0) return;
    const depEdges = storedDeps
      .filter(d => {
        const schema = schemaRef.current;
        const srcOk = schema.find(t => t.name === d.source) || groups.find(g => `__group__${g.id}` === d.source);
        const tgtOk = schema.find(t => t.name === d.target) || groups.find(g => `__group__${g.id}` === d.target);
        return srcOk && tgtOk;
      })
      .map(d => depToEdge(d, isDesignModeRef.current, handleDepDelete));
    setEdges(prev => {
      const fk = prev.filter(e => e.type !== "dependencyEdge");
      const prevIds = prev.filter(e => e.type === "dependencyEdge").map(e => e.id).sort().join(",");
      const newIds = depEdges.map(e => e.id).sort().join(",");
      if (prevIds === newIds) return prev;
      return [...fk, ...depEdges];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedDeps]);

  // ── isDesignMode sync ─────────────────────────────────────────────────────────

  useEffect(() => {
    setNodes(nds => nds.map(n =>
      n.type === "tableNode" || n.type === "groupNode"
        ? { ...n, data: { ...n.data, isDesignMode } }
        : n
    ));
    setEdges(es => es.map(e => e.type === "dependencyEdge" ? { ...e, data: { ...e.data, isDesignMode, onDelete: handleDepDelete } } : e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesignMode]);

  // ── dep deletion callback ────────────────────────────────────────────────────

  const handleDepDelete = useCallback((id: string) => {
    setEdges(es => es.filter(e => e.id !== id));
    setStoredDeps(prev => { const u = prev.filter(d => d.id !== id); saveDeps(u); return u; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbName]);

  // ── connect callback (tables AND groups) ─────────────────────────────────────

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const id = `dep-${connection.source}->${connection.target}`;
    const newDep: DepEdge = {
      id,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
    };
    setEdges(es => {
      if (es.some(e => e.id === id)) return es;
      return [...es, depToEdge(newDep, true, handleDepDelete)];
    });
    setStoredDeps(prev => {
      if (prev.some(d => d.id === id)) return prev;
      const updated = [...prev, newDep];
      saveDeps(updated);
      return updated;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbName, handleDepDelete]);

  // ── position saving ───────────────────────────────────────────────────────────

  const onNodeDragStop = useCallback((_: React.MouseEvent, _node: Node, allNodes: Node[]) => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of allNodes) {
      if (n.type === "tableNode" || n.type === "groupNode") {
        positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
      }
    }
    saveLayout(positions);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbName, showGroups, showTables]);

  // ── display toggles ───────────────────────────────────────────────────────────

  function toggleShowGroups() {
    const next = !showGroups;
    setShowGroups(next);
    showGroupsRef.current = next;
    saveDisplayPrefs(next, showTablesRef.current);
  }

  function toggleShowTables() {
    const next = !showTables;
    setShowTables(next);
    showTablesRef.current = next;
    saveDisplayPrefs(showGroupsRef.current, next);
  }

  // ── computed display nodes/edges (filter without touching real state) ─────────

  const displayNodes = useMemo(() => {
    if (showGroups && showTables) return nodes;

    if (!showGroups) {
      // Flatten table positions to absolute, remove group nodes
      const groupPositions = new Map(
        nodes.filter(n => n.type === "groupNode").map(n => [n.id, n.position as { x: number; y: number }])
      );
      return nodes
        .filter(n => n.type !== "groupNode" && (showTables || n.type !== "tableNode"))
        .map(n => {
          if (n.type === "tableNode" && n.parentId) {
            const gPos = groupPositions.get(n.parentId);
            if (gPos) return { ...n, parentId: undefined, extent: undefined, position: { x: gPos.x + n.position.x, y: gPos.y + n.position.y } };
            return { ...n, parentId: undefined, extent: undefined };
          }
          return n;
        });
    }

    // showGroups=true, showTables=false
    return nodes.filter(n => n.type !== "tableNode");
  }, [nodes, showGroups, showTables]);

  const displayEdges = useMemo(() => {
    const displayIds = new Set(displayNodes.map(n => n.id));
    return edges.filter(e => displayIds.has(e.source) && displayIds.has(e.target));
  }, [edges, displayNodes]);

  function toggleDesignMode() {
    saveDeps(storedDepsRef.current);
    setIsDesignMode(m => !m);
  }

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);
  const onInit = useCallback((inst: { fitView: () => void }) => { setTimeout(() => inst.fitView(), 50); }, []);

  const depCount = storedDeps.length;
  const groupCount = groups.filter(g => g.tables.some(t => nodes.find(n => n.id === t))).length;

  if (!db) return <div className="flex h-full items-center justify-center text-zinc-400 dark:text-zinc-600 text-sm">Loading database…</div>;

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full w-full relative">
      <ReactFlow
        nodes={displayNodes} edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={isDesignMode ? handleConnect : undefined}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        fitView fitViewOptions={{ padding: 0.12 }}
        minZoom={0.1} maxZoom={2}
        proOptions={proOptions}
        onInit={onInit as never}
        colorMode={isDark ? "dark" : "light"}
        edgesFocusable={isDesignMode}
        nodesDraggable={showGroups} // disable drag in flat view to avoid position mismatch
        snapToGrid snapGrid={[10, 10]}
        deleteKeyCode={isDesignMode ? "Delete" : null}
        connectionMode={"loose" as never}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={isDark ? "#3f3f46" : "#d4d4d8"} />
        <Controls className="[&>button]:border-zinc-200 dark:[&>button]:border-zinc-700 [&>button]:bg-white dark:[&>button]:bg-zinc-900" showInteractive={false} />
        <MiniMap nodeColor={n => n.type === "groupNode" ? "transparent" : "#10b981"} maskColor={isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.5)"} className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden" />

        {/* Info — top-left */}
        <Panel position="top-left">
          <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-md px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-700 shadow-sm select-none">
            <span>{tableCount} table{tableCount !== 1 ? "s" : ""}</span>
            {fkCount > 0 && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span className="text-emerald-600 dark:text-emerald-500">{fkCount} FK{fkCount !== 1 ? "s" : ""}</span></>}
            {depCount > 0 && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span className="text-blue-500">{depCount} dep{depCount !== 1 ? "s" : ""}</span></>}
            {groupCount > 0 && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span>{groupCount} group{groupCount !== 1 ? "s" : ""}</span></>}
          </div>
        </Panel>

        {/* Controls — top-right */}
        <Panel position="top-right">
          <div className="flex flex-col items-end gap-2">
            {/* View / Sequence Designer toggle */}
            <div className="flex rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs bg-white dark:bg-zinc-900 shadow-sm">
              <button onClick={() => isDesignMode && toggleDesignMode()}
                className={`px-3 py-1.5 transition-colors ${!isDesignMode ? "bg-zinc-100 dark:bg-zinc-800 font-semibold text-zinc-800 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}>
                View
              </button>
              <button onClick={() => !isDesignMode && toggleDesignMode()}
                className={`px-3 py-1.5 border-l border-zinc-200 dark:border-zinc-700 transition-colors flex items-center gap-1.5 ${isDesignMode ? "bg-blue-50 dark:bg-blue-950/40 font-semibold text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                Sequence Designer
              </button>
            </div>

            {/* Show/hide toggles */}
            <div className="flex gap-1.5">
              <button
                onClick={toggleShowGroups}
                title={showGroups ? "Hide group containers" : "Show group containers"}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs transition-colors ${showGroups ? "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800" : "border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 line-through"}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showGroups ? <><path d="M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><path d="M2 12h20"/></> : <><path d="m2 2 20 20"/><path d="M8.5 5H18a2 2 0 0 1 2 2v9.5"/><path d="M5 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2"/></>}
                </svg>
                Groups
              </button>
              <button
                onClick={toggleShowTables}
                title={showTables ? "Hide tables" : "Show tables"}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs transition-colors ${showTables ? "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800" : "border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 line-through"}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showTables ? <><path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18"/></> : <><path d="m2 2 20 20"/><path d="M9 3H21v12"/><path d="M3 3v18h12"/></>}
                </svg>
                Tables
              </button>
            </div>

            {isDesignMode && (
              <div className="text-[11px] bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-md px-2.5 py-1.5 max-w-[220px] text-center leading-relaxed shadow-sm">
                Drag from a <span className="font-semibold">●</span> handle to another table or group to add a dependency.
                Click <span className="font-semibold">✕</span> on an arrow to remove it.
              </div>
            )}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
