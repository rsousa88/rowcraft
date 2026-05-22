"use client";

import { useRef, useEffect } from "react";
import CodeMirror, { EditorView, keymap } from "@uiw/react-codemirror";
import { sql, SQLite, keywordCompletionSource } from "@codemirror/lang-sql";
import { Compartment } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { githubLight } from "@uiw/codemirror-theme-github";
import { autocompletion, startCompletion, type CompletionContext } from "@codemirror/autocomplete";
import { toggleComment } from "@codemirror/commands";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelectionChange: (selected: string) => void;
  tables: string[];
  columns: Record<string, string[]>;
  theme: "light" | "dark";
}

// Always-on completion source for table/column names — fires on any word match
// without relying on SQL syntax-tree context detection (which often misses partial SQL).
// Table names are inserted with double quotes; column names are inserted as-is.
function makeSchemaSource(tables: string[], columns: Record<string, string[]>) {
  return (ctx: CompletionContext) => {
    const word = ctx.matchBefore(/\w+/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;

    // If the user already typed an opening double-quote before the word, only
    // close the quote; otherwise wrap the whole name.
    const charBefore = ctx.state.sliceDoc(Math.max(0, word.from - 1), word.from);
    const alreadyOpened = charBefore === '"';

    const seen = new Set<string>();
    const opts = [
      ...tables.map(t => ({
        label: t,
        apply: alreadyOpened ? `${t}"` : `"${t}"`,
        type: "class" as const,
        detail: "table",
        boost: 2,
      })),
      ...Object.entries(columns).flatMap(([tbl, cols]) =>
        cols.map(c => ({ label: c, type: "property" as const, detail: tbl }))
      ),
    ].filter(o => { if (seen.has(o.label)) return false; seen.add(o.label); return true; });

    return { from: word.from, options: opts, validFor: /^\w*$/ };
  };
}

function buildExtensions(
  tables: string[],
  columns: Record<string, string[]>,
  completionCompartment: Compartment,
  selectionCb: (s: string) => void
) {
  return [
    // SQL language (syntax highlight + keyword completions)
    sql({ dialect: SQLite, upperCaseKeywords: true }),

    // Autocomplete: SQL keywords + always-on schema completions — in a Compartment
    // so it can be swapped when tables/columns load without rebuilding the editor.
    completionCompartment.of(
      autocompletion({
        activateOnTyping: true,
        override: [
          keywordCompletionSource(SQLite, true),
          makeSchemaSource(tables, columns),
        ],
      })
    ),

    EditorView.lineWrapping,
    keymap.of([
      { key: "Ctrl-Space", mac: "Cmd-Space", run: startCompletion },
      { key: "Ctrl-k Ctrl-c", mac: "Cmd-k Cmd-c", run: (v) => { toggleComment(v); return true; } },
      { key: "Ctrl-k Ctrl-u", mac: "Cmd-k Cmd-u", run: (v) => { toggleComment(v); return true; } },
    ]),
    EditorView.updateListener.of((update) => {
      const sel = update.state.sliceDoc(
        update.state.selection.main.from,
        update.state.selection.main.to
      );
      selectionCb(sel);
    }),
  ];
}

export default function SqlEditor({ value, onChange, onSelectionChange, tables, columns, theme }: Props) {
  const viewRef = useRef<EditorView | null>(null);
  const completionCompartment = useRef(new Compartment());

  // Push updated schema into the live editor whenever tables/columns arrive
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: completionCompartment.current.reconfigure(
        autocompletion({
          activateOnTyping: true,
          override: [
            keywordCompletionSource(SQLite, true),
            makeSchemaSource(tables, columns),
          ],
        })
      ),
    });
  }, [tables, columns]);

  return (
    <CodeMirror
      value={value}
      height="100%"
      style={{ height: "100%" }}
      theme={theme === "dark" ? oneDark : githubLight}
      extensions={buildExtensions(tables, columns, completionCompartment.current, onSelectionChange)}
      onChange={onChange}
      onCreateEditor={(view) => { viewRef.current = view; }}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        bracketMatching: true,
        autocompletion: false, // managed above
        defaultKeymap: true,
      }}
    />
  );
}
