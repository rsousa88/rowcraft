# Rowcraft

A web-based SQLite viewer and editor. Upload `.db` files, browse tables, run SQL queries, edit data inline, and export results — from any machine.

**Live app:** [rowcraft-jet.vercel.app](https://rowcraft-jet.vercel.app)

---

## Features

### Browsing & querying
- Upload SQLite `.db` files (stored securely in the cloud, per account)
- Sidebar with expandable table list and per-column checkboxes — selecting/deselecting columns rewrites the `SELECT` in the editor
- Group tables into collapsible folders for organisation — drag-and-drop to move tables between groups
- Row count badges per table; total record count shown in results even when results are limited
- SQL editor (CodeMirror 6) with syntax highlighting, SQL autocomplete (table and column names), and line wrapping
- **Run** (Ctrl/Cmd+Enter) or **Run Selected** — runs the highlighted selection if present, otherwise the full query
- `--` comment support; Ctrl+K+C / Ctrl+K+U to comment/uncomment (VS Code style)
- Query history (last 50 per database, with timestamps)
- Save and reload named queries per database

### Results grid
- Filter rows client-side with the quick filter bar
- Sort by any column (click header); multi-column sort with Shift+click
- Freeze 0–3 columns so they stay visible during horizontal scroll
- Pagination with configurable page size (25 / 50 / 100 / 500)
- Export to CSV (UTF-8 BOM for Excel compatibility), named after the active table

### Editing data
- Inline row editing — click the pencil icon on any row (only available when browsing a specific table)
- Delete rows with a single click (with confirmation)
- Create new rows via the "+ New row" button
- Explicit NULL vs. empty string control per field (∅ toggle)
- Changes are in-memory (sql.js runs client-side); click **Save** to write back to cloud storage

### Connectors
- Open datasets from another local or desktop app without uploading that app's data to Rowcraft cloud storage
- Connect through a browser-to-localhost bridge owned by the source app
- Browse, filter, sort, page, and edit connector datasets in Rowcraft
- Stage create/update/delete changes back to the source app; the source app remains the system of record
- Keep connector mode separate from Rowcraft's cloud `.db` upload/save flow

### Schema management
- Add, rename, and drop columns via the ⚙ schema editor in the sidebar
- Rename tables
- Import a CSV file to create a new table from it
- Download the current database as a `.db` file

### Interface
- Light / dark / system theme (persisted)
- Resizable SQL editor pane (drag the handle between editor and results)
- Keyboard shortcut overlay (press `?`)

---

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Auth | Clerk |
| File storage | Supabase Storage |
| SQL engine | sql.js (SQLite WASM, runs entirely client-side) |
| SQL editor | CodeMirror 6 via @uiw/react-codemirror |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel |

---

## Getting started

Sign up for a free account at [rowcraft-jet.vercel.app](https://rowcraft-jet.vercel.app) — no installation required.

---

## Connectors

Connectors let another app open one of its datasets in Rowcraft as an editable grid while keeping that app in control of the data. Rowcraft is intentionally passive in this flow: it defines the connector protocol, calls the source app's localhost bridge from browser-side code, and stages edits back through that bridge. Rowcraft does not know about specific apps and does not upload connector datasets to Supabase.

Source apps launch Rowcraft with:

```text
/connectors/connect?bridge={encodedBridgeBaseUrl}&token={oneTimeToken}&dataset={encodedDatasetName}
```

Example:

```text
https://rowcraft-jet.vercel.app/connectors/connect?bridge=http%3A%2F%2F127.0.0.1%3A49152%2Frowcraft%2F&token=abc&dataset=accounts
```

The source app must expose a localhost bridge under `/rowcraft/`, with API routes under:

```text
{bridge}/api/v1/...
```

Rowcraft accepts only loopback HTTP bridge URLs:

- `http://127.0.0.1:{port}/rowcraft/`
- `http://localhost:{port}/rowcraft/`
- `http://[::1]:{port}/rowcraft/`

The connector bridge must provide:

- `GET /api/v1/health`
- `POST /api/v1/session/exchange`
- `GET /api/v1/context`
- `GET /api/v1/datasets`
- `GET /api/v1/datasets/{datasetName}/columns`
- `GET /api/v1/datasets/{datasetName}/records?offset=0&limit=500`
- `POST /api/v1/datasets/{datasetName}/edit-session`
- `GET /api/v1/datasets/{datasetName}/edit-session/{editSessionId}/changes`
- `POST /api/v1/datasets/{datasetName}/edit-session/{editSessionId}/records`
- `PATCH /api/v1/datasets/{datasetName}/edit-session/{editSessionId}/records/{rowId}`
- `DELETE /api/v1/datasets/{datasetName}/edit-session/{editSessionId}/records/{rowId}`
- `POST /api/v1/datasets/{datasetName}/edit-session/{editSessionId}/discard`

Connector edits are staged. The source app decides when and how to apply staged changes to its own data store. For the full request/response contract, see [docs/connector-bridge-protocol.md](docs/connector-bridge-protocol.md).

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd+Enter | Run query (or selection if text is selected) |
| Ctrl/Cmd+Space | Trigger autocomplete |
| Ctrl+K, Ctrl+C | Comment selection |
| Ctrl+K, Ctrl+U | Uncomment selection |
| ? | Show all keyboard shortcuts |
