import { BarChart2, Globe, History, Network, Route, TrendingUp } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: '개요', icon: BarChart2 },
  { to: '/cheapest-path', label: '최적 경로', icon: Route },
  { to: '/tickers', label: '시세', icon: TrendingUp },
  { to: '/withdrawals', label: '출금 수수료', icon: Globe },
  { to: '/network-status', label: '네트워크', icon: Network },
  { to: '/runs', label: '수집 이력', icon: History },
];

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-dark-500">
      <header className="border-b border-dark-200 bg-dark-400">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center bg-brand-500">
              <span className="text-sm font-bold text-dark-500">B</span>
            </div>
            <div>
              <p className="text-sm font-bold text-bnb-text">BTC 경로 탐색기</p>
              <p className="text-xs text-bnb-muted">실시간 수수료 비교</p>
            </div>
          </div>
        </div>
        <nav className="mx-auto max-w-7xl overflow-x-auto px-4">
          <div className="flex gap-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? 'border-brand-500 text-brand-500'
                        : 'border-transparent text-bnb-muted hover:text-bnb-text'
                    }`
                  }
                >
                  <Icon size={14} />
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
