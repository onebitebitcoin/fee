import { Navigate, Route, Routes } from 'react-router-dom';

import { AdminGuard } from './components/AdminGuard';
import { Layout } from './components/Layout';
import { CheapestPathPage } from './pages/CheapestPathPage';
import { ExchangeStatusPage } from './pages/ExchangeStatusPage';
import { PolicyPage } from './pages/PolicyPage';
import { RunsPage } from './pages/RunsPage';
import { TickersPage } from './pages/TickersPage';

const DEFAULT_ROUTE = '/cheapest-path';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/overview" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/cheapest-path" element={<CheapestPathPage />} />
        <Route path="/tickers" element={<TickersPage />} />
        <Route path="/withdrawals" element={<Navigate to="/status" replace />} />
        <Route path="/network-status" element={<Navigate to="/status" replace />} />
        <Route path="/status" element={<ExchangeStatusPage />} />
        <Route path="/policy" element={<PolicyPage />} />
        <Route path="/runs" element={<AdminGuard><RunsPage /></AdminGuard>} />
      </Route>
      <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
    </Routes>
  );
}
