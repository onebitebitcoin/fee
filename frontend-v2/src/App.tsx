import { Routes, Route } from 'react-router-dom';
import ExplorerPage from './pages/ExplorerPage';
import { AdminPage } from './pages/AdminPage';

export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<ExplorerPage />} />
    </Routes>
  );
}
