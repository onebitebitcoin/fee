import { Building2, Mail, RefreshCw, Route, Shield } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/fee', label: '수수료', icon: Route },
  { to: '/status', label: '현황', icon: Building2 },
  { to: '/carf', label: 'CARF', icon: Shield },
  { to: '/contact', label: '문의', icon: Mail },
  { to: '/runs', label: '크롤링', icon: RefreshCw },
];

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-dark-500">
      <header className="border-b border-dark-200 bg-dark-400/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-stretch gap-3 px-4">
          {/* Logo */}
          <NavLink to="/fee" className="flex items-center gap-3 group py-3 shrink-0">
            <div className="relative">
              <img
                src="/logos/hanip.png"
                alt="한입 로고"
                className="h-9 w-9 rounded-full object-cover ring-1 ring-brand-500/30 group-hover:ring-brand-500/60 transition-all"
                width={36}
                height={36}
              />
            </div>
            <div>
              <p className="text-sm font-bold text-bnb-text font-display tracking-tight">한입 비트코인 경로</p>
            </div>
          </NavLink>

          {/* Desktop nav — same row as logo */}
          <nav className="hidden md:flex items-stretch overflow-x-auto gap-0.5 ml-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `relative flex items-center gap-1.5 px-4 text-sm font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? 'text-brand-500'
                        : 'text-bnb-muted hover:text-bnb-text'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={14} />
                      {item.label}
                      <span
                        className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full transition-all duration-200 ${
                          isActive ? 'bg-brand-500' : 'bg-transparent'
                        }`}
                      />
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 pb-24 md:py-6 md:pb-6">
        <Outlet />
      </main>

      {/* Version footer (desktop only — hidden on mobile behind bottom nav) */}
      <footer className="hidden md:block border-t border-dark-200 py-2 text-center text-[11px] text-bnb-muted/50">
        v{__APP_VERSION__}
      </footer>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-dark-200 bg-dark-400/95 backdrop-blur-md md:hidden">
        <div className="mx-auto grid max-w-7xl grid-cols-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${
                    isActive ? 'text-brand-500' : 'text-bnb-muted'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-b-full bg-brand-500" />
                    )}
                    <Icon size={17} />
                    <span className="text-center leading-tight">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
