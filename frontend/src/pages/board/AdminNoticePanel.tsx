import { useEffect, useState, useCallback } from 'react';
import { Megaphone, PencilSimple, Trash, FloppyDisk, X } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import type { BoardPostBrief } from '../../types';
import { fmtKst } from '../explorer/constants';

const adminKey = (): string => sessionStorage.getItem('admin_key') ?? 'dev-secret-key';

/** 관리자 페이지 내 "게시판 공지" 관리 패널 — 공지 작성/수정/삭제 (X-API-Key). */
export function AdminNoticePanel() {
  const [notices, setNotices] = useState<BoardPostBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.getBoardPosts({ size: 100 })
      .then(r => setNotices(r.notices))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setEditingId(null); setTitle(''); setContent(''); setError(null);
  }

  function startEdit(n: BoardPostBrief) {
    // 상세 본문을 가져와 편집 폼에 채운다
    api.getBoardPost(n.id).then(detail => {
      setEditingId(n.id); setTitle(detail.title); setContent(detail.content); setError(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : '불러오기 실패'));
  }

  async function submit() {
    setError(null); setMsg(null);
    if (!title.trim()) return setError('제목을 입력하세요.');
    if (!content.trim()) return setError('내용을 입력하세요.');
    setBusy(true);
    try {
      if (editingId != null) {
        await api.updateBoardPost(editingId, { title: title.trim(), content }, adminKey());
        setMsg('공지를 수정했습니다.');
      } else {
        await api.createBoardPost(
          { category: 'notice', title: title.trim(), content, nickname: '관리자' },
          adminKey(),
        );
        setMsg('공지를 등록했습니다.');
      }
      resetForm();
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm('이 공지를 삭제하시겠습니까?')) return;
    setError(null);
    try {
      await api.deleteBoardPost(id, undefined, adminKey());
      if (editingId === id) resetForm();
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    }
  }

  return (
    <div className="space-y-4">
      {/* 작성/수정 폼 */}
      <div className="ios-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-acc-amber" weight="fill" />
          <span className="font-bold text-sm text-label-primary">
            {editingId != null ? '공지 수정' : '새 공지 작성'}
          </span>
          {editingId != null && (
            <button onClick={resetForm} className="ml-auto text-xs text-label-tertiary hover:text-label-secondary flex items-center gap-1">
              <X className="w-3 h-3" /> 취소
            </button>
          )}
        </div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="공지 제목"
          maxLength={200}
          className="w-full bg-fill-tertiary rounded-xl px-3 py-2.5 text-sm text-label-primary outline-none placeholder:text-label-quaternary"
        />
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="공지 내용"
          rows={5}
          className="w-full bg-fill-tertiary rounded-xl px-3 py-2.5 text-sm text-label-primary outline-none resize-y placeholder:text-label-quaternary"
        />
        {error && <p className="text-xs text-acc-red">{error}</p>}
        {msg && <p className="text-xs text-acc-green">{msg}</p>}
        <button
          onClick={submit}
          disabled={busy}
          className="flex items-center gap-1.5 bg-acc-amber text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-acc-orange transition-colors disabled:opacity-50"
        >
          <FloppyDisk className="w-4 h-4" />
          {editingId != null ? '수정 저장' : '공지 등록'}
        </button>
      </div>

      {/* 공지 목록 */}
      <div className="ios-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-sys-separator">
          <span className="text-xs font-semibold text-label-secondary">등록된 공지 ({notices.length})</span>
        </div>
        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-label-tertiary">불러오는 중…</p>
        ) : notices.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-label-tertiary">등록된 공지가 없습니다.</p>
        ) : (
          <div className="divide-y divide-sys-separator">
            {notices.map(n => (
              <div key={n.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-label-primary truncate">{n.title}</p>
                  <p className="text-[11px] text-label-tertiary">{fmtKst(n.created_at)}</p>
                </div>
                <button onClick={() => startEdit(n)} className="p-1.5 rounded-lg hover:bg-fill-primary text-label-tertiary hover:text-acc-amber transition-colors" title="수정">
                  <PencilSimple className="w-4 h-4" />
                </button>
                <button onClick={() => remove(n.id)} className="p-1.5 rounded-lg hover:bg-fill-primary text-label-tertiary hover:text-acc-red transition-colors" title="삭제">
                  <Trash className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminNoticePanel;
