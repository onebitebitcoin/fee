// ── ExplorerContext ───────────────────────────────────────────────────────────
// 탐색 위저드의 모든 상태·파생 데이터·핸들러를 한 곳에 모아 Provider로 제공한다.
// 각 단계 컴포넌트는 useExplorer()로 필요한 값만 꺼내 쓴다.
// 타입은 useExplorerValue 반환값에서 추론한다(수동 인터페이스 유지보수 불필요).

import { createContext, useContext, useState, useMemo, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { api } from '../../lib/api';
import { SATS_PER_BTC } from '../../lib/formatBtc';
import type { LiveRegistry } from '../../lib/gatemanRegistry';
import type { CheapestPathEntry, CheapestPathResponse, TickerRow } from '../../types';
import type { Phase, CoinType, FlowState } from './flow';
import { phaseIdx, flowNext, flowPrev, flowSteps } from './flow';
import type { AllData, GlobalExchange } from './constants';
import { GLOBAL_EXCHANGES, DOMESTIC_INFO, bestByBtc } from './constants';

function useExplorerValue() {
  const [phase, setPhase]         = useState<Phase>('input');
  const [amount, setAmount]       = useState('100');
  const [unit, setUnit]           = useState<'만원' | '억원'>('만원');
  const [allData, setAllData]     = useState<AllData | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [dir, setDir]             = useState<1 | -1>(1);

  const [domestic, setDomestic]   = useState<string | null>(null);
  const [coin, setCoin]           = useState<CoinType | null>(null);
  const [global, setGlobal]       = useState<GlobalExchange | null>(null);
  const [network, setNetwork]     = useState<string | null>(null);
  const [swapSvc, setSwapSvc]     = useState<string | null>(null);
  const [liveKimp, setLiveKimp]       = useState<Record<string, number> | null>(null);
  const [kimpFetchedAt, setKimpFetchedAt] = useState<number | null>(null);
  const [kimpInfoOpen, setKimpInfoOpen] = useState(false);
  const [btcPrice, setBtcPrice] = useState<{ usd: number; krw: number; upbitKrw: number | null; kimchiPremium: number | null; fetchedAt: Date } | null>(null);
  const [btcMethod, setBtcMethod]         = useState<'onchain' | 'lightning' | null>(null);
  const [globalExitMethod, setGlobalExitMethod] = useState<'onchain' | 'lightning' | null>(null);
  const [liveRegistry, setLiveRegistry] = useState<LiveRegistry | null>(null);
  const [displaySats, setDisplaySats]   = useState(0);
  const [showAltPaths, setShowAltPaths] = useState(false);
  const [cautionMap, setCautionMap] = useState<Record<string, { caution: boolean; reason: string | null }>>({});

  const [exchangeProgress, setExchangeProgress] = useState<Record<string, 'loading' | 'done' | 'error' | 'retrying'>>({});
  const [loadingDone, setLoadingDone] = useState(false);
  const [failedGlobalExchanges, setFailedGlobalExchanges] = useState<string[]>([]);

  const [withdrawalLimits, setWithdrawalLimits] = useState<Record<string, {
    krw_per_tx_limit: number | null;
    btc_per_tx_max: number | null;
    btc_daily_verified: number | null;
    krw_daily_verified_digital: number | null;
    source: string;
    scraped_at: number | null;
  }>>({});

  const prevPhase      = useRef<Phase>('input');
  const satRafRef      = useRef<number | null>(null);
  const stepEndRef     = useRef<HTMLDivElement>(null);
  const skipPopstate   = useRef(false);

  function scrollToStepEnd() {
    requestAnimationFrame(() =>
      stepEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    );
  }

  const amountKrw = parseFloat(amount || '0') * (unit === '만원' ? 10_000 : 100_000_000);

  useEffect(() => {
    api.getGatemanRegistry().then(res => {
      setLiveRegistry(res.data as unknown as LiveRegistry);
    }).catch(() => { /* use static defaults */ });
  }, []);

  useEffect(() => {
    api.getWithdrawalLimits().then(res => {
      setWithdrawalLimits(res.limits);
    }).catch(() => { /* keep static DOMESTIC_INFO fallback */ });
  }, []);

  useEffect(() => {
    api.getCaution().then(setCautionMap).catch(() => { /* keep empty */ });
  }, []);

  // BTC 시세 30초 폴링 — phase 무관하게 항상 실행
  useEffect(() => {
    const fetch = () =>
      api.getLiveKimp()
        .then(res => setBtcPrice({
          usd: Math.round(res.global_btc_price_krw / res.usd_krw_rate),
          krw: Math.round(res.global_btc_price_krw),
          upbitKrw: res.korean_btc_prices?.['upbit'] ? Math.round(res.korean_btc_prices['upbit']) : null,
          kimchiPremium: res.kimp?.['upbit'] != null ? res.kimp['upbit'] : null,
          fetchedAt: new Date(),
        }))
        .catch(() => { /* keep previous */ });
    fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const cur = phaseIdx(phase);
    const prev = phaseIdx(prevPhase.current);
    setDir(cur >= prev ? 1 : -1);
    prevPhase.current = phase;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phase]);

  // ── Derived options ──────────────────────────────────────────────────────────

  const allPaths = useMemo(() => {
    if (!allData) return [] as (CheapestPathEntry & { _g: string })[];
    return Object.entries(allData.byGlobal).flatMap(([g, d]) =>
      d.all_paths.map(p => ({ ...p, _g: g })),
    );
  }, [allData]);

  // liveKimp 가져오기 실패 시의 fallback. 티커 스냅샷의 usd_krw_rate(포렉스 환율) 기준으로 계산한다.
  const snapshotKimp = useMemo(() => {
    if (!allData) return {} as Record<string, number>;
    const ref = allData.byGlobal['binance'] ?? Object.values(allData.byGlobal)[0];
    if (!ref) return {} as Record<string, number>;
    const gkrw = ref.global_btc_price_usd * ref.usd_krw_rate;
    const result: Record<string, number> = {};
    for (const t of allData.tickers) {
      if (t.currency === 'KRW' && t.pair?.includes('BTC') && t.price && gkrw)
        result[t.exchange] = ((t.price - gkrw) / gkrw) * 100;
    }
    return result;
  }, [allData]);

  const domesticBtcKrw = useMemo(() => {
    if (!allData || !domestic) return null;
    return allData.tickers.find(t =>
      t.exchange === domestic && t.currency === 'KRW' && t.pair?.includes('BTC')
    )?.price ?? null;
  }, [allData, domestic]);

  // 한국 거래소 24h 거래량 맵 — KRW 단위 (BTC 거래량 × BTC/KRW 기준가)
  const koreaVolumeMap = useMemo(() => {
    const ref = allData?.byGlobal['binance'] ?? Object.values(allData?.byGlobal ?? {})[0];
    const btcKrw = ref ? ref.global_btc_price_usd * ref.usd_krw_rate : 0;
    const m: Record<string, number> = {};
    for (const t of (allData?.tickers ?? [])) {
      if (t.currency === 'KRW' && t.pair?.includes('BTC') && t.volume_24h_btc && btcKrw) {
        m[t.exchange] = t.volume_24h_btc * btcKrw;  // KRW
      }
    }
    return m;
  }, [allData]);

  const domesticOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const data of Object.values(allData?.byGlobal ?? {}))
      for (const p of data.all_paths) {
        const cur = map.get(p.korean_exchange) ?? 0;
        if ((p.btc_received ?? 0) > cur) map.set(p.korean_exchange, p.btc_received ?? 0);
      }
    return [...map.entries()]
      .map(([exchange, best]) => ({ exchange, best }))
      .sort((a, b) => (koreaVolumeMap[b.exchange] ?? 0) - (koreaVolumeMap[a.exchange] ?? 0));
  }, [allData, koreaVolumeMap]);

  const coinOptions = useMemo(() => {
    if (!allData || !domestic) return [] as { coin: CoinType; best: CheapestPathEntry }[];
    const anyData = Object.values(allData.byGlobal)[0];
    const paths = (anyData?.all_paths ?? []).filter(p => p.korean_exchange === domestic);
    const opts: { coin: CoinType; best: CheapestPathEntry }[] = [];
    const u  = bestByBtc(paths.filter(p => p.transfer_coin === 'USDT'));
    const b  = bestByBtc(paths.filter(p => p.transfer_coin === 'BTC' && p.route_variant !== 'btc_via_global'));
    const bg = bestByBtc(paths.filter(p => p.route_variant === 'btc_via_global'));
    if (u)  opts.push({ coin: 'USDT',       best: u });
    if (bg) opts.push({ coin: 'BTC_GLOBAL',  best: bg });
    if (b)  opts.push({ coin: 'BTC',         best: b });
    return opts;
  }, [allData, domestic]);

  const globalOptions = useMemo(() => {
    if (!allData || !domestic) return [];
    return GLOBAL_EXCHANGES
      .map(g => {
        let paths = (allData.byGlobal[g]?.all_paths ?? []).filter(p =>
          p.korean_exchange === domestic,
        );
        if (coin === 'USDT') {
          paths = paths.filter(p => p.transfer_coin === 'USDT');
        } else if (coin === 'BTC_GLOBAL') {
          paths = paths.filter(p => p.route_variant === 'btc_via_global');
        }
        const best = bestByBtc(paths);
        if (!best) return null;
        return { exchange: g, best };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (b.best.btc_received ?? 0) - (a.best.btc_received ?? 0));
  }, [allData, domestic, coin]);

  const networkOptions = useMemo(() => {
    if (!allData || !domestic || !coin) return [] as { network: string; best: CheapestPathEntry }[];
    let paths: CheapestPathEntry[];
    if (coin === 'BTC') {
      paths = (Object.values(allData.byGlobal)[0]?.all_paths ?? [])
        .filter(p => p.korean_exchange === domestic && p.transfer_coin === 'BTC' && p.route_variant !== 'btc_via_global');
    } else if (coin === 'BTC_GLOBAL') {
      if (!global) return [];
      paths = (allData.byGlobal[global]?.all_paths ?? [])
        .filter(p => p.korean_exchange === domestic && p.route_variant === 'btc_via_global');
    } else {
      if (!global) return [];
      paths = (allData.byGlobal[global]?.all_paths ?? [])
        .filter(p => p.korean_exchange === domestic && p.transfer_coin === 'USDT');
    }
    const map = new Map<string, CheapestPathEntry>();
    for (const p of paths) {
      const cur = map.get(p.network);
      if (!cur || (p.btc_received ?? 0) > (cur.btc_received ?? 0)) map.set(p.network, p);
    }
    return [...map.entries()].map(([n, best]) => ({ network: n, best }));
  }, [allData, domestic, coin, global]);

  // Lightning exit paths available for current global exchange selection (before network is chosen)
  const hasLightningPaths = useMemo(() => {
    if (!allData || !domestic || !global) return false;
    if (coin === 'USDT') {
      return (allData.byGlobal[global]?.all_paths ?? []).some(p =>
        p.korean_exchange === domestic &&
        p.transfer_coin === 'USDT' &&
        (network ? p.network === network : true) &&
        p.path_type === 'lightning_exit',
      );
    }
    if (coin === 'BTC_GLOBAL') {
      return (allData.byGlobal[global]?.all_paths ?? []).some(p =>
        p.korean_exchange === domestic &&
        p.route_variant === 'btc_via_global' &&
        p.path_type === 'lightning_exit',
      );
    }
    return false;
  }, [allData, domestic, global, coin, network]);

  // 글로벌 거래소가 실제로 라이트닝 출금 경로를 제공하는지 (정적 메타데이터 대신 실제 경로 기반)
  // okx처럼 라이트닝을 지원하지만 수수료 스냅샷이 비어 경로가 없으면 false → 표시와 게이팅 일치
  const globalSupportsLightning = (g: string | null): boolean =>
    !!g && (allData?.byGlobal[g]?.all_paths ?? []).some(p => p.path_type === 'lightning_exit');

  // Available lightning swap services for current selection (network step → swap_service step)
  const swapServiceOptions = useMemo(() => {
    const isBtcGlobalLightning = coin === 'BTC_GLOBAL' && globalExitMethod === 'lightning';
    if (!allData || !domestic || (!isBtcGlobalLightning && !network)) return [] as { name: string; fee_pct: number; kyc: boolean; btc_received: number; source_url: string | null }[];
    const basePaths = coin === 'BTC'
      ? (Object.values(allData.byGlobal)[0]?.all_paths ?? []).filter(p =>
          p.korean_exchange === domestic && p.transfer_coin === 'BTC' && p.route_variant !== 'btc_via_global' && p.network === network)
      : coin === 'BTC_GLOBAL'
        ? global
          ? (allData.byGlobal[global]?.all_paths ?? []).filter(p =>
              p.korean_exchange === domestic && p.route_variant === 'btc_via_global')
          : []
        : global
          ? (allData.byGlobal[global]?.all_paths ?? []).filter(p =>
              p.korean_exchange === domestic && p.transfer_coin === 'USDT' && p.network === network)
          : [];
    const lnPaths = basePaths.filter(p => p.path_type === 'lightning_exit' && p.lightning_exit_provider);
    const svcMap = new Map<string, { name: string; fee_pct: number; kyc: boolean; btc_received: number; source_url: string | null }>();
    for (const p of lnPaths) {
      const name = p.lightning_exit_provider!;
      const existing = svcMap.get(name);
      if (!existing || (p.btc_received ?? 0) > existing.btc_received) {
        if (name === '__direct__') {
          svcMap.set(name, {
            name,
            fee_pct: 0,
            kyc: false,
            btc_received: p.btc_received ?? 0,
            source_url: null,
          });
        } else {
          const swapComp = p.breakdown?.components.find(c => c.label.toLowerCase().includes('스왑'));
          const fee_pct = swapComp?.rate_pct ?? 0;
          svcMap.set(name, {
            name,
            fee_pct,
            kyc: p.exit_service_kyc_status === 'kyc',
            btc_received: p.btc_received ?? 0,
            source_url: swapComp?.source_url ?? null,
          });
        }
      }
    }
    // __direct__ 먼저, 나머지는 btc_received 내림차순
    const sorted = [...svcMap.values()].sort((a, b) => b.btc_received - a.btc_received);
    const directIdx = sorted.findIndex(s => s.name === '__direct__');
    if (directIdx > 0) {
      const [direct] = sorted.splice(directIdx, 1);
      sorted.unshift(direct);
    }
    return sorted;
  }, [allData, domestic, coin, global, network, globalExitMethod]);

  const resultPath = useMemo((): CheapestPathEntry | null => {
    const isBtcGlobalLightning = coin === 'BTC_GLOBAL' && globalExitMethod === 'lightning';
    if (!allData || !domestic || !coin || (!isBtcGlobalLightning && !network)) return null;
    let basePaths = coin === 'BTC'
      ? (Object.values(allData.byGlobal)[0]?.all_paths ?? []).filter(p =>
          p.korean_exchange === domestic && p.transfer_coin === 'BTC' && p.route_variant !== 'btc_via_global' && p.network === network)
      : coin === 'BTC_GLOBAL'
        ? global
          ? (allData.byGlobal[global]?.all_paths ?? []).filter(p =>
              p.korean_exchange === domestic && p.route_variant === 'btc_via_global' &&
              (isBtcGlobalLightning || p.network === network))
          : []
        : global
          ? (allData.byGlobal[global]?.all_paths ?? []).filter(p =>
              p.korean_exchange === domestic && p.transfer_coin === 'USDT' && p.network === network)
          : [];
    if (globalExitMethod === 'onchain') {
      basePaths = basePaths.filter(p => p.path_type !== 'lightning_exit');
    } else if (globalExitMethod === 'lightning') {
      basePaths = basePaths.filter(p => p.path_type === 'lightning_exit');
    }
    if (swapSvc) {
      const filtered = basePaths.filter(p => p.lightning_exit_provider === swapSvc);
      if (filtered.length > 0) return bestByBtc(filtered);
    }
    return bestByBtc(basePaths);
  }, [allData, domestic, coin, global, network, swapSvc, globalExitMethod]);

  const altPaths = useMemo(() => {
    if (!resultPath?.btc_received || !allPaths.length) return [];
    // btc_received 내림차순 정렬 후 국내 거래소 기준 최고 1개만 표시
    const sorted = [...allPaths]
      .filter(p => (p.btc_received ?? 0) > (resultPath.btc_received ?? 0))
      .sort((a, b) => (b.btc_received ?? 0) - (a.btc_received ?? 0));
    const seen = new Set<string>();
    const result: typeof sorted = [];
    for (const p of sorted) {
      const key = p.korean_exchange ?? '';
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(p);
      if (result.length >= 8) break;
    }
    return result;
  }, [allPaths, resultPath]);

  useEffect(() => {
    if (phase !== 'result') return;
    if (satRafRef.current != null) cancelAnimationFrame(satRafRef.current);
    if (!resultPath?.btc_received) { setDisplaySats(0); return; }
    const target = Math.round(resultPath.btc_received * SATS_PER_BTC);
    setDisplaySats(0);
    const duration = 1500;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - t) ** 4;
      setDisplaySats(Math.round(target * eased));
      if (t < 1) satRafRef.current = requestAnimationFrame(tick);
    };
    satRafRef.current = requestAnimationFrame(tick);
    return () => { if (satRafRef.current != null) cancelAnimationFrame(satRafRef.current); };
  }, [phase, resultPath?.btc_received]);

  // ── Step sequence for progress dots ─────────────────────────────────────────

  const steps = useMemo(
    () => flowSteps({ coin, globalExitMethod, swapSvc }),
    [coin, globalExitMethod, swapSvc],
  );

  const stepIdx = steps.indexOf(phase);

  // ── API ──────────────────────────────────────────────────────────────────────

  async function handleSearch() {
    if (!amountKrw || amountKrw < 10_000) return;
    setPhase('loading');
    setLoadingDone(false);
    setAllData(null); setError(null); setLiveKimp(null); setKimpFetchedAt(null);
    setDomestic(null); setCoin(null); setGlobal(null); setNetwork(null); setSwapSvc(null); setGlobalExitMethod(null);
    setFailedGlobalExchanges([]);

    const DOMESTIC_EXCHANGES = Object.keys(DOMESTIC_INFO);
    const initProgress: Record<string, 'loading' | 'done' | 'error' | 'retrying'> = {};
    DOMESTIC_EXCHANGES.forEach(d => { initProgress[d] = 'loading'; });
    GLOBAL_EXCHANGES.forEach(g => { initProgress[g] = 'loading'; });
    setExchangeProgress(initProgress);

    const TIMEOUT_MS = 20_000;
    function withTimeout<T>(p: Promise<T>): Promise<T | null> {
      return Promise.race([p, new Promise<null>(res => setTimeout(() => res(null), TIMEOUT_MS))]);
    }

    try {
      const loadingStartedAt = Date.now();
      const [tickerRes, kimpRes] = await Promise.all([
        api.getTickers().catch(() => ({ last_run: null, items: [] as TickerRow[] })),
        api.getLiveKimp().catch(() => null),
      ]);
      // 국내 거래소 데이터는 ticker API로 수집 — 완료 표시
      const domesticStatus = tickerRes.items.length > 0 ? 'done' : 'error';
      setExchangeProgress(prev => {
        const next = { ...prev };
        DOMESTIC_EXCHANGES.forEach(d => { next[d] = domesticStatus; });
        return next;
      });
      if (kimpRes?.kimp) { setLiveKimp(kimpRes.kimp); setKimpFetchedAt(kimpRes.fetched_at ?? null); }

      // 단일 배치 호출로 7개 글로벌 거래소를 한 번에 조회
      const allRes = await withTimeout(
        api.getCheapestPathAll({ mode: 'buy', amountKrw }).catch((err: unknown) => {
          console.error('[cheapest-all] 네트워크 오류:', err);
          return null;
        }),
      );

      const byGlobal: Record<string, CheapestPathResponse> = {};
      const failed: string[] = [];

      if (allRes === null) {
        // 클라이언트 타임아웃 또는 네트워크 실패 — 1회 재시도
        console.warn('[cheapest-all] 타임아웃 또는 네트워크 실패, 재시도 중...');
        GLOBAL_EXCHANGES.forEach(g => {
          setExchangeProgress(prev => ({ ...prev, [g]: 'retrying' }));
        });
        await new Promise(res => setTimeout(res, 2000));
        const retryRes = await withTimeout(
          api.getCheapestPathAll({ mode: 'buy', amountKrw }).catch((err: unknown) => {
            console.error('[cheapest-all] 재시도 네트워크 오류:', err);
            return null;
          }),
        );
        if (retryRes !== null) {
          for (const g of GLOBAL_EXCHANGES) {
            const entry = retryRes.by_global[g];
            if (entry && !entry.error) {
              byGlobal[g] = entry;
              setExchangeProgress(prev => ({ ...prev, [g]: 'done' }));
            } else {
              if (entry?.error) {
                console.warn(`[cheapest-all] 서버 데이터 오류 (${g}):`, entry.error);
              }
              failed.push(g);
              setExchangeProgress(prev => ({ ...prev, [g]: 'error' }));
            }
          }
        } else {
          GLOBAL_EXCHANGES.forEach(g => {
            failed.push(g);
            setExchangeProgress(prev => ({ ...prev, [g]: 'error' }));
          });
        }
      } else {
        for (const g of GLOBAL_EXCHANGES) {
          const entry = allRes.by_global[g];
          if (entry && !entry.error) {
            byGlobal[g] = entry;
            setExchangeProgress(prev => ({ ...prev, [g]: 'done' }));
          } else {
            if (entry?.error) {
              console.warn(`[cheapest-all] 서버 데이터 오류 (${g}):`, entry.error);
            }
            failed.push(g);
            setExchangeProgress(prev => ({ ...prev, [g]: 'error' }));
          }
        }
      }

      setFailedGlobalExchanges(failed);
      if (!Object.keys(byGlobal).length) throw new Error('모든 거래소 조회 실패');
      // 최소 2초 표시 보장: 캐시 응답이 빠를 때도 완료 상태가 화면에 보이도록
      const elapsed = Date.now() - loadingStartedAt;
      await new Promise(res => setTimeout(res, Math.max(400, 2000 - elapsed)));
      setAllData({
        byGlobal,
        tickers: tickerRes.items,
        latestRunAt: Object.values(byGlobal)[0]?.last_run?.completed_at ?? null,
      });
      setLoadingDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류 발생');
      setPhase('input');
    }
  }

  // 브라우저/앱 뒤로가기 지원
  useEffect(() => {
    const onPopstate = () => {
      if (skipPopstate.current) { skipPopstate.current = false; return; }
      const s: FlowState = { coin, globalExitMethod, swapSvc };
      const prev = flowPrev(phase, s);
      if (prev) {
        history.pushState({ phase: prev }, '');
        setDir(-1);
        setPhase(prev);
      } else if (phase === 'domestic') {
        setDir(-1);
        setPhase('input');
      }
    };
    window.addEventListener('popstate', onPopstate);
    return () => window.removeEventListener('popstate', onPopstate);
  }, [phase, coin, globalExitMethod, swapSvc]);

  function handleBack() {
    const s: FlowState = { coin, globalExitMethod, swapSvc };
    const prev = flowPrev(phase, s);
    if (prev) {
      history.back();
    } else if (phase === 'domestic') {
      reset();
    }
  }

  function handleNext(from: Phase) {
    const s: FlowState = { coin, globalExitMethod, swapSvc };
    // side effects before transition
    if (from === 'btc_method' && coin === 'BTC') {
      setNetwork(networkOptions[0]?.network ?? 'Bitcoin');
    }
    if (from === 'global_exit_method' && coin === 'BTC_GLOBAL' && globalExitMethod === 'onchain') {
      setNetwork(networkOptions[0]?.network ?? 'Bitcoin');
    }
    const next = flowNext(from, s);
    history.pushState({ phase: next }, '');
    setPhase(next);
  }

  function handleLoadingNext() {
    history.pushState({ phase: 'domestic' }, '');
    setPhase('domestic');
  }

  function reset() {
    setPhase('input'); setAllData(null); setError(null); setLoadingDone(false);
    setDomestic(null); setCoin(null); setGlobal(null); setNetwork(null); setSwapSvc(null);
    setBtcMethod(null); setGlobalExitMethod(null); setShowAltPaths(false);
    setFailedGlobalExchanges([]);
  }

  return {
    // ── 원시 상태 + setter ──
    phase, setPhase,
    amount, setAmount,
    unit, setUnit,
    allData,
    error,
    dir,
    domestic, setDomestic,
    coin, setCoin,
    global, setGlobal,
    network, setNetwork,
    swapSvc, setSwapSvc,
    liveKimp,
    kimpFetchedAt,
    kimpInfoOpen, setKimpInfoOpen,
    btcPrice,
    btcMethod, setBtcMethod,
    globalExitMethod, setGlobalExitMethod,
    liveRegistry,
    displaySats,
    showAltPaths, setShowAltPaths,
    withdrawalLimits,
    cautionMap,
    exchangeProgress,
    loadingDone,
    failedGlobalExchanges,
    amountKrw,
    stepEndRef,
    scrollToStepEnd,
    // ── 파생 데이터 ──
    allPaths,
    snapshotKimp,
    domesticBtcKrw,
    koreaVolumeMap,
    domesticOptions,
    coinOptions,
    globalOptions,
    networkOptions,
    hasLightningPaths,
    globalSupportsLightning,
    swapServiceOptions,
    resultPath,
    altPaths,
    steps,
    stepIdx,
    // ── 핸들러 ──
    handleSearch,
    handleBack,
    handleNext,
    handleLoadingNext,
    reset,
  };
}

export type ExplorerCtx = ReturnType<typeof useExplorerValue>;

const ExplorerContext = createContext<ExplorerCtx | null>(null);

export function ExplorerProvider({ children }: { children: ReactNode }) {
  const value = useExplorerValue();
  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

export function useExplorer(): ExplorerCtx {
  const ctx = useContext(ExplorerContext);
  if (!ctx) throw new Error('useExplorer must be used within ExplorerProvider');
  return ctx;
}
