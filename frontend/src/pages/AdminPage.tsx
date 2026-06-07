import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FloppyDisk, ArrowCounterClockwise, LockKey,
  PencilSimple, Check, X, ArrowsClockwise, Lightning, WarningCircle,
} from '@phosphor-icons/react';
import { api } from '../lib/api';
import {
  loadAdminSettings, saveAdminSettings, resetAdminSettings,
  type AdminSettings, type KoreanExchangeNode, type GlobalExchangeNode,
} from '../lib/adminSettings';

const ADMIN_PASSWORD = '0000';

// ── Design helpers ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-label-tertiary uppercase tracking-[0.12em] mb-2 px-1">
      {children}
    </p>
  );
}

// ── Inline editable cell ──────────────────────────────────────────────────────

function EditCell({
  value, onSave, type = 'text', nullable = false,
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
  function cancel() { setDraft(value === null ? '' : String(value)); setEditing(false); }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-left hover:text-acc-amber transition-colors group"
      >
        <span>
          {value === null
            ? <span className="text-label-disabled italic">없음</span>
            : String(value)}
        </span>
        <PencilSimple className="w-3 h-3 text-label-disabled group-hover:text-acc-amber flex-shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus type={type} value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
        className="w-full bg-white border border-[rgba(160,100,40,0.25)] rounded-lg px-1.5 py-0.5 text-xs outline-none focus:border-acc-amber/50"
      />
      <button onClick={commit} className="text-acc-green"><Check className="w-3.5 h-3.5" /></button>
      <button onClick={cancel} className="text-acc-red"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

// ── Field row ──────────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-sys-separator last:border-0">
      <span className="text-xs text-label-tertiary flex-shrink-0 mt-0.5 w-28">{label}</span>
      <div className="flex-1 text-right text-xs text-label-primary">{children}</div>
    </div>
  );
}

// ── Korean Exchange Table ─────────────────────────────────────────────────────

function KoreanExchangeTable({
  nodes, onChange,
}: {
  nodes: KoreanExchangeNode[];
  onChange: (nodes: KoreanExchangeNode[]) => void;
}) {
  function update(idx: number, patch: Partial<KoreanExchangeNode>) {
    onChange(nodes.map((n, i) => i === idx ? { ...n, ...patch } : n));
  }

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-sys-separator">
              {['거래소', '거래 수수료 (%)', '1회 KRW 제한', '일일 BTC 한도', '개인지갑 요건', '비고'].map(h => (
                <th key={h} className="text-left py-2 px-3 text-label-tertiary font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nodes.map((node, i) => (
              <tr key={node.id} className="border-b border-sys-separator hover:bg-fill-primary transition-colors">
                <td className="py-2.5 px-3 font-semibold text-label-primary">{node.name}</td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.takerFeePct} type="number" onSave={v => update(i, { takerFeePct: Number(v) })} /></td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.perTxKrwLimit} type="number" nullable onSave={v => update(i, { perTxKrwLimit: v === null ? null : Number(v) })} /></td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.dailyBtcLimitVerified} type="number" nullable onSave={v => update(i, { dailyBtcLimitVerified: v === null ? null : Number(v) })} /></td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.personalWalletNote} onSave={v => update(i, { personalWalletNote: String(v ?? '') })} /></td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.notes} onSave={v => update(i, { notes: String(v ?? '') })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-label-tertiary mt-2 px-3">공개 정보 기준 추정치. 실제 한도는 각 거래소 확인 필요.</p>
      </div>

      <div className="md:hidden space-y-3">
        {nodes.map((node, i) => (
          <div key={node.id} className="ios-card rounded-2xl p-4">
            <p className="font-semibold text-sm text-label-primary mb-3">{node.name}</p>
            <FieldRow label="거래 수수료 (%)"><EditCell value={node.takerFeePct} type="number" onSave={v => update(i, { takerFeePct: Number(v) })} /></FieldRow>
            <FieldRow label="1회 KRW 제한"><EditCell value={node.perTxKrwLimit} type="number" nullable onSave={v => update(i, { perTxKrwLimit: v === null ? null : Number(v) })} /></FieldRow>
            <FieldRow label="일일 BTC 한도"><EditCell value={node.dailyBtcLimitVerified} type="number" nullable onSave={v => update(i, { dailyBtcLimitVerified: v === null ? null : Number(v) })} /></FieldRow>
            <FieldRow label="개인지갑 요건"><EditCell value={node.personalWalletNote} onSave={v => update(i, { personalWalletNote: String(v ?? '') })} /></FieldRow>
            <FieldRow label="비고"><EditCell value={node.notes} onSave={v => update(i, { notes: String(v ?? '') })} /></FieldRow>
          </div>
        ))}
        <p className="text-[11px] text-label-tertiary px-1">공개 정보 기준 추정치. 실제 한도는 각 거래소 확인 필요.</p>
      </div>
    </>
  );
}

