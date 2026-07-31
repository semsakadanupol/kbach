import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTheme } from '@kbach/react';

const NAV_GROUPS = [
  {
    label: 'Guides',
    links: [
      { to: '/', label: 'Home', end: true },
      { to: '/web', label: 'Web setup' },
      { to: '/native', label: 'Native setup' },
      { to: '/cli', label: 'create-kbach CLI' },
    ],
  },
  {
    label: 'Reference',
    links: [
      { to: '/reference/web', label: 'Reference — web' },
      { to: '/reference/native', label: 'Reference — native' },
    ],
  },
];

const GROUP_LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-gray-6 dark:text-gray-5';

function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-lg p-2 text-lg leading-none text-gray-8 dark:text-gray-4 hover:bg-gray-2 dark:hover:bg-gray-9 transition-colors"
    >
      <span aria-hidden="true">{isDark ? '☀️' : '🌙'}</span>
    </button>
  );
}

function Logo() {
  return (
    <span className="flex items-center gap-2 text-lg font-bold text-gray-11 dark:text-white">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-6 text-sm text-white">K</span>
      Kbach
    </span>
  );
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav className="space-y-6">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className={GROUP_LABEL_CLASS + ' mb-2 px-3'}>{group.label}</p>
          <div className="space-y-1">
            {group.links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  isActive
                    ? 'block rounded-lg px-3 py-2 text-sm font-medium bg-blue-1 dark:bg-blue-11 text-blue-8 dark:text-blue-3'
                    : 'block rounded-lg px-3 py-2 text-sm font-medium text-gray-8 dark:text-gray-4 hover:bg-gray-2 dark:hover:bg-gray-9'
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  // Route changes are the only reliable "navigation happened" signal for a
  // drawer closed via NavLink's own onClick — a hash-only jump (TOC link,
  // in-page anchor) shouldn't also close it, so this only fires on an actual
  // pathname change, not every location update.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Body scroll must be locked while the drawer covers the screen — otherwise
  // the page behind it scrolls along with a touch-drag on mobile Safari/Chrome.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mobileNavOpen]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-11">
      {/* Persistent header — present at every width, unlike the old mobile-only bar,
          so the logo/theme toggle never have to live in two places at once. */}
      <header className="sticky top-0 z-40 border-b border-gray-2 dark:border-gray-9 bg-white/80 dark:bg-gray-11/80 backdrop-blur">
        <div className="mx-auto max-w-[90rem] flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileNavOpen}
              className="lg:hidden rounded-lg p-2 text-gray-9 dark:text-gray-3 hover:bg-gray-2 dark:hover:bg-gray-9"
            >
              <span aria-hidden="true" className="text-xl leading-none">{mobileNavOpen ? '✕' : '☰'}</span>
            </button>
            <NavLink to="/"><Logo /></NavLink>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-[90rem] lg:flex">
        {/* Backdrop — mobile/tablet only, sits below the header (still reachable)
            but above page content, closing the drawer on outside click. */}
        {mobileNavOpen && (
          <div
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
            className="lg:hidden fixed inset-x-0 bottom-0 top-14 z-30 bg-black/50"
          />
        )}

        <aside
          className={
            'fixed lg:sticky top-14 left-0 z-30 h-[calc(100dvh-3.5rem)] w-72 lg:w-64 shrink-0 border-r border-gray-2 dark:border-gray-9 bg-white dark:bg-gray-11 p-4 overflow-y-auto flex flex-col transition-transform lg:transition-none lg:translate-x-0 ' +
            (mobileNavOpen ? 'translate-x-0' : 'translate-x-[-100%]')
          }
        >
          <Sidebar onNavigate={() => setMobileNavOpen(false)} />
        </aside>

        <main className="flex-1 min-w-0 px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">{children}</main>
      </div>
    </div>
  );
}
