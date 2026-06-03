import { Routes, Route } from 'react-router-dom';
import ExplorerPage from './pages/ExplorerPage';

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<ExplorerPage />} />
    </Routes>
  );
}
