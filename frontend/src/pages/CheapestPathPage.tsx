import { ArrowRight, Building2, ChevronDown, Search, ShieldAlert, Users, X, Zap } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import { KycBadge } from '../components/KycBadge';
import { GLOBAL_EXCHANGES, KOREAN_EXCHANGES } from '../data/carfData';
import { api } from '../lib/api';
import { fmtEx } from '../lib/exchangeNames';
import { localizeUiLabel } from '../lib/localizeUi';
import type { AccessStats, CheapestPathEntry, CheapestPathFeeComponent, CheapestPathResponse, PathMode } from '../types';

const CARF_2027_IDS = new Set([
  ...KOREAN_EXCHANGES.filter((e) => e.carfGroup === '2027').map((e) => e.id),
  ...GLOBAL_EXCHANGES.filter((e) => e.carfGroup === '2027').map((e) => e.id),
]);

function isCarfAffected(path: CheapestPathEntry, globalExchange: string): boolean {
  if (CARF_2027_IDS.has(path.korean_exchange)) return true;
  if (CARF_2027_IDS.has(globalExchange)) return true;
  return false;
}

const DEFAULT_AMOUNT_MANWON = 100; // 만원 단위
const DEFAULT_EXCLUDED_NETWORKS = ['Aptos', 'Kaia', 'ERC20'];

// 비트코인 네트워크 변형을 단일 canonical key로 통일
const BITCOIN_VARIANTS = new Set([
  'bitcoin', 'bitcoin onchain', 'bitcoin network',
  '비트코인', '비트코인 온체인',
]);
function canonicalNetwork(network: string): string {
  return BITCOIN_VARIANTS.has(network.toLowerCase()) ? 'Bitcoin' : network;
}
const SATS_PER_BTC = 100_000_000;

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(value);
}

function formatCurrency(value: number) {
  const decimals = value % 1 !== 0 ? 1 : 0;
  return `${formatNumber(value, decimals)} KRW`;
}

function formatSats(value: number) {
  return `${formatNumber(Math.round(value * SATS_PER_BTC))} sats`;
}

function formatFeeRateSatVb(value: number) {
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} sat/vB`;
}

function formatPercent(value: number) {
  return `${value.toFixed(value >= 1 ? 2 : 3)}%`;
}

function getFeeTone(feePct: number) {
  if (feePct <= 0.5) return 'text-bnb-green';
  if (feePct <= 1.0) return 'text-brand-400';
  return 'text-bnb-red';
}

type RankedPath = CheapestPathEntry & { rank: number };
type VisibleRankedPath = RankedPath & { visibleRank: number };

function getSellFirstHopKyc(path: CheapestPathEntry) {
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

function sortAllPaths(paths: CheapestPathEntry[], mode: PathMode): RankedPath[] {
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

function formatTopPathSequence(path: CheapestPathEntry, globalExchange: string, mode: PathMode) {
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


function ServiceLogo({
  name,
  variant,
  className = 'h-5 w-5',
}: {
  name: string;
  variant: 'exchange' | 'lightning';
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const logoName = name.toLowerCase().replace(/\s+/g, '');

  if (!imgError) {
    return (
      <img
        src={`/logos/${logoName}.png`}
        alt={name}
        width={20}
        height={20}
        className={`${className} shrink-0 rounded-full bg-dark-500 object-contain`}
        onError={() => setImgError(true)}
      />
    );
  }

  return variant === 'lightning' ? (
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-400 ${className}`}>
      <Zap size={12} />
    </span>
  ) : (
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-dark-200 text-bnb-muted ${className}`}>
      <Building2 size={12} />
    </span>
  );
}

function ServiceLabel({
  name,
  label,
  variant,
  textClassName = 'text-bnb-text',
  logoClassName,
}: {
  name: string;
  label?: string;
  variant: 'exchange' | 'lightning';
  textClassName?: string;
  logoClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${textClassName}`}>
      <ServiceLogo name={name} variant={variant} className={logoClassName} />
      <span>{label ?? name}</span>
    </span>
  );
}

