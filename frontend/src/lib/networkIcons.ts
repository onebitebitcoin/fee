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
