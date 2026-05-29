"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ResultsGrid } from "@/components/ResultsGrid";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import type { QueryResult } from "@/components/DbViewer";
import {
  changedConnectorValues,
  connectorFetch,
  isInternalConnectorColumn,
  validateConnectorBridgeUrl,
  type ConnectorCapabilities,
  type ConnectorChangeSummary,
  type ConnectorColumn,
  type ConnectorContext,
  type ConnectorEditSessionResponse,
  type ConnectorPendingChange,
  type ConnectorRecord,
  type ConnectorRecordsResponse,
  type ConnectorSessionExchange,
  type ConnectorDataset,
} from "@/lib/connectorBridge";

const PAGE_LIMIT = 500;

type LoadState = "idle" | "connecting" | "loading" | "ready" | "error";

type ConnectorConnection = {
  bridgeBaseUrl: string;
  sessionId: string;
  editSessionId: string;
  capabilities: ConnectorCapabilities;
};

type Props = {
  bridgeParam: string;
  tokenParam: string;
  datasetParam: string;
};

function getRowId(row: ConnectorRecord) {
  const raw = row._row_id;
  return typeof raw === "number" ? raw : Number(raw);
}

function rowKey(row: ConnectorRecord) {
  return String(getRowId(row));
}

function formatCount(value: number | undefined) {
  return (value ?? 0).toLocaleString();
}

function makeQueryResult(columns: ConnectorColumn[], rows: ConnectorRecord[]): QueryResult {
  const names = columns.map((column) => column.name);
  return {
    columns: names,
    rows: rows.map((row) => names.map((name) => row[name] ?? null)),
  };
}

