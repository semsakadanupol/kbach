import { ThemeToggle } from "./theme-toggle";

// A plain Server Component (default in the App Router, no 'use client')
// using a static className string — this is the primary path
// @kbach/react/postcss exists for: the class resolves against the
// pre-generated kbach.css, with zero runtime JS needed for styling itself.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-1 p-8 dark:bg-gray-12">
      <h1 className="text-3xl font-bold text-gray-12 dark:text-gray-1">
        Kbach + Next.js
      </h1>
      <p className="rounded-full bg-blue-2 p-4 text-blue-12 dark:bg-blue-11 dark:text-blue-1 border">
        This text and its container are styled entirely by static,
        build-time-generated CSS.
      </p>
      <ThemeToggle />
    </main>
  );
}
