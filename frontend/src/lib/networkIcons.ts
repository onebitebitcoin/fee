// Maps network label strings (as returned by the backend) to TrustWallet asset CDN URLs.
// CDN: https://assets.trustwalletapp.com/blockchains/{chain}/info/logo.png

const TW = (chain: string) =>
  `https://assets.trustwalletapp.com/blockchains/${chain}/info/logo.png`;

const NETWORK_ICONS: Record<string, string> = {
  // Bitcoin / Lightning
  bitcoin:                  TW('bitcoin'),
  'bitcoin (on-chain)':     TW('bitcoin'),
  btc:                      TW('bitcoin'),
  'btc (segwit)':           TW('bitcoin'),
  lightning:                TW('bitcoin'),
  'lightning network':      TW('bitcoin'),

  // Ethereum
  erc20:                    TW('ethereum'),
  'ethereum (erc20)':       TW('ethereum'),
  ethereum:                 TW('ethereum'),

  // Tron
  trc20:                    TW('tron'),
  tron:                     TW('tron'),
  'tron (trc20)':           TW('tron'),

  // BNB Smart Chain
  bep20:                    TW('smartchain'),
  'bnb smart chain (bep20)': TW('smartchain'),
  bnb:                      TW('smartchain'),
  bsc:                      TW('smartchain'),
  opbnb:                    TW('opbnb'),

  // Solana
  sol:                      TW('solana'),
  solana:                   TW('solana'),

  // Aptos
  aptos:                    TW('aptos'),

  // Arbitrum
  'arbitrum one':           TW('arbitrum'),
  'arbitrum one (usdt0)':   TW('arbitrum'),
  arbitrumone:              TW('arbitrum'),
  arbitrum:                 TW('arbitrum'),

  // Avalanche
  'avax c-chain':           TW('avalanchec'),
  'avaxc-chain':            TW('avalanchec'),
  'avalanche c-chain':      TW('avalanchec'),
  avalanche:                TW('avalanchec'),
  avax:                     TW('avalanchec'),

  // Optimism
  optimism:                 TW('optimism'),
  'optimism (usdt0)':       TW('optimism'),

  // Polygon
  polygon:                  TW('polygon'),
  'polygon (usdt0)':        TW('polygon'),
  'polygon pos':            TW('polygon'),
  matic:                    TW('polygon'),
  plasma:                   TW('polygon'),
  'plasma (usdt0)':         TW('polygon'),

  // TON
  ton:                      TW('ton'),
  'the open network (ton)': TW('ton'),

  // Sui
  sui:                      TW('sui'),

  // NEAR
  'near protocol':          TW('near'),
  near:                     TW('near'),

  // Tezos
  tezos:                    TW('tezos'),

  // Scroll
  scroll:                   TW('scroll'),

  // Celo
  celo:                     TW('celo'),

  // Kaia (formerly Klaytn)
  kaia:                     TW('kaia'),
  klaytn:                   TW('klaytn'),

  // Polkadot
  'asset hub polkadot':     TW('polkadot'),
  polkadot:                 TW('polkadot'),

  // Kava
  kavaevm:                  TW('kava'),
  kava:                     TW('kava'),
};

export function getNetworkIconUrl(network: string): string | null {
  return NETWORK_ICONS[network.toLowerCase()] ?? null;
}

// 경로 표시용 네트워크 라벨 변환.
// Bitcoin 온체인 계열("Bitcoin (On-chain)" 등)은 코인명과 중복되므로 짧은 '온체인'으로 축약.
// USDT 등 다른 네트워크(TRC20, ERC20...)는 식별 의미가 있어 원본 유지.
export function formatNetworkLabel(network: string): string {
  const k = network.toLowerCase().trim();
  if (k.includes('on-chain') || k === 'bitcoin' || k === 'btc' || k === 'btc (segwit)') {
    return '온체인';
  }
  if (k === 'lightning') {
    return '라이트닝';
  }
  return network;
}
