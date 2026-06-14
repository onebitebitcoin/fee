import { ArrowRight } from '@phosphor-icons/react';
import { useExplorer } from '../ExplorerContext';
import { LoadingScreen } from '../ui';
import { DOMESTIC_INFO } from '../constants';

const DOMESTIC_KEYS = Object.keys(DOMESTIC_INFO);

export function LoadingStep() {
  const { exchangeProgress, loadingDone, handleLoadingNext } = useExplorer();
  return (
    <div className="flex flex-col items-center gap-6">
      <LoadingScreen progress={exchangeProgress} domesticKeys={DOMESTIC_KEYS} isReady={loadingDone} />
      {loadingDone && (
        <button
          onClick={handleLoadingNext}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-acc-amber text-white font-semibold text-sm hover:bg-acc-amber/90 transition-colors"
        >
          다음
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
