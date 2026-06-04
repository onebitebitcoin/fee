import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FloppyDisk, ArrowCounterClockwise, LockKey, PencilSimple, Check, X, ArrowsClockwise, Lightning } from '@phosphor-icons/react';
import { api } from '../lib/api';
import {
  loadAdminSettings, saveAdminSettings, resetAdminSettings,
  type AdminSettings, type KoreanExchangeNode, type GlobalExchangeNode,
} from '../lib/adminSettings';

const ADMIN_PASSWORD = '0000';

// ── Inline editable cell ──────────────────────────────────────────────────────

function EditCell({
  value,
  onSave,
  type = 'text',
  nullable = false,
}: {
  value: string | number | null;
  onSave: (v: string | number | null) => void;
  type?: 'text' | 'number';
  nullable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null ? '' : String(value));

  function commit() {
    if (nullable && draft === '') { onSave(null); }
    else if (type === 'number') { onSave(Number(draft)); }
    else { onSave(draft); }
    setEditing(false);
  }

  function cancel() {
    setDraft(value === null ? '' : String(value));
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-left hover:text-brand-400 transition-colors group"
      >
        <span>{value === null ? <span className="text-bnb-muted italic">없음</span> : String(value)}</span>
        <PencilSimple className="w-3 h-3 text-dark-100 group-hover:text-brand-400 flex-shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
        className="w-full bg-dark-400 border border-brand-500/50 rounded px-1.5 py-0.5 text-xs outline-none"
      />
      <button onClick={commit} className="text-bnb-green"><Check className="w-3.5 h-3.5" /></button>
      <button onClick={cancel} className="text-bnb-red"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

// ── Field row used in cards ────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 flex-shrink-0 mt-0.5 w-28">{label}</span>
      <div className="flex-1 text-right">{children}</div>
    </div>
  );
}

// ── Korean Exchange Table (PC) + Cards (Mobile) ───────────────────────────────

function KoreanExchangeTable({
  nodes,
  onChange,
}: {
  nodes: KoreanExchangeNode[];
  onChange: (nodes: KoreanExchangeNode[]) => void;
}) {
  function update(idx: number, patch: Partial<KoreanExchangeNode>) {
    onChange(nodes.map((n, i) => i === idx ? { ...n, ...patch } : n));
  }

  return (
    <>
      {/* PC: table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              {['거래소', '거래 수수료 (%)', '1회 KRW 제한', '일일 BTC 한도', '개인지갑 요건', '비고'].map(h => (
                <th key={h} className="text-left py-2 px-3 text-slate-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nodes.map((node, i) => (
              <tr key={node.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2.5 px-3 font-semibold text-bnb-text">{node.name}</td>
                <td className="py-2.5 px-3"><EditCell value={node.takerFeePct} type="number" onSave={v => update(i, { takerFeePct: Number(v) })} /></td>
                <td className="py-2.5 px-3"><EditCell value={node.perTxKrwLimit} type="number" nullable onSave={v => update(i, { perTxKrwLimit: v === null ? null : Number(v) })} /></td>
                <td className="py-2.5 px-3"><EditCell value={node.dailyBtcLimitVerified} type="number" nullable onSave={v => update(i, { dailyBtcLimitVerified: v === null ? null : Number(v) })} /></td>
                <td className="py-2.5 px-3"><EditCell value={node.personalWalletNote} onSave={v => update(i, { personalWalletNote: String(v ?? '') })} /></td>
                <td className="py-2.5 px-3"><EditCell value={node.notes} onSave={v => update(i, { notes: String(v ?? '') })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-slate-400 mt-2 px-3">공개 정보 기준 추정치. 실제 한도는 각 거래소 확인 필요.</p>
      </div>

      {/* Mobile: cards */}
      <div className="md:hidden space-y-3">
        {nodes.map((node, i) => (
          <div key={node.id} className="rounded-xl border border-slate-200 bg-white shadow-card p-4">
            <p className="font-semibold text-sm text-bnb-text mb-3">{node.name}</p>
            <FieldRow label="거래 수수료 (%)"><EditCell value={node.takerFeePct} type="number" onSave={v => update(i, { takerFeePct: Number(v) })} /></FieldRow>
            <FieldRow label="1회 KRW 제한"><EditCell value={node.perTxKrwLimit} type="number" nullable onSave={v => update(i, { perTxKrwLimit: v === null ? null : Number(v) })} /></FieldRow>
            <FieldRow label="일일 BTC 한도"><EditCell value={node.dailyBtcLimitVerified} type="number" nullable onSave={v => update(i, { dailyBtcLimitVerified: v === null ? null : Number(v) })} /></FieldRow>
            <FieldRow label="개인지갑 요건"><EditCell value={node.personalWalletNote} onSave={v => update(i, { personalWalletNote: String(v ?? '') })} /></FieldRow>
            <FieldRow label="비고"><EditCell value={node.notes} onSave={v => update(i, { notes: String(v ?? '') })} /></FieldRow>
          </div>
        ))}
        <p className="text-[11px] text-slate-400 px-1">공개 정보 기준 추정치. 실제 한도는 각 거래소 확인 필요.</p>
      </div>
    </>
  );
}

