import type { BoardCategory } from '../../types';

// 카테고리별 라벨/뱃지/행 배경 색상 (공지=amber, 제보=blue, 일반=중립)
export const CATEGORY_META: Record<BoardCategory, {
  label: string;
  badgeClass: string;
  rowClass: string;
}> = {
  notice: {
    label: '공지',
    badgeClass: 'bg-acc-amber/15 text-acc-amber',
    rowClass: 'bg-acc-amber/5 border-acc-amber/30',
  },
  report: {
    label: '제보',
    badgeClass: 'bg-acc-blue/15 text-acc-blue',
    rowClass: '',
  },
  general: {
    label: '일반',
    badgeClass: 'bg-fill-secondary text-label-tertiary',
    rowClass: '',
  },
};

export const categoryMeta = (category: BoardCategory) =>
  CATEGORY_META[category] ?? CATEGORY_META.general;
