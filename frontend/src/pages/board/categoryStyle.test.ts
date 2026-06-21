import { describe, it, expect } from 'vitest';
import { categoryMeta, CATEGORY_META } from './categoryStyle';

describe('categoryStyle', () => {
  it('공지는 amber, 제보는 blue 색상 클래스를 가진다', () => {
    expect(CATEGORY_META.notice.badgeClass).toContain('acc-amber');
    expect(CATEGORY_META.notice.rowClass).toContain('acc-amber');
    expect(CATEGORY_META.report.badgeClass).toContain('acc-blue');
  });

  it('라벨 매핑', () => {
    expect(categoryMeta('notice').label).toBe('공지');
    expect(categoryMeta('report').label).toBe('제보');
    expect(categoryMeta('general').label).toBe('일반');
  });

  it('알 수 없는 카테고리는 general로 폴백', () => {
    // @ts-expect-error 의도적 잘못된 입력
    expect(categoryMeta('unknown')).toBe(CATEGORY_META.general);
  });
});
