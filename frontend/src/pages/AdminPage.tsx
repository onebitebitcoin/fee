import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FloppyDisk, ArrowCounterClockwise, LockKey } from '@phosphor-icons/react';
import {
  loadAdminSettings, saveAdminSettings, resetAdminSettings,
  type AdminSettings,
} from '../lib/adminSettings';
import { AdminNoticePanel } from './board/AdminNoticePanel';
import { ExchangeTabContent } from './admin/ExchangeTabContent';
import { GatemanRegistryPanel } from './admin/KYCPanel';
import { NoticesPanel } from './admin/NoticesPanel';
import { CrawlStatusPanel } from './admin/CrawlStatusPanel';

const ADMIN_PASSWORD = '0000';
type Tab = 'korean' | 'global' | 'edges' | 'gateman' | 'notices' | 'crawl' | 'board';

export function AdminPage() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [settings, setSettings] = useState<AdminSettings>(() => loadAdminSettings());
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>('korean');

  useEffect(() => {
    if (sessionStorage.getItem('admin_authed') === '1') setAuthed(true);
  }, []);

  function handleLogin() {
    if (pwInput === ADMIN_PASSWORD) {
      setAuthed(true);
      sessionStorage.setItem('admin_authed', '1');
      sessionStorage.setItem('admin_key', pwInput);
      setPwError(false);
    } else {
      setPwError(true);
    }
  }

  function handleSave() { saveAdminSettings(settings); setSaved(true); setTimeout(() => setSaved(false), 2000); }
  function handleReset() {
    if (!confirm('모든 설정을 기본값으로 초기화하겠습니까?')) return;
    setSettings(resetAdminSettings());
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="ios-card rounded-3xl p-8">
            <div className="flex flex-col items-center gap-3 mb-7">
              <div className="w-12 h-12 rounded-2xl bg-acc-amber/15 flex items-center justify-center">
                <LockKey className="w-6 h-6 text-acc-amber" weight="fill" />
              </div>
              <div className="text-center">
                <p className="font-bold text-label-primary">관리자 설정</p>
                <p className="text-xs text-label-secondary mt-0.5">비밀번호를 입력하세요</p>
              </div>
            </div>
            <input
              type="password" value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className={`w-full bg-white border rounded-2xl px-4 py-3 text-sm outline-none text-center tracking-widest ${
                pwError ? 'border-acc-red' : 'border-[rgba(160,100,40,0.20)] focus:border-acc-amber/50'
              }`}
              placeholder="••••" maxLength={8}
            />
            {pwError && <p className="text-xs text-acc-red mt-1.5 text-center">비밀번호가 틀렸습니다</p>}
            <button onClick={handleLogin} className="w-full mt-4 bg-acc-amber text-white font-semibold text-sm py-3 rounded-2xl hover:bg-acc-orange transition-colors shadow-glow-amber">
              로그인
            </button>
            <button onClick={() => navigate('/')} className="w-full mt-2 text-xs text-label-tertiary hover:text-label-secondary transition-colors py-2">
              메인으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'korean',  label: '국내 거래소' },
    { id: 'global',  label: '해외 거래소' },
    { id: 'edges',   label: '엣지 속성' },
    { id: 'gateman', label: '게이트맨' },
    { id: 'notices', label: '공지사항' },
    { id: 'board',   label: '게시판 공지' },
    { id: 'crawl',   label: '크롤 상태' },
  ];

  return (
    <div className="min-h-screen">
      <header className="glass-header sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/')} className="p-1.5 rounded-xl hover:bg-fill-primary transition-colors mr-1">
              <ArrowLeft className="w-4 h-4 text-label-secondary" />
            </button>
            <LockKey className="w-4 h-4 text-acc-amber" weight="fill" />
            <span className="font-bold text-sm text-label-primary tracking-tight">관리자 설정</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-label-tertiary hover:text-label-secondary px-2.5 py-1.5 rounded-xl hover:bg-fill-primary transition-colors">
              <ArrowCounterClockwise className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">초기화</span>
            </button>
            <button onClick={handleSave} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-semibold transition-colors ${
              saved ? 'bg-acc-green/15 text-acc-green' : 'bg-acc-amber text-white shadow-glow-sm hover:bg-acc-orange'
            }`}>
              <FloppyDisk className="w-3.5 h-3.5" />
              <span>{saved ? '저장됨' : '저장'}</span>
            </button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 border-t border-sys-separator overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-0 min-w-max">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.id ? 'border-acc-amber text-acc-amber' : 'border-transparent text-label-tertiary hover:text-label-secondary'
                }`}
              >{t.label}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {(tab === 'korean' || tab === 'global' || tab === 'edges') && (
          <ExchangeTabContent tab={tab} settings={settings} onSettingsChange={setSettings} />
        )}
        {tab === 'gateman' && <GatemanRegistryPanel />}
        {tab === 'notices' && <NoticesPanel />}
        {tab === 'board'   && <AdminNoticePanel />}
        {tab === 'crawl'   && <CrawlStatusPanel />}
      </main>
    </div>
  );
}
