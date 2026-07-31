import { useEffect, useState } from 'react';

export interface TocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Extract h2/h3 headings (with the ids rehype-slug already assigned) from a rendered container. */
export function collectHeadings(container: HTMLElement): TocHeading[] {
  const nodes = container.querySelectorAll<HTMLHeadingElement>('h2[id], h3[id]');
  return Array.from(nodes).map((el) => ({
    id: el.id,
    text: el.textContent ?? '',
    level: el.tagName === 'H2' ? 2 : 3,
  }));
}

/** Only shown at xl+ — narrower viewports get the anchors via in-page scrolling instead. */
export function TableOfContents({ headings }: { headings: TocHeading[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (headings.length === 0) return;

    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    // Treat a heading as "active" once it crosses into the top 30% of the
    // viewport — matches where a reader's eye actually is, rather than
    // waiting for a heading to hit the very top edge (which never fires for
    // the last heading on a short page).
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav
      aria-label="On this page"
      className="hidden xl:block w-64 shrink-0 sticky top-20 self-start max-h-[calc(100dvh-6rem)] overflow-y-auto border-l border-gray-2 dark:border-gray-9 pl-5"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-6 dark:text-gray-5 mb-3">
        On this page
      </p>
      <ul className="space-y-0.5 text-sm">
        {headings.map((h) => {
          const isActive = activeId === h.id;
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                className={
                  (h.level === 3 ? 'pl-6 ' : 'pl-2 ') +
                  'block rounded-md py-1.5 pr-2 transition-colors ' +
                  (isActive
                    ? 'bg-blue-1 dark:bg-blue-11 text-blue-8 dark:text-blue-3 font-medium'
                    : 'text-gray-8 dark:text-gray-4 hover:bg-gray-2 dark:hover:bg-gray-9 hover:text-gray-11 dark:hover:text-white')
                }
              >
                {h.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
