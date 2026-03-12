import { Building2, History, Route } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/cheapest-path', label: '최적 경로', icon: Route },
  { to: '/status', label: '현황', icon: Building2 },
  { to: '/runs', label: '수집 이력', icon: History },
];

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-dark-500">
      <header className="border-b border-dark-200 bg-dark-400">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <NavLink to="/cheapest-path" className="flex items-center gap-3">
            <img
              src="/logos/hanip.png"
              alt="한입 로고"
              className="h-9 w-9 rounded-full object-cover"
              width={36}
              height={36}
            />
            <div>
              <p className="text-sm font-bold text-bnb-text">한입 비트코인 경로</p>
              <p className="text-xs text-bnb-muted">실시간 수수료 비교</p>
            </div>
          </NavLink>
        </div>
        <nav className="mx-auto hidden max-w-7xl overflow-x-auto px-4 md:block">
          <div className="flex gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
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
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 pb-24 md:py-6 md:pb-6">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-dark-200 bg-dark-400/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-7xl grid-cols-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${
                    isActive ? 'text-brand-500' : 'text-bnb-muted'
                  }`
                }
              >
                <Icon size={16} />
                <span className="text-center leading-tight">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
