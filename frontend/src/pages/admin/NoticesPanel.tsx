import { useState, useEffect } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import { SectionLabel } from './adminHelpers';

type NoticeItem = {
  id: number; exchange: string; title: string; url: string | null;
  published_at: string | null; noticed_at: string | null;
};

export function NoticesPanel() {
  const [items, setItems] = useState<NoticeItem[]>([]);
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

  const byExchange = items.reduce<Record<string, NoticeItem[]>>((acc, n) => {
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
