import { describe, expect, it, vi } from 'vitest';
import {
  dismissInstall,
  isInstallDismissed,
  isIos,
  isIosSafari,
  isStandalone,
  registerAppServiceWorker,
} from './pwa';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';

describe('isStandalone', () => {
  it('display-mode: standalone 미디어쿼리가 일치하면 true', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(isStandalone({ matchMedia })).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(display-mode: standalone)');
  });

  it('iOS navigator.standalone 이 true 면 true', () => {
    expect(isStandalone({ navigatorStandalone: true })).toBe(true);
  });

  it('둘 다 아니면 false', () => {
    expect(isStandalone({ matchMedia: () => ({ matches: false }), navigatorStandalone: false })).toBe(false);
    expect(isStandalone({})).toBe(false);
  });
});

describe('isIos / isIosSafari', () => {
  it('iPhone Safari 는 둘 다 true', () => {
    expect(isIos({ userAgent: IPHONE_SAFARI })).toBe(true);
    expect(isIosSafari({ userAgent: IPHONE_SAFARI })).toBe(true);
  });

  it('iOS Chrome 은 iOS 이지만 Safari 는 아니다', () => {
    expect(isIos({ userAgent: IPHONE_CHROME })).toBe(true);
    expect(isIosSafari({ userAgent: IPHONE_CHROME })).toBe(false);
  });

  it('iPadOS 는 Macintosh UA 여도 터치 지점으로 iOS 판별', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
    expect(isIos({ userAgent: ua, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: ua, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
  });

  it('Android Chrome 은 iOS 가 아니다', () => {
    expect(isIos({ userAgent: ANDROID_CHROME })).toBe(false);
  });
});

describe('registerAppServiceWorker', () => {
  it('PROD 가 아니면 등록하지 않는다', async () => {
    const register = vi.fn();
    expect(await registerAppServiceWorker({ isProd: false, serviceWorker: { register } })).toBe(false);
    expect(register).not.toHaveBeenCalled();
  });

  it('serviceWorker 미지원이면 등록하지 않는다', async () => {
    expect(await registerAppServiceWorker({ isProd: true, serviceWorker: undefined })).toBe(false);
  });

  it('PROD 이고 지원되면 /app-sw.js 를 scope / 로 등록한다', async () => {
    const register = vi.fn().mockResolvedValue({});
    expect(await registerAppServiceWorker({ isProd: true, serviceWorker: { register } })).toBe(true);
    expect(register).toHaveBeenCalledWith('/app-sw.js', { scope: '/' });
  });

  it('등록 실패는 경고만 남기고 throw 하지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const register = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await registerAppServiceWorker({ isProd: true, serviceWorker: { register } })).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('설치 안내 닫음 기억', () => {
  it('닫으면 저장하고 이후 dismissed 로 읽힌다', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(isInstallDismissed(storage)).toBe(false);
    dismissInstall(storage);
    expect(isInstallDismissed(storage)).toBe(true);
  });

  it('저장소가 throw 해도 예외를 밖으로 내지 않는다', () => {
    const storage = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(isInstallDismissed(storage)).toBe(false);
    expect(() => dismissInstall(storage)).not.toThrow();
  });
});
