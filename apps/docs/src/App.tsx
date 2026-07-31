import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Web } from './pages/Web';
import { Native } from './pages/Native';
import { Cli } from './pages/Cli';
import { ReferenceWeb } from './pages/ReferenceWeb';
import { ReferenceNative } from './pages/ReferenceNative';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/web" element={<Web />} />
        <Route path="/native" element={<Native />} />
        <Route path="/cli" element={<Cli />} />
        <Route path="/reference/web" element={<ReferenceWeb />} />
        <Route path="/reference/native" element={<ReferenceNative />} />
      </Routes>
    </Layout>
  );
}
