"use client";

import CodeMirror, { EditorView, keymap } from "@uiw/react-codemirror";
import { sql, SQLite, SQLNamespace } from "@codemirror/lang-sql";
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

export default function SqlEditor({ value, onChange, onSelectionChange, tables, columns, theme }: Props) {
  const schema: SQLNamespace = {};
  for (const t of tables) {
    schema[t] = columns[t] ?? [];
  }

  const extensions = [
    sql({
      dialect: SQLite,
      schema,
      upperCaseKeywords: true,
    }),
    EditorView.lineWrapping,
    autocompletion({ activateOnTyping: true }),
    keymap.of([
      // Ctrl/Cmd+Space — trigger autocomplete
      {
        key: "Ctrl-Space",
        mac: "Cmd-Space",
        run: startCompletion,
      },
      // Ctrl/Cmd+K+C — comment selection (VS Code style)
      {
        key: "Ctrl-k Ctrl-c",
        mac: "Cmd-k Cmd-c",
        run: (view) => {
          toggleComment(view);
          return true;
        },
      },
      // Ctrl/Cmd+K+U — uncomment selection
      {
        key: "Ctrl-k Ctrl-u",
        mac: "Cmd-k Cmd-u",
        run: (view) => {
          toggleComment(view);
          return true;
        },
      },
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
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        bracketMatching: true,
        autocompletion: false, // we manage it above
        defaultKeymap: true,
      }}
    />
  );
}
