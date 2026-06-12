import { useExplorer } from '../ExplorerContext';
import { LoadingScreen } from '../ui';

export function LoadingStep() {
  const { exchangeProgress } = useExplorer();
  return <LoadingScreen progress={exchangeProgress} />;
}
