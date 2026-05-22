"use client";

import { useRef, useEffect } from "react";
import CodeMirror, { EditorView, keymap } from "@uiw/react-codemirror";
import { sql, SQLite, SQLNamespace } from "@codemirror/lang-sql";
import { Compartment } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { githubLight } from "@uiw/codemirror-theme-github";
import { autocompletion, startCompletion } from "@codemirror/autocomplete";
import { toggleComment } from "@codemirror/commands";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelectionChange: (selected: string) => void;
  tables: string[];
  columns: Record<string, string[]>;
  theme: "light" | "dark";
}

function buildSqlExt(tables: string[], columns: Record<string, string[]>) {
  const schema: SQLNamespace = {};
  for (const t of tables) {
    schema[t] = columns[t] ?? [];
  }
  return sql({ dialect: SQLite, schema, upperCaseKeywords: true });
}

export default function SqlEditor({ value, onChange, onSelectionChange, tables, columns, theme }: Props) {
  const viewRef = useRef<EditorView | null>(null);
  // Compartment lets us swap the SQL extension (with its schema) without rebuilding the editor
  const sqlCompartment = useRef(new Compartment());

  // Push updated schema into the live editor whenever tables/columns change
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: sqlCompartment.current.reconfigure(buildSqlExt(tables, columns)),
    });
  }, [tables, columns]);

  const extensions = [
    sqlCompartment.current.of(buildSqlExt(tables, columns)),
    EditorView.lineWrapping,
    autocompletion({ activateOnTyping: true }),
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
      onSelectionChange(sel);
    }),
  ];

  return (
    <CodeMirror
      value={value}
      height="100%"
      style={{ height: "100%" }}
      theme={theme === "dark" ? oneDark : githubLight}
      extensions={extensions}
      onChange={onChange}
      onCreateEditor={(view) => { viewRef.current = view; }}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        bracketMatching: true,
        autocompletion: false,
        defaultKeymap: true,
      }}
    />
  );
}
