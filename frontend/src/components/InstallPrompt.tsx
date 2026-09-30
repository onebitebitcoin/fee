import { useEffect, useState, useSyncExternalStore } from 'react';
import { DownloadSimple, ShareNetwork, X } from '@phosphor-icons/react';
import {
  dismissInstall,
  hasInstallPrompt,
  isInstallDismissed,
  isIosSafari,
  isStandalone,
  promptInstall,
  subscribeInstallPrompt,
} from '../lib/pwa';

function readStandalone(): boolean {
  return isStandalone({
    matchMedia: (query) => window.matchMedia(query),
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
  });
}

// 헤더용 설치 버튼. Chrome/Edge 계열은 beforeinstallprompt 를 받았을 때만, iOS Safari 는 안내 모달로 보여 준다.
export default function InstallPrompt() {
  const canPrompt = useSyncExternalStore(subscribeInstallPrompt, hasInstallPrompt, () => false);
  const [hidden, setHidden] = useState(() => readStandalone() || isInstallDismissed());
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iosSafari = isIosSafari({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });

  useEffect(() => {
    const onInstalled = () => setHidden(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  if (hidden || (!canPrompt && !iosSafari)) return null;

  const handleClick = async () => {
    if (!canPrompt) {
      setShowGuide(true);
      return;
    }
    try {
      const outcome = await promptInstall();
      if (outcome === 'accepted') setHidden(true);
    } catch (e) {
      console.warn('앱 설치 프롬프트 실패', e);
      setError('설치 창을 열지 못했습니다. 브라우저 메뉴에서 직접 설치해 주세요.');
    }
  };

  const handleDismiss = () => {
    dismissInstall();
    setHidden(true);
    setShowGuide(false);
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="flex items-center gap-1 text-label-tertiary hover:text-label-secondary transition-colors"
        title="앱 설치"
      >
        <DownloadSimple className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">앱 설치</span>
      </button>

      {error && (
        <div role="alert" className="fixed left-4 right-4 bottom-4 z-30 max-w-xl mx-auto rounded-xl bg-sys-card px-4 py-3 text-xs text-acc-red shadow-float">
          {error}
        </div>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-sys-overlay px-2 pb-2 sm:pb-0"
          onClick={() => setShowGuide(false)}
        >
          <div
            role="dialog"
            aria-label="홈 화면에 추가 안내"
            className="w-full max-w-sm rounded-2xl bg-sys-card p-5 shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-label-primary">홈 화면에 추가</h2>
              <button onClick={() => setShowGuide(false)} title="닫기" className="text-label-tertiary hover:text-label-secondary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="mt-3 space-y-2 text-xs text-label-secondary">
              <li className="flex items-center gap-1.5">
                1. Safari 하단의 공유 버튼
                <ShareNetwork className="w-3.5 h-3.5" />
                을 누릅니다.
              </li>
              <li>2. 메뉴에서 &quot;홈 화면에 추가&quot;를 선택합니다.</li>
              <li>3. 오른쪽 위의 &quot;추가&quot;를 누르면 앱처럼 실행할 수 있습니다.</li>
            </ol>
            <button
              onClick={handleDismiss}
              className="mt-4 text-xs text-label-tertiary hover:text-label-secondary transition-colors"
            >
              다시 보지 않기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
