import { ArrowRight, Building2, Search, ShieldAlert, TrendingUp, Users, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import { KycBadge } from '../components/KycBadge';
import { api } from '../lib/api';
import { fmtEx } from '../lib/exchangeNames';
import type { AccessStats, CheapestPathEntry, CheapestPathResponse } from '../types';

const DEFAULT_AMOUNT_MANWON = 100; // 만원 단위
const DEFAULT_EXCLUDED_NETWORKS = ['Aptos', 'Kaia'];
const SATS_PER_BTC = 100_000_000;

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(value);
}

function formatCurrency(value: number) {
  return `${formatNumber(value)} KRW`;
}

function formatSats(value: number) {
  return `${formatNumber(Math.round(value * SATS_PER_BTC))} sats`;
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


function formatTopPathSequence(path: CheapestPathEntry, globalExchange: string) {
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

function sortAllPaths(paths: CheapestPathEntry[]): RankedPath[] {
  return [...paths]
    .sort((a, b) => {
      if (a.total_fee_krw !== b.total_fee_krw) return a.total_fee_krw - b.total_fee_krw;
      return b.btc_received - a.btc_received;
    })
    .map((path, i) => ({ ...path, rank: i + 1 }));
}

function RouteDetailPopup({
  selectedRoute,
  globalExchange,
  onClose,
}: {
  selectedRoute: { rank: number; path: RankedPath };
  globalExchange: string;
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

          <PathTimeline path={selectedRoute.path} globalExchange={globalExchange} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PathTimeline({ path, globalExchange }: { path: CheapestPathEntry; globalExchange: string }) {
  const components = path.breakdown?.components ?? [];
  const steps = [
    {
      label: fmtEx(path.korean_exchange),
      rawName: path.korean_exchange,
      sub: '한국 거래소',
      active: true,
      variant: 'exchange' as const,
      kycStatus: path.domestic_kyc_status,
      feeText: components[0] ? formatCurrency(components[0].amount_krw) : null,
      feeLabel: components[0]?.label ?? null,
    },
    {
      label: path.transfer_coin,
      sub: path.domestic_withdrawal_network,
      active: true,
      feeText: components[1] ? formatCurrency(components[1].amount_krw) : null,
      feeLabel: components[1]?.label ?? null,
    },
    {
      label: fmtEx(globalExchange),
      rawName: globalExchange,
      sub: path.transfer_coin === 'USDT' ? '글로벌 거래소 · USDT 입금' : '글로벌 거래소 · BTC 입금',
      active: true,
      variant: 'exchange' as const,
      kycStatus: path.global_kyc_status,
      feeText: components[2] ? formatCurrency(components[2].amount_krw) : null,
      feeLabel: components[2]?.label ?? null,
    },
    {
      label: path.global_exit_mode === 'lightning' ? 'Lightning 출금' : '온체인 출금',
      rawName: path.lightning_exit_provider ?? path.swap_service ?? undefined,
      sub: path.global_exit_network + (path.lightning_exit_provider ? ` · ${path.lightning_exit_provider}` : ''),
      active: true,
      variant: path.lightning_exit_provider || path.swap_service ? ('lightning' as const) : undefined,
      kycStatus: path.exit_service_kyc_status,
      feeText: components.length > 3 ? formatCurrency(components.slice(3).reduce((sum, component) => sum + component.amount_krw, 0)) : null,
      feeLabel: components.length > 3 ? components.slice(3).map((component) => component.label).join(' + ') : null,
    },
    {
      label: '개인 지갑',
      sub: formatSats(path.btc_received),
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
                {step.feeText ? (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-bnb-muted">단계 수수료</p>
                    <p className="mt-1 text-sm font-semibold text-brand-400">{step.feeText}</p>
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
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function CheapestPathPage() {
  const [amountKrwInput, setAmountKrwInput] = useState(String(DEFAULT_AMOUNT_MANWON));
  const [globalExchange] = useState('binance');
  const [selectedPathId, setSelectedPathId] = useState('');
  const [data, setData] = useState<CheapestPathResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [pathShortcut, setPathShortcut] = useState<'default' | 'non_kyc' | 'no_lightning'>('default');
  const [error, setError] = useState<string | null>(null);
  const [mobileRouteDetailOpen, setMobileRouteDetailOpen] = useState(false);
  const [accessStats, setAccessStats] = useState<AccessStats | null>(null);

  useEffect(() => {
    api.getAccessCount().then(setAccessStats).catch(() => setAccessStats(null));
  }, []);

  // Table filters
  const [excludedDomesticNetworks, setExcludedDomesticNetworks] = useState<string[]>(DEFAULT_EXCLUDED_NETWORKS);
  const [excludedGlobalExitOptions, setExcludedGlobalExitOptions] = useState<string[]>([]);
  const [excludedLightningProviders, setExcludedLightningProviders] = useState<string[]>([]);

  const load = useCallback(async (requestParams: { amountKrw: number; globalExchange: string }) => {
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

  const rankedPaths = useMemo(() => (data ? sortAllPaths(data.all_paths ?? []) : []), [data]);

  const allDomesticNetworks = useMemo(
    () => data?.available_filters?.domestic_withdrawal_networks ?? Array.from(new Set(rankedPaths.map((p) => p.domestic_withdrawal_network))).sort(),
    [data?.available_filters?.domestic_withdrawal_networks, rankedPaths],
  );
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

  const filteredPaths = useMemo(() => {
    return rankedPaths.filter((path) => {
      const globalExitKey = `${path.global_exit_mode}::${path.global_exit_network}`;
      if (excludedDomesticNetworks.includes(path.domestic_withdrawal_network)) return false;
      if (excludedGlobalExitOptions.includes(globalExitKey)) return false;
      if (path.lightning_exit_provider && excludedLightningProviders.includes(path.lightning_exit_provider)) return false;
      if (pathShortcut === 'no_lightning' && path.global_exit_mode === 'lightning') return false;
      if (pathShortcut === 'non_kyc') {
        const beforeWalletKyc = path.exit_service_kyc_status ?? path.global_kyc_status;
        if (beforeWalletKyc !== 'non_kyc') return false;
      }
      return true;
    });
  }, [excludedDomesticNetworks, excludedGlobalExitOptions, excludedLightningProviders, pathShortcut, rankedPaths]);

  const bestVisiblePath = useMemo(() => filteredPaths[0] ?? null, [filteredPaths]);

  const selectedRoute = useMemo(() => {
    if (!data || !selectedPathId) return null;
    const found = filteredPaths.find((item) => item.path_id === selectedPathId) ?? rankedPaths.find((item) => item.path_id === selectedPathId);
    if (!found) return null;
    return { rank: found.rank, path: found };
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
    await load({
      amountKrw: Math.max((Number(amountKrwInput) || DEFAULT_AMOUNT_MANWON) * 10000, 10000),
      globalExchange,
    });
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


  const topFivePaths = filteredPaths.slice(0, 5);
  const maxFeePct = Math.max(...topFivePaths.map((p) => p.fee_pct), 1);

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
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-3">
            <label className="flex max-w-[8rem] flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-bnb-muted">투입 금액(만원)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={amountKrwInput}
                onChange={(event) => setAmountKrwInput(event.target.value)}
                className="w-full border-b-2 border-brand-500 bg-transparent pb-1 text-left text-2xl font-bold text-bnb-text outline-none placeholder:text-bnb-muted sm:text-center"
                placeholder="100"
              />
            </label>
            <span className="text-sm font-medium leading-relaxed text-bnb-muted sm:text-lg">
              원화로 비트코인을 살 때 가장 저렴한 이동 경로를 바로 비교합니다.
            </span>
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 border border-brand-600 bg-brand-600 px-5 py-2 text-sm font-semibold uppercase tracking-[0.24em] text-dark-500 transition-colors hover:bg-brand-500 disabled:opacity-50 sm:w-auto"
            >
              <Search size={13} />
              {submitting ? '검색 중...' : '검색'}
            </button>
          </div>
        </form>
      </div>

      <div className="border-b border-dark-200 bg-dark-400 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPathShortcut('default')}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors border ${pathShortcut === 'default' ? 'border-brand-500/40 bg-brand-500/10 text-brand-400' : 'border-dark-200 text-bnb-muted hover:text-bnb-text'}`}
          >
            최저 경로
          </button>
          <button
            type="button"
            onClick={() => setPathShortcut('non_kyc')}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors border ${pathShortcut === 'non_kyc' ? 'border-brand-500/40 bg-brand-500/10 text-brand-400' : 'border-dark-200 text-bnb-muted hover:text-bnb-text'}`}
          >
            논 KYC
          </button>
          <button
            type="button"
            onClick={() => setPathShortcut('no_lightning')}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors border ${pathShortcut === 'no_lightning' ? 'border-brand-500/40 bg-brand-500/10 text-brand-400' : 'border-dark-200 text-bnb-muted hover:text-bnb-text'}`}
          >
            라이트닝 제외
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      {loading ? (
        <div className="border-b border-dark-200 bg-dark-400 px-4 py-3 sm:px-5">
          <div className="h-4 w-72 animate-pulse bg-dark-200" />
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
            <div className="border-b border-dark-200">
              <div className="bg-dark-400 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand-400">최적 경로</p>
                </div>
                <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="space-y-2 text-bnb-text">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="border border-brand-400/40 bg-brand-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-400">1위</span>
                        <p className="text-lg font-semibold text-bnb-text sm:text-xl">
                          {formatTopPathSequence(bestVisiblePath, data.global_exchange)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-bnb-muted">
                        <ServiceLabel
                          name={bestVisiblePath.korean_exchange}
                          label={fmtEx(bestVisiblePath.korean_exchange)}
                          variant="exchange"
                          textClassName="text-sm text-bnb-muted"
                          logoClassName="h-5 w-5"
                        />
                        <ArrowRight size={14} className="text-bnb-muted" />
                        <ServiceLabel
                          name={data.global_exchange}
                          label={fmtEx(data.global_exchange)}
                          variant="exchange"
                          textClassName="text-sm text-bnb-muted"
                          logoClassName="h-5 w-5"
                        />
                        {bestVisiblePath.lightning_exit_provider ? (
                          <>
                            <ArrowRight size={14} className="text-bnb-muted" />
                            <ServiceLabel
                              name={bestVisiblePath.lightning_exit_provider}
                              label={bestVisiblePath.lightning_exit_provider}
                              variant="lightning"
                              textClassName="text-sm text-bnb-muted"
                              logoClassName="h-5 w-5"
                            />
                          </>
                        ) : null}
                        <ArrowRight size={14} className="text-bnb-muted" />
                        <span className="text-sm text-bnb-muted">개인 지갑</span>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-bnb-muted">
                      <p>국내 출발: {fmtEx(bestVisiblePath.korean_exchange)} · {bestVisiblePath.transfer_coin} · {bestVisiblePath.domestic_withdrawal_network}</p>
                      <p>해외 진입: {fmtEx(data.global_exchange)} · {bestVisiblePath.transfer_coin === 'USDT' ? 'USDT 입금 후 BTC 전환' : 'BTC 직접 이동'}</p>
                      <p>최종 출금: {bestVisiblePath.global_exit_mode === 'lightning' ? 'Lightning' : 'On-chain'} · {bestVisiblePath.global_exit_network}</p>
                      {bestVisiblePath.lightning_exit_provider ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span>중간 서비스:</span>
                          <ServiceLabel
                            name={bestVisiblePath.lightning_exit_provider}
                            variant="lightning"
                            textClassName="text-sm text-bnb-muted"
                            logoClassName="h-4 w-4"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="w-full lg:max-w-3xl">
                    <div className="border border-dark-200 bg-dark-500/60 p-3">
                      <PathTimeline path={bestVisiblePath} globalExchange={data.global_exchange} />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:min-w-[220px] sm:grid-cols-3 xl:grid-cols-1">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">수령 sats</p>
                      <p className="mt-1 text-xl font-semibold text-bnb-text">{formatSats(bestVisiblePath.btc_received)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">총 수수료</p>
                      <p className="mt-1 text-xl font-semibold text-brand-400">{formatCurrency(bestVisiblePath.total_fee_krw)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">수수료율</p>
                      <p className={`mt-1 text-xl font-semibold ${getFeeTone(bestVisiblePath.fee_pct)}`}>{formatPercent(bestVisiblePath.fee_pct)}</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          ) : null}

          {/* Route Table with Filters */}
          <div className="border-b border-dark-200 bg-dark-500">
            {/* Filter Bar */}
            <div className="space-y-3 border-b border-dark-200 bg-dark-400 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
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
                      {network}
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
                      {option.mode === 'lightning' ? '⚡' : ''}{option.network}
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
            </div>

            <div className="divide-y divide-dark-200 md:hidden">
              {filteredPaths.map((path) => {
                const isHighlighted = selectedPathId === path.path_id;
                return (
                  <article
                    key={`mobile-${path.path_id}`}
                    className={`space-y-2.5 p-3 ${isHighlighted ? 'bg-brand-500/10' : 'bg-dark-500'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className={`font-mono text-xs ${path.rank === 1 ? 'font-bold text-brand-400' : 'text-bnb-muted'}`}>
                          #{String(path.rank).padStart(3, '0')}
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
                      <p className="col-span-2">{path.transfer_coin} · {path.domestic_withdrawal_network}</p>
                      <p>수령 <span className="text-bnb-text">{formatSats(path.btc_received)}</span></p>
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
                    <th className="px-5 py-3">코인 / 네트워크</th>
                    <th className="px-5 py-3 text-right">총 수수료율</th>
                    <th className="px-5 py-3 text-right">수령 sats</th>
                    <th className="px-5 py-3 text-right">수수료(KRW)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPaths.map((path) => {
                        const isHighlighted = selectedPathId === path.path_id;
                    return (
                      <tr
                        key={path.path_id}
                        className={`border-b border-dark-200 transition-colors last:border-b-0 ${isHighlighted ? 'bg-brand-500/10 hover:bg-brand-500/20' : 'bg-dark-500 hover:bg-dark-400'}`}
                      >
                        <td className="px-5 py-4">
                          <span className={`font-mono text-xs ${path.rank === 1 ? 'font-bold text-brand-400' : 'text-bnb-muted'}`}>
                            #{String(path.rank).padStart(3, '0')}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-semibold text-bnb-text">
                          <button
                            type="button"
                            onClick={() => setSelectedPathId(path.path_id)}
                            className={`text-left transition-colors ${
                              isHighlighted ? 'text-brand-400' : 'text-bnb-text hover:text-brand-400'
                            }`}
                            aria-label={`${fmtEx(path.korean_exchange)} 경로 선택`}
                          >
                            <ServiceLabel
                              name={path.korean_exchange}
                              label={fmtEx(path.korean_exchange)}
                              variant="exchange"
                              textClassName={isHighlighted ? 'font-semibold text-brand-400' : 'font-semibold text-bnb-text'}
                              logoClassName="h-5 w-5"
                            />
                          </button>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-bnb-text">{path.transfer_coin} <span className="text-bnb-muted">{path.domestic_withdrawal_network}</span></p>
                            <span className="text-[10px] text-bnb-muted">→ {path.global_exit_mode === 'lightning' ? 'Lightning' : 'On-chain'} / {path.global_exit_network}</span>
                            {path.path_type === 'lightning_exit' && (
                              <span className="inline-flex items-center gap-0.5 border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-yellow-400">
                                <Zap size={9} />
                                LN
                              </span>
                            )}
                            {(path.lightning_exit_provider || path.swap_service) && path.path_type === 'lightning_exit' && (
                              <ServiceLabel
                                name={path.lightning_exit_provider ?? path.swap_service ?? ''}
                                variant="lightning"
                                textClassName="text-[10px] text-bnb-muted"
                                logoClassName="h-4 w-4"
                              />
                            )}
                          </div>
                        </td>
                        <td className={`px-5 py-4 text-right font-semibold ${getFeeTone(path.fee_pct)}`}>
                          {formatPercent(path.fee_pct)}
                        </td>
                        <td className="px-5 py-4 text-right font-medium text-bnb-text">
                          {formatSats(path.btc_received)}
                        </td>
                        <td className="px-5 py-4 text-right font-semibold text-brand-400">
                          {formatCurrency(path.total_fee_krw)}
                        </td>
                      </tr>
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

          {/* Bottom: Focused Route + Fee Velocity */}
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1.1fr)_0.9fr]">
            {/* Focused Route Inspector */}
            <div className="hidden border-r border-dark-200 bg-dark-500 md:block">
              <div className="border-b border-dark-200 bg-dark-400 px-4 py-3 sm:px-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-bnb-muted">경로 상세</p>
              </div>
              <div className="p-4 sm:p-5" role="region" aria-label="선택 경로 상세">
                {selectedRoute ? (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="border border-dark-200 bg-dark-400 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-bnb-muted">{selectedRoute.rank}위</span>
                      <ServiceLabel
                        name={selectedRoute.path.korean_exchange}
                        label={fmtEx(selectedRoute.path.korean_exchange)}
                        variant="exchange"
                        textClassName="text-lg font-semibold text-bnb-text"
                        logoClassName="h-6 w-6"
                      />
                      <ArrowRight size={14} className="text-bnb-muted" />
                      <ServiceLabel
                        name={data.global_exchange}
                        label={fmtEx(data.global_exchange)}
                        variant="exchange"
                        textClassName="text-lg font-semibold text-bnb-text"
                        logoClassName="h-6 w-6"
                      />
                    </div>

                    <PathTimeline path={selectedRoute.path} globalExchange={data.global_exchange} />

                    <div className="grid gap-0 border border-dark-200 md:grid-cols-3">
                      <div className="border-b border-dark-200 p-4 md:border-b-0 md:border-r last:border-r-0">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">코인/네트워크</p>
                        <p className="mt-2 font-semibold text-bnb-text">{selectedRoute.path.transfer_coin}</p>
                        <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-bnb-muted">{selectedRoute.path.domestic_withdrawal_network}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-bnb-muted">
                          {selectedRoute.path.global_exit_mode === 'lightning' ? 'Lightning' : 'On-chain'} / {selectedRoute.path.global_exit_network}
                        </p>
                        {selectedRoute.path.lightning_exit_provider ? (
                          <div className="mt-1">
                            <ServiceLabel
                              name={selectedRoute.path.lightning_exit_provider}
                              variant="lightning"
                              textClassName="text-xs uppercase tracking-[0.2em] text-bnb-muted"
                              logoClassName="h-4 w-4"
                            />
                          </div>
                        ) : null}
                      </div>
                      <div className="border-b border-dark-200 p-4 md:border-b-0 md:border-r last:border-r-0">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">수령 sats</p>
                        <p className="mt-2 font-semibold text-bnb-text">{formatSats(selectedRoute.path.btc_received)}</p>
                      </div>
                      <div className="p-4">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">수수료율</p>
                        <p className={`mt-2 font-semibold ${getFeeTone(selectedRoute.path.fee_pct)}`}>{formatPercent(selectedRoute.path.fee_pct)}</p>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="border border-dashed border-dark-200 bg-dark-400 p-5 text-sm text-bnb-muted">
                    경로를 선택하면 해당 경로의 순위, 수수료, 세부 계산 근거를 이 영역에서 확인할 수 있습니다.
                  </div>
                )}
              </div>
            </div>

            {/* Fee Rate Velocity */}
            <div className="bg-dark-500">
              <div className="flex items-center gap-2 border-b border-dark-200 bg-dark-400 px-4 py-3 sm:px-5">
                <TrendingUp size={14} className="text-bnb-muted" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-bnb-muted">
                  수수료율 비교 (상위 5개)
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <div className="space-y-4">
                  {topFivePaths.map((path) => (
                    <div key={`velocity-${path.path_id}`}>
                      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-bnb-muted">
                        <span className="inline-flex items-center gap-2">
                          <ServiceLogo name={path.korean_exchange} variant="exchange" className="h-4 w-4" />
                          <span>{fmtEx(path.korean_exchange)} · {path.transfer_coin}</span>
                        </span>
                        <span className={getFeeTone(path.fee_pct)}>{formatPercent(path.fee_pct)}</span>
                      </div>
                      <div className="h-2 bg-dark-200">
                        <div
                          className="h-2 bg-brand-500"
                          style={{ width: `${Math.max((path.fee_pct / maxFeePct) * 100, 8)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {(data.disabled_paths?.length ?? 0) > 0 ? (
                  <div className="mt-6 border border-bnb-red/30 bg-bnb-red/5 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-bnb-red">비활성 경로</p>
                    <ul className="mt-3 space-y-2 text-sm text-bnb-muted">
                      {(data.disabled_paths ?? []).slice(0, 4).map((path, index) => (
                        <li key={`${path.korean_exchange}-${path.transfer_coin}-${index}`}>
                          {fmtEx(path.korean_exchange)} · {path.transfer_coin} / {path.network}
                          {path.reason ? ` — ${path.reason}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : null}
      {mobileRouteDetailOpen && selectedRoute ? (
        <RouteDetailPopup
          selectedRoute={selectedRoute}
          globalExchange={data?.global_exchange ?? globalExchange}
          onClose={() => setMobileRouteDetailOpen(false)}
        />
      ) : null}
    </div>
  );
}
