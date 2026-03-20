import type { CheapestPathEntry, CheapestPathFeeComponent, PathMode } from '../types';
import { formatCurrency, formatPercent, formatSats } from './formatBtc';
import { fmtEx } from './exchangeNames';
import { localizeUiLabel } from './localizeUi';

export type RankedPath = CheapestPathEntry & { rank: number };
export type VisibleRankedPath = RankedPath & { visibleRank: number };

export type PathStep = {
  label: string;
  sub: string;
  active: boolean;
  rawName?: string;
  variant?: 'exchange' | 'lightning';
  kycStatus?: CheapestPathEntry['domestic_kyc_status'];
  feeText?: string | null;
  feeLabel?: string | null;
  feeRateText?: string | null;
};

// 비트코인 네트워크 변형을 단일 canonical key로 통일
const BITCOIN_VARIANTS = new Set([
  'bitcoin', 'bitcoin onchain', 'bitcoin network',
  '비트코인', '비트코인 온체인',
]);

export function canonicalNetwork(network: string): string {
  return BITCOIN_VARIANTS.has(network.toLowerCase()) ? 'Bitcoin' : network;
}

export function getFeeTone(feePct: number) {
  if (feePct <= 0.5) return 'text-bnb-green';
  if (feePct <= 1.0) return 'text-brand-400';
  return 'text-bnb-red';
}

export function getSellFirstHopKyc(path: CheapestPathEntry) {
  switch (path.route_variant) {
    case 'lightning_direct':
    case 'lightning_via_global':
      return path.exit_service_kyc_status;
    case 'usdt_via_global':
      return path.global_kyc_status;
    case 'btc_direct':
      return path.domestic_kyc_status;
    default:
      return path.exit_service_kyc_status ?? path.global_kyc_status ?? path.domestic_kyc_status;
  }
}

export function sortAllPaths(paths: CheapestPathEntry[], mode: PathMode): RankedPath[] {
  return [...paths]
    .sort((a, b) => {
      if (mode === 'sell') {
        const receivedDiff = (b.krw_received ?? 0) - (a.krw_received ?? 0);
        if (receivedDiff !== 0) return receivedDiff;
        return a.total_fee_krw - b.total_fee_krw;
      }
      if (a.total_fee_krw !== b.total_fee_krw) return a.total_fee_krw - b.total_fee_krw;
      return (b.btc_received ?? 0) - (a.btc_received ?? 0);
    })
    .map((path, i) => ({ ...path, rank: i + 1 }));
}

export function formatTopPathSequence(path: CheapestPathEntry, globalExchange: string, mode: PathMode) {
  if (mode === 'sell') {
    switch (path.route_variant) {
      case 'lightning_direct':
        return ['개인 지갑', path.lightning_exit_provider ?? '라이트닝 스왑', fmtEx(path.korean_exchange)].join(' → ');
      case 'lightning_via_global':
        return ['개인 지갑', path.lightning_exit_provider ?? '라이트닝 스왑', fmtEx(globalExchange), fmtEx(path.korean_exchange)].join(' → ');
      case 'usdt_via_global':
        return ['개인 지갑', fmtEx(globalExchange), fmtEx(path.korean_exchange)].join(' → ');
      case 'btc_direct':
      default:
        return ['개인 지갑', fmtEx(path.korean_exchange)].join(' → ');
    }
  }

  const parts = [fmtEx(path.korean_exchange), fmtEx(globalExchange)];
  if (path.lightning_exit_provider) {
    parts.push(path.lightning_exit_provider);
  }
  parts.push('개인 지갑');
  return parts.join(' → ');
}

export function buildStepFeeDetails(components: CheapestPathFeeComponent[]): Pick<PathStep, 'feeText' | 'feeLabel' | 'feeRateText'> {
  if (!components.length) {
    return { feeText: null, feeLabel: null, feeRateText: null };
  }

  const feeRateText = components
    .map((component) => (component.rate_pct == null ? null : formatPercent(component.rate_pct)))
    .filter((value): value is string => value !== null)
    .join(' + ');

  return {
    feeText: formatCurrency(components.reduce((sum, component) => sum + component.amount_krw, 0)),
    feeLabel: components.map((component) => component.label).join(' + '),
    feeRateText: feeRateText || null,
  };
}

