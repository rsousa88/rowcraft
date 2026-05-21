"use client";

import { useTheme, type Theme } from "@/components/ThemeProvider";

const CYCLE: Theme[] = ["light", "dark", "auto"];

const ICONS: Record<Theme, React.ReactNode> = {
  light: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  ),
  dark: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    </svg>
  ),
  auto: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
    </svg>
  ),
};

const LABELS: Record<Theme, string> = {
  light: "Light mode",
  dark: "Dark mode",
  auto: "Follow system",
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length];

  return (
    <button
      onClick={() => setTheme(next)}
      title={`${LABELS[theme]} — click for ${LABELS[next]}`}
      className="rounded-md p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
    >
      {ICONS[theme]}
    </button>
  );
}
