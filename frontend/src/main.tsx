import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { applyModeTheme, loadSavedMode } from './pages/explorer/modeStorage';

// 첫 렌더 전에 마지막으로 고른 방향의 테마를 입혀 색이 깜빡이지 않게 한다.
applyModeTheme(loadSavedMode());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
