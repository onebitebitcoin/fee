import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

export function CautionPanel({ group, exchanges }: {
  group: 'korea' | 'global';
  exchanges: { id: string; name: string }[];
}) {
  const ADMIN_KEY = sessionStorage.getItem('admin_key') ?? 'dev-secret-key';
  const [cautionMap, setCautionMap] = useState<Record<string, { caution: boolean; reason: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getCaution().then(data => {
      const init: Record<string, { caution: boolean; reason: string }> = {};
      for (const ex of exchanges) {
        init[ex.id] = { caution: data[ex.id]?.caution ?? false, reason: data[ex.id]?.reason ?? '' };
      }
      setCautionMap(init);
    }).catch(() => {});
  }, [exchanges]);

  async function save(id: string) {
    const cur = cautionMap[id];
    if (!cur) return;
    setSaving(s => ({ ...s, [id]: true }));
    try {
      await api.updateCaution(id, group, cur.caution, cur.reason || null, ADMIN_KEY);
      setMsg(m => ({ ...m, [id]: '저장됨' }));
      setTimeout(() => setMsg(m => { const n = { ...m }; delete n[id]; return n; }), 2000);
    } catch {
      setMsg(m => ({ ...m, [id]: '저장 실패' }));
      setTimeout(() => setMsg(m => { const n = { ...m }; delete n[id]; return n; }), 2000);
    } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  }

  return (
    <div className="space-y-2">
      {exchanges.map(ex => {
        const cur = cautionMap[ex.id] ?? { caution: false, reason: '' };
        return (
          <div key={ex.id} className="flex items-start gap-3 py-2.5 border-b border-sys-separator last:border-0">
            <div className="flex-1">
              <p className="text-xs font-semibold text-label-primary mb-1.5">{ex.name}</p>
              <input
                value={cur.reason}
                onChange={e => setCautionMap(m => ({ ...m, [ex.id]: { ...cur, reason: e.target.value } }))}
                disabled={!cur.caution}
                placeholder={cur.caution ? '유의 이유 입력...' : '유의 해제 상태'}
                className="w-full bg-white border border-[rgba(160,100,40,0.20)] rounded-xl px-3 py-1.5 text-xs outline-none focus:border-acc-amber/50 disabled:bg-fill-tertiary disabled:text-label-disabled"
              />
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0 pt-0.5">
              <button
                onClick={() => setCautionMap(m => ({ ...m, [ex.id]: { ...cur, caution: !cur.caution } }))}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                  cur.caution
                    ? 'bg-acc-red/10 text-acc-red'
                    : 'bg-fill-secondary text-label-tertiary'
                }`}
              >
                {cur.caution ? '유의' : '정상'}
              </button>
              <button
                onClick={() => save(ex.id)}
                disabled={saving[ex.id]}
                className={`text-[10px] px-2 py-0.5 rounded-lg transition-colors ${
                  msg[ex.id] === '저장됨'
                    ? 'text-acc-green'
                    : msg[ex.id] === '저장 실패'
                    ? 'text-acc-red'
                    : 'text-acc-amber hover:text-acc-orange'
                }`}
              >
                {saving[ex.id] ? '...' : msg[ex.id] ?? '저장'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
