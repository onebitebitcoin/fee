import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, CaretDown, Wrench, WarningCircle, ArrowSquareOut, Ticket, Wallet } from '@phosphor-icons/react';
import { NetworkIcon } from '../../../components/NetworkIcon';
import { fmtEx } from '../../../lib/exchangeNames';
import { formatNetworkLabel } from '../../../lib/networkIcons';
import { formatFeeKrw, formatNumber, formatPercent, SATS_PER_BTC } from '../../../lib/formatBtc';
import { SPRING_SLOW, fmtAmountText } from '../constants';
import { ExFavicon, SectionLabel, Chip } from '../ui';
import { useExplorer } from '../ExplorerContext';
import { buildReportQuery } from '../../board/reportTemplate';
import { usesGlobalExchange } from '../pathMode';
import { activeGates, gateSeverity, GATE_BADGE, GATE_BADGE_CLASS } from '../depositGate';
import { routeText } from '../routeStops';

/** 경로 다이어그램의 한 칸 — 아이콘과 이름을 가진 정거장. */
type RouteNode = { key: string; icon: ReactNode; label: string };

/**
 * 자금이 거쳐가는 정거장과 그 사이에서 실제로 움직이는 자산을 순서대로 그린다.
 * 노드 n개 사이에 엣지 n-1개가 들어간다. 방향(살 때/팔 때)은 호출부가 배열 순서로 정하므로
 * 이 컴포넌트는 방향을 알지 못한다.
 */
