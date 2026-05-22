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

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd+Enter | Run query (or selection if text is selected) |
| Ctrl/Cmd+Space | Trigger autocomplete |
| Ctrl+K, Ctrl+C | Comment selection |
| Ctrl+K, Ctrl+U | Uncomment selection |
| ? | Show all keyboard shortcuts |
