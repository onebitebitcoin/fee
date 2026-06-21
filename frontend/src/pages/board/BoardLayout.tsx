import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, House } from '@phosphor-icons/react';

interface BoardLayoutProps {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  children: ReactNode;
}

export function BoardLayout({ title, onBack, right, children }: BoardLayoutProps) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen">
      <header className="glass-header sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => (onBack ? onBack() : navigate('/board'))}
              className="p-1.5 rounded-xl hover:bg-fill-primary transition-colors"
              aria-label="뒤로"
            >
              <ArrowLeft className="w-4 h-4 text-label-secondary" />
            </button>
            <span className="font-bold text-sm text-label-primary tracking-tight">{title}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {right}
            <button
              onClick={() => navigate('/')}
              className="p-1.5 rounded-xl hover:bg-fill-primary transition-colors"
              aria-label="홈"
            >
              <House className="w-4 h-4 text-label-secondary" />
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-3 sm:px-4 py-4 space-y-3">{children}</main>
    </div>
  );
}
