import { Navigate, Route, Routes } from 'react-router-dom';

import { AdminGuard } from './components/AdminGuard';
import { Layout } from './components/Layout';
import { CheapestPathPage } from './pages/CheapestPathPage';
import { ContactPage } from './pages/ContactPage';
import { ExchangeStatusPage } from './pages/ExchangeStatusPage';
import { PolicyPage } from './pages/PolicyPage';
import { RunsPage } from './pages/RunsPage';
import { TickersPage } from './pages/TickersPage';

const DEFAULT_ROUTE = '/fee';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/overview" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/fee" element={<CheapestPathPage />} />
        <Route path="/tickers" element={<TickersPage />} />
        <Route path="/withdrawals" element={<Navigate to="/status" replace />} />
        <Route path="/network-status" element={<Navigate to="/status" replace />} />
        <Route path="/status" element={<ExchangeStatusPage />} />
        <Route path="/carf" element={<PolicyPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/runs" element={<AdminGuard><RunsPage /></AdminGuard>} />
      </Route>
      <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
    </Routes>
  );
}
