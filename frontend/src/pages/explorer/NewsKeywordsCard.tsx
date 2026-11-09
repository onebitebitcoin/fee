// 첫 화면 비트코인 주요 이슈 카드. my-news 가 같은 사건 기사를 묶어 이름 붙인 순위를 보여 준다.
// 평소에는 실시간 검색어처럼 한 줄씩 넘어가고, 누르면 1~10위가 펼쳐진다. 순위를 누르면 그 사건의 최신 기사가 나온다.
import { useEffect, useState } from 'react';
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import type { NewsKeyword, NewsKeywordsResponse } from '../../types';
import { fmtTimeKst, isSurging, parseNewsTime } from './marketOverview';

const REFRESH_MS = 5 * 60 * 1000;
const ROLL_MS = 2600;
const TOP_N = 10;

export function NewsKeywordsCard() {
  const [data, setData] = useState<NewsKeywordsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => api.getNewsKeywords()
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch((e: Error) => { if (alive) setError(e.message); });
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const rank = (data?.rank ?? []).slice(0, TOP_N);

  useEffect(() => {
    if (rank.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setCur(c => (c + 1) % rank.length), ROLL_MS);
    return () => clearInterval(id);
  }, [rank.length]);

  if (!data) {
    return (
      <div className="ios-card rounded-2xl px-4 py-3">
        <p className={`text-[11px] text-center ${error ? 'text-acc-red' : 'text-label-tertiary'}`}>
          {error ? `주요 이슈를 불러오지 못했습니다: ${error}` : '주요 이슈 불러오는 중…'}
        </p>
      </div>
    );
  }

  const top = rank[cur % Math.max(rank.length, 1)];
  const updated = fmtTimeKst(parseNewsTime(data.generated_at));

  return (
    <div className="ios-card rounded-2xl px-4 py-3">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[12px] font-bold text-label-primary">비트코인 주요 이슈</p>
        <p className={`text-[10px] num ${data.stale ? 'text-acc-orange' : 'text-label-tertiary'}`}>
          {data.stale ? `갱신 지연 · ${updated} 기준` : '최근 24시간'}
        </p>
      </div>

      {rank.length === 0 ? (
        <p className="text-[11px] text-label-tertiary text-center py-1">지난 24시간에 여러 매체가 다룬 이슈가 없습니다.</p>
      ) : (
        <button
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="w-full flex items-center gap-2 h-9 px-3 rounded-xl bg-fill-tertiary text-left"
        >
          <span className="flex items-center gap-1 text-[10px] font-bold text-acc-red flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-acc-red animate-pulse" />LIVE
          </span>
          {top && (
            <span key={top.name} className="flex items-center gap-2 min-w-0 flex-1 animate-[fadeUp_.45s_ease-out]">
              <span className="text-[13px] font-bold text-acc-brand num w-4 text-right">{(cur % rank.length) + 1}</span>
              <span className="text-[13px] font-semibold text-label-primary truncate">{top.name}</span>
            </span>
          )}
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-acc-brand flex-shrink-0">
            {open ? '접기' : '순위'}
            <CaretDown className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} weight="bold" />
          </span>
        </button>
      )}

      {open && (
        <ol className="mt-1">
          {rank.map((k, i) => <KeywordRow key={k.name} k={k} rank={i + 1} max={rank[0].count} />)}
        </ol>
      )}
    </div>
  );
}

function KeywordRow({ k, rank, max }: { k: NewsKeyword; rank: number; max: number }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-separator first:border-t-0">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full grid grid-cols-[20px_1fr_12px] items-center gap-2.5 py-2 text-left"
      >
        <span className={`text-[14px] font-bold text-center num ${rank <= 3 ? 'text-acc-brand' : 'text-label-tertiary'}`}>{rank}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-label-primary">
            {k.name}
            {isSurging(k) && <span className="text-[9px] font-bold text-acc-red">급상승</span>}
          </span>
          <span className="block h-1 mt-1 rounded-full bg-acc-brand/15 overflow-hidden">
            <span className="block h-full rounded-full bg-acc-brand" style={{ width: `${(k.count / max) * 100}%` }} />
          </span>
        </span>
        <CaretRight className={`w-3 h-3 text-label-quaternary transition-transform ${open ? 'rotate-90' : ''}`} weight="bold" />
      </button>
      {open && (
        <ul className="ml-[30px] mb-2 space-y-1.5">
          {k.items.map(it => (
            <li key={it.url}>
              <a href={it.url} target="_blank" rel="noopener noreferrer" className="block text-[12px] leading-snug text-label-primary hover:text-acc-brand">
                {it.title}
              </a>
              <span className="text-[10px] text-label-tertiary num">{it.src} · {fmtTimeKst(parseNewsTime(it.at))}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
