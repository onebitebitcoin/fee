import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PencilSimple, Trash, Warning } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import type { BoardComment, BoardPostDetail } from '../../types';
import { fmtKst } from '../explorer/constants';
import { categoryMeta } from './categoryStyle';
import { BoardLayout } from './BoardLayout';

function CommentItem({ comment, onChanged }: { comment: BoardComment; onChanged: () => void }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [content, setContent] = useState(comment.content);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitEdit() {
    setError(null);
    if (!content.trim()) return setError('내용을 입력하세요.');
    if (!password.trim()) return setError('비밀번호를 입력하세요.');
    setBusy(true);
    try {
      await api.updateBoardComment(comment.id, { content, password });
      setMode('view'); setPassword(''); onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '수정 실패'); setBusy(false);
    }
  }

  async function submitDelete() {
    setError(null);
    if (!password.trim()) return setError('비밀번호를 입력하세요.');
    setBusy(true);
    try {
      await api.deleteBoardComment(comment.id, password);
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '삭제 실패'); setBusy(false);
    }
  }

  return (
    <div className="ios-card rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-label-secondary">{comment.nickname}</span>
        <span className="text-[10px] text-label-quaternary">{fmtKst(comment.created_at)}</span>
        {mode === 'view' && (
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => { setMode('edit'); setContent(comment.content); }} className="text-[11px] text-label-tertiary hover:text-acc-amber transition-colors">수정</button>
            <span className="text-label-quaternary text-[10px]">·</span>
            <button onClick={() => setMode('delete')} className="text-[11px] text-label-tertiary hover:text-acc-red transition-colors">삭제</button>
          </div>
        )}
      </div>

      {mode === 'view' && (
        <p className="text-sm text-label-primary whitespace-pre-wrap break-words">{comment.content}</p>
      )}

      {mode === 'edit' && (
        <div className="space-y-2">
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={3}
            className="w-full bg-fill-tertiary rounded-xl px-3 py-2 text-sm text-label-primary outline-none resize-y" />
          <div className="flex gap-2">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호"
              className="flex-1 bg-fill-tertiary rounded-xl px-3 py-2 text-sm outline-none" />
            <button onClick={submitEdit} disabled={busy} className="px-4 rounded-xl text-xs font-semibold bg-acc-amber text-white disabled:opacity-50">저장</button>
            <button onClick={() => { setMode('view'); setError(null); setPassword(''); }} className="px-3 rounded-xl text-xs font-semibold bg-fill-secondary text-label-secondary">취소</button>
          </div>
        </div>
      )}

      {mode === 'delete' && (
        <div className="flex gap-2">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호 입력 후 삭제"
            className="flex-1 bg-fill-tertiary rounded-xl px-3 py-2 text-sm outline-none" />
          <button onClick={submitDelete} disabled={busy} className="px-4 rounded-xl text-xs font-semibold bg-acc-red text-white disabled:opacity-50">삭제</button>
          <button onClick={() => { setMode('view'); setError(null); setPassword(''); }} className="px-3 rounded-xl text-xs font-semibold bg-fill-secondary text-label-secondary">취소</button>
        </div>
      )}

      {error && <p className="text-[11px] text-acc-red mt-1.5">{error}</p>}
    </div>
  );
}

