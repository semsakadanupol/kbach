import { useState, type ReactNode } from "react";
import {
  useGlobalDarkMode,
  toggleGlobalDarkMode,
  ThemeProvider,
  useTheme,
} from "@kbach/react";

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const NAV_GROUPS: { label: string; items: { id: string; label: string }[] }[] = [
  {
    label: "Getting Started",
    items: [
      { id: "installation", label: "Installation" },
      { id: "quick-start", label: "Quick Start" },
    ],
  },
  {
    label: "Layout",
    items: [
      { id: "display", label: "Display & Flex" },
      { id: "grid", label: "Grid" },
      { id: "alignment", label: "Alignment" },
      { id: "flex-sizing", label: "Flex Item Sizing" },
      { id: "position", label: "Position & Overflow" },
      { id: "container-queries", label: "Container Queries" },
    ],
  },
  {
    label: "Sizing & Spacing",
    items: [
      { id: "sizing", label: "Sizing" },
      { id: "spacing", label: "Spacing" },
    ],
  },
  {
    label: "Typography",
    items: [
      { id: "typography", label: "Typography" },
      { id: "typography-completeness", label: "Typography Completeness" },
    ],
  },
  {
    label: "Colors & Backgrounds",
    items: [
      { id: "colors", label: "Colors" },
      { id: "backgrounds", label: "Backgrounds & Gradients" },
    ],
  },
  {
    label: "Borders & Effects",
    items: [
      { id: "borders", label: "Borders" },
      { id: "effects", label: "Effects" },
      { id: "effects-completeness", label: "Effects Completeness" },
      { id: "divide", label: "Divide & Space" },
    ],
  },
  {
    label: "Transforms & Filters",
    items: [
      { id: "transforms", label: "Transforms" },
      { id: "filters", label: "Filters" },
    ],
  },
  {
    label: "Interactivity & Variants",
    items: [
      { id: "interactivity-sizing", label: "Interactivity & Sizing" },
      { id: "variant-system", label: "Variant System" },
      { id: "modifiers", label: "Modifiers" },
      { id: "dynamic-styling", label: "Dynamic & Combined Styling" },
    ],
  },
  {
    label: "Theming",
    items: [{ id: "theme-provider", label: "Theme Provider" }],
  },
  {
    label: "Responsive",
    items: [{ id: "responsive", label: "Responsive" }],
  },
];

function Code({ children }: { children: ReactNode }) {
  return (
    <code
      className="bg-slate-3 dark:bg-slate-8 text-slate-12 dark:text-slate-1 rounded-md px-1"
      style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.8125rem" }}
    >
      {children}
    </code>
  );
}

function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-8 dark:text-slate-5">
      {children}
    </h3>
  );
}

// Shared between the always-visible lg+ sidebar and the collapsible mobile
// nav panel — one source of truth for the link list so the two surfaces
// can never drift out of sync. onNavigate closes the mobile panel after a
// link is clicked (the desktop sidebar doesn't pass it, since it's never
// covering the content it links to).
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <GroupHeading>{group.label}</GroupHeading>
          <div className="flex flex-col">
            {group.items.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={onNavigate}
                className="text-sm text-slate-10 dark:text-slate-4 hover:text-slate-12 dark:hover:text-white hover:bg-slate-3 dark:hover:bg-slate-9 rounded-md px-2 py-1"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="relative rounded-lg bg-slate-12 dark:bg-black p-4"
      style={{ overflow: "hidden" }}
    >
      <button
        className="cursor-pointer bg-slate-9 hover:bg-slate-8 text-slate-2 text-xs rounded-md px-2 py-1"
        style={{ position: "absolute", top: "10px", right: "10px" }}
        onClick={() => {
          navigator.clipboard?.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre
        className="text-slate-2"
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: "0.8125rem",
          lineHeight: 1.7,
          margin: 0,
          paddingRight: "60px",
          overflowX: "auto",
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  code,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  code?: string;
  children?: ReactNode;
}) {
  return (
    <section
      id={id}
      className="flex flex-col gap-4 pb-8 border-b border-slate-3 dark:border-slate-9"
      style={{ scrollMarginTop: "76px" }}
    >
      <div className="flex flex-col gap-2">
        <div className="group flex items-center gap-2">
          <h2 className="text-2xl font-bold">{title}</h2>
          <a
            href={`#${id}`}
            aria-label={"Link to " + title}
            className="opacity-0 group-hover:opacity-100 text-slate-7 dark:text-slate-6"
          >
            #
          </a>
        </div>
        <p
          className="text-sm text-slate-9 dark:text-slate-5"
          style={{ maxWidth: "680px", lineHeight: 1.6 }}
        >
          {description}
        </p>
      </div>
      {children && (
        <div
          className="rounded-lg border border-slate-4 dark:border-slate-8 bg-slate-1 dark:bg-slate-10 p-6"
          style={{ overflowX: "auto" }}
        >
          <div className="flex flex-col gap-2">{children}</div>
        </div>
      )}
      {code && <CodeBlock code={code} />}
    </section>
  );
}

// Consumes useTheme() — requires a <ThemeProvider> ancestor, unlike the
// header's toggle button above (which uses useGlobalDarkMode()/
// toggleGlobalDarkMode() with no provider at all). Both read/write the
// exact same global store, so toggling here also flips the header button's
// label, and vice versa — proving they're two views onto one source of
// truth, not two separate state machines.
function ThemeProviderDemo() {
  const { mode, isDark, setMode, toggle } = useTheme();
  return (
    <div className="flex flex-col gap-2 bg-slate-3 dark:bg-slate-9 p-2">
      <div className="flex gap-2 items-center flex-wrap">
        <span data-testid="theme-provider-mode" className="bg-slate-6 dark:bg-slate-7 text-white p-1 text-xs">
          mode: {mode}
        </span>
        <span data-testid="theme-provider-isdark" className="bg-slate-6 dark:bg-slate-7 text-white p-1 text-xs">
          isDark: {String(isDark)}
        </span>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button data-testid="theme-provider-toggle" className="cursor-pointer bg-gold p-1 text-xs rounded-md" onClick={toggle}>
          toggle()
        </button>
        <button data-testid="theme-provider-set-light" className="cursor-pointer bg-slate-4 dark:bg-slate-8 p-1 text-xs rounded-md" onClick={() => setMode("light")}>
          setMode(&quot;light&quot;)
        </button>
        <button data-testid="theme-provider-set-dark" className="cursor-pointer bg-slate-4 dark:bg-slate-8 p-1 text-xs rounded-md" onClick={() => setMode("dark")}>
          setMode(&quot;dark&quot;)
        </button>
        <button data-testid="theme-provider-set-system" className="cursor-pointer bg-slate-4 dark:bg-slate-8 p-1 text-xs rounded-md" onClick={() => setMode("system")}>
          setMode(&quot;system&quot;)
        </button>
      </div>
    </div>
  );
}

// Real DYNAMIC values — the color and the boolean toggles below are only
// known at runtime (React state), not at build time. This static build
// (see main.tsx's disableRuntimeCSS()) works with them anyway for a
// specific reason: every class name these compute is ALSO used literally
// elsewhere on this page (bg-red-6/bg-green-6/etc. in the Colors section,
// font-bold/rounded-xl/shadow-lg in Typography/Borders/Effects), so the
// Vite plugin's static scan already discovered and generated their CSS —
// this component just picks WHICH of those already-generated class names
// to apply, at runtime, via plain string concatenation (deliberately not
// a template literal — see this file's own backtick-scanning gotcha).
// A truly novel dynamic value with no static occurrence anywhere (e.g.
// building "bg-" + userInput + "-6" from arbitrary user input) needs
// either a safelist entry in vite.config.ts, or runtime CSS generation
// via kb() with disableRuntimeCSS() NOT called.
const DYNAMIC_COLORS = ["red", "green", "blue", "violet", "amber"];

function DynamicStylingDemo() {
  const [colorIndex, setColorIndex] = useState(0);
  const [bold, setBold] = useState(false);
  const [rounded, setRounded] = useState(false);
  const [shadow, setShadow] = useState(false);

  const color = DYNAMIC_COLORS[colorIndex]!;
  const dynamicClassName = "bg-" + color + "-6 text-white p-4 transition";

  const combinedClasses = ["bg-blue-6", "text-white", "p-4", "transition"];
  if (bold) combinedClasses.push("font-bold");
  if (rounded) combinedClasses.push("rounded-xl");
  if (shadow) combinedClasses.push("shadow-lg");
  const combinedClassName = combinedClasses.join(" ");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-xs text-slate-9 dark:text-slate-5">
          Dynamic: className computed from state each render
        </span>
        <div className="flex gap-4 items-center flex-wrap">
          <div
            data-testid="dynamic-color-box"
            className={dynamicClassName}
            style={{ width: "140px", borderRadius: "8px" }}
          >
            bg-{color}-6
          </div>
          <button
            data-testid="dynamic-color-next"
            className="cursor-pointer bg-slate-4 dark:bg-slate-8 p-2 rounded-md text-sm"
            onClick={() => setColorIndex((i) => (i + 1) % DYNAMIC_COLORS.length)}
          >
            Next color
          </button>
          <Code>{dynamicClassName}</Code>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-slate-9 dark:text-slate-5">
          Combined: several independent toggles merged into one className
        </span>
        <div className="flex gap-4 items-center flex-wrap">
          <div
            data-testid="combined-style-box"
            className={combinedClassName}
            style={{ width: "140px" }}
          >
            combined
          </div>
          <label className="flex items-center gap-1 text-sm">
            <input
              data-testid="combined-toggle-bold"
              type="checkbox"
              checked={bold}
              onChange={(e) => setBold(e.target.checked)}
            />
            bold
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              data-testid="combined-toggle-rounded"
              type="checkbox"
              checked={rounded}
              onChange={(e) => setRounded(e.target.checked)}
            />
            rounded
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              data-testid="combined-toggle-shadow"
              type="checkbox"
              checked={shadow}
              onChange={(e) => setShadow(e.target.checked)}
            />
            shadow
          </label>
        </div>
        <Code>{combinedClassName}</Code>
      </div>
    </div>
  );
}

