import { getNetworkIconUrl } from '../lib/networkIcons';

interface Props {
  network: string;
  size?: number;
}

export function NetworkIcon({ network, size = 16 }: Props) {
  const url = getNetworkIconUrl(network);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={network}
      width={size}
      height={size}
      className="rounded-full flex-shrink-0"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}
