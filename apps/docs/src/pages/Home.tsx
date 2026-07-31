import { Link } from 'react-router-dom';

const CODE_EXAMPLE = `<View className="bg-white dark:bg-gray-10 p-4 rounded-xl">
  <Text className="text-gray-11 dark:text-white font-bold">
    Hello Kbach
  </Text>
  <TouchableOpacity className="bg-blue-6 hover:bg-blue-7 pressed:bg-blue-8 rounded-lg px-4 py-2 mt-3">
    <Text className="text-white font-semibold">Press me</Text>
  </TouchableOpacity>
</View>`;

const FEATURES = [
  {
    title: 'One class string, two platforms',
    body: 'The same className resolves to real CSS on web and inline styles on React Native — no separate stylesheets, no platform branching.',
  },
  {
    title: 'Zero-cost on web',
    body: 'Static CSS setup writes real CSS at build time via a Vite plugin — nothing generated client-side, and it warns on typos before you ship them.',
  },
  {
    title: 'Typed theme tokens',
    body: 'useColors() and useSpacing() autocomplete and typo-check against your actual theme, not a blanket any.',
  },
  {
    title: 'One command to set up',
    body: 'npm create kbach@latest wires an existing Vite, Next.js, or Expo project up automatically.',
  },
];

export function Home() {
  return (
    <div className="max-w-[50rem]">
      <p className="text-sm font-semibold text-blue-6 mb-3">Kbach</p>
      <h1 className="text-5xl font-bold text-gray-11 dark:text-white mb-5 leading-tight">
        Tailwind-like utility classes for React and React Native
      </h1>
      <p className="text-lg text-gray-8 dark:text-gray-4 mb-8 leading-relaxed">
        Write <code className="bg-gray-2 dark:bg-gray-9 text-pink-7 dark:text-pink-4 rounded px-1.5 py-0.5 text-base font-mono">className</code> strings once — a custom JSX runtime resolves them at render time on both platforms.
      </p>

      <div className="flex gap-3 mb-10">
        <Link to="/web" className="bg-blue-6 hover:bg-blue-7 text-white font-semibold rounded-lg px-5 py-2.5 transition-colors">
          Web setup
        </Link>
        <Link to="/native" className="bg-gray-2 dark:bg-gray-9 hover:bg-gray-3 dark:hover:bg-gray-8 text-gray-10 dark:text-white font-semibold rounded-lg px-5 py-2.5 transition-colors">
          Native setup
        </Link>
      </div>

      <div className="rounded-xl overflow-hidden mb-12 border border-gray-9 dark:border-gray-8 shadow-lg">
        <div className="flex items-center gap-1.5 bg-gray-10 dark:bg-gray-9 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-6" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-6" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-6" />
        </div>
        <pre className="bg-gray-11 dark:bg-black p-4 overflow-x-auto text-sm text-gray-2">
          <code>{CODE_EXAMPLE}</code>
        </pre>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border border-gray-2 dark:border-gray-9 p-5 transition-all hover:border-gray-3 dark:hover:border-gray-8 hover:shadow-md hover:-translate-y-0.5"
          >
            <h3 className="text-base font-semibold text-gray-11 dark:text-white mb-1.5">{feature.title}</h3>
            <p className="text-sm text-gray-8 dark:text-gray-4 leading-relaxed">{feature.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
