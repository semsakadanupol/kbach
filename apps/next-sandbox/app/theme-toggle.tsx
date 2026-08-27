"use client";

import { useTheme } from "@kbach/react";

// No applyKbachConfig() call — the generated CSS itself embeds the
// darkMode strategy it was built with (see @kbach/react's
// vite-plugin/format.ts's --kb-dark-mode custom property), and
// darkModeStore.ts auto-detects it client-side on its own. Dogfoods this
// being genuinely optional now, not just documented as such.

// Client Component — exercises the exact thing this sandbox exists to
// verify: a hook-based Kbach export (useTheme, which needs 'use client'
// on its own source file) working correctly inside a real Next.js App
// Router build, not just a unit test.
export function ThemeToggle() {
  const { mode, isDark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="rounded-full bg-blue-6 px-4 py-2 text-white dark:bg-blue-8"
    >
      mode: {mode} ({isDark ? "dark" : "light"})
    </button>
  );
}