function RouteDiagram({ nodes, edges }: { nodes: RouteNode[]; edges: string[] }) {
  return (
    <div className="ios-card rounded-2xl p-4">
      <div className="flex items-center gap-1 flex-wrap">
        {nodes.map((n, i) => (
          <Fragment key={n.key}>
            <div className="flex flex-col items-center">
              {n.icon}
              <p className="text-[10px] text-label-secondary mt-1">{n.label}</p>
            </div>
            {i < edges.length && (
              <div className="flex flex-col items-center px-1">
                <ArrowRight className="w-3.5 h-3.5 text-label-tertiary" />
                <p className="text-[9px] text-label-tertiary mt-1">{edges[i]}</p>
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** 원화 계좌 정거장 아이콘 — 팔 때의 종착지. */
function KrwIcon() {
  return (
    <div className="w-6 h-6 rounded-full bg-acc-brand/15 flex items-center justify-center">
      <span className="text-[11px] font-bold text-acc-brand">₩</span>
    </div>
  );
}

export function ResultStep() {
  const navigate = useNavigate();
  const {
    amountKrw, domestic, global, network, swapSvc, liveKimpTotal, liveUsdtKrw, usdtPremium, forexUsdKrw, displayReceived,
    snapshotKimp, domesticBtcKrw, resultPath, altPaths, conditionalAltPath, handleBack, reset,
    globalExitMethod, allData, mode, amountBtc, walletRegistered,
  } = useExplorer();
  const isSell = mode === 'sell';
  const [showAltPaths, setShowAltPaths] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  // 수수료 내역: 항목별 '자세히' 펼침 (인덱스 집합). 금액은 항상 노출.
  const [expandedFees, setExpandedFees] = useState<Set<number>>(new Set());
  const toggleFee = (i: number) =>
    setExpandedFees(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  const isHoldOnGlobal = globalExitMethod === 'none';
  const isDisabled = !!resultPath?.disabled;
  if (!resultPath) return null;
  // 라이트닝 지갑 종착: LN 출금까지만(스왑·온체인 없음) → 종착 노드 라벨/아이콘이 달라진다.
  const isLnWallet = resultPath.destination === 'lightning_wallet';
  // 경로가 실제로 해외 거래소를 경유하는지 판별 (transient global state가 아닌 결과 데이터 기준).
  // - USDT 경로는 항상 글로벌 경유 (buy 모드에선 route_variant 미설정이라 transfer_coin으로 판별).
  // - btc_via_global은 transfer_coin='BTC'이지만 글로벌 경유 → route_variant로 판별.
  // route_variant 부재 시 fail-closed(false) → BTC 직접 경로에 엉뚱한 거래소가 표시되지 않도록.
  const usesGlobal = usesGlobalExchange(resultPath);

  // 경로 다이어그램의 정거장과 구간 자산.
  // 살 때는 국내 거래소에서 출발해 개인 지갑에서 끝나고, 팔 때는 그 반대로 개인 지갑에서
  // 출발해 원화 계좌에서 끝난다. 방향이 뒤집히면 읽는 사람이 자금 흐름을 거꾸로 이해하므로
  // 두 모드의 순서를 각각 세워둔다.
  const routeDiagram = (() => {
    const nodes: RouteNode[] = [];
    const edges: string[] = [];
    const koreanNode: RouteNode = {
      key: 'korean',
      icon: <ExFavicon id={resultPath.korean_exchange} size={24} />,
      label: fmtEx(resultPath.korean_exchange),
    };
    const globalNode: RouteNode | null = global
      ? { key: 'global', icon: <ExFavicon id={global} size={24} />, label: fmtEx(global) }
      : null;
    const swapNode: RouteNode | null = swapSvc
      ? { key: 'swap', icon: <ExFavicon id={swapSvc} size={24} />, label: fmtEx(swapSvc) }
      : null;
    const walletNode: RouteNode = {
      key: 'wallet',
      icon: <NetworkIcon network="bitcoin" size={24} />,
      label: isLnWallet ? '라이트닝 지갑' : '내 지갑',
    };

    if (isSell) {
      const viaLightning = resultPath.global_exit_mode === 'lightning';
      nodes.push({ ...walletNode, label: '내 지갑' });
      // 라이트닝 경로도 지갑에서 스왑 서비스까지는 온체인 비트코인으로 보낸다.
      if (viaLightning && swapNode) {
        edges.push('비트코인');
        nodes.push(swapNode);
      }
      edges.push(viaLightning ? '비트코인 라이트닝' : '비트코인');
      if (usesGlobal && globalNode) {
        nodes.push(globalNode);
        edges.push(resultPath.transfer_coin);
      }
      nodes.push(koreanNode);
      edges.push('원화');
      nodes.push({ key: 'krw', icon: <KrwIcon />, label: '내 계좌' });
      return { nodes, edges };
    }

    nodes.push(koreanNode);
    edges.push(
      resultPath.transfer_coin === 'BTC'
        ? (!usesGlobal && isLnWallet ? '비트코인 라이트닝' : '비트코인')
        : resultPath.transfer_coin,
    );
    if (usesGlobal && globalNode) {
      nodes.push(globalNode);
      // 글로벌 출금 레그 = global_exit_mode 기준 (라이트닝이면 스왑 서비스로도 LN 진입)
      if (!isHoldOnGlobal) edges.push(resultPath.global_exit_mode === 'lightning' ? '비트코인 라이트닝' : '비트코인');
    }
    // 스왑 서비스 (개인지갑 종착, 제3자 LN→온체인 스왑)
    if (swapNode && !isLnWallet) {
      nodes.push(swapNode);
      edges.push('비트코인');
    }
    // 종착지: 라이트닝 지갑 / 개인 지갑 (출금하지 않음 선택 시 숨김)
    if (!isHoldOnGlobal) nodes.push(walletNode);
    return { nodes, edges };
  })();

  return (
    <>
              {isDisabled && (() => {
                const reason = resultPath.disabled_reason && resultPath.disabled_reason !== 'disabled'
                  ? resultPath.disabled_reason : null;
                const msg = resultPath.suspension_message ?? null;
                const noticeTitle = resultPath.notice_title ?? null;
                const noticeUrl = resultPath.notice_url ?? null;
                return (
                <div className="rounded-2xl px-4 py-3 flex items-start gap-3 bg-fill-secondary border border-fill-tertiary/40">
                  <div className="w-7 h-7 rounded-full bg-fill-tertiary flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Wrench weight="fill" className="w-3.5 h-3.5 text-label-tertiary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-label-secondary mb-1">
                      출금 일시 중단
                      {reason && <span className="ml-1.5 text-[10px] font-normal text-label-tertiary">({reason})</span>}
                    </p>
                    {msg ? (
                      <p className="text-[11px] text-label-secondary leading-snug break-words">{msg}</p>
                    ) : (
                      <p className="text-[11px] text-label-secondary leading-snug">
                        해당 경로의 출금이 현재 거래소에 의해 비활성화되어 있습니다.
                      </p>
                    )}
                    {noticeTitle && noticeUrl && (
                      <a
                        href={noticeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-start gap-1 group"
                      >
                        <span className="text-[9px] font-semibold bg-acc-blue/10 text-acc-blue px-1.5 py-0.5 rounded-full shrink-0 mt-0.5">공지</span>
                        <span className="text-[10px] text-acc-blue group-hover:underline leading-snug break-words">{noticeTitle}</span>
                      </a>
                    )}
                    {!noticeTitle && (
                      <p className="text-[10px] text-label-tertiary mt-1.5">
                        거래소 공지사항을 확인하세요.
                      </p>
                    )}
                  </div>
                </div>
                );
              })()}

              {isHoldOnGlobal && (
                <div className="ios-card rounded-2xl px-4 py-3 flex items-center gap-2">
                  <span className="text-[10px] font-semibold bg-acc-blue/10 text-acc-blue px-2 py-0.5 rounded-full shrink-0">개인지갑으로 출금하지 않음</span>
                  <p className="text-[10px] text-label-secondary">출금 없이 해외 거래소에 비트코인 보유하는 경우 기준. 출금 수수료 제외 시 실제 수수료는 더 낮습니다.</p>
                </div>
              )}

              {/* Hero result card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...SPRING_SLOW, delay: 0.1 }}
                className="rounded-3xl text-center relative overflow-hidden"
                style={isDisabled
                  ? { background: 'linear-gradient(145deg, rgba(120,120,130,0.12) 0%, rgba(100,100,110,0.06) 50%, rgba(255,255,255,0) 100%)', border: '0.5px solid rgba(150,150,160,0.25)' }
                  : { background: 'linear-gradient(145deg, var(--hero-grad-from) 0%, var(--hero-grad-mid) 50%, rgba(255,255,255,0) 100%)', border: '0.5px solid var(--hero-grad-border)' }
                }
              >
                {isDisabled && <div className="caution-tape-band w-full h-9" />}
                <div className="p-6">
                {!isDisabled && (
                  <motion.div
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                    className="absolute -top-8 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full bg-acc-brand/10 blur-2xl pointer-events-none"
                  />
                )}
                {isDisabled && (
                  <div className="w-10 h-10 rounded-full bg-fill-secondary border border-fill-tertiary/50 flex items-center justify-center mx-auto mb-4 relative z-10">
                    <Wrench weight="fill" className="w-5 h-5 text-label-tertiary" />
                  </div>
                )}
                <p className="text-xs text-label-tertiary uppercase tracking-wider mb-2 relative z-10">예상 수령</p>
                <p className={`text-5xl font-bold num leading-none relative z-10 ${isDisabled ? 'text-label-tertiary' : 'text-label-primary'}`}>
                  {isSell && '₩'}{formatNumber(displayReceived)}
                </p>
                <p className="text-sm text-label-tertiary mt-1 num relative z-10">{isSell ? '원' : 'sats'}</p>
                <p className="text-[10px] text-label-quaternary mt-1 relative z-10">
                  {isSell
                    ? `${amountBtc} BTC 판매 · 수수료를 뺀 실수령액`
                    : '1 비트코인 = 100,000,000 sats'}
                </p>
                <div className="sep mt-5 mb-4 relative z-10" />

                {(() => {
                  const kimchi = domestic ? ((liveKimpTotal ?? snapshotKimp)[domestic] ?? null) : null;
                  const satsKrw = domesticBtcKrw != null && resultPath.btc_received != null
                    ? Math.round(resultPath.btc_received * domesticBtcKrw)
                    : null;
                  const krwPnL = satsKrw != null ? satsKrw - amountKrw : null;

                  // USDT 경로: 글로벌 BTC를 '진짜 원달러(두나무 포렉스)' 환율로 환산해
                  // 테더 프리미엄(업비트 USDT vs 포렉스)이 globalPnL에 실제 금액으로 드러나게 한다.
                  // 매수 계산은 backend가 업비트 USDT 환율로 일관 처리 → 부호는 테더 프리미엄 방향으로 안정.
                  // BTC 경로는 김프 기반 평가 유지.
                  const isUsdtPath = resultPath.transfer_coin === 'USDT';
                  const gd = global ? allData?.byGlobal?.[global] : null;
                  const globalBtcUsd = gd && !('error' in gd) ? gd.global_btc_price_usd ?? null : null;
                  const upbitUsdt = liveUsdtKrw;
                  // 경로 P&L 계산용 forex(크롤 스냅샷) — globalBtcKrw 환산에만 사용
                  const forexRate = global ? allData?.byGlobal?.[global]?.usd_krw_rate ?? null : null;
                  // 표시용 원달러 프리미엄/환율은 앱 전역 live 값으로 통일 (첫화면·선택단계와 값 일치)
                  const usdtPremiumPct = usdtPremium;
                  const displayForex = forexUsdKrw;
                  const globalBtcKrw = isUsdtPath && forexRate && globalBtcUsd
                    ? globalBtcUsd * forexRate
                    : (domesticBtcKrw != null && kimchi != null
                        ? domesticBtcKrw / (1 + kimchi / 100)
                        : null);
                  const satsGlobalKrw = globalBtcKrw != null && resultPath.btc_received != null
                    ? Math.round(resultPath.btc_received * globalBtcKrw)
                    : null;
                  const globalPnL = satsGlobalKrw != null ? satsGlobalKrw - amountKrw : null;

                  return (
                    <div className="ios-card rounded-2xl px-4 py-3 text-left relative z-10 w-full space-y-3">
                      {/* 수수료 합계 */}
                      <div>
                        <p className="text-[10px] text-label-tertiary uppercase tracking-wide mb-1.5">
                          수수료 합계{isUsdtPath && <span className="normal-case font-normal ml-1.5 text-[9px] opacity-80">· 원달러 환산</span>}
                        </p>
                        <p className="text-sm font-bold text-acc-red num">
                          -{formatFeeKrw(resultPath.total_fee_krw)}
                          <span className="text-[11px] font-normal ml-1.5 opacity-70">({formatPercent(resultPath.fee_pct)})</span>
                        </p>
                        {krwPnL != null && krwPnL !== -resultPath.total_fee_krw && (
                          <p className={`text-[11px] num mt-1.5 ${krwPnL < 0 ? 'text-label-secondary' : 'text-acc-green'}`}>
                            순손익(김치 프리미엄 포함) {krwPnL < 0 ? '▼' : '▲'} ₩{formatNumber(Math.abs(krwPnL))}
                          </p>
                        )}
                        {globalPnL != null && (
                          <button
                            onClick={() => setShowPremium(o => !o)}
                            className="mt-2 flex items-center gap-1 text-[10px] text-label-tertiary hover:text-label-secondary transition-colors cursor-pointer"
                          >
                            프리미엄 고려했을 때는?
                            <CaretDown className={`w-3 h-3 transition-transform duration-200 ${showPremium ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </div>

                      <AnimatePresence>
                        {showPremium && globalPnL != null && (() => {
                          const exchangeRateDiff = isUsdtPath ? (globalPnL + resultPath.total_fee_krw) : null;
                          return (
                            <motion.div
                              key="premium"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="sep mb-3" />
                              <div>
                                <p className="text-[10px] text-label-tertiary uppercase tracking-wide mb-1.5">
                                  글로벌 시세 기준
                                  <span className="ml-1.5 normal-case font-normal">
                                    ({isUsdtPath && usdtPremiumPct != null ? (
                                      <>원달러 프리미엄 <span className={usdtPremiumPct >= 0 ? 'text-acc-red' : 'text-acc-green'}>{usdtPremiumPct >= 0 ? '+' : ''}{usdtPremiumPct.toFixed(2)}%</span></>
                                    ) : (
                                      <>김치 프리미엄 <span className={kimchi! >= 0 ? 'text-acc-red' : 'text-acc-green'}>{kimchi! >= 0 ? '+' : ''}{kimchi!.toFixed(2)}%</span></>
                                    )}
                                    <span className="text-[9px] text-label-tertiary"> / 원달러 환산</span>)
                                  </span>
                                </p>
                                <p className="text-xs text-label-secondary leading-relaxed">
                                  같은 비트코인을 글로벌 시세(원달러 환산)로 평가하면 <span className="num font-semibold text-label-primary">₩{formatNumber(satsGlobalKrw!)}</span>
                                </p>
                                <p className={`text-sm font-bold num mt-1 ${globalPnL >= 0 ? 'text-acc-green' : 'text-acc-red'}`}>
                                  {globalPnL >= 0 ? '▲' : '▼'} ₩{formatNumber(Math.abs(globalPnL))} {globalPnL >= 0 ? '수익' : '지출'}
                                  <span className="text-[11px] font-normal ml-1.5 opacity-70">({(Math.abs(globalPnL) / amountKrw * 100).toFixed(2)}%)</span>
                                </p>
                                {isUsdtPath && exchangeRateDiff != null && (() => {
                                  const showRateDiff = Math.abs(exchangeRateDiff) > 50;
                                  return (
                                    <div className="mt-2 pt-2 border-t border-line space-y-1.5">
                                      <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-label-tertiary">거래소·출금 수수료 <span className="text-[9px] opacity-70">(원달러 환산)</span></span>
                                        <span className="num text-acc-red">-{formatFeeKrw(resultPath.total_fee_krw)}</span>
                                      </div>
                                      {showRateDiff && (
                                        <div className="flex justify-between items-center text-[10px]">
                                          <span className="text-label-tertiary">원달러 프리미엄 차이</span>
                                          <span className={`num ${exchangeRateDiff < 0 ? 'text-acc-red' : 'text-acc-green'}`}>
                                            {exchangeRateDiff < 0 ? '-' : '+'}
                                            {formatFeeKrw(Math.abs(exchangeRateDiff))}
                                          </span>
                                        </div>
                                      )}
                                      {usdtPremiumPct != null && (
                                        <div className="rounded-xl bg-fill-secondary px-3 py-2 space-y-1">
                                          <div className="flex justify-between text-[9px]">
                                            <span className="text-label-tertiary">업비트 USDT <span className="opacity-60">(upbit)</span></span>
                                            <span className="num text-label-secondary font-medium">
                                              {upbitUsdt ? `₩${formatNumber(Math.round(upbitUsdt))}` : '-'}
                                            </span>
                                          </div>
                                          <div className="flex justify-between text-[9px]">
                                            <span className="text-label-tertiary">달러 포렉스 <span className="opacity-60">(dunamu)</span></span>
                                            <span className="num text-label-secondary font-medium">
                                              {displayForex ? `₩${formatNumber(Math.round(displayForex))}` : '-'}
                                            </span>
                                          </div>
                                          <div className="flex justify-between text-[9px] pt-0.5 border-t border-line-soft">
                                            <span className="text-label-tertiary">원달러 프리미엄</span>
                                            <span className={`num font-semibold ${usdtPremiumPct > 0 ? 'text-acc-red' : 'text-acc-green'}`}>
                                              {usdtPremiumPct > 0 ? '+' : ''}{usdtPremiumPct.toFixed(2)}%
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </motion.div>
                          );
                        })()}
                      </AnimatePresence>
                    </div>
                  );
                })()}
                </div>
              </motion.div>

              {/* Route path visualization */}
              <div>
                <SectionLabel>이동 경로</SectionLabel>
                <RouteDiagram
                  nodes={routeDiagram.nodes}
                  edges={routeDiagram.edges}
                />
              </div>

              {/* 입금 관문 — 수수료에는 드러나지 않지만 경로를 실행할 수 있는지를 가른다 */}
              {(() => {
                const gates = activeGates(resultPath, walletRegistered);
                if (!gates.length) return null;
                const worst = gateSeverity(gates)!;
                return (
                  <div>
                    <SectionLabel>입금 조건</SectionLabel>
                    <div className="ios-card rounded-2xl divide-y divide-line">
                      {gates.map((g, i) => (
                        <div key={i} className="px-4 py-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${GATE_BADGE_CLASS[g.level]}`}>
                              {GATE_BADGE[g.level]}
                            </span>
                            <p className="text-[12px] font-bold text-label-primary">{g.label}</p>
                          </div>
                          <p className="text-[11px] text-label-secondary leading-relaxed">{g.desc}</p>
                          {g.source && (
                            g.source_url ? (
                              <a
                                href={g.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-acc-blue hover:underline"
                              >
                                {g.source}
                                <ArrowSquareOut className="w-2.5 h-2.5" />
                              </a>
                            ) : (
                              <p className="mt-1.5 text-[10px] text-label-quaternary">{g.source}</p>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                    {worst === 'blocked' && (
                      <p className="text-[10px] text-acc-red mt-2 leading-relaxed">
                        이 경로는 수수료가 낮더라도 지금 수단으로는 입금이 반영되지 않습니다.
                        해외 거래소를 경유하는 경로를 확인해 보세요.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Fee breakdown — 각 항목 금액은 항상 노출, 항목별 '자세히'로 세부 펼침 */}
              {resultPath.breakdown?.components && resultPath.breakdown.components.length > 0 && (
                <div>
                  <SectionLabel>수수료 내역</SectionLabel>
                  <p className="text-[10px] text-label-tertiary mb-2 -mt-1">
                    <span className="inline-flex items-center gap-1 mr-2"><span className="bg-acc-blue/10 text-acc-blue px-1.5 py-0.5 rounded-full text-[9px] font-semibold">고정 수수료</span>이동 금액과 무관</span>
                    <span className="inline-flex items-center gap-1"><span className="bg-acc-brand/10 text-acc-brand px-1.5 py-0.5 rounded-full text-[9px] font-semibold">비율 수수료</span>거래·이동 금액 × 비율</span>
                  </p>
                  <div className="ios-card rounded-2xl divide-y divide-line">
                    {resultPath.breakdown.components.map((c, i) => {
                      const hasDetail =
                        (c.move_amount != null && !!c.move_coin) ||
                        !!c.network ||
                        !!fmtAmountText(c.amount_text) ||
                        !!c.source_url;
                      const open = expandedFees.has(i);
                      return (
                        <div key={i} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs text-label-secondary leading-snug">{c.label}</p>
                                {c.is_fixed != null && (
                                  <span
                                    title={c.is_fixed ? '이동 금액에 관계없이 항상 동일한 고정 수수료' : '거래 금액(매수·매도) 또는 이동 금액에 비례하는 비율(%) 수수료'}
                                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full cursor-help ${
                                      c.is_fixed
                                        ? 'bg-acc-blue/10 text-acc-blue'
                                        : 'bg-acc-brand/10 text-acc-brand'
                                    }`}>
                                    {c.is_fixed ? '고정 수수료' : '비율 수수료'}
                                  </span>
                                )}
                                {c.note && (
                                  <span
                                    title={c.note}
                                    className="inline-flex items-start gap-1 max-w-full text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-acc-green/10 text-acc-green leading-relaxed"
                                  >
                                    <Ticket className="w-2.5 h-2.5 shrink-0 mt-[2px]" weight="bold" />
                                    <span>{c.note}</span>
                                  </span>
                                )}
                              </div>
                              {hasDetail && (
                                <button
                                  onClick={() => toggleFee(i)}
                                  className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium text-acc-brand hover:opacity-80 transition-opacity cursor-pointer"
                                >
                                  자세히
                                  <CaretDown className={`w-2.5 h-2.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} weight="bold" />
                                </button>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-semibold text-acc-red num">
                                -{formatFeeKrw(c.amount_krw)}
                              </p>
                              {c.rate_pct != null && (
                                <p className="text-[10px] text-label-tertiary num mt-0.5">{c.rate_pct.toFixed(4)}%</p>
                              )}
                            </div>
                          </div>
                          <AnimatePresence>
                            {open && hasDetail && (
                              <motion.div
                                key="detail"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-2 pt-2 border-t border-line space-y-1">
                                  {c.move_amount != null && c.move_coin && (
                                    <p className="text-[10px] text-label-secondary num">
                                      이동 {c.move_coin === 'BTC' ? c.move_amount.toFixed(8) : c.move_amount.toFixed(2)} {c.move_coin}
                                      {c.move_amount_krw != null && (
                                        <span className="text-label-tertiary"> ≈ ₩{formatNumber(c.move_amount_krw)}</span>
                                      )}
                                    </p>
                                  )}
                                  {c.network && (
                                    <p className="text-[10px] text-label-tertiary flex items-center gap-1">
                                      출금 네트워크 <NetworkIcon network={c.network} size={11} />
                                      <span className="text-label-secondary font-medium">{formatNetworkLabel(c.network)}</span>
                                    </p>
                                  )}
                                  {fmtAmountText(c.amount_text) && (
                                    <p className="text-[10px] text-label-tertiary num">수수료 {fmtAmountText(c.amount_text)}</p>
                                  )}
                                  {c.source_url && (
                                    <a
                                      href={c.source_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-0.5 text-[10px] text-acc-blue hover:underline"
                                    >
                                      출처 <ArrowSquareOut className="w-2.5 h-2.5" />
                                    </a>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                    {resultPath.discarded_krw != null && resultPath.discarded_krw > 0 && (
                      <div className="flex items-center justify-between px-4 py-3 gap-3">
                        <p className="text-xs text-label-secondary leading-snug">
                          최소주문 잔돈 <span className="text-[9px] text-label-tertiary">(못 쓰고 남음 · 근사)</span>
                        </p>
                        <p className="text-xs font-semibold text-label-tertiary num shrink-0">≈ ₩{formatNumber(resultPath.discarded_krw)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {resultPath.domestic_kyc_status === 'kyc' && <Chip color="brand">국내 인증 필요</Chip>}
                {usesGlobal && resultPath.global_kyc_status === 'kyc'   && <Chip color="brand">해외 인증 필요</Chip>}
                {usesGlobal && resultPath.global_kyc_status === 'non_kyc' && <Chip color="green">해외 인증 불필요</Chip>}
                {resultPath.global_exit_mode === 'lightning' && <Chip color="blue">라이트닝 출금</Chip>}
              </div>

              {/* Top 3 추천 경로 */}
              {altPaths.length > 0 && (() => {
                const isCurrentPath = (p: typeof altPaths[0]) => resultPath != null && (
                  (p.path_id && resultPath.path_id)
                    ? p.path_id === resultPath.path_id
                    : p.korean_exchange === resultPath.korean_exchange &&
                      p.network === resultPath.network &&
                      p.transfer_coin === resultPath.transfer_coin &&
                      p.path_type === resultPath.path_type &&
                      (p.lightning_exit_provider ?? null) === (resultPath.lightning_exit_provider ?? null)
                );
                const cheapest = altPaths[0];
                const cheapestIsCurrent = isCurrentPath(cheapest);
                const savingsKrw = !cheapestIsCurrent
                  ? Math.round(resultPath.total_fee_krw - cheapest.total_fee_krw)
                  : 0;
                const medalColors = [
                  'bg-[#FFD700]/20 text-[#FFD700]',
                  'bg-[#A8A9AD]/20 text-[#A8A9AD]',
                  'bg-[#CD7F32]/20 text-[#CD7F32]',
                ];
                return (
                  <div>
                    <SectionLabel>추천 경로</SectionLabel>
                    {savingsKrw > 100 ? (
                      <button
                        onClick={() => setShowAltPaths(o => !o)}
                        className="w-full mb-2 rounded-2xl px-4 py-3 flex items-center gap-2.5 text-left cursor-pointer"
                        style={{ background: 'linear-gradient(135deg, rgba(52,199,89,0.22) 0%, rgba(52,199,89,0.12) 100%)', border: '0.5px solid rgba(52,199,89,0.45)' }}
                      >
                        <div className="w-6 h-6 rounded-full bg-acc-green/15 flex items-center justify-center shrink-0">
                          <span className="text-acc-green text-[11px] font-bold">↓</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-acc-green">
                            현재보다 <span className="num">{formatFeeKrw(savingsKrw)}</span> 더 절약 가능한 경로가 있어요
                          </p>
                          <p className="text-[10px] text-label-tertiary mt-0.5">
                            1위 경로 선택 시 수수료를 줄일 수 있어요
                          </p>
                        </div>
                        <CaretDown className={`shrink-0 w-4 h-4 text-acc-green transition-transform duration-200 ${showAltPaths ? 'rotate-180' : ''}`} />
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowAltPaths(o => !o)}
                        className="mb-2 flex items-center gap-1 text-[10px] text-label-tertiary hover:text-label-secondary transition-colors cursor-pointer"
                      >
                        다른 경로 보기 ({altPaths.length}개)
                        <CaretDown className={`w-3 h-3 transition-transform duration-200 ${showAltPaths ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                    <AnimatePresence>
                      {showAltPaths && (
                      <motion.div
                        key="alt-paths"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                    <div className="space-y-2">
                      {altPaths.map((p, i) => {
                        const isCurrent = isCurrentPath(p);
                        const pathSavings = i > 0 || !isCurrent
                          ? Math.round(resultPath.total_fee_krw - p.total_fee_krw)
                          : 0;
                        return (
                          <div
                            key={p.path_id ?? i}
                            className={`ios-card rounded-2xl px-4 py-3 ${isCurrent ? 'ring-1 ring-acc-brand/40' : ''}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${medalColors[i] ?? 'bg-fill-secondary text-label-tertiary'}`}>
                                  {i + 1}
                                </span>
                                {isSell ? (
                                  // 팔 때는 자금이 지갑에서 거래소로 흐르므로 추천 목록과 같은 요약 문구를 쓴다
                                  <span className="text-[10px] text-label-secondary font-medium leading-relaxed min-w-0">{routeText(p, 'sell')}</span>
                                ) : (
                                  <div className="flex items-center gap-1 flex-wrap min-w-0">
                                    <ExFavicon id={p.korean_exchange} size={16} />
                                    <span className="text-[10px] text-label-secondary font-medium">{fmtEx(p.korean_exchange)}</span>
                                    <ArrowRight className="w-2.5 h-2.5 text-label-tertiary flex-shrink-0" />
                                    <span className="text-[10px] text-label-tertiary">{p.transfer_coin === 'BTC' ? '비트코인' : p.transfer_coin}</span>
                                    {(p.transfer_coin === 'USDT' || p.route_variant?.endsWith('via_global')) && p._g && (
                                      <>
                                        <ArrowRight className="w-2.5 h-2.5 text-label-tertiary flex-shrink-0" />
                                        <ExFavicon id={p._g} size={16} />
                                        <span className="text-[10px] text-label-secondary font-medium">{fmtEx(p._g)}</span>
                                      </>
                                    )}
                                    <ArrowRight className="w-2.5 h-2.5 text-label-tertiary flex-shrink-0" />
                                    {p.global_exit_mode === 'lightning' && p.lightning_exit_provider && p.lightning_exit_provider !== '__direct__' ? (
                                      // 스왑 서비스 경유 → 서비스 로고 (메인 경로 표시와 동일 규칙)
                                      <ExFavicon id={p.lightning_exit_provider} size={12} />
                                    ) : (
                                      <NetworkIcon network={p.global_exit_mode === 'lightning' ? 'lightning' : (p.global_exit_network || p.network)} size={12} />
                                    )}
                                    <span className="text-[10px] text-label-tertiary">
                                      {p.global_exit_mode === 'lightning'
                                        ? (p.lightning_exit_provider && p.lightning_exit_provider !== '__direct__'
                                            ? fmtEx(p.lightning_exit_provider)
                                            : 'LN 스왑')
                                        : formatNetworkLabel(p.global_exit_network || p.network)}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs font-semibold text-acc-red num">-{formatFeeKrw(p.total_fee_krw)}</p>
                                <p className="text-[10px] text-label-tertiary num mt-0.5">{formatPercent(p.fee_pct)}</p>
                              </div>
                            </div>
                            <div className="mt-1.5 flex items-center gap-3 text-[10px]">
                              {isCurrent && <span className="text-acc-brand font-semibold">현재 선택</span>}
                              {!isCurrent && pathSavings > 100 && (
                                <span className="text-acc-green font-semibold num">{formatFeeKrw(pathSavings)} 절약</span>
                              )}
                              {!isCurrent && pathSavings < -100 && (
                                <span className="text-acc-red font-semibold num">{formatFeeKrw(Math.abs(pathSavings))} 추가</span>
                              )}
                              <span className="text-label-tertiary">
                                수령{' '}
                                <span className="text-label-primary num font-medium">
                                  {isSell
                                    ? `₩${formatNumber(Math.round(p.krw_received ?? 0))}`
                                    : `${formatNumber(Math.round((p.btc_received ?? 0) * SATS_PER_BTC))} sats`}
                                </span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                      </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })()}

              {/* 조건부 절약 경로 (팔 때): 지갑 주소를 등록하면 바로 입금할 수 있는 더 싼 경로 */}
              {conditionalAltPath && (() => {
                const p = conditionalAltPath;
                const savings = Math.round(resultPath.total_fee_krw - p.total_fee_krw);
                const gate = activeGates(p, false).find(g => g.level === 'required');
                return (
                  <div className="rounded-2xl px-4 py-3 border border-acc-brand/30 bg-acc-brand/8 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-acc-brand shrink-0" weight="fill" />
                      <span className="text-[10px] font-semibold text-acc-brand">조건부 절약 경로</span>
                    </div>
                    <p className="text-[11px] font-semibold text-label-primary leading-relaxed">
                      {fmtEx(p.korean_exchange)}에 비트코인 지갑 주소를 등록하면 바로 입금해서{' '}
                      <span className="text-acc-green num">{formatFeeKrw(savings)}</span> 더 아낄 수 있어요
                    </p>
                    <p className="text-[10px] text-label-secondary">{routeText(p, 'sell')}</p>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="text-acc-red font-semibold num">-{formatFeeKrw(p.total_fee_krw)}</span>
                      <span className="text-label-tertiary">
                        수령 <span className="text-label-primary num font-medium">₩{formatNumber(Math.round(p.krw_received ?? 0))}</span>
                      </span>
                    </div>
                    {gate?.desc && <p className="text-[10px] text-label-tertiary leading-relaxed">{gate.desc}</p>}
                    <p className="text-[10px] text-label-tertiary leading-relaxed">
                      이미 등록했다면 첫 화면에서 '등록했어요'를 선택하세요. 이 경로도 일반 추천에 포함돼요.
                    </p>
                  </div>
                );
              })()}

              {/* Retry */}
              <button
                onClick={reset}
                className="w-full py-3.5 rounded-2xl bg-fill-secondary text-label-secondary text-sm font-semibold hover:bg-fill-primary transition-colors"
              >
                다시 탐색
              </button>
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>

              {/* 제보하기: 현재 경로 정보를 게시판 제보 템플릿에 자동첨부 */}
              <button
                onClick={() => navigate(`/board/new?${buildReportQuery({
                  koreanExchange: fmtEx(resultPath.korean_exchange),
                  globalExchange: global ? fmtEx(global) : null,
                  coin: resultPath.transfer_coin,
                  network: resultPath.network ?? resultPath.global_exit_network,
                  amountKrw,
                  feeText: `${formatFeeKrw(resultPath.total_fee_krw)} (${formatPercent(resultPath.fee_pct)})`,
                })}`)}
                className="w-full py-2 text-xs text-label-tertiary hover:text-acc-blue transition-colors flex items-center justify-center gap-1.5"
              >
                <WarningCircle className="w-3.5 h-3.5" /> 이 경로에 문제가 있나요? 제보하기
              </button>
    </>
  );
}
