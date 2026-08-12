import { useState } from "react";

export default function App() {
  const [dark, setDark] = useState(false);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute(
      "data-theme",
      next ? "dark" : "light",
    );
  };

  return (
    <div className="flex h-[100%] flex-col items-center justify-center gap-4 bg-blue-6 dark:bg-blue-8 text-gray-1">
      <span>Kbach — Rust/WASM core engine, web sandbox</span>
      <button
        data-testid="toggle-btn"
        className="cursor-pointer hover:bg-[#facc15] p-2 rounded-lg"
        onClick={toggleDark}
      >
        Toggle dark mode ({dark ? "dark" : "light"})
      </button>

      <div data-testid="responsive-box" className="hidden sm:block sm:text-lg">
        responsive: hidden below sm, block at/above sm
      </div>

      {/* Deliberate typo — Phase 6 verification: should produce a build-time
          [kbach] warning in the dev server's terminal output, not the browser. */}
      <div data-testid="typo-box" className="bg-blu-6">
        typo check
      </div>

      <div data-testid="arbitrary-box" className="p-[37px] bg-[#16a34a]">
        arbitrary value
      </div>

      <div data-testid="opacity-box" className="bg-blue-6 bg-opacity-50 p-4">
        opacity composition
      </div>

      <div data-testid="mode-aware-box" className="bg-surface p-4">
        mode-aware color
      </div>

      <div data-testid="divide-box" className="divide-x">
        <span data-testid="divide-child-1">a</span>
        <span data-testid="divide-child-2">b</span>
      </div>
    </div>
  );
}