// ── Global Exchange Table ─────────────────────────────────────────────────────

function GlobalExchangeTable({
  nodes, onChange,
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
      className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
        node.fatca ? 'bg-acc-red/10 text-acc-red' : 'bg-fill-secondary text-label-tertiary'
      }`}
    >
      {node.fatca ? '대상' : '비대상'}
    </button>
  );

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-sys-separator">
              {['거래소', '국가', 'CARF 연도', '거래 수수료 (%)', 'FATCA', '비고'].map(h => (
                <th key={h} className="text-left py-2 px-3 text-label-tertiary font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nodes.map((node, i) => (
              <tr key={node.id} className="border-b border-sys-separator hover:bg-fill-primary transition-colors">
                <td className="py-2.5 px-3 font-semibold text-label-primary">{node.name}</td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.country} onSave={v => update(i, { country: String(v ?? '') })} /></td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.carfYear} type="number" nullable onSave={v => update(i, { carfYear: v === null ? null : Number(v) })} /></td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.takerFeePct} type="number" onSave={v => update(i, { takerFeePct: Number(v) })} /></td>
                <td className="py-2.5 px-3"><FatcaBtn node={node} i={i} /></td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.notes} onSave={v => update(i, { notes: String(v ?? '') })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {nodes.map((node, i) => (
          <div key={node.id} className="ios-card rounded-2xl p-4">
            <p className="font-semibold text-sm text-label-primary mb-3">{node.name}</p>
            <FieldRow label="국가"><EditCell value={node.country} onSave={v => update(i, { country: String(v ?? '') })} /></FieldRow>
            <FieldRow label="CARF 연도"><EditCell value={node.carfYear} type="number" nullable onSave={v => update(i, { carfYear: v === null ? null : Number(v) })} /></FieldRow>
            <FieldRow label="거래 수수료 (%)"><EditCell value={node.takerFeePct} type="number" onSave={v => update(i, { takerFeePct: Number(v) })} /></FieldRow>
            <FieldRow label="FATCA"><FatcaBtn node={node} i={i} /></FieldRow>
            <FieldRow label="비고"><EditCell value={node.notes} onSave={v => update(i, { notes: String(v ?? '') })} /></FieldRow>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Edge Properties Section ───────────────────────────────────────────────────

function EdgePropertiesSection() {
  const sourceCls = (s: string) =>
    s === '크롤링'     ? 'bg-acc-blue/10 text-acc-blue'   :
    s === '어드민 설정' ? 'bg-acc-amber/10 text-acc-amber' :
                          'bg-fill-secondary text-label-tertiary';

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
        { name: 'network', desc: '비트코인, 라이트닝 등', source: '크롤링' },
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
    c === 'blue' ? 'bg-acc-blue' :
    c === 'amber' ? 'bg-acc-amber' :
    c === 'green' ? 'bg-acc-green' : 'bg-label-disabled';

  return (
    <div className="space-y-3">
      <p className="text-xs text-label-tertiary">수수료는 실시간 크롤 데이터. 아래는 각 엣지 속성 정의입니다.</p>
      {sections.map(sec => (
        <div key={sec.title} className="ios-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls(sec.color)}`} />
            <span className="text-xs font-semibold text-label-primary">{sec.title}</span>
          </div>
          <div className="space-y-2">
            {sec.props.map(p => (
              <div key={p.name} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] font-mono text-acc-amber block">{p.name}</span>
                  <span className="text-[11px] text-label-secondary">{p.desc}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${sourceCls(p.source)}`}>
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
              type="password"
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className={`w-full bg-white border rounded-2xl px-4 py-3 text-sm outline-none text-center tracking-widest ${
                pwError ? 'border-acc-red' : 'border-[rgba(160,100,40,0.20)] focus:border-acc-amber/50'
              }`}
              placeholder="••••"
              maxLength={8}
            />
            {pwError && <p className="text-xs text-acc-red mt-1.5 text-center">비밀번호가 틀렸습니다</p>}
            <button
              onClick={handleLogin}
              className="w-full mt-4 bg-acc-amber text-white font-semibold text-sm py-3 rounded-2xl hover:bg-acc-orange transition-colors shadow-glow-amber"
            >
              로그인
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full mt-2 text-xs text-label-tertiary hover:text-label-secondary transition-colors py-2"
            >
              메인으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Admin UI ───────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string }[] = [
    { id: 'korean',  label: '국내 거래소' },
    { id: 'global',  label: '해외 거래소' },
    { id: 'edges',   label: '엣지 속성' },
    { id: 'gateman', label: '게이트맨' },
    { id: 'notices', label: '공지사항' },
    { id: 'crawl',   label: '크롤 상태' },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="glass-header sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="p-1.5 rounded-xl hover:bg-fill-primary transition-colors mr-1"
            >
              <ArrowLeft className="w-4 h-4 text-label-secondary" />
            </button>
            <LockKey className="w-4 h-4 text-acc-amber" weight="fill" />
            <span className="font-bold text-sm text-label-primary tracking-tight">관리자 설정</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs text-label-tertiary hover:text-label-secondary px-2.5 py-1.5 rounded-xl hover:bg-fill-primary transition-colors"
            >
              <ArrowCounterClockwise className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">초기화</span>
            </button>
            <button
              onClick={handleSave}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-semibold transition-colors ${
                saved
                  ? 'bg-acc-green/15 text-acc-green'
                  : 'bg-acc-amber text-white shadow-glow-sm hover:bg-acc-orange'
              }`}
            >
              <FloppyDisk className="w-3.5 h-3.5" />
              <span>{saved ? '저장됨' : '저장'}</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 border-t border-sys-separator overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-0 min-w-max">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'border-acc-amber text-acc-amber'
                    : 'border-transparent text-label-tertiary hover:text-label-secondary'
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
        {(tab === 'korean' || tab === 'global' || tab === 'edges') && (
          <div className="ios-card rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-sys-separator">
              <p className="text-xs text-label-secondary">
                {tab === 'korean' && '국내 거래소 노드 속성 — 셀을 클릭해 편집. 저장 후 메인 화면에 반영됩니다.'}
                {tab === 'global' && '해외 거래소 노드 속성 — 셀을 클릭해 편집. 미국세금신고(FATCA) 버튼으로 토글.'}
                {tab === 'edges'  && '출금 엣지(Transfer Edge) 속성 정의 — 크롤링 데이터는 실시간 갱신됨.'}
              </p>
            </div>
            <div className="p-4">
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
              {tab === 'edges' && <EdgePropertiesSection />}
            </div>
          </div>
        )}
        {tab === 'gateman' && <GatemanRegistryPanel />}
        {tab === 'notices' && <NoticesPanel />}
        {tab === 'crawl'   && <CrawlStatusPanel />}
      </main>
    </div>
  );
}

