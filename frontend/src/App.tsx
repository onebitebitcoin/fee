import { Routes, Route } from 'react-router-dom';
import { RouteExplorerPage } from './pages/RouteExplorerPage';
import { AdminPage } from './pages/AdminPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RouteExplorerPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}
