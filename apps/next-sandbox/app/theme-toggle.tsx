"use client";

import { applyKbachConfig, useTheme } from "@kbach/react";

// Must match postcss.config.js's '@kbach/react/postcss': { config: {...} }
// exactly — that option only drives build-time CSS generation, it never
// reaches client-side JS. Without this, useTheme()'s own toggle below would
// silently no-op: it reads the CLIENT bundle's active theme (a separate
// module instance from anything a Server Component might set — RSC and
// client code don't share JS module state at all), which otherwise
// defaults to 'media' (no DOM write for a manual toggle). Module scope, not
// inside the component body — this only needs to run once, before the
// first render that calls toggle()/setMode(), the same "call it identically
// from build code and app code" pattern @kbach/react's config.ts documents.
applyKbachConfig({ darkMode: "attribute" });

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
