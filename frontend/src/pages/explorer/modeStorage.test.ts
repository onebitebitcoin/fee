import { describe, it, expect } from 'vitest';
import { loadSavedMode, saveMode, applyModeTheme, MODE_STORAGE_KEY } from './modeStorage';
import type { ModeStorage } from './modeStorage';

function memoryStorage(): ModeStorage {
  const data = new Map<string, string>();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
  };
}

const blockedStorage: ModeStorage = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
};

describe('modeStorage', () => {
  it('저장된 값이 없으면 buy 를 돌려준다', () => {
    expect(loadSavedMode(memoryStorage())).toBe('buy');
  });

  it('저장한 모드를 다시 읽는다', () => {
    const storage = memoryStorage();
    saveMode('sell', storage);
    expect(loadSavedMode(storage)).toBe('sell');
    saveMode('buy', storage);
    expect(loadSavedMode(storage)).toBe('buy');
  });

  it('알 수 없는 값이 저장돼 있으면 buy 로 되돌린다', () => {
    const storage = memoryStorage();
    storage.setItem(MODE_STORAGE_KEY, 'hold');
    expect(loadSavedMode(storage)).toBe('buy');
  });

  it('저장소 접근이 막혀도 예외 없이 buy 를 돌려준다', () => {
    expect(() => saveMode('sell', blockedStorage)).not.toThrow();
    expect(loadSavedMode(blockedStorage)).toBe('buy');
  });

  it('저장소가 없는 환경에서도 buy 를 돌려준다', () => {
    expect(loadSavedMode(undefined)).toBe('buy');
    expect(() => saveMode('sell', undefined)).not.toThrow();
  });
});

describe('applyModeTheme', () => {
  function fakeRoot() {
    const attrs = new Map<string, string>();
    return {
      attrs,
      setAttribute: (k: string, v: string) => { attrs.set(k, v); },
      removeAttribute: (k: string) => { attrs.delete(k); },
    };
  }

  it('sell 이면 data-theme="sell" 을 붙인다', () => {
    const root = fakeRoot();
    applyModeTheme('sell', root);
    expect(root.attrs.get('data-theme')).toBe('sell');
  });

  it('buy 이면 data-theme 를 뗀다', () => {
    const root = fakeRoot();
    applyModeTheme('sell', root);
    applyModeTheme('buy', root);
    expect(root.attrs.has('data-theme')).toBe(false);
  });
});
