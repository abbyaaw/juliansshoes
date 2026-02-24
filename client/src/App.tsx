import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Collection from './pages/Collection';
import ShoeDetail from './pages/ShoeDetail';
import Import from './pages/Import';
import Settings from './pages/Settings';
import Export from './pages/Export';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Collection />} />
        <Route path="/shoes/:id" element={<ShoeDetail />} />
        <Route path="/import" element={<Import />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/export" element={<Export />} />
      </Routes>
    </Layout>
  );
}
