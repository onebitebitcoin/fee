import { Routes, Route } from 'react-router-dom';
import ExplorerPage from './pages/ExplorerPage';
import { AdminPage } from './pages/AdminPage';
import BoardListPage from './pages/board/BoardListPage';
import BoardWritePage from './pages/board/BoardWritePage';
import BoardDetailPage from './pages/board/BoardDetailPage';

export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/board" element={<BoardListPage />} />
      <Route path="/board/new" element={<BoardWritePage />} />
      <Route path="/board/:id" element={<BoardDetailPage />} />
      <Route path="/board/:id/edit" element={<BoardWritePage />} />
      <Route path="*" element={<ExplorerPage />} />
    </Routes>
  );
}