// ── Global Exchange Table (PC) + Cards (Mobile) ───────────────────────────────

function GlobalExchangeTable({
  nodes,
  onChange,
}: {
  nodes: GlobalExchangeNode[];
  onChange: (nodes: GlobalExchangeNode[]) => void;
}) {
  function update(idx: number, patch: Partial<GlobalExchangeNode>) {
    onChange(nodes.map((n, i) => i === idx ? { ...n, ...patch } : n));
  }

  const FatcaBtn = ({ node, i }: { node: GlobalExchangeNode; i: number }) => (
    <button
      onClick={() => update(i, { fatca: !node.fatca })}
      className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${node.fatca ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
    >
      {node.fatca ? '대상' : '비대상'}
    </button>
  );

  return (
    <>
      {/* PC: table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              {['거래소', '국가', 'CARF 연도', 'Taker 수수료 (%)', 'FATCA', '비고'].map(h => (
                <th key={h} className="text-left py-2 px-3 text-slate-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nodes.map((node, i) => (
              <tr key={node.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2.5 px-3 font-semibold text-bnb-text">{node.name}</td>
                <td className="py-2.5 px-3"><EditCell value={node.country} onSave={v => update(i, { country: String(v ?? '') })} /></td>
                <td className="py-2.5 px-3"><EditCell value={node.carfYear} type="number" nullable onSave={v => update(i, { carfYear: v === null ? null : Number(v) })} /></td>
                <td className="py-2.5 px-3"><EditCell value={node.takerFeePct} type="number" onSave={v => update(i, { takerFeePct: Number(v) })} /></td>
                <td className="py-2.5 px-3"><FatcaBtn node={node} i={i} /></td>
                <td className="py-2.5 px-3"><EditCell value={node.notes} onSave={v => update(i, { notes: String(v ?? '') })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="md:hidden space-y-3">
        {nodes.map((node, i) => (
          <div key={node.id} className="rounded-xl border border-slate-200 bg-white shadow-card p-4">
            <p className="font-semibold text-sm text-bnb-text mb-3">{node.name}</p>
            <FieldRow label="국가"><EditCell value={node.country} onSave={v => update(i, { country: String(v ?? '') })} /></FieldRow>
            <FieldRow label="CARF 연도"><EditCell value={node.carfYear} type="number" nullable onSave={v => update(i, { carfYear: v === null ? null : Number(v) })} /></FieldRow>
            <FieldRow label="Taker 수수료 (%)"><EditCell value={node.takerFeePct} type="number" onSave={v => update(i, { takerFeePct: Number(v) })} /></FieldRow>
            <FieldRow label="FATCA"><FatcaBtn node={node} i={i} /></FieldRow>
            <FieldRow label="비고"><EditCell value={node.notes} onSave={v => update(i, { notes: String(v ?? '') })} /></FieldRow>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Edge Properties Cards ──────────────────────────────────────────────────────

function EdgePropertiesSection() {
  const sourceCls = (s: string) =>
    s === '크롤링'    ? 'bg-blue-50 text-blue-700 border-blue-200' :
    s === '어드민 설정' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                         'bg-slate-100 text-slate-500 border-slate-200';

  const sections = [
    {
      title: '국내 USDT 출금 엣지', color: 'blue',
      props: [
        { name: 'fee', desc: '출금 수수료 (USDT)', source: '크롤링' },
        { name: 'network', desc: 'TRC20, ERC20 등', source: '크롤링' },
        { name: 'min_withdrawal', desc: '최소 출금량', source: '크롤링' },
        { name: 'enabled', desc: '출금 활성 여부', source: '크롤링' },
      ],
    },
    {
      title: '국내 BTC 출금 엣지 (개인 지갑)', color: 'amber',
      props: [
        { name: 'fee', desc: '출금 수수료 (BTC)', source: '크롤링' },
        { name: 'network', desc: 'Bitcoin, Lightning 등', source: '크롤링' },
        { name: 'perTxKrwLimit', desc: '1회 KRW 출금 제한', source: '어드민 설정' },
        { name: 'dailyBtcLimit', desc: '일일 BTC 한도', source: '어드민 설정' },
      ],
    },
    {
      title: '국내 BTC → 해외 경유 엣지', color: 'green',
      props: [
        { name: 'koreanFee', desc: '국내 BTC 출금 수수료', source: '크롤링' },
        { name: 'globalFee', desc: '해외 BTC 재출금 수수료', source: '크롤링' },
        { name: 'perTxLimit', desc: '1회 KRW 제한 없음 (거래소 주소)', source: '규정' },
      ],
    },
    {
      title: '해외 BTC 출금 엣지', color: 'neutral',
      props: [
        { name: 'fee', desc: '출금 수수료 (BTC)', source: '크롤링' },
        { name: 'network', desc: '전송 네트워크', source: '크롤링' },
        { name: 'enabled', desc: '출금 활성 여부', source: '크롤링' },
      ],
    },
  ];

  const dotCls = (c: string) =>
    c === 'blue' ? 'bg-blue-500' : c === 'amber' ? 'bg-amber-500' : c === 'green' ? 'bg-emerald-500' : 'bg-slate-400';

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">수수료는 실시간 크롤 데이터. 아래는 각 엣지 속성 정의입니다.</p>
      {sections.map(sec => (
        <div key={sec.title} className="rounded-xl border border-slate-200 bg-white shadow-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls(sec.color)}`} />
            <span className="text-xs font-semibold text-bnb-text">{sec.title}</span>
          </div>
          <div className="space-y-2">
            {sec.props.map(p => (
              <div key={p.name} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] font-mono text-brand-700 block">{p.name}</span>
                  <span className="text-[11px] text-slate-500">{p.desc}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${sourceCls(p.source)}`}>
                  {p.source}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main AdminPage ─────────────────────────────────────────────────────────────

type Tab = 'korean' | 'global' | 'edges' | 'gateman' | 'notices' | 'crawl';

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
      setPwError(false);
    } else {
      setPwError(true);
    }
  }

  function handleSave() {
    saveAdminSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    if (!confirm('모든 설정을 기본값으로 초기화하겠습니까?')) return;
    setSettings(resetAdminSettings());
  }

  // ── Password gate ──────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div className="min-h-screen bg-dark-500 text-bnb-text flex items-center justify-center">
        <div className="w-full max-w-sm px-4">
          <div className="bg-dark-300 border border-dark-200 rounded-xl p-6 shadow-xl">
            <div className="flex flex-col items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
                <LockKey className="w-5 h-5 text-brand-400" weight="fill" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">관리자 설정</p>
                <p className="text-xs text-bnb-muted mt-0.5">비밀번호를 입력하세요</p>
              </div>
            </div>
            <input
              type="password"
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className={`w-full bg-dark-400 border rounded-lg px-3 py-2.5 text-sm outline-none text-center tracking-widest ${pwError ? 'border-bnb-red' : 'border-dark-100 focus:border-brand-500/50'}`}
              placeholder="••••"
              maxLength={8}
            />
            {pwError && <p className="text-xs text-bnb-red mt-1.5 text-center">비밀번호가 틀렸습니다</p>}
            <button
              onClick={handleLogin}
              className="w-full mt-3 bg-brand-500 text-stone-900 font-semibold text-sm py-2.5 rounded-lg hover:bg-brand-400 transition-colors"
            >
              로그인
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full mt-2 text-xs text-bnb-muted hover:text-bnb-text transition-colors py-1.5"
            >
              메인으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Admin UI ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-dark-500 text-bnb-text">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-dark-400/95 backdrop-blur-sm border-b border-dark-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-xs text-bnb-muted hover:text-bnb-text transition-colors mr-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <LockKey className="w-4 h-4 text-brand-500" weight="fill" />
            <span className="font-semibold text-sm tracking-tight">관리자 설정</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs text-bnb-muted hover:text-bnb-text transition-colors"
            >
              <ArrowCounterClockwise className="w-3.5 h-3.5" />
              <span>초기화</span>
            </button>
            <button
              onClick={handleSave}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                saved ? 'bg-bnb-green/20 text-bnb-green' : 'bg-brand-500 text-stone-900 hover:bg-brand-400'
              }`}
            >
              <FloppyDisk className="w-3.5 h-3.5" />
              <span>{saved ? '저장됨' : '저장'}</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 pb-0 border-t border-dark-200/40 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-0 min-w-max">
            {([
              { id: 'korean',  label: '국내 거래소 노드' },
              { id: 'global',  label: '해외 거래소 노드' },
              { id: 'edges',   label: '출금 엣지 속성' },
              { id: 'gateman', label: '게이트맨 레지스트리' },
              { id: 'notices', label: '공지사항' },
              { id: 'crawl',   label: '크롤 상태' },
            ] as { id: Tab; label: string }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-brand-500 text-brand-400'
                    : 'border-transparent text-bnb-muted hover:text-bnb-text'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-dark-300 border border-dark-200 rounded-xl overflow-hidden">
          {(tab !== 'crawl' && tab !== 'gateman' && tab !== 'notices') && (
            <div className="p-4 border-b border-dark-200">
              <p className="text-xs text-bnb-muted">
                {tab === 'korean' && '국내 거래소 노드 속성 — 셀을 클릭해 편집. 저장 후 메인 화면에 반영됩니다.'}
                {tab === 'global' && '해외 거래소 노드 속성 — 셀을 클릭해 편집. FATCA 버튼으로 토글.'}
                {tab === 'edges'  && '출금 엣지(Transfer Edge) 속성 정의 — 크롤링 데이터는 실시간 갱신됨.'}
              </p>
            </div>
          )}
          <div className={(tab !== 'crawl' && tab !== 'gateman' && tab !== 'notices') ? 'p-4' : ''}>
            {tab === 'korean' && (
              <KoreanExchangeTable
                nodes={settings.koreanNodes}
                onChange={nodes => setSettings(s => ({ ...s, koreanNodes: nodes }))}
              />
            )}
            {tab === 'global' && (
              <GlobalExchangeTable
                nodes={settings.globalNodes}
                onChange={nodes => setSettings(s => ({ ...s, globalNodes: nodes }))}
              />
            )}
            {tab === 'edges'   && <EdgePropertiesSection />}
            {tab === 'gateman' && <GatemanRegistryPanel />}
            {tab === 'notices' && <NoticesPanel />}
            {tab === 'crawl'   && <CrawlStatusPanel />}
          </div>
        </div>
      </main>
    </div>
  );
}

// ── GatemanRegistryPanel ────────────────────────────────────────────────────

type GateLevel = 'required' | 'conditional' | 'info';
interface GateItem { label: string; desc: string; level: GateLevel; condition: string | null }
type RegistryData = { domestic: Record<string, GateItem[]>; global: Record<string, GateItem[]>; onchain: GateItem[] };

const LEVEL_CFG = {
  required:    { badge: 'bg-red-950/50 text-red-400 border-red-500/30',   label: '필수' },
  conditional: { badge: 'bg-amber-950/40 text-amber-400 border-amber-500/30', label: '조건부' },
  info:        { badge: 'bg-blue-950/40 text-blue-400 border-blue-500/30',   label: '참고' },
};

function GateItemRow({ item, onDelete, onChange }: {
  item: GateItem;
  onDelete: () => void;
  onChange: (patch: Partial<GateItem>) => void;
}) {
  return (
    <div className="flex gap-2 items-start p-2 rounded-lg border border-dark-200 bg-dark-400/40">
      <div className="flex-1 space-y-1">
        <input
          value={item.label}
          onChange={e => onChange({ label: e.target.value })}
          className="w-full bg-dark-400 border border-dark-200 rounded px-2 py-1 text-xs outline-none focus:border-brand-500/50"
          placeholder="라벨"
        />
        <textarea
          value={item.desc}
          onChange={e => onChange({ desc: e.target.value })}
          rows={2}
          className="w-full bg-dark-400 border border-dark-200 rounded px-2 py-1 text-[11px] text-bnb-muted outline-none focus:border-brand-500/50 resize-none"
          placeholder="설명"
        />
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={item.level}
            onChange={e => onChange({ level: e.target.value as GateLevel })}
            className="bg-dark-400 border border-dark-200 rounded px-1.5 py-0.5 text-[10px] outline-none"
          >
            {(['required', 'conditional', 'info'] as GateLevel[]).map(l => (
              <option key={l} value={l}>{LEVEL_CFG[l].label}</option>
            ))}
          </select>
          <input
            value={item.condition ?? ''}
            onChange={e => onChange({ condition: e.target.value || null })}
            className="flex-1 bg-dark-400 border border-dark-200 rounded px-2 py-0.5 text-[10px] outline-none focus:border-brand-500/50"
            placeholder="조건 (선택)"
          />
          <span className={`text-[9px] px-1 py-0.5 rounded border ${LEVEL_CFG[item.level].badge}`}>{LEVEL_CFG[item.level].label}</span>
        </div>
      </div>
      <button onClick={onDelete} className="text-bnb-muted hover:text-red-400 transition-colors mt-1 flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ExchangeGateEditor({ label, gates, onChange }: {
  label: string; gates: GateItem[]; onChange: (g: GateItem[]) => void;
}) {
  function addGate() {
    onChange([...gates, { label: '', desc: '', level: 'required', condition: null }]);
  }
  function updateGate(i: number, patch: Partial<GateItem>) {
    onChange(gates.map((g, idx) => idx === i ? { ...g, ...patch } : g));
  }
  function deleteGate(i: number) {
    onChange(gates.filter((_, idx) => idx !== i));
  }
  return (
    <div className="border border-dark-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-dark-400/60 border-b border-dark-200">
        <span className="text-xs font-semibold">{label}</span>
        <button onClick={addGate} className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1">
          <Check className="w-3 h-3" /> 항목 추가
        </button>
      </div>
      <div className="p-3 space-y-2">
        {gates.length === 0 && <p className="text-[10px] text-bnb-muted">게이트 항목 없음</p>}
        {gates.map((g, i) => (
          <GateItemRow key={i} item={g} onDelete={() => deleteGate(i)} onChange={p => updateGate(i, p)} />
        ))}
      </div>
    </div>
  );
}

function GatemanRegistryPanel() {
  const [data, setData] = useState<RegistryData | null>(null);
  const [meta, setMeta] = useState<{ updated_at: string; updated_source: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    api.getGatemanRegistry().then(res => {
      setData(res.data as RegistryData);
      setMeta({ updated_at: res.updated_at, updated_source: res.updated_source });
    }).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    try {
      const res = await api.updateGatemanRegistry(data as unknown as Record<string, unknown>);
      setMeta(m => m ? { ...m, updated_at: res.updated_at, updated_source: 'manual' } : null);
      setMsg({ text: '저장됨', ok: true });
    } catch {
      setMsg({ text: '저장 실패', ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 2500);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await api.refreshGatemanRegistry();
      const reg = await api.getGatemanRegistry();
      setData(reg.data as RegistryData);
      setMeta({ updated_at: res.updated_at, updated_source: 'crawl' });
      setMsg({ text: `크롤 완료 (${res.crawl_status})`, ok: true });
    } catch {
      setMsg({ text: '크롤링 실패', ok: false });
    } finally {
      setRefreshing(false);
      setTimeout(() => setMsg(null), 3000);
    }
  }

  function fmtDate(iso: string) {
    return new Intl.DateTimeFormat('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul',
    }).format(new Date(iso));
  }

  if (loading) return <div className="p-6 text-xs text-bnb-muted">로딩 중...</div>;
  if (!data)   return <div className="p-6 text-xs text-red-400">데이터 없음</div>;

  return (
    <div className="p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-bnb-muted space-y-0.5">
          {meta && (
            <>
              <p>최근 업데이트: <span className="text-stone-300">{fmtDate(meta.updated_at)}</span></p>
              <p>출처: <span className={meta.updated_source === 'crawl' ? 'text-blue-400' : meta.updated_source === 'manual' ? 'text-amber-400' : 'text-bnb-muted'}>{meta.updated_source}</span></p>
            </>
          )}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {msg && (
            <span className={`text-xs px-2 py-1 rounded ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-dark-200 text-bnb-muted hover:text-bnb-text transition-colors disabled:opacity-40"
          >
            <ArrowsClockwise className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? '크롤링 중...' : '새로고침 (크롤 후 초기화)'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-stone-900 font-semibold hover:bg-brand-400 transition-colors disabled:opacity-40"
          >
            <FloppyDisk className="w-3.5 h-3.5" />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* 국내 거래소 */}
      <div>
        <p className="text-[10px] font-semibold text-bnb-muted uppercase tracking-wider mb-2">국내 거래소</p>
        <div className="space-y-3">
          {Object.entries(data.domestic).map(([exId, gates]) => (
            <ExchangeGateEditor
              key={exId}
              label={exId}
              gates={gates}
              onChange={g => setData(d => d ? { ...d, domestic: { ...d.domestic, [exId]: g } } : d)}
            />
          ))}
        </div>
      </div>

      {/* 해외 거래소 */}
      <div>
        <p className="text-[10px] font-semibold text-bnb-muted uppercase tracking-wider mb-2">해외 거래소</p>
        <div className="space-y-3">
          {Object.entries(data.global).map(([exId, gates]) => (
            <ExchangeGateEditor
              key={exId}
              label={exId}
              gates={gates}
              onChange={g => setData(d => d ? { ...d, global: { ...d.global, [exId]: g } } : d)}
            />
          ))}
        </div>
      </div>

      {/* 온체인 공통 */}
      <div>
        <p className="text-[10px] font-semibold text-bnb-muted uppercase tracking-wider mb-2">온체인 공통 주의사항</p>
        <ExchangeGateEditor
          label="onchain"
          gates={data.onchain}
          onChange={g => setData(d => d ? { ...d, onchain: g } : d)}
        />
      </div>
    </div>
  );
}

// ── NoticesPanel ─────────────────────────────────────────────────────────────

function NoticesPanel() {
  const [items, setItems] = useState<Array<{
    id: number; exchange: string; title: string; url: string | null;
    published_at: string | null; noticed_at: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  async function fetchNotices() {
    setLoading(true);
    try {
      const res = await api.getAdminNotices(100);
      setItems(res.items);
      setLastFetch(new Date());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchNotices(); }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchNotices, 3_600_000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  function fmtDate(iso: string | null) {
    if (!iso) return '-';
    return new Intl.DateTimeFormat('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul',
    }).format(new Date(iso));
  }

  const byExchange = items.reduce<Record<string, typeof items>>((acc, n) => {
    (acc[n.exchange] = acc[n.exchange] ?? []).push(n);
    return acc;
  }, {});

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-bnb-muted">
          {lastFetch && <span>마지막 조회: {fmtDate(lastFetch.toISOString())}</span>}
          <span className="ml-3">공지 {items.length}건</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-bnb-muted cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            1시간 자동 갱신
          </label>
          <button
            onClick={fetchNotices}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-dark-200 text-bnb-muted hover:text-bnb-text transition-colors disabled:opacity-40"
          >
            <ArrowsClockwise className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {Object.entries(byExchange).map(([exchange, notices]) => (
        <div key={exchange}>
          <p className="text-[10px] font-semibold text-bnb-muted uppercase tracking-wider mb-2 px-1">{exchange}</p>
          <div className="space-y-1.5">
            {notices.map(n => (
              <div key={n.id} className="flex items-start justify-between gap-3 px-3 py-2 rounded-lg border border-dark-200 bg-dark-400/40">
                <div className="flex-1 min-w-0">
                  {n.url
                    ? <a href={n.url} target="_blank" rel="noreferrer" className="text-xs text-brand-400 hover:underline truncate block">{n.title}</a>
                    : <p className="text-xs truncate">{n.title}</p>
                  }
                </div>
                <span className="text-[10px] text-bnb-muted flex-shrink-0">{fmtDate(n.noticed_at)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {items.length === 0 && !loading && (
        <p className="text-xs text-bnb-muted text-center py-8">공지사항 없음</p>
      )}
    </div>
  );
}

// ── Crawl Status Panel ──────────────────────────────────────────────────────

type CrawlStatusData = Awaited<ReturnType<typeof api.getCrawlStatus>>;

const STATUS_CLS: Record<string, string> = {
  pass:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  error:   'bg-red-50 text-red-700 border-red-200',
  missing: 'bg-slate-100 text-slate-500 border-slate-200',
  running: 'bg-amber-50 text-amber-700 border-amber-200',
};
const STATUS_LABEL: Record<string, string> = {
  pass: 'PASS', error: 'FAIL', missing: '없음', running: '실행 중',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold ${STATUS_CLS[status] ?? STATUS_CLS.missing}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function fmtTs(ts: number | null | undefined): string {
  if (!ts) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(ts * 1000));
}

function CrawlStatusPanel() {
  const [data, setData]       = useState<CrawlStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await api.getCrawlStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetch, 3_600_000);
    return () => clearInterval(id);
  }, [autoRefresh, fetch]);

  async function handleTrigger() {
    try {
      setTriggering(true);
      // 개발 환경 기본 키: backend/app/core/config.py admin_api_key 기본값
      const key = import.meta.env.VITE_ADMIN_API_KEY ?? 'dev-secret-key';
      await api.triggerCrawl(key);
      setTimeout(fetch, 2000);
    } catch {
      alert('크롤 트리거 실패. 서버 설정을 확인하세요.');
    } finally {
      setTriggering(false);
    }
  }

  const run = data?.last_run;
  const isRunning = data?.running;
  const korea = data?.exchanges.filter(e => e.group === 'korea') ?? [];
  const global = data?.exchanges.filter(e => e.group === 'global') ?? [];

  const totalPass = data?.exchanges.filter(e => e.ticker === 'pass' && e.btc_wd === 'pass' && e.usdt_wd === 'pass').length ?? 0;
  const totalFail = data?.exchanges.filter(e => e.ticker === 'error' || e.btc_wd === 'error' || e.usdt_wd === 'error').length ?? 0;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {isRunning && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              <Lightning className="w-3 h-3 animate-pulse" weight="fill" />
              크롤링 실행 중
            </span>
          )}
          {run && !isRunning && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${run.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
              {run.status === 'completed' ? '완료' : '실패'}
            </span>
          )}
          {run && (
            <span className="text-xs text-slate-500">
              완료: {fmtTs(run.completed_at)} · ₩/$ {run.usd_krw_rate?.toLocaleString() ?? '-'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="rounded" />
            자동 갱신 (1시간)
          </label>
          <button
            onClick={fetch}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-bnb-text px-2.5 py-1.5 rounded border border-slate-200 bg-white transition-colors disabled:opacity-40"
          >
            <ArrowsClockwise className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
          <button
            onClick={handleTrigger}
            disabled={triggering || isRunning}
            className="flex items-center gap-1.5 text-xs text-stone-900 bg-brand-500 hover:bg-brand-400 disabled:opacity-40 px-2.5 py-1.5 rounded font-semibold transition-colors"
          >
            <Lightning className="w-3.5 h-3.5" weight="fill" />
            {triggering ? '트리거 중...' : '크롤 실행'}
          </button>
        </div>
      </div>

      {/* Summary badges */}
      {data && (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-500">전체 {data.exchanges.length}개 거래소</span>
          <span className="text-emerald-700 font-semibold">{totalPass}개 정상</span>
          {totalFail > 0 && <span className="text-red-600 font-semibold">{totalFail}개 오류</span>}
        </div>
      )}

      {error && <p className="text-red-600 text-xs">{error}</p>}

      {/* Exchange cards */}
      {data && (
        <div>
          {[
            { label: '국내 거래소', rows: korea },
            { label: '해외 거래소', rows: global },
          ].map(({ label, rows }) => (
            <div key={label} className="mb-4">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">{label}</p>
              <div className="space-y-2">
                {rows.map(ex => {
                  const allPass = ex.ticker === 'pass' && ex.btc_wd === 'pass' && ex.usdt_wd === 'pass';
                  const st = (s: string) => isRunning ? 'running' : s;
                  return (
                    <div
                      key={ex.exchange}
                      className={`rounded-lg border px-3 py-2.5 ${allPass ? 'border-slate-200 bg-white' : 'border-red-200 bg-red-50/40'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm capitalize text-bnb-text">{ex.exchange}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[10px] text-slate-400">티커</span>
                          <StatusBadge status={st(ex.ticker)} />
                          <span className="text-[10px] text-slate-400 ml-1">BTC</span>
                          <StatusBadge status={st(ex.btc_wd)} />
                          <span className="text-[10px] text-slate-400 ml-1">USDT</span>
                          <StatusBadge status={st(ex.usdt_wd)} />
                        </div>
                      </div>
                      {ex.errors.length > 0 && (
                        <p className="text-[11px] text-red-600 mt-1 leading-snug">{ex.errors.join(' · ')}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!data && !error && (
        <p className="text-slate-400 text-xs">로딩 중...</p>
      )}
    </div>
  );
}
