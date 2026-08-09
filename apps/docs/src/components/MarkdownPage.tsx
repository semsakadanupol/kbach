import { useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeHighlight from 'rehype-highlight';
import { Link, useLocation } from 'react-router-dom';
import type { Components } from 'react-markdown';
import { collectHeadings, TableOfContents, type TocHeading } from './TableOfContents';

// Cross-references inside the SOURCE .md files point at sibling .md files
// (e.g. packages/ui/README.md links to "./kbach-ui.md") — those paths
// don't exist as routes on the site. Mapped here to the actual route that
// renders each target file, so in-doc navigation keeps working instead of
// silently 404ing. Anchor-only links (#some-heading) need no rewrite —
// rehype-slug below generates the same ids GitHub does, which is what these
// links were written against.
const LINK_REWRITES: Record<string, string> = {
  './kbach-ui.md': '/reference/web',
  'kbach-ui.md': '/reference/web',
  '../ui/README.md': '/web',
};

function rewriteHref(href: string): string | null {
  if (href in LINK_REWRITES) return LINK_REWRITES[href]!;
  return null;
}

// Anchor targets need breathing room above them so a jumped-to heading isn't
// flush against (or hidden under) the mobile sticky header — applies at every
// width since the extra space is harmless on desktop, where there's no sticky
// header to clear.
const HEADING_SCROLL_MARGIN = { scrollMarginTop: '5rem' };

function CodeBlock({ children }: { children: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = preRef.current?.textContent ?? '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="group relative mb-4">
      <pre ref={preRef} className="bg-gray-11 dark:bg-black rounded-lg p-4 overflow-x-auto text-sm">
        {children}
      </pre>
      <button
        onClick={handleCopy}
        aria-label="Copy code to clipboard"
        className="absolute top-2 right-2 rounded-md px-2 py-1 text-xs font-medium text-gray-3 bg-gray-9 hover:bg-gray-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

const components: Components = {
  h1: ({ children }) => <h1 style={HEADING_SCROLL_MARGIN} className="text-3xl font-bold text-gray-11 dark:text-white mt-8 mb-4 first:mt-0">{children}</h1>,
  h2: ({ id, children }) => <h2 id={id} style={HEADING_SCROLL_MARGIN} className="text-2xl font-bold text-gray-11 dark:text-white mt-10 mb-3 pb-2 border-b border-gray-3 dark:border-gray-8">{children}</h2>,
  h3: ({ id, children }) => <h3 id={id} style={HEADING_SCROLL_MARGIN} className="text-lg font-semibold text-gray-11 dark:text-white mt-6 mb-2">{children}</h3>,
  h4: ({ children }) => <h4 style={HEADING_SCROLL_MARGIN} className="text-base font-semibold text-gray-10 dark:text-gray-2 mt-4 mb-2">{children}</h4>,
  p: ({ children }) => <p className="text-gray-9 dark:text-gray-3 leading-relaxed mb-4">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-6 mb-4 text-gray-9 dark:text-gray-3 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 text-gray-9 dark:text-gray-3 space-y-1">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="border-l-4 border-blue-6 pl-4 italic text-gray-8 dark:text-gray-4 mb-4">{children}</blockquote>,
  table: ({ children }) => <div className="overflow-x-auto mb-4"><table className="w-full text-sm border-collapse">{children}</table></div>,
  th: ({ children }) => <th className="text-left font-semibold text-gray-10 dark:text-gray-2 border-b-2 border-gray-3 dark:border-gray-8 px-3 py-2">{children}</th>,
  td: ({ children }) => <td className="border-b border-gray-2 dark:border-gray-9 px-3 py-2 text-gray-9 dark:text-gray-3">{children}</td>,
  code: ({ className, children }) => {
    // react-markdown gives inline code no className, and fenced code blocks
    // a "language-xxx" className via remark — used here to tell them apart,
    // since only fenced blocks should get the multi-line <pre> treatment.
    const isBlock = !!className;
    if (!isBlock) {
      return <code className="bg-gray-2 dark:bg-gray-9 text-pink-7 dark:text-pink-4 rounded px-1.5 py-0.5 text-sm font-mono">{children}</code>;
    }
    return <code className={className}>{children}</code>;
  },
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  a: ({ href, children }) => {
    if (!href) return <>{children}</>;
    if (href.startsWith('#')) {
      return <a href={href} className="text-blue-6 hover:text-blue-7 underline">{children}</a>;
    }
    const rewritten = rewriteHref(href);
    if (rewritten) {
      return <Link to={rewritten} className="text-blue-6 hover:text-blue-7 underline">{children}</Link>;
    }
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-6 hover:text-blue-7 underline">{children}</a>;
    }
    // Any other relative link we don't have a mapping for (e.g. a link to a
    // file that isn't rendered on the site at all) — leave as a plain path
    // rather than guessing; better a visibly-inert link than a silent
    // wrong-route rewrite.
    return <a href={href} className="text-blue-6 hover:text-blue-7 underline">{children}</a>;
  },
};

export function MarkdownPage({ content }: { content: string }) {
  const articleRef = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const { hash } = useLocation();

  // Re-scan after every render triggered by a new `content` — rehype-slug's
  // ids only exist in the committed DOM, so this can't run any earlier than
  // a post-render effect.
  useEffect(() => {
    if (!articleRef.current) return;
    setHeadings(collectHeadings(articleRef.current));
  }, [content]);

  // Browsers only auto-scroll to a URL hash on the page's OWN initial load,
  // not on a client-side route change into a page that already has that
  // hash (e.g. a <Link to="/web#some-heading"> from a different route) —
  // react-router doesn't do this either without the data-router APIs'
  // <ScrollRestoration>, which this app doesn't use. Same content-dependent
  // timing as the heading scan above: the target id doesn't exist until
  // rehype-slug's output is in the DOM.
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(hash.slice(1));
    target?.scrollIntoView();
  }, [hash, content]);

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_16rem] xl:gap-12">
      <div ref={articleRef} className="max-w-[50rem]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug, rehypeHighlight]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
      <TableOfContents headings={headings} />
    </div>
  );
}
