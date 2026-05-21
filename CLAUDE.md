# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Rowcraft

Rowcraft is a web-based SQLite viewer and editor. Users upload `.db` files, browse tables, run SQL queries (SELECT, INSERT, UPDATE, DELETE), select columns via checkboxes, save named queries, and export results to CSV. It is hosted on Vercel with user authentication so databases are accessible from any machine without moving files.

## Origin

A fully working self-contained HTML prototype exists at:
`/Users/rsousa/Library/CloudStorage/SynologyDrive-Job/CoWork/oecd/data-v3/peers_viewer.html`

That prototype (built with sql.js + CodeMirror 5, no framework) is the functional reference for all features. The goal of this repo is to refactor it into a proper hosted web application.

The build script for the prototype is `build_viewer.py` in the same directory.

## Planned Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js (App Router) | Vercel-native |
| Auth | Clerk or NextAuth.js | TBD |
| Database storage | Vercel Blob or Supabase Storage | User-uploaded `.db` files |
| SQL engine | sql.js (SQLite WASM) | Same as prototype — runs client-side |
| SQL editor | CodeMirror 6 | Upgrade from CM5 used in prototype |
| Styling | Tailwind CSS | |
| Deployment | Vercel | |

## Core Features (from prototype)

- Upload and open SQLite `.db` files
- Sidebar: expandable table list with per-column checkboxes (all selected by default); selecting/deselecting columns rewrites the SELECT in the editor
- SQL editor (CodeMirror) with syntax highlighting, SQL intellisense (table + column names), `--` comment support
- Run / Run Selected (Ctrl+Enter smart: runs selection if present, else all)
- Results grid with null highlighting and column tooltips
- Save named queries (persisted); load from dropdown; delete with confirmation
- Export results to CSV (UTF-8 BOM for Excel compatibility)
- Save / Save As / Download for the open database file
- Recent files list on landing page

## Auth & Multi-tenancy

- Each user has their own isolated set of uploaded databases
- Databases stored in cloud object storage keyed by user ID
- Landing page shows the user's database list (not a local file picker)
- Offline/local mode (no auth) should remain possible for self-hosted use

## Key Conventions

- All user-facing copy in British English
- No references to OECD, PEERS, or any client project anywhere in the codebase
- The sql.js engine runs entirely client-side — no SQL is processed server-side
- Column names in the SQLite schema use the original names as-is (dots replaced with `__` in JS identifiers)
