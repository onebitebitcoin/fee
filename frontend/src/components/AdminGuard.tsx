import { Lock } from 'lucide-react';
import { type ReactNode, useState } from 'react';

// 비밀번호: char codes로 저장 (평문 미노출)
const ADMIN_CHARS = [48, 48, 48, 48];
const SESSION_KEY = 'admin_authed';

function isValidPassword(pw: string): boolean {
  return (
    pw.length === ADMIN_CHARS.length &&
    pw.split('').every((c, i) => c.charCodeAt(0) === ADMIN_CHARS[i])
  );
}

interface Props {
  children: ReactNode;
}

export function AdminGuard({ children }: Props) {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1');
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  if (authed) return <>{children}</>;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isValidPassword(input)) {
      sessionStorage.setItem(SESSION_KEY, '1');
      setAuthed(true);
    } else {
      setError(true);
      setInput('');
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-xs rounded-xl border border-dark-200 bg-dark-400 p-8">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Lock size={28} className="text-bnb-muted" />
          <p className="text-sm font-semibold text-bnb-text">관리자 전용 페이지</p>
          <p className="text-xs text-bnb-muted">비밀번호를 입력하세요</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(false);
            }}
            placeholder="비밀번호"
            autoFocus
            className="rounded-lg border border-dark-200 bg-dark-500 px-3 py-2 text-sm text-bnb-text placeholder:text-bnb-muted focus:border-brand-500 focus:outline-none"
          />
          {error && (
            <p className="text-xs text-red-400">비밀번호가 올바르지 않습니다.</p>
          )}
          <button
            type="submit"
            className="rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
          >
            확인
          </button>
        </form>
      </div>
    </div>
  );
}
