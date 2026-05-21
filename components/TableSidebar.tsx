"use client";

import { useState, useEffect, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SchemaAction {
  type: "addCol" | "renameCol" | "dropCol" | "renameTable";
  table: string;
  column?: string;
  value?: string;
}

interface GroupDef {
  id: string;
  name: string;
  collapsed: boolean;
  tables: string[];
}

interface DragItem {
  type: "table" | "group";
  id: string;           // table name or group id
  fromGroup: string | null; // group id the table came from, null = ungrouped
}

interface Props {
  dbName: string;
  tables: string[];
  columns: Record<string, string[]>;
  selectedCols: Record<string, Set<string>>;
  activeTable: string | null;
  rowCounts: Record<string, number>;
  onTableSelect: (table: string) => void;
  onColToggle: (table: string, col: string, checked: boolean) => void;
  onAllColsToggle: (table: string, checked: boolean) => void;
  onSchemaAction: (action: SchemaAction) => void;
  loading: boolean;
}

// ── Group persistence ─────────────────────────────────────────────────────────

function groupsKey(dbName: string) { return `rc-table-groups-${dbName}`; }

function loadGroups(dbName: string): GroupDef[] {
  try { return JSON.parse(localStorage.getItem(groupsKey(dbName)) ?? "[]"); }
  catch { return []; }
}

function persistGroups(dbName: string, groups: GroupDef[]) {
  localStorage.setItem(groupsKey(dbName), JSON.stringify(groups));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TableSidebar({
  dbName, tables, columns, selectedCols, activeTable, rowCounts,
  onTableSelect, onColToggle, onAllColsToggle, onSchemaAction, loading,
}: Props) {
  // ── existing state ──
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [schemaOpen, setSchemaOpen] = useState<string | null>(null);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState("TEXT");
  const [renamingCol, setRenamingCol] = useState<{ table: string; col: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingTable, setRenamingTable] = useState<string | null>(null);
  const [renameTableValue, setRenameTableValue] = useState("");

  // ── group state ──
  const [groups, setGroups] = useState<GroupDef[]>([]);
  const [ungroupedCollapsed, setUngroupedCollapsed] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameGroupValue, setRenameGroupValue] = useState("");
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null); // group id | "ungrouped" | "group:{id}" (header for reorder)
  const newGroupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setGroups(loadGroups(dbName));
  }, [dbName]);

  function updateGroups(next: GroupDef[]) {
    setGroups(next);
    persistGroups(dbName, next);
  }

  // ── derived ──
  const assignedTables = new Set(groups.flatMap((g) => g.tables));
  const ungroupedTables = tables.filter((t) => !assignedTables.has(t));

  // ── group actions ──
  function createGroup() {
    const name = newGroupName.trim();
    if (!name) { setCreatingGroup(false); return; }
    const group: GroupDef = { id: crypto.randomUUID(), name, collapsed: false, tables: [] };
    updateGroups([...groups, group]);
    setNewGroupName("");
    setCreatingGroup(false);
  }

  function renameGroup(id: string, name: string) {
    if (!name.trim()) return;
    updateGroups(groups.map((g) => g.id === id ? { ...g, name: name.trim() } : g));
    setRenamingGroup(null);
  }

  function deleteGroup(id: string) {
    updateGroups(groups.filter((g) => g.id !== id));
  }

  function toggleGroupCollapse(id: string) {
    updateGroups(groups.map((g) => g.id === id ? { ...g, collapsed: !g.collapsed } : g));
  }

  // ── drag-and-drop ──
  function onTableDragStart(e: React.DragEvent, table: string, fromGroup: string | null) {
    e.dataTransfer.effectAllowed = "move";
    setDragItem({ type: "table", id: table, fromGroup });
  }

  function onGroupDragStart(e: React.DragEvent, groupId: string) {
    e.dataTransfer.effectAllowed = "move";
    setDragItem({ type: "group", id: groupId, fromGroup: null });
    e.stopPropagation();
  }

  function onDragOver(e: React.DragEvent, target: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragTarget(target);
  }

  function onDragLeave(e: React.DragEvent) {
    // Only clear if leaving the actual target (not a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragTarget(null);
    }
  }

  function onDrop(e: React.DragEvent, targetGroupId: string | null) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragItem) { setDragTarget(null); return; }

    if (dragItem.type === "table") {
      // Move table between groups
      const table = dragItem.id;
      const fromGroup = dragItem.fromGroup;
      if (targetGroupId === fromGroup) { setDragItem(null); setDragTarget(null); return; }

      let next = groups.map((g) => ({
        ...g,
        tables: g.tables.filter((t) => t !== table),
      }));
      if (targetGroupId !== null) {
        next = next.map((g) =>
          g.id === targetGroupId ? { ...g, tables: [...g.tables, table] } : g
        );
      }
      updateGroups(next);
    } else if (dragItem.type === "group" && targetGroupId !== null) {
      // Reorder groups: insert dragged group before target group
      const fromIdx = groups.findIndex((g) => g.id === dragItem.id);
      const toIdx = groups.findIndex((g) => g.id === targetGroupId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) { setDragItem(null); setDragTarget(null); return; }
      const next = [...groups];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      updateGroups(next);
    }

    setDragItem(null);
    setDragTarget(null);
  }

  function onDragEnd() {
    setDragItem(null);
    setDragTarget(null);
  }

  // ── table row renderer (preserves all existing functionality) ──
  function renderTableRow(table: string, fromGroup: string | null, indent = false) {
    const isExpanded = expanded.has(table);
    const isSchemaOpen = schemaOpen === table;
    const cols = columns[table] ?? [];
    const sel = selectedCols[table] ?? new Set();
    const allChecked = cols.every((c) => sel.has(c));
    const someChecked = cols.some((c) => sel.has(c));

    return (
      <div key={table}>
        <div className={[
          "flex items-center gap-1 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 group",
          indent ? "pl-2 pr-3" : "px-3",
          table === activeTable ? "bg-zinc-100 dark:bg-zinc-800/60" : "",
        ].join(" ")}>
          {/* Drag handle — only this element is draggable to avoid button conflicts */}
          <span
            draggable
            onDragStart={(e) => { e.stopPropagation(); onTableDragStart(e, table, fromGroup); }}
            onDragEnd={onDragEnd}
            className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-zinc-300 dark:text-zinc-600 shrink-0 select-none text-xs px-0.5"
            title="Drag to move to a group"
          >
            ⠿
          </span>
          <button
            className="mr-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-xs"
            onClick={(e) => { e.stopPropagation(); setExpanded((prev) => { const next = new Set(prev); next.has(table) ? next.delete(table) : next.add(table); return next; }); }}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? "▾" : "▸"}
          </button>
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
            onChange={(e) => onAllColsToggle(table, e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="accent-emerald-500"
          />
          <button
            className="ml-1 flex-1 text-left text-sm truncate text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white"
            onClick={() => { onTableSelect(table); setExpanded(new Set([table])); }}
          >
            {table}
          </button>
          {rowCounts[table] != null && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums shrink-0">
              {rowCounts[table].toLocaleString()}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setSchemaOpen(isSchemaOpen ? null : table); }}
            className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xs px-0.5"
            title="Edit schema"
          >
            ⚙
          </button>
        </div>

        {/* Column checkboxes */}
        {isExpanded && (
          <div className={indent ? "pl-12 pb-1" : "pl-8 pb-1"}>
            {cols.map((col) => (
              <label key={col} className="flex items-center gap-2 py-0.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer">
                <input type="checkbox" checked={sel.has(col)} onChange={(e) => onColToggle(table, col, e.target.checked)} className="accent-emerald-500" />
                <span className="truncate">{col}</span>
              </label>
            ))}
          </div>
        )}

        {/* Schema editor panel */}
        {isSchemaOpen && (
          <div className="mx-2 mb-2 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs">
            <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
              {renamingTable === table ? (
                <div className="flex items-center gap-1">
                  <input autoFocus type="text" value={renameTableValue} onChange={(e) => setRenameTableValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && renameTableValue.trim()) { onSchemaAction({ type: "renameTable", table, value: renameTableValue.trim() }); setRenamingTable(null); setSchemaOpen(null); } if (e.key === "Escape") setRenamingTable(null); }}
                    className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-xs" placeholder="New table name" />
                  <button onClick={() => { if (renameTableValue.trim()) { onSchemaAction({ type: "renameTable", table, value: renameTableValue.trim() }); setRenamingTable(null); setSchemaOpen(null); } }} className="text-emerald-600 font-medium px-1">✓</button>
                  <button onClick={() => setRenamingTable(null)} className="text-zinc-400 px-1">✕</button>
                </div>
              ) : (
                <button onClick={() => { setRenamingTable(table); setRenameTableValue(table); }} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200">Rename table…</button>
              )}
            </div>
            <div className="px-3 py-1 text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Columns</div>
            {cols.map((col) => (
              <div key={col} className="px-3 py-1 flex items-center gap-1 group/col hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                {renamingCol?.table === table && renamingCol.col === col ? (
                  <div className="flex items-center gap-1 w-full">
                    <input autoFocus type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && renameValue.trim()) { onSchemaAction({ type: "renameCol", table, column: col, value: renameValue.trim() }); setRenamingCol(null); } if (e.key === "Escape") setRenamingCol(null); }}
                      className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-xs" />
                    <button onClick={() => { if (renameValue.trim()) { onSchemaAction({ type: "renameCol", table, column: col, value: renameValue.trim() }); setRenamingCol(null); } }} className="text-emerald-600 font-medium">✓</button>
                    <button onClick={() => setRenamingCol(null)} className="text-zinc-400">✕</button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 truncate text-zinc-600 dark:text-zinc-300">{col}</span>
                    <button onClick={() => { setRenamingCol({ table, col }); setRenameValue(col); }} className="opacity-0 group-hover/col:opacity-100 text-zinc-400 hover:text-blue-500 px-0.5" title="Rename column">✎</button>
                    <button onClick={() => { if (confirm(`Drop column "${col}" from "${table}"? This cannot be undone.`)) onSchemaAction({ type: "dropCol", table, column: col }); }} className="opacity-0 group-hover/col:opacity-100 text-zinc-400 hover:text-red-500 px-0.5" title="Drop column">✕</button>
                  </>
                )}
              </div>
            ))}
            <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
              <div className="text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Add column</div>
              <div className="flex gap-1">
                <input type="text" value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="Name" className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-xs" />
                <select value={newColType} onChange={(e) => setNewColType(e.target.value)} className="px-1 py-0.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-xs">
                  {["TEXT", "INTEGER", "REAL", "BLOB", "NUMERIC"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <button onClick={() => { if (!newColName.trim()) return; onSchemaAction({ type: "addCol", table, column: newColName.trim(), value: newColType }); setNewColName(""); }} className="w-full text-center py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-medium">
                Add column
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── drop zone (inline renderer, not a React component, to avoid reconciliation issues) ──
  function renderDropZone(targetId: string | null) {
    if (!dragItem || dragItem.type !== "table") return null;
    const key = targetId ?? "ungrouped";
    const isTarget = dragTarget === key;
    return (
      <div
        className={[
          "mx-2 my-0.5 h-7 rounded border-2 border-dashed flex items-center justify-center text-[10px] transition-all",
          isTarget
            ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
            : "border-zinc-200 dark:border-zinc-700 text-zinc-300 dark:text-zinc-600",
        ].join(" ")}
        onDragOver={(e) => onDragOver(e, key)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, targetId)}
      >
        {isTarget ? "Drop here" : "Drop table here"}
      </div>
    );
  }

  // ── loading state ──
  if (loading) {
    return (
      <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 p-4 text-xs text-zinc-400 dark:text-zinc-500">
        Loading…
      </aside>
    );
  }

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Tables</span>
        <button
          onClick={() => { setCreatingGroup(true); setTimeout(() => newGroupInputRef.current?.focus(), 0); }}
          className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          title="New group"
        >
          + Group
        </button>
      </div>

      {/* New group inline input */}
      {creatingGroup && (
        <div className="px-3 py-1.5 flex items-center gap-1">
          <span className="text-sm">📁</span>
          <input
            ref={newGroupInputRef}
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createGroup(); if (e.key === "Escape") { setCreatingGroup(false); setNewGroupName(""); } }}
            onBlur={createGroup}
            placeholder="Group name…"
            className="flex-1 min-w-0 text-xs px-1.5 py-0.5 rounded border border-emerald-400 dark:border-emerald-600 bg-white dark:bg-zinc-900 focus:outline-none"
          />
        </div>
      )}

      {/* Groups */}
      {groups.map((group) => {
        const isDropTarget = dragTarget === group.id && dragItem?.type === "group"
          ? false // don't highlight group header when reordering (handled separately)
          : dragTarget === group.id;
        const isGroupDragTarget = dragTarget === `group-reorder-${group.id}`;

        return (
          <div
            key={group.id}
            className={[
              "transition-all",
              isGroupDragTarget ? "border-t-2 border-emerald-400" : "",
            ].join(" ")}
            onDragOver={(e) => {
              if (dragItem?.type === "group") {
                e.preventDefault();
                setDragTarget(`group-reorder-${group.id}`);
              }
            }}
            onDrop={(e) => {
              if (dragItem?.type === "group") {
                onDrop(e, group.id);
              }
            }}
          >
            {/* Group header */}
            <div
              className="flex items-center gap-1 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 group/grp cursor-default"
              draggable
              onDragStart={(e) => onGroupDragStart(e, group.id)}
              onDragEnd={onDragEnd}
              onDragOver={(e) => {
                if (dragItem?.type === "table") onDragOver(e, group.id);
              }}
              onDragLeave={onDragLeave}
              onDrop={(e) => {
                if (dragItem?.type === "table") onDrop(e, group.id);
              }}
            >
              {/* Folder icon — click to collapse */}
              <button
                className="shrink-0 text-sm leading-none"
                onClick={() => toggleGroupCollapse(group.id)}
                title={group.collapsed ? "Expand" : "Collapse"}
              >
                {group.collapsed ? "📁" : "📂"}
              </button>

              {/* Group name — double-click to rename */}
              {renamingGroup === group.id ? (
                <input
                  autoFocus
                  type="text"
                  value={renameGroupValue}
                  onChange={(e) => setRenameGroupValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") renameGroup(group.id, renameGroupValue); if (e.key === "Escape") setRenamingGroup(null); }}
                  onBlur={() => renameGroup(group.id, renameGroupValue)}
                  className="flex-1 min-w-0 text-xs px-1 py-0.5 rounded border border-emerald-400 dark:border-emerald-600 bg-white dark:bg-zinc-900 focus:outline-none"
                />
              ) : (
                <span
                  className="flex-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 truncate select-none"
                  onDoubleClick={() => { setRenamingGroup(group.id); setRenameGroupValue(group.name); }}
                  title="Double-click to rename"
                >
                  {group.name}
                </span>
              )}

              <span className="text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums shrink-0">
                {group.tables.length}
              </span>

              {/* Delete group (hover) */}
              <button
                onClick={() => deleteGroup(group.id)}
                className="opacity-0 group-hover/grp:opacity-100 text-zinc-400 hover:text-red-500 text-xs px-0.5 transition-opacity"
                title="Delete group (tables move to Ungrouped)"
              >
                ✕
              </button>
            </div>

            {/* Group tables */}
            {!group.collapsed && (
              <>
                {group.tables
                  .filter((t) => tables.includes(t)) // skip stale table names
                  .map((table) => renderTableRow(table, group.id, true))}
                {renderDropZone(group.id)}
              </>
            )}

            {/* Drop target highlight overlay when dragging table over collapsed group */}
            {group.collapsed && isDropTarget && (
              <div
                className="mx-2 my-0.5 h-5 rounded border-2 border-dashed border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                onDragOver={(e) => onDragOver(e, group.id)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, group.id)}
              />
            )}
          </div>
        );
      })}

      {/* Ungrouped section */}
      {ungroupedTables.length > 0 && (
        <div
          onDragOver={(e) => { if (dragItem?.type === "table") onDragOver(e, "ungrouped"); }}
          onDragLeave={onDragLeave}
          onDrop={(e) => { if (dragItem?.type === "table") onDrop(e, null); }}
        >
          {groups.length > 0 && (
            <div className="flex items-center gap-1 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer" onClick={() => setUngroupedCollapsed((v) => !v)}>
              <span className="text-xs mr-1">{ungroupedCollapsed ? "▸" : "▾"}</span>
              <span className="flex-1 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider select-none">Ungrouped</span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums">{ungroupedTables.length}</span>
            </div>
          )}

          {!ungroupedCollapsed && (
            <>
              {ungroupedTables.map((table) => renderTableRow(table, null, false))}
              {dragItem?.type === "table" && dragItem.fromGroup !== null && renderDropZone(null)}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