type PathStep = {
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

function buildStepFeeDetails(components: CheapestPathFeeComponent[]): Pick<PathStep, 'feeText' | 'feeLabel' | 'feeRateText'> {
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

function RouteDetailPopup({
  selectedRoute,
  globalExchange,
  mode,
  onClose,
}: {
  selectedRoute: { rank: number; path: RankedPath };
  globalExchange: string;
  mode: PathMode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="경로 상세 팝업"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto border border-dark-200 bg-dark-400 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-dark-200 px-4 py-3 sm:px-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-bnb-muted">경로 상세</p>
            <p className="mt-1 text-sm font-semibold text-bnb-text">{fmtEx(selectedRoute.path.korean_exchange)}</p>
          </div>
          <button type="button" onClick={onClose} className="text-bnb-muted hover:text-bnb-text">
            <X size={15} />
          </button>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="border border-dark-200 bg-dark-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-bnb-muted">
              {selectedRoute.rank}위
            </span>
            <ServiceLabel
              name={selectedRoute.path.korean_exchange}
              label={fmtEx(selectedRoute.path.korean_exchange)}
              variant="exchange"
              textClassName="text-base font-semibold text-bnb-text"
              logoClassName="h-6 w-6"
            />
            <ArrowRight size={14} className="text-bnb-muted" />
            <ServiceLabel
              name={globalExchange}
              label={fmtEx(globalExchange)}
              variant="exchange"
              textClassName="text-base font-semibold text-bnb-text"
              logoClassName="h-6 w-6"
            />
          </div>

          <PathTimeline path={selectedRoute.path} globalExchange={globalExchange} mode={mode} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PathTimeline({ path, globalExchange, mode }: { path: CheapestPathEntry; globalExchange: string; mode: PathMode }) {
  const components = path.breakdown?.components ?? [];
  const steps: PathStep[] = mode === 'sell'
    ? (() => {
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
      })()
    : [
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

  return (
    <>
      <div className="space-y-3 md:hidden" aria-label="모바일 경로 타임라인">
        {steps.map((step, idx) => (
          <div key={idx} className="flex gap-3">
            <div className="flex w-4 flex-col items-center">
              <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${step.active ? 'bg-brand-500' : 'bg-dark-200'}`} />
              {idx < steps.length - 1 ? <div className="mt-1 w-px flex-1 bg-brand-500/40" /> : null}
            </div>
            <div className="flex-1 border border-dark-200 bg-dark-500 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {step.rawName && step.variant ? (
                      <ServiceLabel
                        name={step.rawName}
                        label={step.label}
                        variant={step.variant}
                        textClassName="text-sm font-semibold text-bnb-text"
                        logoClassName="h-5 w-5"
                      />
                    ) : (
                      <p className="text-sm font-semibold text-bnb-text">{step.label}</p>
                    )}
                    <KycBadge status={step.kycStatus} />
                  </div>
                  <p className="mt-1 text-xs text-bnb-muted">{step.sub}</p>
                </div>
                {step.feeText || step.feeRateText ? (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-bnb-muted">단계 수수료</p>
                    {step.feeText ? <p className="mt-1 text-sm font-semibold text-brand-400">{step.feeText}</p> : null}
                    {step.feeRateText ? <p className="mt-1 text-[11px] font-data text-bnb-muted">수수료율 {step.feeRateText}</p> : null}
                  </div>
                ) : null}
              </div>
              {step.feeLabel ? <p className="mt-2 text-[11px] text-bnb-muted">{step.feeLabel}</p> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden items-start gap-0 md:flex" aria-label="데스크톱 경로 타임라인">
        {steps.map((step, idx) => (
          <div key={idx} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {idx > 0 && <div className="h-px flex-1 bg-brand-500/40" />}
              <div className={`h-2 w-2 shrink-0 rounded-full ${step.active ? 'bg-brand-500' : 'bg-dark-200'}`} />
              {idx < steps.length - 1 && <div className="h-px flex-1 bg-brand-500/40" />}
            </div>
            <div className="mt-2 text-center">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {step.rawName && step.variant ? (
                  <ServiceLabel
                    name={step.rawName}
                    label={step.label}
                    variant={step.variant}
                    textClassName="justify-center text-[11px] font-semibold text-bnb-text"
                    logoClassName="h-5 w-5"
                  />
                ) : (
                  <p className="text-[11px] font-semibold text-bnb-text">{step.label}</p>
                )}
                <KycBadge status={step.kycStatus} />
              </div>
              <p className="mt-0.5 text-[10px] text-bnb-muted">{step.sub}</p>
              {step.feeText ? <p className="mt-1 text-[10px] font-semibold text-brand-400">{step.feeText}</p> : null}
              {step.feeRateText ? <p className="mt-0.5 text-[10px] font-data text-bnb-muted">수수료율 {step.feeRateText}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function CheapestPathPage() {
  const [mode, setMode] = useState<PathMode>('buy');
  const [amountKrwInput, setAmountKrwInput] = useState(String(DEFAULT_AMOUNT_MANWON));
  const [amountBtcInput, setAmountBtcInput] = useState('0.01');
  const [walletUtxoCountInput, setWalletUtxoCountInput] = useState('1');
  const [globalExchange] = useState('binance');
  const [selectedPathId, setSelectedPathId] = useState('');
  const [data, setData] = useState<CheapestPathResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [pathShortcut, setPathShortcut] = useState<'default' | 'non_kyc' | 'no_lightning'>('non_kyc');

  useEffect(() => {
    setPathShortcut(mode === 'sell' ? 'default' : 'non_kyc');
  }, [mode]);
  const [error, setError] = useState<string | null>(null);
  const [mobileRouteDetailOpen, setMobileRouteDetailOpen] = useState(false);
  const [expandedPathId, setExpandedPathId] = useState('');
  const [accessStats, setAccessStats] = useState<AccessStats | null>(null);

  useEffect(() => {
    api.getAccessCount().then(setAccessStats).catch(() => setAccessStats(null));
  }, []);

  // 페이지 최초 로딩 시 기본값으로 자동 검색
  useEffect(() => {
    setHasSearched(true);
    load({
      mode: 'buy',
      amountKrw: DEFAULT_AMOUNT_MANWON * 10000,
      globalExchange: 'binance',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [carfBlackbox, setCarfBlackbox] = useState(false);

  // Table filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [excludedDomesticNetworks, setExcludedDomesticNetworks] = useState<string[]>(DEFAULT_EXCLUDED_NETWORKS);
  const [excludedGlobalExitOptions, setExcludedGlobalExitOptions] = useState<string[]>([]);
  const [excludedLightningProviders, setExcludedLightningProviders] = useState<string[]>([]);

  const load = useCallback(async (requestParams: { mode: PathMode; amountKrw?: number; amountBtc?: number; walletUtxoCount?: number; globalExchange: string }) => {
    try {
      setError(null);
      setLoading(true);
      const response = await api.getCheapestPath(requestParams);
      if (response.error) {
        setData(response);
        setError(response.error);
        return;
      }
      setData(response);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : '최적 경로 조회에 실패했습니다.');
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  }, []);

  const rankedPaths = useMemo(() => (data ? sortAllPaths(data.all_paths ?? [], data.mode ?? mode) : []), [data, mode]);

  const allDomesticNetworks = useMemo(() => {
    const raw = data?.available_filters?.domestic_withdrawal_networks ??
      Array.from(new Set(rankedPaths.map((p) => p.domestic_withdrawal_network))).sort();
    return Array.from(new Set(raw.map(canonicalNetwork))).sort();
  }, [data?.available_filters?.domestic_withdrawal_networks, rankedPaths]);
  const allGlobalExitOptions = useMemo(
    () => data?.available_filters?.global_exit_options ?? Array.from(new Set(rankedPaths.map((p) => `${p.global_exit_mode}::${p.global_exit_network}`))).sort().map((value) => {
      const [mode, network] = value.split('::');
      return { mode: mode as 'onchain' | 'lightning', network };
    }),
    [data?.available_filters?.global_exit_options, rankedPaths],
  );
  const allLightningProviders = useMemo(
    () => data?.available_filters?.lightning_exit_providers ?? Array.from(new Set(rankedPaths.map((p) => p.lightning_exit_provider).filter(Boolean))).sort() as string[],
    [data?.available_filters?.lightning_exit_providers, rankedPaths],
  );

  const filteredPaths = useMemo<VisibleRankedPath[]>(() => {
    return rankedPaths.filter((path) => {
      const globalExitKey = `${path.global_exit_mode}::${path.global_exit_network}`;
      if (excludedDomesticNetworks.includes(canonicalNetwork(path.domestic_withdrawal_network))) return false;
      if (excludedGlobalExitOptions.includes(globalExitKey)) return false;
      if (path.lightning_exit_provider && excludedLightningProviders.includes(path.lightning_exit_provider)) return false;
      if (pathShortcut === 'no_lightning' && path.global_exit_mode === 'lightning') return false;
      if (pathShortcut === 'non_kyc') {
        const beforeWalletKyc = mode === 'sell'
          ? getSellFirstHopKyc(path)
          : (path.exit_service_kyc_status ?? path.global_kyc_status);
        if (beforeWalletKyc !== 'non_kyc') return false;
      }
      return true;
    }).map((path, index) => ({ ...path, visibleRank: index + 1 }));
  }, [excludedDomesticNetworks, excludedGlobalExitOptions, excludedLightningProviders, mode, pathShortcut, rankedPaths]);

  const bestVisiblePath = useMemo(() => filteredPaths[0] ?? null, [filteredPaths]);

  const selectedRoute = useMemo(() => {
    if (!data || !selectedPathId) return null;
    const visibleMatch = filteredPaths.find((item) => item.path_id === selectedPathId);
    if (visibleMatch) return { rank: visibleMatch.visibleRank, path: visibleMatch };
    const rankedMatch = rankedPaths.find((item) => item.path_id === selectedPathId);
    if (!rankedMatch) return null;
    return { rank: rankedMatch.rank, path: rankedMatch };
  }, [data, filteredPaths, rankedPaths, selectedPathId]);

  useEffect(() => {
    if (!selectedPathId) return;
    if (!filteredPaths.some((path) => path.path_id === selectedPathId)) {
      setSelectedPathId('');
    }
  }, [filteredPaths, selectedPathId]);

  useEffect(() => {
    if (!hasSearched || filteredPaths.length === 0) return;
    if (selectedPathId && filteredPaths.some((path) => path.path_id === selectedPathId)) return;
    setSelectedPathId(filteredPaths[0].path_id);
  }, [data, filteredPaths, hasSearched, selectedPathId]);

  useEffect(() => {
    if (mobileRouteDetailOpen && !selectedRoute) {
      setMobileRouteDetailOpen(false);
    }
  }, [mobileRouteDetailOpen, selectedRoute]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasSearched(true);
    setSubmitting(true);
    await load(
      mode === 'sell'
        ? {
            mode,
            amountBtc: Math.max(Number(amountBtcInput) || 0.01, 0.00000001),
            walletUtxoCount: Math.max(Math.floor(Number(walletUtxoCountInput) || 1), 1),
            globalExchange,
          }
        : {
            mode,
            amountKrw: Math.max((Number(amountKrwInput) || DEFAULT_AMOUNT_MANWON) * 10000, 10000),
            globalExchange,
          },
    );
  };

  const toggleDomesticNetwork = (network: string) => {
    setExcludedDomesticNetworks((prev) =>
      prev.includes(network) ? prev.filter((n) => n !== network) : [...prev, network],
    );
  };

  const toggleGlobalExitOption = (mode: 'onchain' | 'lightning', network: string) => {
    const key = `${mode}::${network}`;
    setExcludedGlobalExitOptions((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const toggleLightningProvider = (provider: string) => {
    setExcludedLightningProviders((prev) =>
      prev.includes(provider) ? prev.filter((item) => item !== provider) : [...prev, provider],
    );
  };

  const openMobileRouteDetail = (pathId: string) => {
    setSelectedPathId(pathId);
    setMobileRouteDetailOpen(true);
  };


  return (
    <div className="space-y-0 border border-dark-200">
      {/* Form */}
      <div className="border-b border-dark-200 bg-dark-500 px-4 py-4 sm:px-5 sm:py-5">
        <div className="mb-3 flex items-center gap-3 text-xs text-bnb-muted">
          <Users size={13} />
          <span>누적 {accessStats ? accessStats.total.toLocaleString('ko-KR') : '-'}회</span>
          <span className="text-dark-100">|</span>
          <span>오늘 {accessStats ? accessStats.today.toLocaleString('ko-KR') : '-'}회</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('buy')}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors border ${mode === 'buy' ? 'border-brand-500/40 bg-brand-500/10 text-brand-400' : 'border-dark-200 text-bnb-muted hover:text-bnb-text'}`}
            >
              비트코인 살 때
            </button>
            <button
              type="button"
              onClick={() => setMode('sell')}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors border ${mode === 'sell' ? 'border-bnb-red/40 bg-bnb-red/10 text-bnb-red' : 'border-dark-200 text-bnb-muted hover:text-bnb-text'}`}
            >
              비트코인 팔 때
            </button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-3">
            <label className="flex max-w-[8rem] flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-bnb-muted">{mode === 'sell' ? '보유 BTC' : '투입 금액(만원)'}</span>
              {mode === 'sell' ? (
                <input
                  type="number"
                  min={0.00000001}
                  step={0.00000001}
                  value={amountBtcInput}
                  onChange={(event) => setAmountBtcInput(event.target.value)}
                  className="w-full border-b-2 border-bnb-red bg-transparent pb-1 text-left text-2xl font-bold text-bnb-text outline-none placeholder:text-bnb-muted sm:text-center"
                  placeholder="0.01"
                />
              ) : (
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={amountKrwInput}
                  onChange={(event) => setAmountKrwInput(event.target.value)}
                  className="w-full border-b-2 border-brand-500 bg-transparent pb-1 text-left text-2xl font-bold text-bnb-text outline-none placeholder:text-bnb-muted sm:text-center"
                  placeholder="100"
                />
              )}
            </label>
            <span className="text-sm font-medium leading-relaxed text-bnb-muted sm:text-lg">
              {mode === 'sell'
                ? '개인지갑의 비트코인을 한국 거래소 원화로 되돌리는 역방향 매도 경로를 비교합니다.'
                : '원화로 비트코인을 살 때 가장 저렴한 이동 경로를 바로 비교합니다.'}
            </span>
            <button
              type="submit"
              disabled={submitting}
              className={`flex w-full items-center justify-center gap-2 px-5 py-2 text-sm font-semibold uppercase tracking-[0.24em] text-dark-500 transition-colors disabled:opacity-50 sm:w-auto ${mode === 'sell' ? 'border border-bnb-red bg-bnb-red hover:bg-bnb-red/90' : 'border border-brand-600 bg-brand-600 hover:bg-brand-500'}`}
            >
              <Search size={13} />
              {submitting ? '검색 중...' : '검색'}
            </button>
          </div>
          {mode === 'sell' ? (
            <div className="mt-4 grid gap-3 border border-dark-200 bg-dark-400/40 p-3 sm:grid-cols-[minmax(0,10rem)_1fr] sm:items-end">
              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-bnb-muted">지갑 UTXO 개수</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={walletUtxoCountInput}
                  onChange={(event) => setWalletUtxoCountInput(event.target.value)}
                  className="w-full border border-dark-200 bg-dark-500 px-3 py-2 text-base font-semibold text-bnb-text outline-none transition-colors focus:border-bnb-red"
                  aria-label="지갑 UTXO 개수"
                />
              </label>
              <div className="space-y-1.5">
                <p className="text-xs text-bnb-text">Native SegWit(P2WPKH) · 받는 주소 1개 + 거스름돈 1개 기준으로 전송 수수료를 추정합니다.</p>
                {data?.mode === 'sell' && data.wallet_fee_estimate ? (
                  <div className="space-y-1 text-xs text-bnb-muted">
                    <p>
                      mempool.space 중간 수수료 <span className="font-data text-bnb-text">{formatFeeRateSatVb(data.wallet_fee_estimate.medium_fee_rate_sat_vb)}</span>
                      {' '}· 예상 크기 <span className="font-data text-bnb-text">{formatNumber(data.wallet_fee_estimate.estimated_tx_vbytes)} vB</span>
                      {' '}· 전송 수수료 <span className="font-data text-bnb-red">{formatNumber(data.wallet_fee_estimate.fee_sats)} sats</span>
                    </p>
                    <p>
                      {formatNumber(data.wallet_fee_estimate.utxo_count)} UTXO 입력 기준 · 약 <span className="font-data text-bnb-text">{formatCurrency(data.wallet_fee_estimate.fee_krw)}</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-bnb-muted">검색 시 현재 mempool.space 중간 수수료율로 지갑 전송 수수료를 함께 계산합니다.</p>
                )}
              </div>
            </div>
          ) : null}
        </form>
      </div>

      <div className="border-b border-dark-200 bg-dark-400 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPathShortcut('non_kyc')}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors border ${pathShortcut === 'non_kyc' ? 'border-brand-500/40 bg-brand-500/10 text-brand-400' : 'border-dark-200 text-bnb-muted hover:text-bnb-text'}`}
          >
            신원인증 최소화
          </button>
          <button
            type="button"
            onClick={() => setPathShortcut('default')}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors border ${pathShortcut === 'default' ? 'border-brand-500/40 bg-brand-500/10 text-brand-400' : 'border-dark-200 text-bnb-muted hover:text-bnb-text'}`}
          >
            가장 낮은 수수료
          </button>
          <button
            type="button"
            onClick={() => setPathShortcut('no_lightning')}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors border ${pathShortcut === 'no_lightning' ? 'border-brand-500/40 bg-brand-500/10 text-brand-400' : 'border-dark-200 text-bnb-muted hover:text-bnb-text'}`}
          >
            라이트닝 제외
          </button>
          <button
            type="button"
            onClick={() => setCarfBlackbox((v) => !v)}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors border ${carfBlackbox ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-dark-200 text-bnb-muted hover:text-bnb-text'}`}
          >
            CARF 2027 블랙박스
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      {loading ? (
        <div className="border-b border-dark-200 bg-dark-400 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-400">최적 경로 계산 중</p>
              <p className="mt-1 text-sm text-bnb-muted">거래소·네트워크별 수수료를 다시 비교하고 있습니다.</p>
            </div>
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-bnb-muted">
              <span className="live-dot" aria-hidden="true" />
              로딩 중
            </div>
          </div>
          <div
            role="progressbar"
            aria-label="최적 경로 로딩"
            aria-valuetext="최적 경로를 계산하고 있습니다"
            className="loading-progress-track mt-3 h-1.5 w-full"
          >
            <div className="loading-progress-bar" />
          </div>
        </div>
      ) : null}


      {/* Error */}
      {error ? (
        <div className="border-b border-dark-200 border-bnb-red/30 bg-bnb-red/10 p-5 text-bnb-red">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5" size={18} />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em]">경로 분석 실패</p>
              <p className="mt-2 text-sm font-medium">{error}</p>
              {data?.errors?.length ? (
                <ul className="mt-3 space-y-1 text-sm text-bnb-muted">
                  {data.errors.map((item, index) => (
                    <li key={`${item.stage}-${item.exchange}-${item.coin}-${index}`}>
                      {[item.exchange ? fmtEx(item.exchange) : null, item.coin].filter(Boolean).join(' / ')}: {item.error_message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {!loading && hasSearched && data && !error ? (
        <>
          {/* Best Path */}
          {bestVisiblePath ? (
            <div className={`border-b border-dark-200 ${carfBlackbox && isCarfAffected(bestVisiblePath, data.global_exchange) ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
              <div className="bg-dark-400 p-4 sm:p-5">
                <p className={`text-[11px] font-semibold uppercase tracking-[0.3em] ${mode === 'sell' ? 'text-bnb-red' : 'text-brand-400'}`}>{mode === 'sell' ? '비트코인 팔 때 경로' : '최적 경로'}</p>
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="border border-brand-400/40 bg-brand-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-400">1위</span>
                    <p className="text-lg font-semibold text-bnb-text sm:text-xl">
                      {formatTopPathSequence(bestVisiblePath, data.global_exchange, mode)}
                    </p>
                  </div>
                  <div className="border border-dark-200 bg-dark-500/60 p-3">
                    <PathTimeline path={bestVisiblePath} globalExchange={data.global_exchange} mode={mode} />
                  </div>
                  {/* Stats: mobile = stacked rows, sm+ = 3-col grid */}
                  <div className="divide-y divide-dark-200 border border-dark-200 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    <div className="flex items-center justify-between bg-dark-500 px-3 py-2.5 sm:flex-col sm:items-start sm:p-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">{mode === 'sell' ? '예상 KRW 수령' : '수령 sats'}</p>
                      <p className="font-data font-semibold text-bnb-text sm:mt-1 sm:text-xl">{mode === 'sell' ? formatCurrency(bestVisiblePath.krw_received ?? 0) : formatSats(bestVisiblePath.btc_received ?? 0)}</p>
                    </div>
                    <div className="flex items-center justify-between bg-dark-500 px-3 py-2.5 sm:flex-col sm:items-start sm:p-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">총 수수료</p>
                      <p className="font-data font-semibold text-brand-400 sm:mt-1 sm:text-xl">{formatCurrency(bestVisiblePath.total_fee_krw)}</p>
                    </div>
                    <div className="flex items-center justify-between bg-dark-500 px-3 py-2.5 sm:flex-col sm:items-start sm:p-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">수수료율</p>
                      <p className={`font-data font-semibold sm:mt-1 sm:text-xl ${getFeeTone(bestVisiblePath.fee_pct)}`}>{formatPercent(bestVisiblePath.fee_pct)}</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          ) : null}

          {/* Route Table with Filters */}
          <div className="border-b border-dark-200 bg-dark-500">
            {/* Filter Bar */}
            <div className="border-b border-dark-200 bg-dark-400 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                className="flex w-full items-center gap-2"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-bnb-muted">필터</span>
                {!filtersOpen && excludedDomesticNetworks.length > 0 && (
                  <span className="rounded-full bg-dark-200 px-1.5 py-0.5 text-[10px] font-data text-bnb-muted">
                    {excludedDomesticNetworks.length}개 제외
                  </span>
                )}
                <ChevronDown size={12} className={`ml-auto text-bnb-muted transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} />
              </button>
              {filtersOpen && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {allDomesticNetworks.map((network) => {
                  const excluded = excludedDomesticNetworks.includes(network);
                  return (
                    <button
                      key={network}
                      type="button"
                      onClick={() => toggleDomesticNetwork(network)}
                      className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors border ${
                        excluded
                          ? 'border-dark-100 bg-dark-300 text-bnb-muted/40 line-through'
                          : 'border-brand-500/40 bg-brand-500/10 text-brand-400 hover:bg-brand-500/20'
                      }`}
                    >
                      {localizeUiLabel(network)}
                    </button>
                  );
                })}
                {allGlobalExitOptions.map((option) => {
                  const key = `${option.mode}::${option.network}`;
                  const excluded = excludedGlobalExitOptions.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleGlobalExitOption(option.mode, option.network)}
                      className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors border ${
                        excluded
                          ? 'border-dark-100 bg-dark-300 text-bnb-muted/40 line-through'
                          : 'border-brand-500/40 bg-brand-500/10 text-brand-400 hover:bg-brand-500/20'
                      }`}
                    >
                      {option.mode === 'lightning' ? '⚡ ' : ''}{localizeUiLabel(option.network)}
                    </button>
                  );
                })}
                {allLightningProviders.map((provider) => {
                  const excluded = excludedLightningProviders.includes(provider);
                  return (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => toggleLightningProvider(provider)}
                      className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors border ${
                        excluded
                          ? 'border-dark-100 bg-dark-300 text-bnb-muted/40 line-through'
                          : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                      }`}
                    >
                      ⚡ {provider}
                    </button>
                  );
                })}
                <span className="ml-auto text-[11px] uppercase tracking-[0.2em] text-bnb-muted">
                  {filteredPaths.length}/{rankedPaths.length}
                </span>
              </div>
              )}
            </div>

            <div className="divide-y divide-dark-200 md:hidden">
              {filteredPaths.map((path) => {
                const isHighlighted = selectedPathId === path.path_id;
                return (
                  <article
                    key={`mobile-${path.path_id}`}
                    className={`space-y-2.5 p-3 ${isHighlighted ? 'bg-brand-500/10' : 'bg-dark-500'} ${carfBlackbox && data && isCarfAffected(path, data.global_exchange) ? 'opacity-30 grayscale pointer-events-none' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className={`font-mono text-xs ${path.visibleRank === 1 ? 'font-bold text-brand-400' : 'text-bnb-muted'}`}>
                          #{String(path.visibleRank).padStart(3, '0')}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedPathId(path.path_id)}
                          className="min-w-0 text-left text-sm font-semibold text-bnb-text"
                          aria-label={`${fmtEx(path.korean_exchange)} 경로 선택`}
                        >
                          <ServiceLabel
                            name={path.korean_exchange}
                            label={fmtEx(path.korean_exchange)}
                            variant="exchange"
                            textClassName="text-sm font-semibold text-bnb-text"
                            logoClassName="h-5 w-5"
                          />
                        </button>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-brand-400">{formatCurrency(path.total_fee_krw)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-bnb-muted">
                      <p className="col-span-2">{path.transfer_coin} · {localizeUiLabel(path.domestic_withdrawal_network)}</p>
                      <p>{mode === 'sell' ? 'KRW 수령' : '수령'} <span className="text-bnb-text">{mode === 'sell' ? formatCurrency(path.krw_received ?? 0) : formatSats(path.btc_received ?? 0)}</span></p>
                      <p>수수료율 <span className={getFeeTone(path.fee_pct)}>{formatPercent(path.fee_pct)}</span></p>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => openMobileRouteDetail(path.path_id)}
                        className="inline-flex items-center justify-center border border-brand-500/40 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400 transition-colors hover:bg-brand-500/10"
                        aria-label={`${fmtEx(path.korean_exchange)} 경로 상세 열기`}
                      >
                        경로 상세
                      </button>
                    </div>
                  </article>
                );
              })}
              {filteredPaths.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-bnb-muted">필터 조건에 해당하는 경로가 없습니다.</div>
              ) : null}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-200 bg-dark-400 text-left text-[11px] font-semibold uppercase tracking-[0.28em] text-bnb-muted">
                    <th className="px-5 py-3">순위</th>
                    <th className="px-5 py-3">출발지</th>
                    <th className="px-5 py-3">경유지</th>
                    <th className="px-5 py-3 text-right">수수료율</th>
                    <th className="px-5 py-3 text-right">{mode === 'sell' ? 'KRW 수령' : '수령 sats'}</th>
                    <th className="px-5 py-3 text-right">수수료(KRW)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPaths.map((path) => {
                    const isExpanded = expandedPathId === path.path_id;
                    return (
                      <Fragment key={path.path_id}>
                        <tr
                          className={`cursor-pointer border-b border-dark-200 transition-colors ${isExpanded ? 'bg-dark-400' : 'bg-dark-500 hover:bg-dark-400'} ${carfBlackbox && data && isCarfAffected(path, data.global_exchange) ? 'opacity-30 grayscale pointer-events-none' : ''}`}
                          onClick={() => setExpandedPathId(prev => prev === path.path_id ? '' : path.path_id)}
                        >
                          <td className="px-5 py-3.5">
                            <span className={`font-mono text-xs ${path.visibleRank === 1 ? 'font-bold text-brand-400' : 'text-bnb-muted'}`}>
                              #{String(path.visibleRank).padStart(3, '0')}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <ServiceLabel
                              name={path.korean_exchange}
                              label={fmtEx(path.korean_exchange)}
                              variant="exchange"
                              textClassName={isExpanded ? 'font-semibold text-brand-400' : 'font-semibold text-bnb-text'}
                              logoClassName="h-5 w-5"
                            />
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {mode === 'sell' ? (
                                <>
                                  <span className="text-xs text-bnb-muted">지갑</span>
                                  {path.lightning_exit_provider && (
                                    <>
                                      <ArrowRight size={10} className="text-dark-100 shrink-0" />
                                      <ServiceLogo name={path.lightning_exit_provider} variant="lightning" className="h-4 w-4" />
                                    </>
                                  )}
                                  {(path.route_variant === 'usdt_via_global' || path.route_variant === 'lightning_via_global') && (
                                    <>
                                      <ArrowRight size={10} className="text-dark-100 shrink-0" />
                                      <ServiceLogo name={data.global_exchange} variant="exchange" className="h-4 w-4" />
                                    </>
                                  )}
                                  <ArrowRight size={10} className="text-dark-100 shrink-0" />
                                  <ServiceLogo name={path.korean_exchange} variant="exchange" className="h-4 w-4" />
                                </>
                              ) : (
                                <>
                                  <ServiceLogo name={path.korean_exchange} variant="exchange" className="h-4 w-4" />
                                  <ArrowRight size={10} className="text-dark-100 shrink-0" />
                                  <span className="rounded border border-dark-100 px-1 py-0.5 text-[10px] font-medium text-bnb-muted">{path.transfer_coin}</span>
                                  <ArrowRight size={10} className="text-dark-100 shrink-0" />
                                  <ServiceLogo name={data.global_exchange} variant="exchange" className="h-4 w-4" />
                                  {path.lightning_exit_provider && (
                                    <>
                                      <ArrowRight size={10} className="text-dark-100 shrink-0" />
                                      <ServiceLogo name={path.lightning_exit_provider} variant="lightning" className="h-4 w-4" />
                                    </>
                                  )}
                                  <ArrowRight size={10} className="text-dark-100 shrink-0" />
                                  <span className="text-xs text-bnb-muted">지갑</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className={`px-5 py-3.5 text-right font-semibold font-data ${getFeeTone(path.fee_pct)}`}>
                            {formatPercent(path.fee_pct)}
                          </td>
                          <td className="px-5 py-3.5 text-right font-medium font-data text-bnb-text">
                            {mode === 'sell' ? formatCurrency(path.krw_received ?? 0) : formatSats(path.btc_received ?? 0)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-semibold font-data text-brand-400">{formatCurrency(path.total_fee_krw)}</span>
                              <ChevronDown size={13} className={`shrink-0 text-bnb-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-dark-200 bg-dark-400/60">
                            <td colSpan={6} className="p-4">
                              <div className="space-y-3">
                                <div className="border border-dark-200 bg-dark-500/80 p-3">
                                  <PathTimeline path={path} globalExchange={data.global_exchange} mode={mode} />
                                </div>
                                <div className="grid grid-cols-3 gap-px border border-dark-200 bg-dark-200">
                                  <div className="bg-dark-500 p-3">
                                    <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">{mode === 'sell' ? '예상 KRW 수령' : '수령 sats'}</p>
                                    <p className="mt-1 font-semibold font-data text-bnb-text">{mode === 'sell' ? formatCurrency(path.krw_received ?? 0) : formatSats(path.btc_received ?? 0)}</p>
                                  </div>
                                  <div className="bg-dark-500 p-3">
                                    <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">총 수수료</p>
                                    <p className="mt-1 font-semibold font-data text-brand-400">{formatCurrency(path.total_fee_krw)}</p>
                                  </div>
                                  <div className="bg-dark-500 p-3">
                                    <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">코인 / 네트워크</p>
                                    <p className="mt-1 text-sm text-bnb-text">{path.transfer_coin} <span className="text-bnb-muted">{localizeUiLabel(path.domestic_withdrawal_network)}</span></p>
                                    <p className="text-xs text-bnb-muted">{path.global_exit_mode === 'lightning' ? '⚡ 라이트닝' : '온체인'} · {localizeUiLabel(path.global_exit_network)}</p>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {filteredPaths.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-sm text-bnb-muted">
                        필터 조건에 해당하는 경로가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </>
      ) : null}
      {mobileRouteDetailOpen && selectedRoute ? (
        <RouteDetailPopup
          selectedRoute={selectedRoute}
          globalExchange={data?.global_exchange ?? globalExchange}
          mode={mode}
          onClose={() => setMobileRouteDetailOpen(false)}
        />
      ) : null}
    </div>
  );
}
