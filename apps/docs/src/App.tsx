import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Web } from './pages/Web';
import { Cli } from './pages/Cli';
import { ReferenceWeb } from './pages/ReferenceWeb';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/web" element={<Web />} />
        <Route path="/cli" element={<Cli />} />
        <Route path="/reference/web" element={<ReferenceWeb />} />
        {/* @kbach/react's own README/reference now cover React Native/Expo
            too (see its "React Native / Expo setup" section) — @kbach/native
            no longer has separate docs to render. Redirects, not removed
            routes, so old bookmarks/links to these paths still land
            somewhere useful instead of 404ing. */}
        <Route path="/native" element={<Navigate to="/web" replace />} />
        <Route path="/reference/native" element={<Navigate to="/reference/web" replace />} />
      </Routes>
    </Layout>
  );
}
