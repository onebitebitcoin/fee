import { useExplorer } from '../ExplorerContext';
import { LoadingScreen } from '../ui';
import { DOMESTIC_INFO } from '../constants';

const DOMESTIC_KEYS = Object.keys(DOMESTIC_INFO);

export function LoadingStep() {
  const { exchangeProgress } = useExplorer();
  return <LoadingScreen progress={exchangeProgress} domesticKeys={DOMESTIC_KEYS} />;
}
