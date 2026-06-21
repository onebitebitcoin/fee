import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Warning } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import type { BoardCategory } from '../../types';
import { BoardLayout } from './BoardLayout';
import { isReportTemplate, parseReportContext, buildReportTemplate } from './reportTemplate';

const WRITE_CATEGORIES: { id: BoardCategory; label: string }[] = [
  { id: 'general', label: '일반' },
  { id: 'report', label: '제보' },
];

export function BoardWritePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const postId = id ? Number(id) : null;

  const [category, setCategory] = useState<BoardCategory>('general');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 편집 모드: 기존 글 로드
  useEffect(() => {
    if (!isEdit || postId == null) return;
    api.getBoardPost(postId)
      .then(p => {
        if (p.category === 'notice') {
          setError('공지글은 관리자 페이지에서 수정하세요.');
          return;
        }
        setCategory(p.category);
        setTitle(p.title);
        setContent(p.content);
        setNickname(p.nickname);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '글을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [isEdit, postId]);

  // 작성 모드: 제보 템플릿 프리필
  useEffect(() => {
    if (isEdit) return;
    if (isReportTemplate(searchParams)) {
      const tpl = buildReportTemplate(parseReportContext(searchParams));
      setCategory('report');
      setTitle(tpl.title);
      setContent(tpl.content);
    }
  }, [isEdit, searchParams]);

  async function handleSubmit() {
    setError(null);
    if (!title.trim()) return setError('제목을 입력하세요.');
    if (!content.trim()) return setError('내용을 입력하세요.');
    if (!nickname.trim()) return setError('닉네임을 입력하세요.');
    if (!password.trim()) return setError('비밀번호를 입력하세요.');

    setSubmitting(true);
    try {
      if (isEdit && postId != null) {
        await api.updateBoardPost(postId, { title: title.trim(), content, password });
        navigate(`/board/${postId}`);
      } else {
        const created = await api.createBoardPost({
          category, title: title.trim(), content, nickname: nickname.trim(), password,
        });
        navigate(`/board/${created.id}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <BoardLayout title={isEdit ? '글 수정' : '글쓰기'} onBack={() => navigate(isEdit && postId ? `/board/${postId}` : '/board')}>
      {loading ? (
        <p className="text-center text-sm text-label-tertiary py-8">불러오는 중…</p>
      ) : (
        <div className="space-y-3">
          {/* 카테고리 (작성 모드만) */}
          {!isEdit && (
            <div className="seg-ctrl inline-flex">
              {WRITE_CATEGORIES.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`relative px-5 py-1.5 text-xs font-semibold rounded-[8px] transition-colors ${
                    category === c.id ? 'bg-fill-primary text-label-primary' : 'text-label-secondary'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="제목"
            maxLength={200}
            className="w-full ios-card rounded-2xl px-4 py-3 text-sm font-semibold text-label-primary outline-none placeholder:text-label-quaternary"
          />

          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="내용을 입력하세요"
            rows={12}
            className="w-full ios-card rounded-2xl px-4 py-3 text-sm text-label-primary outline-none placeholder:text-label-quaternary resize-y leading-relaxed"
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="닉네임"
              maxLength={50}
              disabled={isEdit}
              className="ios-card rounded-2xl px-4 py-3 text-sm text-label-primary outline-none placeholder:text-label-quaternary disabled:opacity-50"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={isEdit ? '비밀번호 확인' : '비밀번호'}
              maxLength={128}
              className="ios-card rounded-2xl px-4 py-3 text-sm text-label-primary outline-none placeholder:text-label-quaternary"
            />
          </div>
          {isEdit && (
            <p className="text-[11px] text-label-tertiary px-1">작성 시 입력한 비밀번호를 입력해야 수정됩니다.</p>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-acc-red/10 text-acc-red text-sm">
              <Warning className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => navigate(isEdit && postId ? `/board/${postId}` : '/board')}
              className="flex-1 py-3 rounded-2xl font-semibold text-sm bg-fill-secondary text-label-secondary hover:bg-fill-primary transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-3 rounded-2xl font-bold text-sm bg-acc-amber text-white hover:bg-acc-orange transition-colors disabled:opacity-50"
            >
              {submitting ? '저장 중…' : isEdit ? '수정' : '등록'}
            </button>
          </div>
        </div>
      )}
    </BoardLayout>
  );
}

export default BoardWritePage;