export default function App() {
  // No <ThemeProvider> anywhere in this tree — useGlobalDarkMode()/
  // toggleGlobalDarkMode() work standalone, reading/writing the same
  // module-level store the (optional) <ThemeProvider> in the "Theme
  // Provider" section below also reads/writes, so both stay in sync.
  const dark = useGlobalDarkMode();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div
      className="flex flex-col bg-slate-2 dark:bg-slate-11 text-slate-12 dark:text-slate-1"
      style={{ fontFamily: FONT_STACK }}
    >
      <header className="sticky top-0 flex items-center justify-between gap-4 bg-slate-1 dark:bg-slate-10 border-b border-slate-4 dark:border-slate-8 px-6 py-2 z-50">
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center bg-linear-to-r from-blue-6 to-violet-6 text-white font-bold rounded-lg"
            style={{ width: "28px", height: "28px", fontSize: "0.875rem" }}
          >
            K
          </span>
          <span className="text-lg font-bold">Kbach</span>
          <span className="hidden md:block text-sm text-slate-9 dark:text-slate-5">
            Rust/WASM core engine — utility reference &amp; live sandbox
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="mobile-nav-toggle"
            className="lg:hidden cursor-pointer bg-slate-3 dark:bg-slate-8 hover:bg-slate-4 dark:hover:bg-slate-7 p-2 rounded-lg text-sm font-semibold"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? "Close" : "Menu"}
          </button>
          <button
            data-testid="toggle-btn"
            className="cursor-pointer bg-gold hover:bg-[#facc15] focus:outline p-2 rounded-lg font-semibold text-sm"
            onClick={toggleGlobalDarkMode}
          >
            {dark ? "Dark" : "Light"} mode
          </button>
        </div>
      </header>

      {mobileNavOpen && (
        <nav
          data-testid="mobile-nav-panel"
          className="lg:hidden flex flex-col gap-6 bg-slate-1 dark:bg-slate-10 border-b border-slate-4 dark:border-slate-8 p-4"
          style={{ maxHeight: "70vh", overflowY: "auto" }}
        >
          <NavLinks onNavigate={() => setMobileNavOpen(false)} />
        </nav>
      )}

      <div className="flex flex-col lg:grid lg:grid-cols-[260px_1fr]">
        <aside
          className="hidden lg:flex flex-col shrink-0 gap-6 border-r border-slate-4 dark:border-slate-8 p-4"
          style={{
            position: "sticky",
            top: "57px",
            height: "calc(100vh - 57px)",
            overflowY: "auto",
          }}
        >
          <NavLinks />
        </aside>

        <main className="flex flex-col flex-1 gap-8 p-6 md:p-8" style={{ minWidth: 0 }}>
          <div className="flex flex-col gap-2 pb-8 border-b border-slate-3 dark:border-slate-9">
            <h1 className="text-4xl font-extrabold">Kbach</h1>
            <p
              className="text-lg text-slate-9 dark:text-slate-5"
              style={{ maxWidth: "680px", lineHeight: 1.6 }}
            >
              A Rust/WASM utility-first styling engine aiming for full
              Tailwind CSS v4 parity — grid, transforms, filters, gradients,
              animations, container queries, and a parameterized variant
              system — with Kbach's own 22-family + metals color palette as
              the one deliberate difference. Every example below is live,
              generated CSS.
            </p>
          </div>

          <div className="flex flex-col gap-8">
            <GroupHeading>Getting Started</GroupHeading>

            <Section
              id="installation"
              title="Installation"
              description={
                <>
                  Install <Code>@kbach/react</Code> and wire up the Vite
                  plugin — it scans your source at build time and writes a
                  real, static <Code>kbach.css</Code>, resolved through the
                  same Rust/WASM core engine every example on this page uses.
                </>
              }
              code={[
                'npm install @kbach/react',
                '',
                '// vite.config.ts',
                "import { defineConfig } from 'vite';",
                "import react from '@vitejs/plugin-react';",
                "import { kbach } from '@kbach/react/vite';",
                '',
                'export default defineConfig({',
                '  plugins: [kbach(), react()],',
                '});',
              ].join('\n')}
            />

            <Section
              id="quick-start"
              title="Quick Start"
              description={
                <>
                  Call <Code>initKbach()</Code> once before your first render
                  — it loads the WASM core engine — then use utility{" "}
                  <Code>className</Code> strings anywhere, no
                  provider required.
                </>
              }
              code={[
                "import { initKbach } from '@kbach/react';",
                "import { createRoot } from 'react-dom/client';",
                "import App from './App';",
                '',
                'initKbach().then(() => {',
                "  createRoot(document.getElementById('root')!).render(<App />);",
                '});',
                '',
                '// App.tsx',
                '<div className="flex items-center gap-4 bg-blue-6 text-white p-4 rounded-lg">',
                '  Hello Kbach',
                '</div>',
              ].join('\n')}
            >
              <div
                data-testid="quick-start-demo"
                className="flex items-center gap-4 bg-blue-6 text-white p-4 rounded-lg"
              >
                Hello Kbach
              </div>
            </Section>

            <GroupHeading>Layout</GroupHeading>

            <Section
              id="display"
              title="Display & Flex Container"
              description={
                <>
                  Every CSS <Code>display</Code> value Kbach resolves —{" "}
                  <Code>flex</Code>, <Code>inline-flex</Code>, <Code>grid</Code>,{" "}
                  <Code>block</Code>, <Code>inline</Code>, <Code>inline-block</Code>
                  , <Code>contents</Code>, and <Code>hidden</Code> — plus{" "}
                  <Code>flex-row-reverse</Code> and <Code>flex-wrap</Code> on an
                  actual flex container.
                </>
              }
              code={[
                '<div className="flex flex-row-reverse gap-2">...</div>',
                '<div className="flex w-[120px] flex-wrap gap-1">...</div>',
              ].join('\n')}
            >
              <div className="flex flex-row gap-2 flex-wrap">
                <div
                  data-testid="disp-flex"
                  className="flex bg-slate-4 dark:bg-slate-8 p-2"
                >
                  flex
                </div>
                <div
                  data-testid="disp-inline-flex"
                  className="inline-flex bg-slate-4 dark:bg-slate-8 p-2"
                >
                  inline-flex
                </div>
                <div
                  data-testid="disp-grid"
                  className="grid bg-slate-4 dark:bg-slate-8 p-2"
                >
                  grid
                </div>
                <div
                  data-testid="disp-block"
                  className="block bg-slate-4 dark:bg-slate-8 p-2"
                >
                  block
                </div>
                <div
                  data-testid="disp-inline"
                  className="inline bg-slate-4 dark:bg-slate-8 p-2"
                >
                  inline
                </div>
                <div
                  data-testid="disp-inline-block"
                  className="inline-block bg-slate-4 dark:bg-slate-8 p-2"
                >
                  inline-block
                </div>
                <div data-testid="disp-contents" className="contents">
                  <span className="bg-slate-4 dark:bg-slate-8 p-2">contents</span>
                </div>
                <div
                  data-testid="disp-hidden"
                  className="hidden bg-slate-4 dark:bg-slate-8 p-2"
                >
                  hidden (never visible)
                </div>
              </div>
              <div className="flex flex-row-reverse gap-2 bg-slate-3 dark:bg-slate-9 p-2">
                <span
                  data-testid="row-reverse-a"
                  className="bg-slate-6 dark:bg-slate-7 p-1"
                >
                  a
                </span>
                <span
                  data-testid="row-reverse-b"
                  className="bg-slate-6 dark:bg-slate-7 p-1"
                >
                  b
                </span>
              </div>
              <div className="flex w-[120px] flex-wrap gap-1 bg-slate-3 dark:bg-slate-9 p-2">
                <span className="bg-slate-6 dark:bg-slate-7 p-1">one</span>
                <span className="bg-slate-6 dark:bg-slate-7 p-1">two</span>
                <span className="bg-slate-6 dark:bg-slate-7 p-1">three</span>
              </div>
            </Section>

            <Section
              id="grid"
              title="Grid"
              description={
                <>
                  Web-only (React Native has no CSS Grid equivalent).{" "}
                  <Code>grid-cols-*</Code>/<Code>grid-rows-*</Code>,{" "}
                  <Code>col-span-*</Code>/<Code>row-span-*</Code>,{" "}
                  <Code>col-start-*</Code>/<Code>col-end-*</Code>,{" "}
                  <Code>grid-flow-*</Code>, <Code>auto-cols-*</Code>/
                  <Code>auto-rows-*</Code>, and <Code>place-items-*</Code>/
                  <Code>place-content-*</Code>/<Code>place-self-*</Code>.
                </>
              }
              code={[
                '<div className="grid grid-cols-3 gap-2">',
                '  <div className="col-span-2">...</div>',
                '</div>',
                '<div className="grid place-items-center">...</div>',
              ].join('\n')}
            >
              <div
                data-testid="grid-cols-box"
                className="grid grid-cols-3 gap-2 bg-slate-3 dark:bg-slate-9 p-2"
              >
                <div className="bg-slate-6 dark:bg-slate-7 p-2">1</div>
                <div className="bg-slate-6 dark:bg-slate-7 p-2">2</div>
                <div className="bg-slate-6 dark:bg-slate-7 p-2">3</div>
                <div
                  data-testid="grid-span-cell"
                  className="col-span-2 bg-cyan-6 p-2"
                >
                  col-span-2
                </div>
                <div className="bg-slate-6 dark:bg-slate-7 p-2">6</div>
              </div>
              <div className="grid grid-flow-col grid-rows-2 gap-1 bg-slate-3 dark:bg-slate-9 p-2">
                <div className="bg-slate-6 dark:bg-slate-7 p-1">1</div>
                <div className="bg-slate-6 dark:bg-slate-7 p-1">2</div>
                <div className="bg-slate-6 dark:bg-slate-7 p-1">3</div>
                <div className="bg-slate-6 dark:bg-slate-7 p-1">4</div>
              </div>
              <div
                data-testid="place-items-box"
                className="grid h-[80px] place-items-center bg-slate-3 dark:bg-slate-9 p-2"
              >
                <span className="bg-teal-6 p-2">place-items-center</span>
              </div>
            </Section>

            <Section
              id="alignment"
              title="Alignment"
              description={
                <>
                  <Code>items-*</Code>, <Code>justify-*</Code>,{" "}
                  <Code>content-*</Code>, and <Code>self-*</Code> — every flexbox
                  alignment axis Kbach supports.
                </>
              }
              code={[
                '<div className="flex items-center justify-between">...</div>',
                '<div className="flex content-between flex-wrap">...</div>',
                '<span className="self-center">...</span>',
              ].join('\n')}
            >
              <div
                className="flex items-center justify-between gap-2 bg-slate-3 dark:bg-slate-9 p-2"
                style={{ height: "60px" }}
              >
                <span
                  data-testid="items-center"
                  className="items-center bg-slate-6 dark:bg-slate-7 p-1"
                >
                  items-center
                </span>
                <span className="bg-slate-6 dark:bg-slate-7 p-1">
                  justify-between
                </span>
              </div>
              <div className="flex justify-evenly bg-slate-3 dark:bg-slate-9 p-2">
                <span className="bg-slate-6 dark:bg-slate-7 p-1">
                  justify-evenly
                </span>
                <span className="bg-slate-6 dark:bg-slate-7 p-1">a</span>
                <span className="bg-slate-6 dark:bg-slate-7 p-1">b</span>
              </div>
              <div
                className="flex content-between flex-wrap gap-1 bg-slate-3 dark:bg-slate-9 p-2"
                style={{ height: "80px" }}
              >
                <span className="bg-slate-6 dark:bg-slate-7 p-1">
                  content-between
                </span>
                <span className="bg-slate-6 dark:bg-slate-7 p-1">row2</span>
              </div>
              <div
                className="flex gap-2 bg-slate-3 dark:bg-slate-9 p-2"
                style={{ height: "60px" }}
              >
                <span className="self-start bg-slate-6 dark:bg-slate-7 p-1">
                  self-start
                </span>
                <span className="self-center bg-slate-6 dark:bg-slate-7 p-1">
                  self-center
                </span>
                <span className="self-end bg-slate-6 dark:bg-slate-7 p-1">
                  self-end
                </span>
                <span className="self-stretch bg-slate-6 dark:bg-slate-7 p-1">
                  self-stretch
                </span>
                <span className="self-baseline bg-slate-6 dark:bg-slate-7 p-1">
                  self-baseline
                </span>
                <span className="self-auto bg-slate-6 dark:bg-slate-7 p-1">
                  self-auto
                </span>
              </div>
            </Section>

            <Section
              id="flex-sizing"
              title="Flex Item Sizing"
              description={
                <>
                  The <Code>flex</Code> shorthand family (<Code>flex-1</Code>/
                  <Code>flex-auto</Code>/<Code>flex-none</Code>/
                  <Code>flex-initial</Code>) and <Code>grow</Code>/
                  <Code>shrink</Code> (plus the legacy <Code>flex-grow</Code>/
                  <Code>flex-shrink-0</Code> names).
                </>
              }
              code={[
                '<span className="flex-1">grows to fill</span>',
                '<span className="shrink-0">fixed</span>',
                '<span className="flex-auto">...</span>',
              ].join('\n')}
            >
              <div
                data-testid="flex-box"
                className="flex w-full bg-slate-3 dark:bg-slate-9"
              >
                <span
                  data-testid="flex-grow-child"
                  className="flex-1 bg-green-7 p-1"
                >
                  grows to fill (flex-1)
                </span>
                <span
                  data-testid="flex-fixed-child"
                  className="shrink-0 bg-yellow-5 p-1"
                >
                  fixed (shrink-0)
                </span>
              </div>
              <div className="flex w-full bg-slate-3 dark:bg-slate-9">
                <span className="flex-auto bg-cyan-6 p-1">flex-auto</span>
                <span className="flex-none bg-cyan-8 p-1">flex-none</span>
                <span className="flex-initial bg-cyan-4 p-1">flex-initial</span>
              </div>
              <div className="flex w-full bg-slate-3 dark:bg-slate-9">
                <span className="grow bg-teal-6 p-1">grow</span>
                <span className="grow-0 bg-teal-8 p-1">grow-0</span>
                <span className="shrink bg-teal-4 p-1">shrink</span>
              </div>
              <div className="flex w-full bg-slate-3 dark:bg-slate-9">
                <span className="flex-grow bg-indigo-6 p-1">
                  flex-grow (legacy)
                </span>
                <span className="flex-shrink-0 bg-indigo-8 p-1">
                  flex-shrink-0 (legacy)
                </span>
              </div>
            </Section>

            <Section
              id="position"
              title="Position, Z-Index, Order, Aspect-Ratio, Overflow"
              description={
                <>
                  <Code>relative</Code>/<Code>absolute</Code> with{" "}
                  <Code>top-*</Code>/<Code>right-*</Code>/<Code>bottom-*</Code>/
                  <Code>left-*</Code>, the <Code>inset-*</Code> shorthand, and{" "}
                  <Code>z-*</Code>, <Code>order-*</Code>, and{" "}
                  <Code>aspect-square</Code>/<Code>aspect-video</Code>.
                </>
              }
              code={[
                '<div className="relative">',
                '  <div className="absolute top-1 right-1 z-50">...</div>',
                '  <div className="absolute inset-4">...</div>',
                '</div>',
                '<div className="aspect-video">...</div>',
              ].join('\n')}
            >
              <div
                className="relative bg-slate-3 dark:bg-slate-9 p-4"
                style={{ height: "120px", width: "220px" }}
              >
                <div data-testid="pos-top-left" className="absolute top-1 left-1 bg-red-6 text-white p-1 text-xs">
                  top-1 left-1
                </div>
                <div data-testid="pos-top-right" className="absolute top-1 right-1 bg-blue-6 text-white p-1 text-xs z-50">
                  top-1 right-1
                </div>
                <div data-testid="pos-bottom-left" className="absolute bottom-1 left-1 bg-green-6 text-white p-1 text-xs">
                  bottom-1 left-1
                </div>
                <div data-testid="pos-bottom-right" className="absolute bottom-1 right-1 bg-amber-6 text-white p-1 text-xs">
                  bottom-1 right-1
                </div>
              </div>
              <div
                className="relative bg-slate-3 dark:bg-slate-9 p-1"
                style={{ height: "60px", width: "220px" }}
              >
                <div data-testid="pos-inset" className="absolute inset-4 bg-slate-6 dark:bg-slate-7 text-white p-1 text-xs">
                  inset-4
                </div>
              </div>
              <div className="flex bg-slate-3 dark:bg-slate-9 p-2 gap-1">
                <span className="order-2 bg-slate-6 dark:bg-slate-7 p-1">
                  order-2
                </span>
                <span className="order-1 bg-slate-6 dark:bg-slate-7 p-1">
                  order-1
                </span>
              </div>
              <div className="flex gap-2">
                <div
                  className="aspect-square bg-slate-4 dark:bg-slate-8"
                  style={{ width: "40px" }}
                >
                  sq
                </div>
                <div
                  className="aspect-video bg-slate-4 dark:bg-slate-8"
                  style={{ width: "80px" }}
                >
                  video
                </div>
              </div>
              <div
                className="overflow-hidden bg-slate-3 dark:bg-slate-9 p-1"
                style={{ width: "100px", height: "24px" }}
              >
                overflow-hidden clips this long line of text that would otherwise
                overflow
              </div>
            </Section>

            <Section
              id="container-queries"
              title="Container Queries"
              description={
                <>
                  <Code>@container</Code> marks an element as a query
                  container; <Code>@sm:</Code>/<Code>@min-[...]:</Code> style
                  descendants based on the CONTAINER's width, not the viewport's.
                  Also <Code>starting:</Code> (<Code>@starting-style</Code>) and
                  arbitrary properties (<Code>[clip-path:circle(50%)]</Code>).
                </>
              }
              code={[
                '<div className="@container">',
                '  <div className="@sm:bg-green-6 bg-red-6">...</div>',
                '</div>',
                '<div className="starting:opacity-0 transition opacity-100">...</div>',
              ].join('\n')}
            >
              <div className="flex gap-6 flex-wrap items-start">
                <div
                  data-testid="container-narrow"
                  className="@container bg-slate-3 p-2"
                  style={{ width: "150px" }}
                >
                  <div
                    data-testid="container-narrow-inner"
                    className="@sm:bg-green-6 bg-red-6 p-2 text-white text-xs"
                  >
                    @sm:bg-green-6 (narrow container, stays red)
                  </div>
                </div>
                <div
                  data-testid="container-wide"
                  className="@container bg-slate-3 p-2"
                  style={{ width: "700px" }}
                >
                  <div
                    data-testid="container-wide-inner"
                    className="@sm:bg-green-6 bg-red-6 p-2 text-white text-xs"
                  >
                    @sm:bg-green-6 (wide container, turns green)
                  </div>
                </div>
              </div>
              <div className="flex gap-4 flex-wrap items-center">
                <div
                  data-testid="clip-path-demo"
                  className="[clip-path:circle(50%)] bg-blue-6"
                  style={{ width: "60px", height: "60px" }}
                />
                <div
                  data-testid="starting-style-demo"
                  className="starting:opacity-0 transition opacity-100 bg-green-6 p-4 text-white text-xs"
                >
                  starting:opacity-0
                </div>
              </div>
            </Section>

            <GroupHeading>Sizing & Spacing</GroupHeading>

            <Section
              id="sizing"
              title="Sizing"
              description={
                <>
                  <Code>w-full</Code>/<Code>h-full</Code> (100%),{" "}
                  <Code>w-screen</Code>/<Code>h-screen</Code> (dynamic viewport
                  units — resize your mobile browser's address bar to see why that
                  matters), and <Code>min-*</Code>/<Code>max-*</Code> from the
                  spacing scale.
                </>
              }
              code={[
                '<div className="h-screen w-screen">...</div>',
                '<div className="min-w-8 max-w-8">...</div>',
              ].join('\n')}
            >
              <div
                data-testid="h-screen-box"
                className="h-screen w-screen bg-slate-3 dark:bg-slate-9 p-2"
              >
                h-screen w-screen — should exactly fill the viewport
              </div>
              <div className="flex gap-2">
                <div className="w-full bg-slate-4 dark:bg-slate-8 p-1">w-full</div>
              </div>
              <div className="flex gap-2">
                <div className="min-w-8 max-w-8 bg-slate-4 dark:bg-slate-8 p-1">
                  min/max-w-8
                </div>
                <div className="min-h-8 max-h-8 bg-slate-4 dark:bg-slate-8 p-1">
                  min/max-h-8
                </div>
              </div>
            </Section>

            <Section
              id="spacing"
              title="Spacing"
              description={
                <>
                  Padding and margin, both the shorthand (<Code>p-*</Code>/
                  <Code>m-*</Code>), axis (<Code>px-*</Code>/<Code>my-*</Code>), and
                  per-side (<Code>pt-*</Code>/<Code>ml-*</Code>) forms, plus{" "}
                  <Code>gap-x-*</Code>/<Code>gap-y-*</Code>.
                </>
              }
              code={[
                '<div className="px-2 py-1">...</div>',
                '<div className="mt-1 mr-2 mb-1 ml-2">...</div>',
                '<div className="gap-x-4 gap-y-2">...</div>',
              ].join('\n')}
            >
              <div className="flex gap-1">
                <div className="p-1 bg-slate-4 dark:bg-slate-8">p-1</div>
                <div className="px-2 py-1 bg-slate-4 dark:bg-slate-8">
                  px-2 py-1
                </div>
                <div className="pt-1 pr-2 pb-1 pl-2 bg-slate-4 dark:bg-slate-8">
                  pt/pr/pb/pl
                </div>
              </div>
              <div className="flex gap-1">
                <div className="m-1 bg-slate-4 dark:bg-slate-8">m-1</div>
                <div className="mx-2 my-1 bg-slate-4 dark:bg-slate-8">
                  mx-2 my-1
                </div>
                <div className="mt-1 mr-2 mb-1 ml-2 bg-slate-4 dark:bg-slate-8">
                  mt/mr/mb/ml
                </div>
              </div>
              <div className="flex gap-x-4 gap-y-2 flex-wrap bg-slate-3 dark:bg-slate-9 p-2">
                <span className="bg-slate-6 dark:bg-slate-7 p-1">gap-x-4</span>
                <span className="bg-slate-6 dark:bg-slate-7 p-1">gap-y-2</span>
              </div>
            </Section>

            <GroupHeading>Typography</GroupHeading>

            <Section
              id="typography"
              title="Typography"
              description={
                <>
                  Font weight and size scales, text alignment, case/decoration
                  transforms, <Code>truncate</Code>, and <Code>leading-*</Code>/
                  <Code>tracking-*</Code>.
                </>
              }
              code={[
                '<span className="font-semibold text-2xl">...</span>',
                '<span className="text-center underline">...</span>',
                '<div className="truncate">...</div>',
              ].join('\n')}
            >
              <div className="flex gap-2 items-baseline flex-wrap">
                <span className="font-thin">thin</span>
                <span className="font-normal">normal</span>
                <span className="font-medium">medium</span>
                <span className="font-semibold">semibold</span>
                <span className="font-bold">bold</span>
                <span className="font-extrabold">extrabold</span>
              </div>
              <div className="flex gap-2 items-baseline flex-wrap">
                <span className="text-xs">xs</span>
                <span className="text-sm">sm</span>
                <span className="text-base">base</span>
                <span className="text-lg">lg</span>
                <span className="text-xl">xl</span>
                <span className="text-2xl">2xl</span>
                <span className="text-3xl">3xl</span>
                <span className="text-4xl">4xl</span>
              </div>
              <div
                className="flex flex-col gap-1 bg-slate-3 dark:bg-slate-9 text-black dark:text-white p-2"
                style={{ width: "160px" }}
              >
                <span className="text-left">text-left</span>
                <span className="text-center">text-center</span>
                <span className="text-right">text-right</span>
                <span className="text-justify">
                  text-justify text-justify text-justify
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="uppercase">uppercase</span>
                <span className="lowercase">LOWERCASE</span>
                <span className="capitalize">capitalize me</span>
                <span className="underline">underline</span>
                <span className="line-through">line-through</span>
                <span className="no-underline">no-underline</span>
              </div>
              <div
                className="truncate bg-slate-3 dark:bg-slate-9 text-black dark:text-white p-1"
                style={{ width: "120px" }}
              >
                truncate this very long line of text
              </div>
              <div className="flex gap-2">
                <span className="leading-8 bg-slate-3 dark:bg-slate-9 text-black dark:text-white p-1">
                  leading-8
                </span>
                <span className="tracking-[0.2em] bg-slate-3 dark:bg-slate-9 text-black dark:text-white p-1">
                  tracking-[0.2em]
                </span>
              </div>
            </Section>

            <Section
              id="typography-completeness"
              title="Typography Completeness"
              description={
                <>
                  <Code>italic</Code>, named <Code>leading-*</Code>/
                  <Code>tracking-*</Code> keyword scales, <Code>decoration-*</Code>,{" "}
                  <Code>underline-offset-*</Code>, <Code>indent-*</Code>,{" "}
                  <Code>text-wrap</Code> family, <Code>whitespace-*</Code>,{" "}
                  <Code>break-*</Code>, <Code>align-*</Code>, <Code>list-*</Code>,
                  and <Code>hyphens-*</Code>.
                </>
              }
              code={[
                '<span className="italic">...</span>',
                '<span className="underline decoration-wavy decoration-blue-6 decoration-4 underline-offset-4">...</span>',
                '<div className="text-balance">...</div>',
                '<div className="hyphens-auto">...</div>',
              ].join('\n')}
            >
              <div className="flex gap-2 items-baseline flex-wrap">
                <span className="italic">italic</span>
                <span className="not-italic">not-italic</span>
              </div>
              <div className="flex gap-2 items-baseline flex-wrap">
                <span className="leading-none bg-slate-3 dark:bg-slate-9 text-black dark:text-white p-1">
                  leading-none
                </span>
                <span className="leading-tight bg-slate-3 dark:bg-slate-9 text-black dark:text-white p-1">
                  leading-tight
                </span>
                <span className="leading-relaxed bg-slate-3 dark:bg-slate-9 text-black dark:text-white p-1">
                  leading-relaxed
                </span>
                <span className="leading-loose bg-slate-3 dark:bg-slate-9 text-black dark:text-white p-1">
                  leading-loose
                </span>
              </div>
              <div className="flex gap-2 items-baseline flex-wrap">
                <span className="tracking-tighter">tracking-tighter</span>
                <span className="tracking-normal">tracking-normal</span>
                <span className="tracking-widest">tracking-widest</span>
              </div>
              <div className="flex gap-2 items-baseline flex-wrap">
                <span
                  data-testid="decoration-demo"
                  className="underline decoration-wavy decoration-blue-6 decoration-4 underline-offset-4"
                >
                  decoration-wavy decoration-blue-6 decoration-4 underline-offset-4
                </span>
              </div>
              <div
                className="indent-8 bg-slate-3 dark:bg-slate-9 text-black dark:text-white p-1"
                style={{ width: "220px" }}
              >
                indent-8 this paragraph has an indented first line of text.
              </div>
              <div className="flex gap-2 flex-wrap">
                <span
                  data-testid="text-balance-demo"
                  className="text-balance bg-slate-3 dark:bg-slate-9 text-black dark:text-white p-1"
                  style={{ width: "160px", display: "inline-block" }}
                >
                  text-balance wraps this heading evenly
                </span>
                <span className="whitespace-nowrap bg-slate-3 dark:bg-slate-9 text-black dark:text-white p-1">
                  whitespace-nowrap does not wrap at all no matter how long
                </span>
              </div>
              <div
                className="break-all bg-slate-3 dark:bg-slate-9 text-black dark:text-white p-1"
                style={{ width: "100px" }}
              >
                break-all: supercalifragilisticexpialidocious
              </div>
              <div className="flex gap-2 items-baseline flex-wrap">
                <span>
                  base<span className="align-super text-xs">align-super</span>
                </span>
                <span>
                  base<span className="align-sub text-xs">align-sub</span>
                </span>
              </div>
              <ul className="list-disc list-inside flex flex-col gap-1">
                <li>list-disc</li>
                <li>list-inside</li>
              </ul>
              <div
                className="hyphens-auto bg-slate-3 dark:bg-slate-9 text-black dark:text-white p-1"
                style={{ width: "100px" }}
                lang="en"
              >
                hyphens-auto supercalifragilisticexpialidocious
              </div>
            </Section>

            <GroupHeading>Colors & Backgrounds</GroupHeading>

            <Section
              id="colors"
              title="Colors"
              description={
                <>
                  A sample of the 22-family palette, opacity composition (
                  <Code>bg-opacity-50</Code>/<Code>text-opacity-75</Code>),
                  arbitrary values (<Code>bg-[#16a34a]</Code>), a mode-aware theme
                  color (<Code>bg-surface</Code>, which actually changes hex value
                  across themes rather than just contrast), and the metals accent
                  set. These stay fixed across light/dark on purpose — the point is
                  showing off the exact color.
                </>
              }
              code={[
                '<div className="bg-red-6 text-white">...</div>',
                '<div className="bg-blue-6 bg-opacity-50 text-opacity-75">...</div>',
                '<div className="bg-[#16a34a]">...</div>',
                '<div className="bg-surface">...</div>',
                '<div className="bg-gold text-coal border-silver">...</div>',
              ].join('\n')}
            >
              <div className="flex gap-1 flex-wrap">
                <div className="bg-red-6 text-white p-1">red-6</div>
                <div className="bg-green-6 text-white p-1">green-6</div>
                <div className="bg-blue-6 border border-white p-1">blue-6</div>
                <div className="bg-violet-6 text-white p-1">violet-6</div>
                <div className="bg-amber-6 p-1">amber-6</div>
              </div>
              <div
                data-testid="opacity-box"
                className="bg-blue-6 bg-opacity-50 text-opacity-75 p-4"
              >
                opacity composition (bg-opacity-50, text-opacity-75)
              </div>
              <div data-testid="arbitrary-box" className="p-[37px] bg-[#16a34a]">
                arbitrary value
              </div>
              <div
                data-testid="mode-aware-box"
                className="bg-surface text-black dark:text-white p-4"
              >
                mode-aware color
              </div>
              <div
                data-testid="metals-box"
                className="bg-gold text-coal p-4 border-4 border-silver"
              >
                metals palette: gold/coal/silver/bronze/copper
              </div>
              <div className="flex gap-1">
                <div className="bg-bronze p-1 text-white">bronze</div>
                <div className="bg-copper p-1 text-white">copper</div>
              </div>
            </Section>

            <Section
              id="backgrounds"
              title="Backgrounds & Gradients"
              description={
                <>
                  Web-only. <Code>bg-position</Code>/<Code>-size</Code>/
                  <Code>-repeat</Code>/<Code>-attachment</Code>/<Code>-clip</Code>/
                  <Code>-origin</Code> keywords, and <Code>bg-linear-to-*</Code>/
                  <Code>bg-radial</Code>/<Code>bg-conic</Code> gradients composed
                  from <Code>from-*</Code>/<Code>via-*</Code>/<Code>to-*</Code>{" "}
                  color stops — Tailwind v4's gradient naming and stop-rebuild
                  technique, ported exactly.
                </>
              }
              code={[
                '<div className="bg-linear-to-r from-blue-6 via-green-6 to-red-6">...</div>',
                '<div className="bg-radial from-blue-6 to-red-6">...</div>',
                '<span className="bg-clip-text text-[transparent] bg-linear-to-r from-blue-6 to-red-6">...</span>',
              ].join('\n')}
            >
              <div className="flex gap-4 flex-wrap items-center">
                <div
                  data-testid="gradient-2-stop"
                  className="bg-linear-to-r from-blue-6 to-red-6"
                  style={{ width: "140px", height: "60px" }}
                />
                <div
                  data-testid="gradient-3-stop"
                  className="bg-linear-to-r from-blue-6 via-green-6 to-red-6"
                  style={{ width: "140px", height: "60px" }}
                />
                <div
                  data-testid="gradient-radial"
                  className="bg-radial from-blue-6 to-red-6"
                  style={{ width: "60px", height: "60px" }}
                />
                <div
                  data-testid="gradient-conic"
                  className="bg-conic from-blue-6 via-green-6 to-red-6"
                  style={{ width: "60px", height: "60px" }}
                />
              </div>
              <div className="flex gap-4 flex-wrap items-center">
                <div
                  data-testid="bg-position-size-box"
                  className="bg-cover bg-center bg-no-repeat"
                  style={{
                    width: "120px",
                    height: "80px",
                    backgroundImage:
                      "linear-gradient(45deg, #2563eb 25%, transparent 25%), linear-gradient(-45deg, #2563eb 25%, transparent 25%)",
                    backgroundColor: "#dbeafe",
                    backgroundSize: "20px 20px",
                  }}
                />
                <span className="bg-clip-text text-[transparent] bg-linear-to-r from-blue-6 to-red-6 font-bold text-2xl">
                  bg-clip-text
                </span>
              </div>
            </Section>

            <GroupHeading>Borders & Effects</GroupHeading>

            <Section
              id="borders"
              title="Borders"
              description={
                <>
                  Widths, styles, named colors, arbitrary widths, the full{" "}
                  <Code>rounded-*</Code> radius scale, <Code>ring</Code>, and{" "}
                  <Code>outline</Code>.
                </>
              }
              code={[
                '<div className="border-2 border-dashed">...</div>',
                '<div className="border border-red-6 rounded-xl">...</div>',
                '<div className="ring">...</div>',
              ].join('\n')}
            >
              <div className="flex gap-2 flex-wrap">
                <div className="border p-1">border</div>
                <div className="border-2 border-dashed p-1">
                  border-2 border-dashed
                </div>
                <div className="border-dotted p-1">border-dotted</div>
                <div className="border-none p-1">border-none</div>
                <div className="border border-red-6 p-1">border-red-6</div>
                <div className="border-[3px] p-1">border-[3px]</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <div className="rounded-none border p-1">none</div>
                <div className="rounded-sm border p-1">sm</div>
                <div className="rounded-md border p-1">md</div>
                <div className="rounded-lg border p-1">lg</div>
                <div className="rounded-xl border p-1">xl</div>
                <div className="rounded-2xl border p-1">2xl</div>
                <div className="rounded-3xl border p-1">3xl</div>
                <div className="rounded-full border p-1">full</div>
              </div>
              <div className="flex gap-2">
                <div className="ring p-1">ring</div>
                <div className="outline p-1">outline</div>
                <div className="outline-none border p-1">outline-none</div>
              </div>
            </Section>

            <Section
              id="effects"
              title="Effects"
              description={
                <>
                  <Code>shadow-*</Code>, <Code>opacity-*</Code>,{" "}
                  <Code>transition</Code>/<Code>duration</Code>/<Code>delay</Code>/
                  <Code>ease-*</Code>, <Code>cursor-*</Code>, <Code>select-*</Code>,
                  and <Code>pointer-events-*</Code>. <Code>shadow-*</Code> is a
                  real multi-layer scale — <Code>sm</Code>/<Code>DEFAULT</Code>/
                  <Code>md</Code>/<Code>lg</Code>/<Code>xl</Code>/<Code>2xl</Code>{" "}
                  each pair a tight, higher-opacity "contact" layer with a soft,
                  wide "ambient" one (plus <Code>shadow-inner</Code> for an inset
                  shadow), the same technique real elevation shadows use — not a
                  single flat <Code>rgba(...)</Code> blur. That still can't fix
                  simple physics, though: a black shadow genuinely has no
                  contrast against a near-black background. Each box below
                  pairs a lighter <Code>dark:bg-slate-7</Code> surface (so it
                  visibly lifts off the page) with a stronger{" "}
                  <Code>dark:shadow-[...]</Code> tuned per tier — the standard
                  fix for dark-mode elevation, in Kbach same as anywhere else.
                </>
              }
              code={[
                '<div className="shadow-lg dark:shadow-[0_4px_8px_rgba(0,0,0,0.7)]">...</div>',
                '<div className="shadow-inner dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">...</div>',
                '<div className="transition duration-300 delay-150 ease-in-out hover:bg-red-6">...</div>',
                '<span className="cursor-pointer select-none">...</span>',
              ].join('\n')}
            >
              <div className="flex gap-2 flex-wrap">
                <div className="shadow-sm dark:shadow-[0_1px_2px_rgba(0,0,0,0.7),0_1px_3px_rgba(0,0,0,0.4)] bg-white dark:bg-slate-7 p-2">
                  shadow-sm
                </div>
                <div className="shadow dark:shadow-[0_2px_4px_rgba(0,0,0,0.7),0_8px_12px_rgba(0,0,0,0.5)] bg-white dark:bg-slate-7 p-2">
                  shadow
                </div>
                <div className="shadow-md dark:shadow-[0_3px_6px_rgba(0,0,0,0.7),0_12px_20px_rgba(0,0,0,0.5)] bg-white dark:bg-slate-7 p-2">
                  shadow-md
                </div>
                <div className="shadow-lg dark:shadow-[0_4px_8px_rgba(0,0,0,0.7),0_16px_28px_rgba(0,0,0,0.55)] bg-white dark:bg-slate-7 p-2">
                  shadow-lg
                </div>
                <div className="shadow-xl dark:shadow-[0_8px_16px_rgba(0,0,0,0.75),0_24px_40px_rgba(0,0,0,0.6)] bg-white dark:bg-slate-7 p-2">
                  shadow-xl
                </div>
                <div className="shadow-2xl dark:shadow-[0_12px_24px_rgba(0,0,0,0.8),0_32px_64px_rgba(0,0,0,0.65)] bg-white dark:bg-slate-7 p-2">
                  shadow-2xl
                </div>
                <div className="shadow-inner dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] bg-white dark:bg-slate-7 p-2">
                  shadow-inner
                </div>
                <div className="shadow-none bg-white dark:bg-slate-7 p-2">
                  shadow-none
                </div>
                <div className="shadow-[0_0_10px_red] bg-white dark:bg-slate-7 p-2">
                  arbitrary shadow
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <div className="opacity-25 bg-red-6 p-2 text-white">opacity-25</div>
                <div className="opacity-75 bg-red-6 p-2 text-white">opacity-75</div>
              </div>
              <div className="transition duration-300 delay-150 ease-in-out hover:bg-red-6 bg-slate-4 dark:bg-slate-8 p-2">
                transition duration-300 delay-150 ease-in-out (hover me)
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="cursor-pointer bg-slate-3 dark:bg-slate-9 p-1">
                  cursor-pointer
                </span>
                <span className="cursor-default bg-slate-3 dark:bg-slate-9 p-1">
                  cursor-default
                </span>
                <span className="cursor-not-allowed bg-slate-3 dark:bg-slate-9 p-1">
                  cursor-not-allowed
                </span>
                <span className="cursor-wait bg-slate-3 dark:bg-slate-9 p-1">
                  cursor-wait
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="select-none bg-slate-3 dark:bg-slate-9 p-1">
                  select-none
                </span>
                <span className="select-text bg-slate-3 dark:bg-slate-9 p-1">
                  select-text
                </span>
                <span className="select-all bg-slate-3 dark:bg-slate-9 p-1">
                  select-all
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  className="pointer-events-none bg-slate-4 dark:bg-slate-8 p-1"
                  onClick={() => alert("should never fire")}
                >
                  pointer-events-none
                </button>
                <button
                  className="pointer-events-auto bg-slate-4 dark:bg-slate-8 p-1"
                  onClick={() => {}}
                >
                  pointer-events-auto
                </button>
              </div>
            </Section>

            <Section
              id="effects-completeness"
              title="Effects Completeness"
              description={
                <>
                  <Code>text-shadow-*</Code>, <Code>mix-blend-*</Code>/
                  <Code>bg-blend-*</Code>, a real composable <Code>ring</Code>/
                  <Code>ring-offset-*</Code> (CSS variables + <Code>calc()</Code>,
                  not a single hardcoded value), and <Code>animate-*</Code> with
                  real emitted <Code>@keyframes</Code> blocks.
                </>
              }
              code={[
                '<span className="text-shadow-lg">...</span>',
                '<div className="mix-blend-multiply">...</div>',
                '<div className="ring-4 ring-blue-6 ring-offset-4 ring-offset-red-6">...</div>',
                '<div className="animate-spin">...</div>',
              ].join('\n')}
            >
              <div className="flex gap-4 flex-wrap items-center">
                <span
                  data-testid="text-shadow-demo"
                  className="text-shadow-lg text-2xl font-bold bg-slate-8 text-white p-2"
                >
                  text-shadow-lg
                </span>
              </div>
              <div className="flex gap-4 flex-wrap items-center">
                <div
                  data-testid="mix-blend-demo"
                  className="relative"
                  style={{ width: "140px", height: "80px" }}
                >
                  <div className="bg-yellow-5 absolute" style={{ inset: 0 }} />
                  <div
                    className="mix-blend-multiply bg-blue-6 absolute"
                    style={{
                      top: "20px",
                      left: "20px",
                      right: "0px",
                      bottom: "0px",
                    }}
                  />
                </div>
              </div>
              <div className="flex gap-6 flex-wrap items-center">
                <div
                  data-testid="ring-demo"
                  className="ring ring-blue-6 bg-slate-1 p-4"
                  style={{ width: "60px", height: "60px" }}
                />
                <div
                  data-testid="ring-offset-demo"
                  className="ring-4 ring-blue-6 ring-offset-4 ring-offset-red-6 bg-slate-1 p-4"
                  style={{ width: "60px", height: "60px" }}
                />
              </div>
              <div className="flex gap-6 flex-wrap items-center">
                <div
                  data-testid="animate-spin-demo"
                  className="animate-spin bg-blue-6 rounded-full"
                  style={{ width: "24px", height: "24px" }}
                />
                <div
                  data-testid="animate-ping-demo"
                  className="animate-ping bg-red-6 rounded-full"
                  style={{ width: "24px", height: "24px" }}
                />
                <div
                  data-testid="animate-pulse-demo"
                  className="animate-pulse bg-green-6 rounded-full"
                  style={{ width: "24px", height: "24px" }}
                />
                <div
                  data-testid="animate-bounce-demo"
                  className="animate-bounce bg-amber-6 rounded-full"
                  style={{ width: "24px", height: "24px" }}
                />
              </div>
            </Section>

            <Section
              id="divide"
              title="Divide & Space"
              description={
                <>
                  <Code>divide-x</Code>/<Code>divide-y</Code> add a border between
                  children via a child combinator, not the element itself;{" "}
                  <Code>space-x-*</Code> does the same with margins.
                </>
              }
              code={[
                '<div className="divide-x divide-color-slate-6">...</div>',
                '<div className="flex space-x-4">...</div>',
              ].join('\n')}
            >
              <div
                data-testid="divide-box"
                className="divide-x divide-color-slate-6 dark:divide-color-slate-7"
              >
                <span data-testid="divide-child-1" className="p-1">
                  a
                </span>
                <span data-testid="divide-child-2" className="p-1">
                  b
                </span>
              </div>
              <div
                className="divide-y divide-color-slate-6 dark:divide-color-slate-7 flex flex-col"
                style={{ width: "80px" }}
              >
                <span className="p-1">row1</span>
                <span className="p-1">row2</span>
              </div>
              <div className="flex space-x-4">
                <span className="bg-slate-4 dark:bg-slate-8 p-1">space-x-4</span>
                <span className="bg-slate-4 dark:bg-slate-8 p-1">item</span>
              </div>
            </Section>

            <GroupHeading>Transforms & Filters</GroupHeading>

            <Section
              id="transforms"
              title="Transforms"
              description={
                <>
                  Web-only. <Code>scale-*</Code>/<Code>scale-x-*</Code>/
                  <Code>scale-y-*</Code>, <Code>rotate-*</Code>,{" "}
                  <Code>translate-x-*</Code>/<Code>translate-y-*</Code>,{" "}
                  <Code>skew-x-*</Code>/<Code>skew-y-*</Code>, and{" "}
                  <Code>origin-*</Code> — each sets its own CSS variable and
                  composes into a single <Code>transform</Code>, so multiple
                  transform utilities on the same element stack instead of one
                  clobbering the other (the box below combines{" "}
                  <Code>scale-110</Code>, <Code>rotate-12</Code>, and{" "}
                  <Code>translate-x-4</Code> at once).
                </>
              }
              code={[
                '<div className="scale-125">...</div>',
                '<div className="rotate-45">...</div>',
                '<div className="scale-110 rotate-12 translate-x-4">...</div>',
              ].join('\n')}
            >
              <div className="flex gap-8 items-center" style={{ height: "100px" }}>
                <div
                  data-testid="scale-box"
                  className="scale-125 bg-cyan-6 p-2"
                  style={{ width: "60px" }}
                >
                  scale-125
                </div>
                <div
                  data-testid="rotate-box"
                  className="rotate-45 bg-teal-6 p-2"
                  style={{ width: "60px" }}
                >
                  rotate-45
                </div>
                <div
                  data-testid="skew-box"
                  className="skew-x-12 bg-indigo-6 p-2"
                  style={{ width: "60px" }}
                >
                  skew-x-12
                </div>
                <div
                  data-testid="composed-box"
                  className="scale-110 rotate-12 translate-x-4 bg-violet-6 p-2"
                  style={{ width: "80px" }}
                >
                  composed
                </div>
              </div>
            </Section>

            <Section
              id="filters"
              title="Filters"
              description={
                <>
                  Web-only. <Code>blur-*</Code>, <Code>brightness-*</Code>/
                  <Code>contrast-*</Code>/<Code>saturate-*</Code>,{" "}
                  <Code>grayscale</Code>/<Code>invert</Code>/<Code>sepia</Code> (+{" "}
                  <Code>-0</Code> to disable), <Code>hue-rotate-*</Code>,{" "}
                  <Code>drop-shadow-*</Code>, and every <Code>backdrop-*</Code>{" "}
                  variant — composed via CSS variables the same way as{" "}
                  <Code>transform</Code>, so <Code>blur-sm grayscale</Code> stack on
                  one element instead of clobbering.
                </>
              }
              code={[
                '<div className="blur-sm grayscale">...</div>',
                '<div className="backdrop-blur-md">...</div>',
              ].join('\n')}
            >
              <div className="flex gap-4 flex-wrap items-center">
                <div
                  data-testid="filter-none-box"
                  className="bg-[#16a34a] p-4 text-white"
                  style={{ width: "90px" }}
                >
                  none
                </div>
                <div
                  data-testid="blur-box"
                  className="blur-sm bg-[#16a34a] p-4 text-white"
                  style={{ width: "90px" }}
                >
                  blur-sm
                </div>
                <div
                  data-testid="grayscale-box"
                  className="grayscale bg-[#16a34a] p-4 text-white"
                  style={{ width: "90px" }}
                >
                  grayscale
                </div>
                <div
                  data-testid="invert-box"
                  className="invert bg-[#16a34a] p-4 text-white"
                  style={{ width: "90px" }}
                >
                  invert
                </div>
                <div
                  data-testid="sepia-box"
                  className="sepia bg-[#16a34a] p-4 text-white"
                  style={{ width: "90px" }}
                >
                  sepia
                </div>
                <div
                  data-testid="composed-filter-box"
                  className="blur-sm grayscale bg-[#16a34a] p-4 text-white"
                  style={{ width: "90px" }}
                >
                  blur+gray
                </div>
              </div>
              <div className="relative" style={{ height: "90px", width: "220px" }}>
                <div
                  className="bg-[#ef4444] p-2 text-white"
                  style={{ position: "absolute", inset: 0 }}
                >
                  background content behind the glass panel
                </div>
                <div
                  data-testid="backdrop-blur-box"
                  className="backdrop-blur-md p-2 text-white"
                  style={{
                    position: "absolute",
                    top: "20px",
                    left: "20px",
                    right: "20px",
                    bottom: "0px",
                    background: "rgba(255,255,255,0.15)",
                  }}
                >
                  backdrop-blur-md
                </div>
              </div>
            </Section>

            <GroupHeading>Interactivity & Variants</GroupHeading>

            <Section
              id="interactivity-sizing"
              title="Interactivity & Sizing"
              description={
                <>
                  <Code>caret-*</Code>/<Code>accent-*</Code>/
                  <Code>fill-*</Code>/<Code>stroke-*</Code>, <Code>resize-*</Code>/
                  <Code>touch-*</Code>/<Code>will-change-*</Code>,{" "}
                  <Code>size-*</Code> and fraction widths (<Code>w-1/3</Code>), and{" "}
                  <Code>scroll-*</Code>/<Code>snap-*</Code>.
                </>
              }
              code={[
                '<input className="caret-red-6 accent-red-6" type="range" />',
                '<div className="size-8">...</div>',
                '<div className="w-1/3">...</div>',
                '<div className="snap-x snap-mandatory">...</div>',
              ].join('\n')}
            >
              <div className="flex gap-4 flex-wrap items-center">
                <input
                  data-testid="caret-accent-demo"
                  className="caret-red-6 accent-red-6"
                  type="range"
                  defaultValue={50}
                />
                <textarea
                  data-testid="resize-demo"
                  className="resize-y bg-slate-3 p-2"
                  defaultValue="resize-y"
                  style={{ width: "140px", height: "50px" }}
                />
              </div>
              <div className="flex gap-4 flex-wrap items-center">
                <svg
                  data-testid="svg-fill-stroke-demo"
                  width="48"
                  height="48"
                  viewBox="0 0 48 48"
                >
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    className="fill-blue-6 stroke-red-6 stroke-width-2"
                  />
                </svg>
              </div>
              <div className="flex gap-4 flex-wrap items-center">
                <div data-testid="size-demo" className="size-8 bg-green-6" />
                <div
                  data-testid="w-fraction-demo"
                  className="flex bg-slate-3"
                  style={{ width: "180px" }}
                >
                  <div data-testid="w-1-3-box" className="w-1/3 bg-blue-6 h-8" />
                  <div className="w-2/3 bg-red-6 h-8" />
                </div>
              </div>
              <div
                data-testid="scroll-snap-demo"
                className="snap-x snap-mandatory flex gap-2 overflow-hidden"
                style={{ width: "180px", height: "50px" }}
              >
                <div
                  className="snap-start bg-blue-6 shrink-0"
                  style={{ width: "160px" }}
                />
                <div
                  className="snap-start bg-red-6 shrink-0"
                  style={{ width: "160px" }}
                />
              </div>
            </Section>

            <Section
              id="variant-system"
              title="Variant System"
              description={
                <>
                  Parameterized modifiers: <Code>has-[...]</Code>,{" "}
                  <Code>data-[...]</Code>/<Code>aria-[...]</Code>,{" "}
                  <Code>not-*</Code>, <Code>first</Code>/<Code>last</Code>/
                  <Code>odd</Code>/<Code>even</Code>, and generalized{" "}
                  <Code>group-*</Code> beyond the hardcoded hover/focus (e.g.{" "}
                  <Code>group-active</Code>).
                </>
              }
              code={[
                '<li className="first:bg-blue-6 odd:bg-slate-3 even:bg-slate-1">...</li>',
                '<label className="has-[input:checked]:bg-green-6">...</label>',
                '<span className="group-active:text-red-6">...</span>',
                '<div className="data-[state=open]:bg-green-6">...</div>',
              ].join('\n')}
            >
              <ul className="flex flex-col gap-1" style={{ width: "160px" }}>
                <li
                  data-testid="li-1"
                  className="first:bg-blue-6 odd:bg-slate-3 even:bg-slate-1 p-1"
                >
                  item 1 (first, odd)
                </li>
                <li
                  data-testid="li-2"
                  className="odd:bg-slate-3 even:bg-slate-1 p-1"
                >
                  item 2 (even)
                </li>
                <li
                  data-testid="li-3"
                  className="odd:bg-slate-3 even:bg-slate-1 p-1"
                >
                  item 3 (odd)
                </li>
                <li
                  data-testid="li-4"
                  className="last:bg-red-6 odd:bg-slate-3 even:bg-slate-1 p-1"
                >
                  item 4 (last, even)
                </li>
              </ul>
              <div className="flex gap-4 flex-wrap items-center">
                <label
                  data-testid="has-demo"
                  className="has-[input:checked]:bg-green-6 bg-slate-3 p-2 flex gap-2 items-center"
                >
                  <input type="checkbox" defaultChecked />
                  has-[input:checked]
                </label>
                <button
                  data-testid="group-active-demo"
                  className="group bg-slate-3 p-2"
                >
                  <span className="group-active:text-red-6 text-slate-9">
                    group-active (press me)
                  </span>
                </button>
              </div>
              <div className="flex gap-4 flex-wrap items-center">
                <div
                  data-testid="data-state-demo"
                  data-state="open"
                  className="data-[state=open]:bg-green-6 bg-slate-3 p-2"
                >
                  data-[state=open]
                </div>
                <span
                  data-testid="not-hover-demo"
                  className="not-hover:opacity-50 bg-slate-3 p-2"
                >
                  not-hover:opacity-50
                </span>
              </div>
            </Section>

            <Section
              id="modifiers"
              title="Modifiers"
              description={
                <>
                  Every pseudo-class (<Code>hover:</Code>/<Code>focus:</Code>/
                  <Code>disabled:</Code>/<Code>checked:</Code>/...), ancestor and
                  sibling state (<Code>group-hover:</Code>/<Code>peer-hover:</Code>
                  ), and media-query modifier (<Code>motion-safe:</Code>/
                  <Code>print:</Code>). Try hovering, focusing, and checking the
                  controls below.
                </>
              }
              code={[
                '<button className="hover:bg-red-6 focus-visible:bg-red-6">...</button>',
                '<span className="group-hover:bg-red-6">...</span>',
                '<span className="peer-hover:bg-red-6 peer-focus:bg-green-6">...</span>',
                '<span className="motion-safe:transition print:hidden">...</span>',
              ].join('\n')}
            >
              <div className="flex gap-2 flex-wrap">
                <button className="bg-slate-4 dark:bg-slate-8 hover:bg-red-6 p-1">
                  hover:
                </button>
                <button className="bg-slate-4 dark:bg-slate-8 focus:bg-red-6 p-1">
                  focus:
                </button>
                <button className="bg-slate-4 dark:bg-slate-8 focus-visible:bg-red-6 p-1">
                  focus-visible:
                </button>
                <input
                  className="bg-slate-4 dark:bg-slate-8 focus-within:bg-red-6 p-1"
                  placeholder="focus-within:"
                />
                <button className="bg-slate-4 dark:bg-slate-8 active:bg-red-6 p-1">
                  active:
                </button>
                <a
                  href="#modifiers"
                  className="bg-slate-4 dark:bg-slate-8 visited:bg-violet-6 p-1"
                >
                  visited:
                </a>
                <button
                  disabled
                  className="bg-slate-4 dark:bg-slate-8 disabled:bg-slate-8 dark:disabled:bg-slate-6 p-1"
                >
                  disabled:
                </button>
                <label className="flex items-center gap-1 bg-slate-4 dark:bg-slate-8 p-1">
                  <input type="checkbox" className="checked:bg-red-6" />
                  checked:
                </label>
              </div>
              <div className="group bg-slate-3 dark:bg-slate-9 p-2">
                <span className="bg-slate-4 dark:bg-slate-8 group-hover:bg-red-6 p-1">
                  group-hover:
                </span>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  className="peer bg-slate-4 dark:bg-slate-8 p-1"
                  placeholder="peer"
                />
                <span className="bg-slate-4 dark:bg-slate-8 peer-hover:bg-red-6 peer-focus:bg-green-6 p-1">
                  peer-hover:/peer-focus:
                </span>
              </div>
              <div className="flex gap-2">
                <span className="motion-safe:transition bg-slate-4 dark:bg-slate-8 p-1">
                  motion-safe:
                </span>
                <span className="motion-reduce:transition-none bg-slate-4 dark:bg-slate-8 p-1">
                  motion-reduce:
                </span>
                <span className="print:hidden bg-slate-4 dark:bg-slate-8 p-1">
                  print: (hidden when printed)
                </span>
              </div>
            </Section>

            <Section
              id="dynamic-styling"
              title="Dynamic & Combined Styling"
              description={
                <>
                  Kbach utility <Code>className</Code> strings are just
                  strings — no <Code>clsx()</Code>/<Code>cva()</Code>-style
                  composition API needed. The box below computes its
                  className from React state on every render (cycling
                  through colors), and the one after it merges several
                  independent toggles into a single combined className via
                  plain array/string composition.
                </>
              }
              code={[
                "const color = colors[colorIndex];",
                'const className = "bg-" + color + "-6 text-white p-4";',
                '',
                'const classes = ["bg-blue-6", "text-white", "p-4"];',
                'if (bold) classes.push("font-bold");',
                'if (rounded) classes.push("rounded-xl");',
                'if (shadow) classes.push("shadow-lg");',
                'const combined = classes.join(" ");',
              ].join('\n')}
            >
              <DynamicStylingDemo />
            </Section>

            <GroupHeading>Theming</GroupHeading>

            <Section
              id="theme-provider"
              title="Theme Provider"
              description={
                <>
                  The header's own light/dark toggle above uses{" "}
                  <Code>useGlobalDarkMode()</Code>/
                  <Code>toggleGlobalDarkMode()</Code> — no{" "}
                  <Code>&lt;ThemeProvider&gt;</Code> anywhere in the tree. This
                  section instead wraps a subtree in{" "}
                  <Code>&lt;ThemeProvider&gt;</Code> and reads it via{" "}
                  <Code>useTheme()</Code> (<Code>mode</Code>/<Code>isDark</Code>/
                  <Code>setMode</Code>/<Code>toggle</Code>) — both read and write
                  the exact same global store, so toggling either one updates
                  the other instantly.
                </>
              }
              code={[
                "import { ThemeProvider, useTheme } from '@kbach/react';",
                '',
                'function Demo() {',
                '  const { mode, isDark, setMode, toggle } = useTheme();',
                '  return <button onClick={toggle}>{mode}</button>;',
                '}',
                '',
                '<ThemeProvider>',
                '  <Demo />',
                '</ThemeProvider>',
              ].join('\n')}
            >
              <ThemeProvider>
                <ThemeProviderDemo />
              </ThemeProvider>
            </Section>

            <GroupHeading>Responsive</GroupHeading>

            <Section
              id="responsive"
              title="Responsive"
              description={
                <>
                  <Code>sm:</Code>/<Code>md:</Code>/<Code>lg:</Code>/
                  <Code>xl:</Code>/<Code>2xl:</Code> — resize the window to see each
                  breakpoint kick in.
                </>
              }
              code={[
                '<div className="hidden sm:block sm:text-lg">...</div>',
                '<div className="md:bg-green-4 lg:bg-blue-4 xl:bg-violet-4 2xl:bg-red-4">...</div>',
              ].join('\n')}
            >
              <div
                data-testid="responsive-box"
                className="hidden sm:block sm:text-lg"
              >
                hidden below sm, block at/above sm
              </div>
              <div className="bg-slate-3 dark:bg-slate-9 p-2 md:bg-green-4 lg:bg-blue-4 xl:bg-violet-4 2xl:bg-red-4">
                slate below md, green at md, blue at lg, violet at xl, red at 2xl
              </div>
            </Section>
          </div>

          <footer className="flex items-center justify-between gap-4 pt-8 mt-4 border-t border-slate-3 dark:border-slate-9 text-xs text-slate-8 dark:text-slate-5">
            <span>Kbach — Rust/WASM utility-first styling engine.</span>
            <span>Every utility on this page is real, generated CSS.</span>
          </footer>

          {/* Deliberate typo — Phase 6 verification: should produce a build-time
              [kbach] warning in the dev server's terminal output, not the browser. */}
          <div data-testid="typo-box" className="bg-blu-6">
            typo check
          </div>
        </main>
      </div>
    </div>
  );
}
