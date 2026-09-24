// ── 탐색 방향(살 때/팔 때) 보존 ─────────────────────────────────────────────
// 게시판 등 다른 화면에서 홈으로 돌아오거나 새로고침하면 ExplorerProvider 가 다시
// 마운트되어 모드가 초기값으로 돌아간다. 사용자가 고른 방향과 그 테마를 유지하려고
// 마지막 모드를 브라우저 저장소에 남긴다. 저장소가 막혀 있어도(사생활 보호 모드 등)
// 화면은 기본값 buy 로 정상 동작해야 하므로 모든 접근을 try/catch 로 감싼다.

import type { PathMode } from '../../types';

export const MODE_STORAGE_KEY = 'explorer.mode';

export type ModeStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): ModeStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadSavedMode(storage: ModeStorage | undefined = defaultStorage()): PathMode {
  try {
    return storage?.getItem(MODE_STORAGE_KEY) === 'sell' ? 'sell' : 'buy';
  } catch {
    return 'buy';
  }
}

export function saveMode(mode: PathMode, storage: ModeStorage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // 저장에 실패해도 현재 화면의 모드 전환은 그대로 유효하다.
  }
}

export type ThemeRoot = Pick<Element, 'setAttribute' | 'removeAttribute'>;

/**
 * 모드에 맞춰 `<html data-theme>` 를 갱신한다. 팔레트 변수는 index.css 의
 * `:root[data-theme="sell"]` 블록에 있고, 이 속성 하나로 화면 전체 색이 바뀐다.
 * 앱 시작 시점(main.tsx)에도 호출해 탐색 화면이 아닌 곳에서 새로고침해도 테마가 맞는다.
 */
export function applyModeTheme(mode: PathMode, root: ThemeRoot = document.documentElement): void {
  if (mode === 'sell') root.setAttribute('data-theme', 'sell');
  else root.removeAttribute('data-theme');
}
