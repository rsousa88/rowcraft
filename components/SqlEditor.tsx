"use client";

import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { sql, SQLDialect, SQLNamespace } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { githubLight } from "@uiw/codemirror-theme-github";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelectionChange: (selected: string) => void;
  tables: string[];
  columns: Record<string, string[]>;
  theme: "light" | "dark";
}

export default function SqlEditor({ value, onChange, onSelectionChange, tables, columns, theme }: Props) {
  const schema: SQLNamespace = {};
  for (const t of tables) {
    schema[t] = columns[t] ?? [];
  }

  return (
    <CodeMirror
      value={value}
      height="200px"
      theme={theme === "dark" ? oneDark : githubLight}
      extensions={[
        sql({ dialect: SQLDialect.define({}), schema }),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          const sel = update.state.sliceDoc(
            update.state.selection.main.from,
            update.state.selection.main.to
          );
          onSelectionChange(sel);
        }),
      ]}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        bracketMatching: true,
        autocompletion: true,
      }}
    />
  );
}