// ── GatemanRegistryPanel ───────────────────────────────────────────────────────

type GateLevel = 'required' | 'conditional' | 'info';
interface GateItem { label: string; desc: string; level: GateLevel; condition: string | null }
type RegistryData = { domestic: Record<string, GateItem[]>; global: Record<string, GateItem[]>; onchain: GateItem[] };

const LEVEL_CFG = {
  required:    { badge: 'bg-acc-red/10 text-acc-red',       label: '필수' },
  conditional: { badge: 'bg-acc-amber/10 text-acc-amber',   label: '조건부' },
  info:        { badge: 'bg-acc-blue/10 text-acc-blue',     label: '참고' },
};

function GateItemRow({ item, onDelete, onChange }: {
  item: GateItem;
  onDelete: () => void;
  onChange: (patch: Partial<GateItem>) => void;
}) {
  return (
    <div className="flex gap-2 items-start p-3 rounded-xl bg-fill-tertiary border border-sys-separator">
      <div className="flex-1 space-y-1.5">
        <input
          value={item.label}
          onChange={e => onChange({ label: e.target.value })}
          className="w-full bg-white border border-[rgba(160,100,40,0.20)] rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-acc-amber/50"
          placeholder="라벨"
        />
        <textarea
          value={item.desc}
          onChange={e => onChange({ desc: e.target.value })}
          rows={2}
          className="w-full bg-white border border-[rgba(160,100,40,0.20)] rounded-xl px-2.5 py-1.5 text-[11px] text-label-secondary outline-none focus:border-acc-amber/50 resize-none"
          placeholder="설명"
        />
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={item.level}
            onChange={e => onChange({ level: e.target.value as GateLevel })}
            className="bg-white border border-[rgba(160,100,40,0.20)] rounded-lg px-1.5 py-0.5 text-[10px] outline-none"
          >
            {(['required', 'conditional', 'info'] as GateLevel[]).map(l => (
              <option key={l} value={l}>{LEVEL_CFG[l].label}</option>
            ))}
          </select>
          <input
            value={item.condition ?? ''}
            onChange={e => onChange({ condition: e.target.value || null })}
            className="flex-1 bg-white border border-[rgba(160,100,40,0.20)] rounded-lg px-2 py-0.5 text-[10px] outline-none focus:border-acc-amber/50"
            placeholder="조건 (선택)"
          />
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${LEVEL_CFG[item.level].badge}`}>
            {LEVEL_CFG[item.level].label}
          </span>
        </div>
      </div>
      <button onClick={onDelete} className="text-label-tertiary hover:text-acc-red transition-colors mt-1 flex-shrink-0">
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
    <div className="ios-card rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-sys-separator">
        <span className="text-xs font-semibold text-label-primary">{label}</span>
        <button
          onClick={addGate}
          className="text-[10px] text-acc-amber hover:text-acc-orange flex items-center gap-1 transition-colors"
        >
          <Check className="w-3 h-3" /> 항목 추가
        </button>
      </div>
      <div className="p-3 space-y-2">
        {gates.length === 0 && (
          <p className="text-[10px] text-label-tertiary py-1">게이트 항목 없음</p>
        )}
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

  if (loading) return <div className="text-xs text-label-tertiary py-8 text-center">로딩 중...</div>;
  if (!data)   return <div className="text-xs text-acc-red py-8 text-center">데이터 없음</div>;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="ios-card rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-label-secondary space-y-0.5">
          {meta && (
            <>
              <p>최근 업데이트: <span className="text-label-primary font-medium">{fmtDate(meta.updated_at)}</span></p>
              <p>출처: <span className={
                meta.updated_source === 'crawl'  ? 'text-acc-blue' :
                meta.updated_source === 'manual' ? 'text-acc-amber' :
                'text-label-tertiary'
              }>{meta.updated_source}</span></p>
            </>
          )}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {msg && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              msg.ok ? 'bg-acc-green/10 text-acc-green' : 'bg-acc-red/10 text-acc-red'
            }`}>{msg.text}</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl ios-card text-label-secondary hover:text-label-primary transition-colors disabled:opacity-40"
          >
            <ArrowsClockwise className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? '크롤링 중...' : '새로고침'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-acc-amber text-white font-semibold shadow-glow-sm hover:bg-acc-orange transition-colors disabled:opacity-40"
          >
            <FloppyDisk className="w-3.5 h-3.5" />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* 국내 거래소 */}
      <div>
        <SectionLabel>국내 거래소</SectionLabel>
        <div className="space-y-3">
          {Object.entries(data.domestic).map(([exId, gates]) => (
            <ExchangeGateEditor key={exId} label={exId} gates={gates}
              onChange={g => setData(d => d ? { ...d, domestic: { ...d.domestic, [exId]: g } } : d)} />
          ))}
        </div>
      </div>

      {/* 해외 거래소 */}
      <div>
        <SectionLabel>해외 거래소</SectionLabel>
        <div className="space-y-3">
          {Object.entries(data.global).map(([exId, gates]) => (
            <ExchangeGateEditor key={exId} label={exId} gates={gates}
              onChange={g => setData(d => d ? { ...d, global: { ...d.global, [exId]: g } } : d)} />
          ))}
        </div>
      </div>

      {/* 온체인 공통 */}
      <div>
        <SectionLabel>온체인 공통 주의사항</SectionLabel>
        <ExchangeGateEditor
          label="onchain"
          gates={data.onchain}
          onChange={g => setData(d => d ? { ...d, onchain: g } : d)}
        />
      </div>
    </div>
  );
}

