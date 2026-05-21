"use client";

import { useEffect } from "react";

const SHORTCUTS = [
  { keys: ["Ctrl", "Enter"], mac: ["⌘", "↵"], desc: "Run query (or selection if selected)" },
  { keys: ["Ctrl", "Space"], mac: ["⌘", "Space"], desc: "Trigger autocomplete" },
  { keys: ["Ctrl", "K", "C"], mac: ["⌘", "K", "C"], desc: "Comment selection" },
  { keys: ["Ctrl", "K", "U"], mac: ["⌘", "K", "U"], desc: "Uncomment selection" },
  { keys: ["?"], mac: ["?"], desc: "Show / hide this panel" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcuts({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">Keyboard shortcuts</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg leading-none">✕</button>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {SHORTCUTS.map(({ keys, mac, desc }) => (
              <tr key={desc} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                <td className="py-2 pr-4 text-zinc-500 dark:text-zinc-400">{desc}</td>
                <td className="py-2 text-right">
                  <div className="flex items-center justify-end gap-1 flex-wrap">
                    {(isMac ? mac : keys).map((k) => (
                      <kbd
                        key={k}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500 text-center">Press Esc or click outside to close</p>
      </div>
    </div>
  );
}