export function buildPathSteps(path: CheapestPathEntry, globalExchange: string, mode: PathMode): PathStep[] {
  const components = path.breakdown?.components ?? [];

  if (mode === 'sell') {
    switch (path.route_variant) {
      case 'lightning_direct':
        return [
          {
            label: '개인 지갑',
            sub: 'BTC 보유',
            active: true,
            kycStatus: path.wallet_kyc_status,
            ...buildStepFeeDetails(components.slice(0, 1)),
          },
          {
            label: '라이트닝 스왑',
            rawName: path.lightning_exit_provider ?? path.swap_service ?? undefined,
            sub: '라이트닝 → 온체인 전환',
            active: true,
            variant: 'lightning' as const,
            kycStatus: path.exit_service_kyc_status,
            ...buildStepFeeDetails(components.slice(1, 2)),
          },
          {
            label: fmtEx(path.korean_exchange),
            rawName: path.korean_exchange,
            sub: `비트코인 입금 · ${localizeUiLabel(path.domestic_withdrawal_network)}`,
            active: true,
            variant: 'exchange' as const,
            kycStatus: path.domestic_kyc_status,
            ...buildStepFeeDetails(components.slice(2, 3)),
          },
        ];
      case 'lightning_via_global':
        return [
          {
            label: '개인 지갑',
            sub: 'BTC 보유',
            active: true,
            kycStatus: path.wallet_kyc_status,
            ...buildStepFeeDetails(components.slice(0, 1)),
          },
          {
            label: '라이트닝 스왑',
            rawName: path.lightning_exit_provider ?? path.swap_service ?? undefined,
            sub: '라이트닝 → 거래소 입금',
            active: true,
            variant: 'lightning' as const,
            kycStatus: path.exit_service_kyc_status,
            ...buildStepFeeDetails(components.slice(1, 2)),
          },
          {
            label: fmtEx(globalExchange),
            rawName: globalExchange,
            sub: 'BTC 매도 · USDT 확보',
            active: true,
            variant: 'exchange' as const,
            kycStatus: path.global_kyc_status,
            ...buildStepFeeDetails(components.slice(2, 3)),
          },
          {
            label: fmtEx(path.korean_exchange),
            rawName: path.korean_exchange,
            sub: `USDT 입금 · ${localizeUiLabel(path.domestic_withdrawal_network)}`,
            active: true,
            variant: 'exchange' as const,
            kycStatus: path.domestic_kyc_status,
            ...buildStepFeeDetails(components.slice(3)),
          },
        ];
      case 'usdt_via_global':
        return [
          {
            label: '개인 지갑',
            sub: 'BTC 보유',
            active: true,
            kycStatus: path.wallet_kyc_status,
            ...buildStepFeeDetails(components.slice(0, 1)),
          },
          {
            label: fmtEx(globalExchange),
            rawName: globalExchange,
            sub: 'BTC 매도 · USDT 확보',
            active: true,
            variant: 'exchange' as const,
            kycStatus: path.global_kyc_status,
            ...buildStepFeeDetails(components.slice(1, 2)),
          },
          {
            label: fmtEx(path.korean_exchange),
            rawName: path.korean_exchange,
            sub: `USDT 입금 · ${localizeUiLabel(path.domestic_withdrawal_network)}`,
            active: true,
            variant: 'exchange' as const,
            kycStatus: path.domestic_kyc_status,
            ...buildStepFeeDetails(components.slice(2)),
          },
        ];
      case 'btc_direct':
      default:
        return [
          {
            label: '개인 지갑',
            sub: 'BTC 보유',
            active: true,
            kycStatus: path.wallet_kyc_status,
            ...buildStepFeeDetails(components.slice(0, 1)),
          },
          {
            label: fmtEx(path.korean_exchange),
            rawName: path.korean_exchange,
            sub: `비트코인 입금 · ${localizeUiLabel(path.domestic_withdrawal_network)}`,
            active: true,
            variant: 'exchange' as const,
            kycStatus: path.domestic_kyc_status,
            ...buildStepFeeDetails(components.slice(1)),
          },
        ];
    }
  }

  return [
    {
      label: fmtEx(path.korean_exchange),
      rawName: path.korean_exchange,
      sub: '한국 거래소',
      active: true,
      variant: 'exchange' as const,
      kycStatus: path.domestic_kyc_status,
      ...buildStepFeeDetails(components.slice(0, 1)),
    },
    {
      label: path.transfer_coin,
      sub: localizeUiLabel(path.domestic_withdrawal_network),
      active: true,
      ...buildStepFeeDetails(components.slice(1, 2)),
    },
    {
      label: fmtEx(globalExchange),
      rawName: globalExchange,
      sub: path.transfer_coin === 'USDT' ? '글로벌 거래소 · USDT 입금' : '글로벌 거래소 · 비트코인 입금',
      active: true,
      variant: 'exchange' as const,
      kycStatus: path.global_kyc_status,
      ...buildStepFeeDetails(components.slice(2, 3)),
    },
    {
      label: path.global_exit_mode === 'lightning' ? '라이트닝 출금' : '온체인 출금',
      rawName: path.lightning_exit_provider ?? path.swap_service ?? undefined,
      sub: localizeUiLabel(path.global_exit_network) + (path.lightning_exit_provider ? ` · ${path.lightning_exit_provider}` : ''),
      active: true,
      variant: path.lightning_exit_provider || path.swap_service ? ('lightning' as const) : undefined,
      kycStatus: path.exit_service_kyc_status,
      ...buildStepFeeDetails(components.slice(3)),
    },
    {
      label: '개인 지갑',
      sub: formatSats(path.btc_received ?? 0),
      active: true,
      kycStatus: path.wallet_kyc_status,
    },
  ];
}