// ── NoticesPanel ──────────────────────────────────────────────────────────────

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
    <div className="space-y-4">
      <div className="ios-card rounded-2xl p-4 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-label-secondary">
          {lastFetch && <span>마지막 조회: {fmtDate(lastFetch.toISOString())}</span>}
          <span className="ml-3 text-label-tertiary">공지 {items.length}건</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-label-tertiary cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            1시간 자동 갱신
          </label>
          <button
            onClick={fetchNotices}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl ios-card text-label-secondary hover:text-label-primary transition-colors disabled:opacity-40"
          >
            <ArrowsClockwise className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {Object.entries(byExchange).map(([exchange, notices]) => (
        <div key={exchange}>
          <SectionLabel>{exchange}</SectionLabel>
          <div className="ios-card rounded-2xl divide-y divide-sys-separator">
            {notices.map(n => (
              <div key={n.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  {n.url
                    ? <a href={n.url} target="_blank" rel="noreferrer" className="text-xs text-acc-amber hover:underline truncate block">{n.title}</a>
                    : <p className="text-xs text-label-primary truncate">{n.title}</p>
                  }
                </div>
                <span className="text-[10px] text-label-tertiary flex-shrink-0">{fmtDate(n.noticed_at)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {items.length === 0 && !loading && (
        <p className="text-xs text-label-tertiary text-center py-8">공지사항 없음</p>
      )}
    </div>
  );
}

// ── Crawl Status Panel ────────────────────────────────────────────────────────

type CrawlStatusData = Awaited<ReturnType<typeof api.getCrawlStatus>>;

const STATUS_CLS: Record<string, string> = {
  pass:    'bg-acc-green/10 text-acc-green',
  error:   'bg-acc-red/10 text-acc-red',
  missing: 'bg-fill-secondary text-label-tertiary',
  running: 'bg-acc-amber/10 text-acc-amber',
};
const STATUS_LABEL: Record<string, string> = {
  pass: 'PASS', error: 'FAIL', missing: '없음', running: '실행 중',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CLS[status] ?? STATUS_CLS.missing}`}>
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

  // 크롤 실행 중일 때 5초 간격으로 폴링
  useEffect(() => {
    if (!data?.running) return;
    const id = setInterval(fetch, 5_000);
    return () => clearInterval(id);
  }, [data?.running, fetch]);

  async function handleTrigger() {
    try {
      setTriggering(true);
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
    <div className="space-y-4">
      {/* 상태 헤더 */}
      <div className="ios-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {isRunning && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-acc-amber bg-acc-amber/10 px-2.5 py-1 rounded-full">
                <Lightning className="w-3 h-3 animate-pulse" weight="fill" />
                크롤링 실행 중
              </span>
            )}
            {run && !isRunning && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                run.status === 'completed' ? 'bg-acc-green/10 text-acc-green' : 'bg-acc-red/10 text-acc-red'
              }`}>
                {run.status === 'completed' ? '완료' : '실패'}
              </span>
            )}
            {run && (
              <span className="text-xs text-label-tertiary">
                완료: {fmtTs(run.completed_at)} · ₩/$ {run.usd_krw_rate?.toLocaleString() ?? '-'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-label-tertiary cursor-pointer">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
              자동 갱신 (1시간)
            </label>
            <button
              onClick={fetch}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-label-secondary hover:text-label-primary px-2.5 py-1.5 rounded-xl ios-card transition-colors disabled:opacity-40"
            >
              <ArrowsClockwise className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
            <button
              onClick={handleTrigger}
              disabled={triggering || isRunning}
              className="flex items-center gap-1.5 text-xs text-white bg-acc-amber hover:bg-acc-orange disabled:opacity-40 px-2.5 py-1.5 rounded-xl font-semibold transition-colors shadow-glow-sm"
            >
              <Lightning className="w-3.5 h-3.5" weight="fill" />
              {triggering ? '트리거 중...' : '크롤 실행'}
            </button>
          </div>
        </div>

        {data && (
          <div className="flex items-center gap-3 text-xs pt-1 border-t border-sys-separator">
            <span className="text-label-tertiary">전체 {data.exchanges.length}개 거래소</span>
            <span className="text-acc-green font-semibold">{totalPass}개 정상</span>
            {totalFail > 0 && <span className="text-acc-red font-semibold">{totalFail}개 오류</span>}
          </div>
        )}
      </div>

      {error && <p className="text-acc-red text-xs px-1">{error}</p>}

      {/* 조치 필요: 출금 활성이지만 수수료가 비어 경로에서 제외되는 데이터 갭 */}
      {data && data.data_gaps.length > 0 && (
        <div className="ios-card rounded-xl px-4 py-3 border border-acc-amber/30 bg-acc-amber/5">
          <div className="flex items-center gap-1.5 mb-2">
            <WarningCircle className="w-4 h-4 text-acc-amber" weight="fill" />
            <span className="text-sm font-semibold text-label-primary">조치 필요 · 데이터 갭 {data.data_gaps.length}건</span>
          </div>
          <p className="text-[11px] text-label-secondary mb-2 leading-snug">
            출금이 활성 상태이지만 수수료가 수집되지 않아 해당 경로가 계산에서 제외됩니다. 크롤을 다시 실행하거나 수수료를 보완하세요.
          </p>
          <div className="space-y-1">
            {data.data_gaps.map((g, i) => (
              <div key={`${g.exchange}-${g.coin}-${g.network_label}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium capitalize text-label-primary">
                  {g.exchange} · {g.coin}
                  {g.network_label && <span className="text-label-tertiary"> ({g.network_label})</span>}
                </span>
                <span className="text-[11px] text-acc-amber flex-shrink-0">{g.issue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exchange cards */}
      {data && [
        { label: '국내 거래소', rows: korea },
        { label: '해외 거래소', rows: global },
      ].map(({ label, rows }) => (
        <div key={label}>
          <SectionLabel>{label}</SectionLabel>
          <div className="space-y-2">
            {rows.map(ex => {
              const allPass = ex.ticker === 'pass' && ex.btc_wd === 'pass' && ex.usdt_wd === 'pass';
              const st = (s: string) => isRunning ? 'running' : s;
              return (
                <div
                  key={ex.exchange}
                  className={`ios-card rounded-xl px-4 py-3 ${allPass ? '' : 'border-acc-red/25'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm capitalize text-label-primary">{ex.exchange}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                      <span className="text-[10px] text-label-tertiary">티커</span>
                      <StatusBadge status={st(ex.ticker)} />
                      <span className="text-[10px] text-label-tertiary ml-1">BTC</span>
                      <StatusBadge status={st(ex.btc_wd)} />
                      <span className="text-[10px] text-label-tertiary ml-1">USDT</span>
                      <StatusBadge status={st(ex.usdt_wd)} />
                    </div>
                  </div>
                  {ex.errors.length > 0 && (
                    <p className="text-[11px] text-acc-red mt-1.5 leading-snug">{ex.errors.join(' · ')}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!data && !error && (
        <p className="text-label-tertiary text-xs text-center py-8">로딩 중...</p>
      )}
    </div>
  );
}
