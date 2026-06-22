// ── ExplorerContext ───────────────────────────────────────────────────────────
// 탐색 위저드의 모든 상태·파생 데이터·핸들러를 한 곳에 모아 Provider로 제공한다.
// 각 단계 컴포넌트는 useExplorer()로 필요한 값만 꺼내 쓴다.
// 타입은 useExplorerValue 반환값에서 추론한다(수동 인터페이스 유지보수 불필요).

import { createContext, useContext, useState, useMemo, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { api } from '../../lib/api';
import { SATS_PER_BTC } from '../../lib/formatBtc';
import type { CheapestPathEntry, CheapestPathResponse, TickerRow } from '../../types';
import type { Phase, CoinType, Destination, FlowState } from './flow';
import { phaseIdx, flowNext, flowPrev } from './flow';
import type { AllData, GlobalExchange } from './constants';
import { GLOBAL_EXCHANGES, DOMESTIC_INFO } from './constants';
import { flattenPaths, dedupAndSortPaths, filterRecommendedPaths } from './recommend';
import { useExchangeMetadata } from './useExchangeMetadata';
import {
  computeSnapshotKimp,
  computeDomesticBtcKrw,
  computeKoreaVolumeMap,
  computeDomesticOptions,
  computeCoinOptions,
  computeGlobalOptions,
  computeNetworkOptions,
  computeDisabledNetworkOptions,
  computeHasLightningPaths,
  computeGlobalSupportsLightning,
  computeCurrentLightningPaths,
  computeLightningExitInfo,
  computeSwapServiceOptions,
  computeResultPath,
  computeAltPaths,
} from './derivations';

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
  const [destination, setDestination] = useState<Destination | null>(null);  // 마법사 종착지 선택
  const [swapSvc, setSwapSvc]     = useState<string | null>(null);
  const [liveKimp, setLiveKimp]       = useState<Record<string, number> | null>(null);
  // 김치 프리미엄(총, 포렉스 기준) — 전 화면 '김치 프리미엄' 표시 단일 기준
  const [liveKimpTotal, setLiveKimpTotal] = useState<Record<string, number> | null>(null);
  const [kimpFetchedAt, setKimpFetchedAt] = useState<number | null>(null);
  const [liveUsdtKrw, setLiveUsdtKrw] = useState<number | null>(null); // Upbit KRW-USDT 실거래가
  const [usdtPremium, setUsdtPremium] = useState<number | null>(null); // 원달러(테더) 프리미엄 %
  const [forexUsdKrw, setForexUsdKrw] = useState<number | null>(null); // 두나무 포렉스 USD/KRW (USDT 프리미엄 기준)
  const [btcPrice, setBtcPrice] = useState<{ usd: number; krw: number; upbitKrw: number | null; kimchiPremium: number | null; kimchiPremiumTotal: number | null; fetchedAt: Date } | null>(null);
  const [btcPriceLoading, setBtcPriceLoading] = useState(true); // 최초 kimp/live fetch 진행 여부 (첫 페이지 로딩 표시용)
  const [btcMethod, setBtcMethod]         = useState<'onchain' | 'lightning' | null>(null);
  const [globalExitMethod, setGlobalExitMethod] = useState<'onchain' | 'lightning' | 'none' | null>(null);
  const [displaySats, setDisplaySats]   = useState(0);
  const [showAltPaths, setShowAltPaths] = useState(false);

  // 거래소 메타데이터(게이트맨/유의/CARF/출금한도) — 마운트 1회 fetch, 탐색 상태와 결합 없음
  const { liveRegistry, cautionMap, carfMap, withdrawalLimits } = useExchangeMetadata();

  // ── 추천 경로 필터 (제외 필터) ──────────────────────────────────────────────────
  const [excludeExchanges,       setExcludeExchanges]       = useState<Set<string>>(new Set());
  const [excludeGlobalExchanges, setExcludeGlobalExchanges] = useState<Set<string>>(new Set());
  const [excludeServices,        setExcludeServices]        = useState<Set<string>>(new Set());
  const [excludeOnchain,         setExcludeOnchain]         = useState(false);
  const [excludeLightning,       setExcludeLightning]       = useState(false);
  const [excludeDisabled,        setExcludeDisabled]        = useState(false);
  // 종착지 필터 (추천 리스트): 개인 온체인 지갑(기본) / 라이트닝 지갑
  const [destinationFilter,      setDestinationFilter]      = useState<Destination>('personal');

  const [exchangeProgress, setExchangeProgress] = useState<Record<string, 'loading' | 'done' | 'error' | 'retrying'>>({});
  const [loadingDone, setLoadingDone] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [failedGlobalExchanges, setFailedGlobalExchanges] = useState<string[]>([]);

  const prevPhase            = useRef<Phase>('input');
  const satRafRef            = useRef<number | null>(null);
  const stepEndRef           = useRef<HTMLDivElement>(null);
  const skipPopstate         = useRef(false);
  const fromRecommendation   = useRef(false);

  const _prefetchCache = useRef<{
    amount: number;
    byGlobal: Record<string, CheapestPathResponse>;
    tickers: TickerRow[];
    latestRunAt: number | null;
    kimp: Record<string, number> | null;
    kimpTotal: Record<string, number> | null;
    usdtPremium: number | null;
    kimpFetchedAt: number | null;
    fetchedAt: number;
  } | null>(null);
  const _isPrefetching = useRef(false);

  function scrollToStepEnd() {
    requestAnimationFrame(() =>
      stepEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    );
  }

  const amountKrw = parseFloat(amount || '0') * (unit === '만원' ? 10_000 : 100_000_000);

  // BTC 시세 30초 폴링 — phase 무관하게 항상 실행
  useEffect(() => {
    const fetch = () =>
      api.getLiveKimp()
        .then(res => {
          setBtcPrice({
            usd: Math.round(res.global_btc_price_krw / res.usd_krw_rate),
            krw: Math.round(res.global_btc_price_krw),
            upbitKrw: res.korean_btc_prices?.['upbit'] ? Math.round(res.korean_btc_prices['upbit']) : null,
            kimchiPremium: res.kimp?.['upbit'] != null ? res.kimp['upbit'] : null,
            kimchiPremiumTotal: res.kimchi_premium_total?.['upbit'] != null ? res.kimchi_premium_total['upbit'] : null,
            fetchedAt: new Date(),
          });
          if (res.usd_krw_rate) setLiveUsdtKrw(res.usd_krw_rate);
          setUsdtPremium(res.usdt_premium ?? null);
          setForexUsdKrw(res.forex_usd_krw_rate ?? null);
        })
        .catch(() => { /* keep previous */ })
        .finally(() => setBtcPriceLoading(false)); // 최초 fetch 완료(성공/실패) 시 로딩 해제
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

  // 금액 입력 후 500ms 디바운스로 백그라운드 프리페치 — 버튼 클릭 시 즉시 응답
  useEffect(() => {
    if (!amountKrw || amountKrw < 10_000) return;
    const PREFETCH_TTL = 55_000;
    if (
      _prefetchCache.current?.amount === amountKrw &&
      Date.now() - _prefetchCache.current.fetchedAt < PREFETCH_TTL
    ) return;
    if (_isPrefetching.current) return;

    const timer = setTimeout(async () => {
      if (_isPrefetching.current) return;
      _isPrefetching.current = true;
      try {
        const [tickerRes, kimpRes, allRes] = await Promise.all([
          api.getTickers().catch(() => null),
          api.getLiveKimp().catch(() => null),
          api.getCheapestPathAll({ mode: 'buy', amountKrw }).catch(() => null),
        ]);
        if (!allRes) return;
        const byGlobal: Record<string, CheapestPathResponse> = {};
        for (const g of GLOBAL_EXCHANGES) {
          const entry = allRes.by_global[g];
          if (entry && !entry.error) byGlobal[g] = entry as CheapestPathResponse;
        }
        if (Object.keys(byGlobal).length === 0) return;
        _prefetchCache.current = {
          amount: amountKrw,
          byGlobal,
          tickers: tickerRes?.items ?? [],
          latestRunAt: Object.values(byGlobal)[0]?.last_run?.completed_at ?? null,
          kimp: kimpRes?.kimp ?? null,
          kimpTotal: kimpRes?.kimchi_premium_total ?? null,
          usdtPremium: kimpRes?.usdt_premium ?? null,
          kimpFetchedAt: kimpRes?.fetched_at ?? null,
          fetchedAt: Date.now(),
        };
      } catch { /* prefetch 실패 무시 */ }
      finally { _isPrefetching.current = false; }
    }, 500);

    return () => clearTimeout(timer);
  }, [amountKrw]);

  // ── Derived options ──────────────────────────────────────────────────────────

  const allPaths = useMemo(() => {
    if (!allData) return [] as (CheapestPathEntry & { _g: string })[];
    return flattenPaths(allData.byGlobal);
  }, [allData]);

  // 필터 적용 전 전체 dedup+sort 목록 (필터 옵션 도출용)
  const allRecommendedPaths = useMemo(() => dedupAndSortPaths(allPaths), [allPaths]);

  // 필터 적용 결과 (화면 표시용)
  const topRecommendedPaths = useMemo(() =>
    filterRecommendedPaths(allRecommendedPaths, {
      destinationFilter, excludeExchanges, excludeGlobalExchanges, excludeServices,
      excludeOnchain, excludeLightning, excludeDisabled,
    }),
    [allRecommendedPaths, destinationFilter, excludeExchanges, excludeGlobalExchanges, excludeServices, excludeOnchain, excludeLightning, excludeDisabled]);

  // liveKimp 가져오기 실패 시의 fallback. 티커 스냅샷의 usd_krw_rate(포렉스 환율) 기준으로 계산한다.
  const snapshotKimp = useMemo(() => computeSnapshotKimp(allData), [allData]);

  const domesticBtcKrw = useMemo(() => computeDomesticBtcKrw(allData, domestic), [allData, domestic]);

  // 한국 거래소 24h 거래량 맵 — KRW 단위 (BTC 거래량 × BTC/KRW 기준가)
  const koreaVolumeMap = useMemo(() => computeKoreaVolumeMap(allData), [allData]);

  const domesticOptions = useMemo(
    () => computeDomesticOptions(allData, koreaVolumeMap),
    [allData, koreaVolumeMap]);

  const coinOptions = useMemo(() => computeCoinOptions(allData, domestic), [allData, domestic]);

  const globalOptions = useMemo(
    () => computeGlobalOptions(allData, domestic, coin),
    [allData, domestic, coin]);

  const networkOptions = useMemo(
    () => computeNetworkOptions(allData, domestic, coin, global),
    [allData, domestic, coin, global]);

  const disabledNetworkOptions = useMemo(
    () => computeDisabledNetworkOptions(allData, domestic, coin, global),
    [allData, domestic, coin, global]);

  // Lightning exit paths available for current global exchange selection (before network is chosen)
  const hasLightningPaths = useMemo(
    () => computeHasLightningPaths(allData, domestic, global, coin, network),
    [allData, domestic, global, coin, network]);

  // 글로벌 거래소가 라이트닝 출금을 지원하는지: 실제 경로 존재 → 정적 메타데이터 폴백
  const globalSupportsLightning = (g: string | null): boolean =>
    computeGlobalSupportsLightning(allData, g);

  // 현재 선택(국내/코인/글로벌/네트워크) 기준의 lightning_exit 경로 집합 — 종착지 단계·스왑 단계가 공유
  const currentLightningPaths = useMemo(
    () => computeCurrentLightningPaths(allData, domestic, coin, global, network, globalExitMethod),
    [allData, domestic, coin, global, network, globalExitMethod]);

  // 종착지 단계 가용성: 라이트닝 지갑(직접출금) / 개인지갑(스왑 경유) 경로 존재 여부
  const lightningExitInfo = useMemo(
    () => computeLightningExitInfo(currentLightningPaths),
    [currentLightningPaths]);

  // Available lightning swap services (개인지갑 종착, network/destination step → swap_service step)
  const swapServiceOptions = useMemo(
    () => computeSwapServiceOptions(currentLightningPaths),
    [currentLightningPaths]);

  const resultPath = useMemo(
    () => computeResultPath(allData, domestic, coin, global, network, swapSvc, globalExitMethod, destination),
    [allData, domestic, coin, global, network, swapSvc, globalExitMethod, destination]);

  const altPaths = useMemo(
    () => computeAltPaths(allRecommendedPaths, resultPath),
    [allRecommendedPaths, resultPath]);

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

  // ── API ──────────────────────────────────────────────────────────────────────

  async function handleSearch(dest: 'recommendation' | 'domestic' = 'recommendation') {
    if (!amountKrw || amountKrw < 10_000) return;

    // 프리페치 캐시 히트 → 즉시 네비게이션 (로딩 없음)
    const PREFETCH_TTL = 55_000;
    const cached = _prefetchCache.current;
    if (cached?.amount === amountKrw && Date.now() - cached.fetchedAt < PREFETCH_TTL) {
      setAllData({ byGlobal: cached.byGlobal, tickers: cached.tickers, latestRunAt: cached.latestRunAt });
      if (cached.kimp) { setLiveKimp(cached.kimp); setLiveKimpTotal(cached.kimpTotal); setKimpFetchedAt(cached.kimpFetchedAt); setUsdtPremium(cached.usdtPremium); }
      setDomestic(null); setCoin(null); setGlobal(null); setNetwork(null); setSwapSvc(null); setGlobalExitMethod(null); setDestination(null);
      setFailedGlobalExchanges([]);
      setError(null);
      setLoadingDone(true);
      setIsSearching(false);
      history.pushState({ phase: dest }, '');
      setPhase(dest);
      return;
    }

    setIsSearching(true);
    setLoadingDone(false);
    setAllData(null); setError(null); setLiveKimp(null); setLiveKimpTotal(null); setKimpFetchedAt(null);
    setDomestic(null); setCoin(null); setGlobal(null); setNetwork(null); setSwapSvc(null); setGlobalExitMethod(null); setDestination(null);
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
      if (kimpRes?.kimp) { setLiveKimp(kimpRes.kimp); setLiveKimpTotal(kimpRes.kimchi_premium_total ?? null); setKimpFetchedAt(kimpRes.fetched_at ?? null); setUsdtPremium(kimpRes.usdt_premium ?? null); setForexUsdKrw(kimpRes.forex_usd_krw_rate ?? null); }

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
      setAllData({
        byGlobal,
        tickers: tickerRes.items,
        latestRunAt: Object.values(byGlobal)[0]?.last_run?.completed_at ?? null,
      });
      setLoadingDone(true);
      setIsSearching(false);
      history.pushState({ phase: dest }, '');
      setPhase(dest);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류 발생');
      setIsSearching(false);
    }
  }

  // 브라우저/앱 뒤로가기 지원
  useEffect(() => {
    const onPopstate = () => {
      if (skipPopstate.current) { skipPopstate.current = false; return; }
      // fromRecommendation 먼저 체크 — flowPrev가 non-null을 반환해도 recommendation으로 돌아가야 함
      if (phase === 'result' && fromRecommendation.current) {
        fromRecommendation.current = false;
        setDir(-1);
        setPhase('recommendation');
        return;
      }
      const s: FlowState = { coin, globalExitMethod, destination, swapSvc };
      const prev = flowPrev(phase, s);
      if (prev) {
        history.pushState({ phase: prev }, '');
        setDir(-1);
        setPhase(prev);
      } else if (phase === 'recommendation') {
        setDir(-1);
        setPhase('input');
      } else if (phase === 'domestic') {
        setDir(-1);
        setPhase('recommendation');
      }
    };
    window.addEventListener('popstate', onPopstate);
    return () => window.removeEventListener('popstate', onPopstate);
  }, [phase, coin, globalExitMethod, destination, swapSvc]);

  function handleBack() {
    if (phase === 'result' && fromRecommendation.current) {
      history.back();  // onPopstate가 fromRecommendation 감지 후 처리
      return;
    }
    const s: FlowState = { coin, globalExitMethod, destination, swapSvc };
    const prev = flowPrev(phase, s);
    if (prev) {
      history.back();
    } else if (phase === 'recommendation') {
      reset();
    } else if (phase === 'domestic') {
      history.pushState({ phase: 'recommendation' }, '');
      setDir(-1);
      setPhase('recommendation');
    }
  }

  function handleGoToDomestic() {
    history.pushState({ phase: 'domestic' }, '');
    setPhase('domestic');
  }

  function handleSelectRecommendedPath(p: CheapestPathEntry & { _g: string }) {
    setDomestic(p.korean_exchange);
    const isUsdt = p.transfer_coin === 'USDT';
    const isViaGlobal = p.route_variant?.endsWith('via_global') ?? false;
    let coinType: CoinType;
    if (isUsdt) coinType = 'USDT';
    else if (isViaGlobal) coinType = 'BTC_GLOBAL';
    else coinType = 'BTC';
    setCoin(coinType);
    setGlobal(isUsdt || isViaGlobal ? (p._g as GlobalExchange) : null);
    if (p.path_type === 'lightning_exit') {
      setGlobalExitMethod('lightning');
      if (p.destination === 'lightning_wallet') {
        // 라이트닝 지갑 직접출금 — 스왑 없음
        setDestination('lightning_wallet');
        setSwapSvc(null);
      } else {
        // 라이트닝 스왑 경유 → 개인지갑
        setDestination('personal');
        setSwapSvc(p.lightning_exit_provider ?? null);
      }
    } else {
      setDestination('personal');
      setSwapSvc(null);
      if (isUsdt || isViaGlobal) {
        setGlobalExitMethod('onchain');
      } else {
        // BTC 직접 경로 (국내 거래소 직접 출금)
        setBtcMethod('onchain');
        setGlobalExitMethod(null);
      }
    }
    setNetwork(p.network);
    fromRecommendation.current = true;
    history.pushState({ phase: 'result' }, '');
    setPhase('result');
  }

  function handleNext(from: Phase) {
    const s: FlowState = { coin, globalExitMethod, destination, swapSvc };
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

  function reset() {
    setPhase('input'); setAllData(null); setError(null); setLoadingDone(false);
    setIsSearching(false);
    setDomestic(null); setCoin(null); setGlobal(null); setNetwork(null); setSwapSvc(null); setDestination(null);
    setBtcMethod(null); setGlobalExitMethod(null); setShowAltPaths(false);
    setFailedGlobalExchanges([]);
    setExcludeExchanges(new Set()); setExcludeGlobalExchanges(new Set()); setExcludeServices(new Set());
    setExcludeOnchain(false); setExcludeLightning(false); setDestinationFilter('personal');
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
    destination, setDestination,
    swapSvc, setSwapSvc,
    liveKimp,
    liveKimpTotal,
    liveUsdtKrw,
    usdtPremium,
    forexUsdKrw,
    kimpFetchedAt,
    btcPrice,
    btcPriceLoading,
    btcMethod, setBtcMethod,
    globalExitMethod, setGlobalExitMethod,
    liveRegistry,
    displaySats,
    showAltPaths, setShowAltPaths,
    withdrawalLimits,
    cautionMap,
    carfMap,
    exchangeProgress,
    loadingDone,
    isSearching,
    failedGlobalExchanges,
    amountKrw,
    stepEndRef,
    scrollToStepEnd,
    // ── 파생 데이터 ──
    allPaths,
    allRecommendedPaths,
    topRecommendedPaths,
    // ── 필터 ──
    excludeExchanges,       setExcludeExchanges,
    excludeGlobalExchanges, setExcludeGlobalExchanges,
    excludeServices,        setExcludeServices,
    excludeOnchain,         setExcludeOnchain,
    excludeLightning,       setExcludeLightning,
    excludeDisabled,        setExcludeDisabled,
    destinationFilter,      setDestinationFilter,
    snapshotKimp,
    domesticBtcKrw,
    koreaVolumeMap,
    domesticOptions,
    coinOptions,
    globalOptions,
    networkOptions,
    disabledNetworkOptions,
    hasLightningPaths,
    globalSupportsLightning,
    swapServiceOptions,
    lightningExitInfo,
    resultPath,
    altPaths,
    // ── 핸들러 ──
    handleSearch,
    handleBack,
    handleGoToDomestic,
    handleSelectRecommendedPath,
    handleNext,
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
