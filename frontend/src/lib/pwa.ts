// PWA 설치·서비스워커 로직. 판별 함수는 환경을 인자로 받아 node 환경 테스트에서 검증한다.

export const SERVICE_WORKER_URL = '/app-sw.js';
export const INSTALL_DISMISSED_KEY = 'pwa.installDismissed';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface StandaloneEnv {
  matchMedia?: (query: string) => { matches: boolean };
  navigatorStandalone?: boolean;
}

export function isStandalone(env: StandaloneEnv): boolean {
  if (env.navigatorStandalone === true) return true;
  return env.matchMedia?.('(display-mode: standalone)').matches === true;
}

export interface UaEnv {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

// iPadOS 13+ 는 UA 가 Macintosh 로 오므로 터치 지점 수로 구분한다.
export function isIos(env: UaEnv): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  return env.platform === 'MacIntel' && (env.maxTouchPoints ?? 0) > 1;
}

// iOS 의 Chrome/Firefox/Edge/네이버앱 등은 홈 화면 추가 메뉴가 다르거나 없어 Safari 만 안내한다.
export function isIosSafari(env: UaEnv): boolean {
  return isIos(env) && !/CriOS|FxiOS|EdgiOS|OPiOS|NAVER|KAKAOTALK|DaumApps/i.test(env.userAgent);
}

export interface ServiceWorkerEnv {
  isProd: boolean;
  serviceWorker?: Pick<ServiceWorkerContainer, 'register'>;
}

export async function registerAppServiceWorker(
  env: ServiceWorkerEnv = {
    isProd: import.meta.env.PROD,
    serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? navigator.serviceWorker
      : undefined,
  },
): Promise<boolean> {
  if (!env.isProd || !env.serviceWorker) return false;
  try {
    await env.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' });
    return true;
  } catch (error) {
    console.warn('서비스워커 등록에 실패했습니다.', error);
    return false;
  }
}

// ── beforeinstallprompt 보관 ────────────────────────────────────────────────
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function captureInstallPrompt(event: Event): void {
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  notify();
}

export function clearInstallPrompt(): void {
  deferredPrompt = null;
  notify();
}

export function hasInstallPrompt(): boolean {
  return deferredPrompt !== null;
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// 네이티브 설치 프롬프트를 띄우고 사용자의 선택을 돌려준다. 프롬프트는 한 번만 쓸 수 있다.
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferredPrompt;
  if (!event) return 'unavailable';
  deferredPrompt = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

let listening = false;
// 앱 시작 시 한 번 호출해, 컴포넌트가 마운트되기 전에 발생한 이벤트도 놓치지 않는다.
export function listenInstallEvents(target: Window = window): void {
  if (listening) return;
  listening = true;
  target.addEventListener('beforeinstallprompt', captureInstallPrompt);
  target.addEventListener('appinstalled', clearInstallPrompt);
}

// ── 안내 닫음 기억 ──────────────────────────────────────────────────────────
type DismissStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): DismissStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function isInstallDismissed(storage: DismissStorage | undefined = defaultStorage()): boolean {
  try {
    return storage?.getItem(INSTALL_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissInstall(storage: DismissStorage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(INSTALL_DISMISSED_KEY, '1');
  } catch {
    // 저장소가 막혀 있어도 현재 세션에서는 컴포넌트 상태로 숨긴다.
  }
}
