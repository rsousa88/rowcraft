export type ConnectorCapabilities = {
  readDatasets?: boolean;
  queryRows?: boolean;
  stageCreates?: boolean;
  stageUpdates?: boolean;
  stageDeletes?: boolean;
  applyStagedChanges?: boolean;
  executeSqlReadOnly?: boolean;
};

export type ConnectorSessionExchange = {
  sessionId: string;
  mode: string;
  apiVersion: string;
  capabilities: ConnectorCapabilities;
};

export type ConnectorContext = {
  name: string;
  fileName?: string;
  schemaVersion?: string;
  capabilities?: ConnectorCapabilities;
};

export type ConnectorDataset = {
  name: string;
  label?: string;
  source?: string;
  rowCount: number;
  updatedOn?: string;
  sortOrder?: number;
  columnCount?: number;
};

export type ConnectorColumn = {
  name: string;
  label?: string;
  type?: string;
  sqliteType?: string;
  relatedDataset?: string | null;
  isMultiSelect?: boolean;
};

export type ConnectorRecordValue = string | number | boolean | null;
export type ConnectorRecord = Record<string, ConnectorRecordValue>;

export type ConnectorRecordsResponse = {
  offset: number;
  limit: number;
  rows: ConnectorRecord[];
  total?: number;
};

export type ConnectorEditSessionResponse = {
  session: {
    id: string;
    datasetName: string;
    status: string;
  };
  summary: ConnectorChangeSummary;
};

export type ConnectorChangeSummary = {
  sessionId: string;
  datasetName: string;
  status: string;
  creates: number;
  updates: number;
  deletes: number;
  total: number;
};

export type ConnectorPendingChange = {
  id: string;
  sessionId: string;
  datasetName: string;
  operation: "create" | "update" | "delete";
  rowId: number | null;
  clientRowId?: string;
  after?: Record<string, ConnectorRecordValue>;
  changedColumns?: string[];
  stagedOn?: string;
};

export type ConnectorBridgeSession = {
  bridgeBaseUrl: string;
  sessionId: string;
  datasetName: string;
  editSessionId: string;
  capabilities: ConnectorCapabilities;
};

const INTERNAL_COLUMNS = new Set(["_row_id", "_source_id", "_is_new"]);

export function isInternalConnectorColumn(column: string) {
  return INTERNAL_COLUMNS.has(column);
}

export function validateConnectorBridgeUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "The connector bridge URL is invalid." };
  }

  if (url.protocol !== "http:") {
    return { ok: false, error: "The connector bridge must use http." };
  }

  if (url.username || url.password) {
    return { ok: false, error: "The connector bridge URL must not include credentials." };
  }

  const allowedHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (!allowedHosts.has(url.hostname)) {
    return { ok: false, error: "The connector bridge URL must point to localhost." };
  }

  if (!url.pathname.startsWith("/rowcraft/")) {
    return { ok: false, error: "The connector bridge URL must be under /rowcraft/." };
  }

  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  url.search = "";
  url.hash = "";

  return { ok: true, url: url.toString() };
}

export function connectorApiUrl(bridgeBaseUrl: string, path: string) {
  return new URL(`api/v1/${path.replace(/^\/+/, "")}`, bridgeBaseUrl).toString();
}

export async function connectorFetch<T>(
  bridgeBaseUrl: string,
  path: string,
  options: RequestInit & { sessionId?: string } = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.sessionId) headers.set("Authorization", `Bearer ${options.sessionId}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(connectorApiUrl(bridgeBaseUrl, path), {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `Connector bridge request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      try {
        const text = await res.text();
        if (text) message = text;
      } catch {
        /* keep default message */
      }
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function coerceConnectorValue(column: ConnectorColumn, value: string | null): ConnectorRecordValue {
  if (value === null) return null;

  const sqliteType = (column.sqliteType ?? column.type ?? "").toUpperCase();
  const trimmed = value.trim();

  if (sqliteType.includes("INT")) {
    if (!/^-?\d+$/.test(trimmed)) throw new Error(`${column.name} must be an integer.`);
    return Number(trimmed);
  }

  if (
    sqliteType.includes("REAL") ||
    sqliteType.includes("FLOA") ||
    sqliteType.includes("DOUB") ||
    sqliteType.includes("DEC") ||
    sqliteType.includes("NUM")
  ) {
    if (trimmed === "" || Number.isNaN(Number(trimmed))) {
      throw new Error(`${column.name} must be a number.`);
    }
    return Number(trimmed);
  }

  if (sqliteType.includes("BOOL")) {
    const lower = trimmed.toLowerCase();
    if (["true", "1", "yes"].includes(lower)) return true;
    if (["false", "0", "no"].includes(lower)) return false;
    throw new Error(`${column.name} must be true or false.`);
  }

  return value;
}

export function changedConnectorValues(
  columns: ConnectorColumn[],
  before: ConnectorRecord | undefined,
  next: Record<string, string | null>
) {
  const changed: Record<string, ConnectorRecordValue> = {};

  for (const column of columns) {
    const name = column.name;
    if (!(name in next) || isInternalConnectorColumn(name)) continue;
    const coerced = coerceConnectorValue(column, next[name]);
    if (!before || before[name] !== coerced) changed[name] = coerced;
  }

  return changed;
}
