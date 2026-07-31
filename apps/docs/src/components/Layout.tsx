import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useTheme } from '@kbach/react';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/web', label: 'Web setup' },
  { to: '/native', label: 'Native setup' },
  { to: '/cli', label: 'create-kbach CLI' },
  { to: '/reference/web', label: 'Reference — web' },
  { to: '/reference/native', label: 'Reference — native' },
];

function navLinkClass(isActive: boolean): string {
  return isActive
    ? 'block rounded-lg px-3 py-2 text-sm font-medium bg-blue-1 dark:bg-blue-11 text-blue-8 dark:text-blue-3'
    : 'block rounded-lg px-3 py-2 text-sm font-medium text-gray-8 dark:text-gray-4 hover:bg-gray-2 dark:hover:bg-gray-9';
}

function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="w-full rounded-lg px-3 py-2 text-sm font-medium text-gray-8 dark:text-gray-4 hover:bg-gray-2 dark:hover:bg-gray-9 text-left"
      aria-label="Toggle dark mode"
    >
      {isDark ? '☀️ Light mode' : '🌙 Dark mode'}
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-11 flex">
      <aside className="w-64 shrink-0 border-r border-gray-2 dark:border-gray-9 p-4 sticky top-0 h-screen overflow-y-auto flex flex-col">
        <NavLink to="/" className="flex items-center gap-2 px-3 py-2 mb-4">
          <span className="text-xl font-bold text-gray-11 dark:text-white">Kbach</span>
        </NavLink>
        <nav className="flex-1 space-y-1">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => navLinkClass(isActive)}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <ThemeToggle />
      </aside>
      <main className="flex-1 px-8 py-10 md:px-12">{children}</main>
    </div>
  );
}
