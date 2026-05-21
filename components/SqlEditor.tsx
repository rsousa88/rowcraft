"use client";

import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { sql, SQLDialect, SQLNamespace } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelectionChange: (selected: string) => void;
  tables: string[];
  columns: Record<string, string[]>;
}

export default function SqlEditor({ value, onChange, onSelectionChange, tables, columns }: Props) {
  const schema: SQLNamespace = {};
  for (const t of tables) {
    schema[t] = columns[t] ?? [];
  }

  return (
    <CodeMirror
      value={value}
      height="200px"
      theme={oneDark}
      extensions={[
        sql({ dialect: SQLDialect.define({}), schema }),
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