export function BoardDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const postId = id ? Number(id) : null;

  const [post, setPost] = useState<BoardPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [delPassword, setDelPassword] = useState('');
  const [delError, setDelError] = useState<string | null>(null);

  // 댓글 작성
  const [cNick, setCNick] = useState('');
  const [cContent, setCContent] = useState('');
  const [cPassword, setCPassword] = useState('');
  const [cBusy, setCBusy] = useState(false);
  const [cError, setCError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (postId == null) return;
    api.getBoardPost(postId)
      .then(setPost)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '글을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  async function confirmDelete() {
    if (postId == null) return;
    setDelError(null);
    if (!delPassword.trim()) return setDelError('비밀번호를 입력하세요.');
    try {
      await api.deleteBoardPost(postId, delPassword);
      navigate('/board');
    } catch (e: unknown) {
      setDelError(e instanceof Error ? e.message : '삭제 실패');
    }
  }

  async function submitComment() {
    if (postId == null) return;
    setCError(null);
    if (!cNick.trim()) return setCError('닉네임을 입력하세요.');
    if (!cContent.trim()) return setCError('내용을 입력하세요.');
    if (!cPassword.trim()) return setCError('비밀번호를 입력하세요.');
    setCBusy(true);
    try {
      await api.createBoardComment(postId, { nickname: cNick.trim(), content: cContent, password: cPassword });
      setCContent(''); setCPassword('');
      load();
    } catch (e: unknown) {
      setCError(e instanceof Error ? e.message : '댓글 등록 실패');
    } finally {
      setCBusy(false);
    }
  }

  const meta = post ? categoryMeta(post.category) : null;
  const isNotice = post?.category === 'notice';

  return (
    <BoardLayout title="게시글">
      {loading ? (
        <p className="text-center text-sm text-label-tertiary py-8">불러오는 중…</p>
      ) : error || !post ? (
        <div className="ios-card rounded-2xl px-4 py-3 text-sm text-acc-red">{error || '게시글이 없습니다.'}</div>
      ) : (
        <>
          {/* 본문 */}
          <div className={`ios-card rounded-2xl px-4 py-4 border ${meta?.rowClass || 'border-transparent'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${meta?.badgeClass}`}>{meta?.label}</span>
              <h1 className="flex-1 text-base font-bold text-label-primary break-words">{post.title}</h1>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-label-tertiary mb-3">
              <span className="font-medium text-label-secondary">{post.nickname}</span>
              <span className="text-label-quaternary">·</span>
              <span>{fmtKst(post.created_at)}</span>
            </div>
            <div className="h-px bg-separator mb-3" />
            <p className="text-sm text-label-primary whitespace-pre-wrap break-words leading-relaxed">{post.content}</p>
          </div>

          {/* 수정/삭제 (공지는 관리자 페이지에서만) */}
          {!isNotice && (
            <div className="flex gap-2">
              <button
                onClick={() => navigate(`/board/${post.id}/edit`)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-semibold bg-fill-secondary text-label-secondary hover:bg-fill-primary transition-colors"
              >
                <PencilSimple className="w-4 h-4" /> 수정
              </button>
              <button
                onClick={() => setDeleting(v => !v)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-semibold bg-acc-red/10 text-acc-red hover:bg-acc-red/15 transition-colors"
              >
                <Trash className="w-4 h-4" /> 삭제
              </button>
            </div>
          )}

          {deleting && !isNotice && (
            <div className="ios-card rounded-2xl px-4 py-3 space-y-2">
              <p className="text-xs text-label-secondary">삭제하려면 비밀번호를 입력하세요.</p>
              <div className="flex gap-2">
                <input type="password" value={delPassword} onChange={e => setDelPassword(e.target.value)} placeholder="비밀번호"
                  className="flex-1 bg-fill-tertiary rounded-xl px-3 py-2 text-sm outline-none" />
                <button onClick={confirmDelete} className="px-4 rounded-xl text-xs font-semibold bg-acc-red text-white">삭제 확인</button>
              </div>
              {delError && <p className="text-[11px] text-acc-red flex items-center gap-1"><Warning className="w-3 h-3" />{delError}</p>}
            </div>
          )}

          {/* 댓글 */}
          <div className="pt-1">
            <p className="text-[11px] font-semibold text-label-quaternary uppercase tracking-wider mb-2 px-1">
              댓글 {post.comments.length}
            </p>
            <div className="space-y-2">
              {post.comments.map(c => (
                <CommentItem key={c.id} comment={c} onChanged={load} />
              ))}
              {post.comments.length === 0 && (
                <p className="text-center text-xs text-label-tertiary py-3">첫 댓글을 남겨보세요.</p>
              )}
            </div>
          </div>

          {/* 댓글 작성 */}
          <div className="ios-card rounded-2xl px-4 py-3 space-y-2">
            <textarea value={cContent} onChange={e => setCContent(e.target.value)} rows={2} placeholder="댓글을 입력하세요"
              className="w-full bg-fill-tertiary rounded-xl px-3 py-2 text-sm text-label-primary outline-none resize-y placeholder:text-label-quaternary" />
            <div className="flex gap-2">
              <input value={cNick} onChange={e => setCNick(e.target.value)} placeholder="닉네임" maxLength={50}
                className="flex-1 min-w-0 bg-fill-tertiary rounded-xl px-3 py-2 text-sm outline-none placeholder:text-label-quaternary" />
              <input type="password" value={cPassword} onChange={e => setCPassword(e.target.value)} placeholder="비밀번호" maxLength={128}
                className="flex-1 min-w-0 bg-fill-tertiary rounded-xl px-3 py-2 text-sm outline-none placeholder:text-label-quaternary" />
              <button onClick={submitComment} disabled={cBusy} className="px-4 rounded-xl text-xs font-semibold bg-acc-amber text-white hover:bg-acc-orange transition-colors disabled:opacity-50">등록</button>
            </div>
            {cError && <p className="text-[11px] text-acc-red flex items-center gap-1"><Warning className="w-3 h-3" />{cError}</p>}
          </div>
        </>
      )}
    </BoardLayout>
  );
}

export default BoardDetailPage;
