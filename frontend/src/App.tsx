import { Navigate, Route, Routes } from 'react-router-dom';

import { Layout } from './components/Layout';
import { CheapestPathPage } from './pages/CheapestPathPage';
import { NetworkStatusPage } from './pages/NetworkStatusPage';
import { RunsPage } from './pages/RunsPage';
import { TickersPage } from './pages/TickersPage';
import { WithdrawalsPage } from './pages/WithdrawalsPage';

const DEFAULT_ROUTE = '/cheapest-path';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/overview" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/cheapest-path" element={<CheapestPathPage />} />
        <Route path="/tickers" element={<TickersPage />} />
        <Route path="/withdrawals" element={<WithdrawalsPage />} />
        <Route path="/network-status" element={<NetworkStatusPage />} />
        <Route path="/runs" element={<RunsPage />} />
      </Route>
      <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
    </Routes>
  );
}
