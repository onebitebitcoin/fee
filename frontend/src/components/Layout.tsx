import { Building2, Mail, Menu, RefreshCw, Route, Shield, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/fee', label: '수수료', icon: Route },
  { to: '/status', label: '현황', icon: Building2 },
  { to: '/carf', label: 'CARF', icon: Shield },
  { to: '/contact', label: '문의', icon: Mail },
  { to: '/runs', label: '크롤링', icon: RefreshCw },
];

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close menu on navigation
  const handleNavClick = () => setMenuOpen(false);

  return (
    <div className="flex min-h-screen flex-col bg-dark-500">
      <header className="border-b border-dark-200 bg-dark-400/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-stretch gap-3 px-4">
          {/* Logo */}
          <NavLink to="/fee" className="flex items-center gap-3 group py-3 shrink-0" onClick={handleNavClick}>
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

          {/* Mobile hamburger button */}
          <button
            className="ml-auto flex md:hidden items-center justify-center p-2 text-bnb-muted hover:text-bnb-text transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="메뉴"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <nav className="md:hidden border-t border-dark-200 bg-dark-400/95 backdrop-blur-md">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={handleNavClick}
                  className={`flex items-center gap-3 px-5 py-3.5 text-sm font-medium border-b border-dark-200/50 last:border-b-0 transition-colors ${
                    isActive ? 'text-brand-500 bg-brand-500/5' : 'text-bnb-muted hover:text-bnb-text hover:bg-dark-300/30'
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                  {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-500" />}
                </NavLink>
              );
            })}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:py-6">
        <Outlet />
      </main>

      <footer className="border-t border-dark-200 py-2 text-center text-[11px] text-bnb-muted/50">
        v{__APP_VERSION__}
      </footer>
    </div>
  );
}