export function ConnectorBridgeViewer({ bridgeParam, tokenParam, datasetParam }: Props) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectorConnection | null>(null);
  const [context, setContext] = useState<ConnectorContext | null>(null);
  const [datasets, setDatasets] = useState<ConnectorDataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>(datasetParam);
  const [datasetMismatch, setDatasetMismatch] = useState(false);
  const [columns, setColumns] = useState<ConnectorColumn[]>([]);
  const [baseRows, setBaseRows] = useState<ConnectorRecord[]>([]);
  const [updatedRows, setUpdatedRows] = useState<Record<string, ConnectorRecord>>({});
  const [deletedRows, setDeletedRows] = useState<Set<string>>(new Set());
  const [createdRows, setCreatedRows] = useState<Record<string, ConnectorRecord>>({});
  const [summary, setSummary] = useState<ConnectorChangeSummary | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [expectedCount, setExpectedCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const activeDataset = useMemo(
    () => datasets.find((dataset) => dataset.name === selectedDataset),
    [selectedDataset, datasets]
  );

  const editableColumns = useMemo(
    () => columns.filter((column) => !isInternalConnectorColumn(column.name)),
    [columns]
  );

  const visibleRows = useMemo(() => {
    const base = baseRows
      .filter((row) => !deletedRows.has(rowKey(row)))
      .map((row) => ({ ...row, ...(updatedRows[rowKey(row)] ?? {}) }));

    return [...base, ...Object.entries(createdRows).map(([clientRowId, row]) => ({
      ...row,
      _row_id: clientRowId,
      _source_id: clientRowId,
      _is_new: true,
    }))];
  }, [baseRows, createdRows, deletedRows, updatedRows]);

  const result = useMemo(() => makeQueryResult(editableColumns, visibleRows), [editableColumns, visibleRows]);
  const rowids = useMemo(() => visibleRows.map((row) => row._row_id as number | string), [visibleRows]);

  const refreshSummary = useCallback(async (conn: ConnectorConnection, datasetName: string) => {
    const next = await connectorFetch<ConnectorChangeSummary>(
      conn.bridgeBaseUrl,
      `datasets/${encodeURIComponent(datasetName)}/edit-session/${encodeURIComponent(conn.editSessionId)}/changes`,
      { sessionId: conn.sessionId }
    );
    setSummary(next);
    if (next.total > 0) {
      setNotice("This connector session has pending staged changes. Apply or discard them in the source app, or continue with caution.");
    }
  }, []);

  const loadDatasetData = useCallback(async (conn: ConnectorConnection, dataset: ConnectorDataset) => {
    setLoadState("loading");
    setError(null);
    setNotice(null);
    setColumns([]);
    setBaseRows([]);
    setUpdatedRows({});
    setDeletedRows(new Set());
    setCreatedRows({});
    setLoadedCount(0);
    setExpectedCount(dataset.rowCount ?? 0);

    const [datasetColumns, editSession] = await Promise.all([
      connectorFetch<ConnectorColumn[]>(
        conn.bridgeBaseUrl,
        `datasets/${encodeURIComponent(dataset.name)}/columns`,
        { sessionId: conn.sessionId }
      ),
      connectorFetch<ConnectorEditSessionResponse>(
        conn.bridgeBaseUrl,
        `datasets/${encodeURIComponent(dataset.name)}/edit-session`,
        { method: "POST", sessionId: conn.sessionId }
      ),
    ]);

    const nextConn = { ...conn, editSessionId: editSession.session.id };
    setConnection(nextConn);
    setColumns(datasetColumns.filter((column) => !isInternalConnectorColumn(column.name)));
    setSummary(editSession.summary);
    if (editSession.summary.total > 0) {
      setNotice("This connector session already has staged changes. Rowcraft can show counts, but the bridge does not expose enough detail to rebuild the pending overlay.");
    }

    const allRows: ConnectorRecord[] = [];
    let offset = 0;
    let total = dataset.rowCount ?? 0;

    while (true) {
      const page = await connectorFetch<ConnectorRecordsResponse>(
        nextConn.bridgeBaseUrl,
        `datasets/${encodeURIComponent(dataset.name)}/records?offset=${offset}&limit=${PAGE_LIMIT}`,
        { sessionId: nextConn.sessionId }
      );
      allRows.push(...page.rows);
      total = page.total ?? total;
      setExpectedCount(total);
      setLoadedCount(allRows.length);
      setBaseRows([...allRows]);

      if (page.rows.length < PAGE_LIMIT) break;
      offset += page.rows.length;
      if (total > 0 && allRows.length >= total) break;
    }

    setLoadState("ready");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      setLoadState("connecting");
      setError(null);

      if (!bridgeParam || !tokenParam || !datasetParam) {
        setLoadState("error");
        setError("Missing connector bridge parameters. Open this dataset from the source app again.");
        return;
      }

      const validation = validateConnectorBridgeUrl(bridgeParam);
      if (!validation.ok) {
        setLoadState("error");
        setError(validation.error);
        return;
      }

      try {
        await connectorFetch(validation.url, "health");
        const exchange = await connectorFetch<ConnectorSessionExchange>(validation.url, "session/exchange", {
          method: "POST",
          body: JSON.stringify({ token: tokenParam }),
        });

        const conn: ConnectorConnection = {
          bridgeBaseUrl: validation.url,
          sessionId: exchange.sessionId,
          editSessionId: "",
          capabilities: exchange.capabilities,
        };

        const [contextData, datasetList] = await Promise.all([
          connectorFetch<ConnectorContext>(conn.bridgeBaseUrl, "context", { sessionId: conn.sessionId }),
          connectorFetch<ConnectorDataset[]>(conn.bridgeBaseUrl, "datasets", { sessionId: conn.sessionId }),
        ]);

        if (cancelled) return;

        setConnection(conn);
        setContext(contextData);
        setDatasets(datasetList);

        const launchDataset = datasetList.find((dataset) => dataset.name === datasetParam);
        if (!launchDataset) {
          setDatasetMismatch(true);
          setLoadState("error");
          setError(`Dataset "${datasetParam}" is no longer available from this connector.`);
          return;
        }

        setSelectedDataset(launchDataset.name);
        await loadDatasetData(conn, launchDataset);
      } catch (err) {
        if (cancelled) return;
        setLoadState("error");
        setError(err instanceof Error ? err.message : "Could not connect to the connector bridge. Open this dataset from the source app again.");
      }
    }

    connect();
    return () => {
      cancelled = true;
    };
  }, [bridgeParam, loadDatasetData, datasetParam, tokenParam]);

  async function selectDataset(datasetName: string) {
    const conn = connection;
    const dataset = datasets.find((item) => item.name === datasetName);
    if (!conn || !dataset) return;

    try {
      setSelectedDataset(dataset.name);
      setDatasetMismatch(false);
      await loadDatasetData(conn, dataset);
    } catch (err) {
      setLoadState("error");
      setError(err instanceof Error ? err.message : "Could not load the selected dataset.");
    }
  }

  function getDisplayedRowById(rowid: number | string) {
    return visibleRows.find((row) => String(row._row_id) === String(rowid));
  }

  async function handleEditRow(rowid: number | string, values: Record<string, string | null>) {
    const conn = connection;
    if (!conn) return;

    try {
      setBusy(true);
      if (typeof rowid === "string") {
        setCreatedRows((prev) => ({
          ...prev,
          [rowid]: {
            ...(prev[rowid] ?? {}),
            ...changedConnectorValues(editableColumns, undefined, values),
          },
        }));
        setNotice("This staged create was edited locally. The bridge does not expose update-by-clientRowId for already staged creates.");
        return;
      }

      const displayed = getDisplayedRowById(rowid);
      const body = changedConnectorValues(editableColumns, displayed, values);
      if (Object.keys(body).length === 0) return;

      await connectorFetch<ConnectorPendingChange>(
        conn.bridgeBaseUrl,
        `datasets/${encodeURIComponent(selectedDataset)}/edit-session/${encodeURIComponent(conn.editSessionId)}/records/${encodeURIComponent(String(rowid))}`,
        {
          method: "PATCH",
          sessionId: conn.sessionId,
          body: JSON.stringify(body),
        }
      );

      const nextAfter = changedConnectorValues(editableColumns, undefined, values);
      setUpdatedRows((prev) => ({ ...prev, [String(rowid)]: nextAfter }));
      await refreshSummary(conn, selectedDataset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stage the row update.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteRow(rowid: number | string, msg: string) {
    const conn = connection;
    if (!conn || !confirm(msg)) return;

    try {
      setBusy(true);
      if (typeof rowid === "string") {
        setCreatedRows((prev) => {
          const next = { ...prev };
          delete next[rowid];
          return next;
        });
        setNotice("This staged create was removed locally. The bridge does not expose delete-by-clientRowId for already staged creates.");
        return;
      }

      await connectorFetch<void>(
        conn.bridgeBaseUrl,
        `datasets/${encodeURIComponent(selectedDataset)}/edit-session/${encodeURIComponent(conn.editSessionId)}/records/${encodeURIComponent(String(rowid))}`,
        { method: "DELETE", sessionId: conn.sessionId }
      );

      setDeletedRows((prev) => new Set(prev).add(String(rowid)));
      await refreshSummary(conn, selectedDataset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stage the row delete.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateRow(values: Record<string, string | null>) {
    const conn = connection;
    if (!conn) return;

    try {
      setBusy(true);
      const clientRowId = crypto.randomUUID();
      const body = changedConnectorValues(editableColumns, undefined, values);

      const pending = await connectorFetch<ConnectorPendingChange>(
        conn.bridgeBaseUrl,
        `datasets/${encodeURIComponent(selectedDataset)}/edit-session/${encodeURIComponent(conn.editSessionId)}/records`,
        {
          method: "POST",
          sessionId: conn.sessionId,
          body: JSON.stringify({ clientRowId, ...body }),
        }
      );

      const pendingClientRowId = pending.clientRowId ?? clientRowId;
      setCreatedRows((prev) => ({
        ...prev,
        [pendingClientRowId]: pending.after ?? body,
      }));
      await refreshSummary(conn, selectedDataset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stage the row create.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscard() {
    const conn = connection;
    const dataset = activeDataset;
    if (!conn || !dataset || !summary || summary.total === 0) return;
    if (!confirm("Discard all staged Rowcraft changes for this connector dataset?")) return;

    try {
      setBusy(true);
      await connectorFetch<{ discarded: boolean }>(
        conn.bridgeBaseUrl,
        `datasets/${encodeURIComponent(selectedDataset)}/edit-session/${encodeURIComponent(conn.editSessionId)}/discard`,
        { method: "POST", sessionId: conn.sessionId }
      );
      setNotice(null);
      await loadDatasetData(conn, dataset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not discard staged changes.");
    } finally {
      setBusy(false);
    }
  }

  const progressText = expectedCount > 0
    ? `${formatCount(loadedCount)} / ${formatCount(expectedCount)} rows loaded`
    : `${formatCount(loadedCount)} rows loaded`;

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2">
        <Link href="/" className="hover:opacity-80 transition-opacity shrink-0">
          <Logo size={22} />
        </Link>
        <span className="text-zinc-300 dark:text-zinc-600">/</span>
        <span className="text-sm font-medium truncate text-zinc-600 dark:text-zinc-400 min-w-0">
          Connector {context ? `/ ${context.name}` : ""}
        </span>
        {activeDataset && (
          <span className="rounded border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {activeDataset.name}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <UserButton />
        </div>
      </header>

      <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950 dark:text-amber-100">
        Editing connector dataset. Changes are staged in the source app and are applied outside Rowcraft.
      </div>

      <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 flex flex-wrap items-center gap-3 text-xs">
        <span className="font-medium text-zinc-600 dark:text-zinc-300">
          {loadState === "ready" ? "Connected" : loadState === "error" ? "Connection issue" : "Connecting"}
        </span>
        <span className="text-zinc-400 dark:text-zinc-500">{progressText}</span>
        {summary && (
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
            <span>Pending:</span>
            <span>{summary.creates} create</span>
            <span>{summary.updates} update</span>
            <span>{summary.deletes} delete</span>
          </div>
        )}
        {datasets.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
            Dataset
            <select
              value={selectedDataset}
              onChange={(event) => selectDataset(event.target.value)}
              disabled={busy || loadState === "connecting" || loadState === "loading"}
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
            >
              {datasets.map((dataset) => (
                <option key={dataset.name} value={dataset.name}>
                  {dataset.label ?? dataset.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={handleDiscard}
          disabled={busy || !summary || summary.total === 0}
          className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
        >
          Discard staged changes
        </button>
      </div>

      {(error || notice || datasetMismatch) && (
        <div className={[
          "shrink-0 border-b px-4 py-2 text-xs",
          error ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200" : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
        ].join(" ")}>
          {error ?? notice}
        </div>
      )}

      <main className="flex-1 overflow-hidden">
        {loadState === "connecting" || (loadState === "loading" && baseRows.length === 0) ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400 dark:text-zinc-600">
            {loadState === "connecting" ? "Connecting to connector bridge..." : `Loading dataset records... ${progressText}`}
          </div>
        ) : result.columns.length > 0 ? (
          <ResultsGrid
            result={result}
            activeTable={selectedDataset}
            tableTotal={activeDataset?.rowCount}
            rowids={rowids}
            onEditRow={connection?.capabilities.stageUpdates === false ? undefined : handleEditRow}
            onDeleteRow={connection?.capabilities.stageDeletes === false ? undefined : handleDeleteRow}
            onCreateRow={connection?.capabilities.stageCreates === false ? undefined : handleCreateRow}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400 dark:text-zinc-600">
            {error ? "Connector dataset is not loaded." : "No editable columns found for this connector dataset."}
          </div>
        )}
      </main>
    </div>
  );
}
