import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MagnifyingGlass, PencilSimple, ChatCircle, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import type { BoardListResponse, BoardPostBrief } from '../../types';
import { fmtKst } from '../explorer/constants';
import { categoryMeta } from './categoryStyle';
import { BoardLayout } from './BoardLayout';

const PAGE_SIZE = 20;

function PostRow({ post, onClick }: { post: BoardPostBrief; onClick: () => void }) {
  const meta = categoryMeta(post.category);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left ios-card rounded-2xl px-4 py-3 border transition-colors hover:bg-fill-primary ${
        meta.rowClass || 'border-transparent'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${meta.badgeClass}`}>
          {meta.label}
        </span>
        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-label-primary">
          {post.title}
        </span>
        {post.comment_count > 0 && (
          <span className="flex-shrink-0 flex items-center gap-0.5 text-[11px] text-acc-amber font-semibold">
            <ChatCircle className="w-3 h-3" weight="fill" />
            {post.comment_count}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-label-tertiary">
        <span className="font-medium text-label-secondary">{post.nickname}</span>
        <span className="text-label-quaternary">·</span>
        <span>{fmtKst(post.created_at)}</span>
      </div>
    </button>
  );
}

export function BoardListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const q = searchParams.get('q') || '';

  const [data, setData] = useState<BoardListResponse | null>(null);
  const [searchInput, setSearchInput] = useState(q);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.getBoardPosts({ page, size: PAGE_SIZE, q: q || undefined })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [page, q]);

  useEffect(() => { load(); }, [load]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (searchInput.trim()) next.set('q', searchInput.trim());
    setSearchParams(next);
  }

  function goPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <BoardLayout
      title="게시판"
      onBack={() => navigate('/')}
      right={
        <button
          onClick={() => navigate('/board/new')}
          className="flex items-center gap-1 bg-acc-amber text-white text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-acc-orange transition-colors"
        >
          <PencilSimple className="w-3.5 h-3.5" weight="bold" />
          글쓰기
        </button>
      }
    >
      {/* 검색 */}
      <form onSubmit={submitSearch} className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 ios-card rounded-2xl px-3 py-2.5">
          <MagnifyingGlass className="w-4 h-4 text-label-tertiary flex-shrink-0" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="제목·내용 검색"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none text-label-primary placeholder:text-label-quaternary"
          />
        </div>
        <button type="submit" className="bg-fill-primary text-label-secondary text-xs font-semibold px-4 rounded-2xl hover:bg-fill-secondary transition-colors">
          검색
        </button>
      </form>

      {q && (
        <p className="text-[11px] text-label-tertiary px-1">
          "{q}" 검색 결과 {data?.total ?? 0}건 ·{' '}
          <button onClick={() => setSearchParams(new URLSearchParams())} className="text-acc-amber font-semibold">전체보기</button>
        </p>
      )}

      {error && (
        <div className="ios-card rounded-2xl px-4 py-3 text-sm text-acc-red">{error}</div>
      )}

      {loading && !data ? (
        <p className="text-center text-sm text-label-tertiary py-8">불러오는 중…</p>
      ) : (
        <div className="space-y-2">
          {/* 공지: 모든 페이지 상단 고정 (검색 없을 때만) */}
          {!q && data?.notices.map(p => (
            <PostRow key={`n-${p.id}`} post={p} onClick={() => navigate(`/board/${p.id}`)} />
          ))}
          {data?.items.map(p => (
            <PostRow key={p.id} post={p} onClick={() => navigate(`/board/${p.id}`)} />
          ))}
          {data && data.items.length === 0 && data.notices.length === 0 && (
            <p className="text-center text-sm text-label-tertiary py-8">게시글이 없습니다.</p>
          )}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-2">
          <button
            onClick={() => goPage(page - 1)}
            disabled={page <= 1}
            className="p-2 rounded-xl hover:bg-fill-primary disabled:opacity-30 transition-colors"
          >
            <CaretLeft className="w-4 h-4 text-label-secondary" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => goPage(p)}
              className={`min-w-8 h-8 px-2 rounded-xl text-xs font-semibold transition-colors ${
                p === page ? 'bg-acc-amber text-white' : 'text-label-secondary hover:bg-fill-primary'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => goPage(page + 1)}
            disabled={page >= totalPages}
            className="p-2 rounded-xl hover:bg-fill-primary disabled:opacity-30 transition-colors"
          >
            <CaretRight className="w-4 h-4 text-label-secondary" />
          </button>
        </div>
      )}
    </BoardLayout>
  );
}

export default BoardListPage;
