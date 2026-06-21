import { useState, useEffect } from 'react';
import { ArrowsClockwise, FloppyDisk, Check, X } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import { SectionLabel } from './adminHelpers';

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

export function GatemanRegistryPanel() {
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

      <div>
        <SectionLabel>국내 거래소</SectionLabel>
        <div className="space-y-3">
          {Object.entries(data.domestic).map(([exId, gates]) => (
            <ExchangeGateEditor key={exId} label={exId} gates={gates}
              onChange={g => setData(d => d ? { ...d, domestic: { ...d.domestic, [exId]: g } } : d)} />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>해외 거래소</SectionLabel>
        <div className="space-y-3">
          {Object.entries(data.global).map(([exId, gates]) => (
            <ExchangeGateEditor key={exId} label={exId} gates={gates}
              onChange={g => setData(d => d ? { ...d, global: { ...d.global, [exId]: g } } : d)} />
          ))}
        </div>
      </div>

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
