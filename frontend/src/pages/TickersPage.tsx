import { useCallback } from 'react';

import { PageErrorMessage } from '../components/PageErrorMessage';
import { PageSkeletonBlocks } from '../components/PageSkeletonBlocks';
import { useAsyncData } from '../hooks/useAsyncData';
import { api } from '../lib/api';
import { fmtEx } from '../lib/exchangeNames';
import type { TickerRow } from '../types';

function ExchangeLogo({ exchange }: { exchange: string }) {
  const logoName = exchange.toLowerCase().replace(/\s+/g, '');
  return (
    <img
      src={`/logos/${logoName}.png`}
      alt={exchange}
      width={20}
      height={20}
      className="h-5 w-5 shrink-0 rounded-full object-contain bg-dark-500"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

function fmtPrice(price: number, currency: string) {
  if (currency === 'KRW') {
    return price.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
  }
  return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtFee(val: number | null | undefined) {
  if (val == null) return '—';
  return `${val}%`;
}

export function TickersPage() {
  const loadTickers = useCallback(async (): Promise<TickerRow[]> => {
    const response = await api.getTickers();
    return response.items;
  }, []);

  const { data: items, error, loading } = useAsyncData(loadTickers, {
    initialData: [],
  });

  if (error) return <PageErrorMessage message={error} />;
  if (loading) return <PageSkeletonBlocks blocks={6} className="h-14 bg-dark-300" />;

  // KRW 기준 가격 정규화 (비교용)
  const krwItems = items.filter((it) => it.currency === 'KRW');
  const usdItems = items.filter((it) => it.currency !== 'KRW');

  // 상대적 가격 바 계산
  const krwPrices = krwItems.map((it) => it.price);
  const minKrw = Math.min(...krwPrices);
  const maxKrw = Math.max(...krwPrices);
  const krwRange = maxKrw - minKrw || 1;

  function barWidth(price: number, min: number, range: number) {
    return Math.max(((price - min) / range) * 100, 4);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="section-label">거래소 시세</p>
          <h2 className="mt-1 text-xl font-bold text-bnb-text font-display">BTC 실시간 가격</h2>
        </div>
        <span className="text-xs text-bnb-muted font-data">{items.length}개 항목</span>
      </div>

      {/* KRW 거래소 */}
      {krwItems.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <p className="section-label">원화 마켓</p>
            <span className="rounded-full bg-dark-200 px-2 py-0.5 text-[10px] font-data text-bnb-muted">
              KRW
            </span>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block border border-dark-200 overflow-hidden">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-dark-400 border-b border-dark-200">
                <tr>
                  <th className="px-4 py-3 section-label w-8">#</th>
                  <th className="px-4 py-3 section-label">거래소</th>
                  <th className="px-4 py-3 section-label">마켓</th>
                  <th className="px-4 py-3 text-right section-label">BTC 가격</th>
                  <th className="px-4 py-3 section-label min-w-[180px]">가격대 분포</th>
                  <th className="px-4 py-3 text-right section-label">메이커</th>
                  <th className="px-4 py-3 text-right section-label">테이커</th>
                </tr>
              </thead>
              <tbody className="bg-dark-300 divide-y divide-dark-200">
                {krwItems
                  .sort((a, b) => b.price - a.price)
                  .map((item, idx) => {
                    const bw = barWidth(item.price, minKrw, krwRange);
                    const isTop = idx === 0;
                    return (
                      <tr
                        key={`${item.exchange}-${item.market_type}`}
                        className="group transition-colors hover:bg-dark-400"
                      >
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`rank-badge ${
                              idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : 'rank-n'
                            }`}
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ExchangeLogo exchange={item.exchange} />
                            <span className={`font-medium ${isTop ? 'text-brand-400' : 'text-bnb-text'}`}>
                              {fmtEx(item.exchange)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-bnb-muted text-xs">{item.market_type}</td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`font-data font-semibold text-sm ${
                              isTop ? 'text-brand-400' : 'text-bnb-text'
                            }`}
                          >
                            {fmtPrice(item.price, item.currency)}
                          </span>
                          <span className="ml-1 text-[10px] text-bnb-muted">₩</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-dark-200 rounded-sm overflow-hidden max-w-[140px]">
                              <div
                                className="h-full rounded-sm price-bar-fill"
                                style={{ width: `${bw}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-data text-bnb-muted w-10 text-right shrink-0">
                              {bw.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-data text-sm text-bnb-text">
                          {fmtFee(item.maker_fee_pct)}
                        </td>
                        <td className="px-4 py-3 text-right font-data text-sm text-bnb-text">
                          {fmtFee(item.taker_fee_pct)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {krwItems
              .sort((a, b) => b.price - a.price)
              .map((item, idx) => {
                const bw = barWidth(item.price, minKrw, krwRange);
                const isTop = idx === 0;
                return (
                  <article
                    key={`mobile-${item.exchange}-${item.market_type}`}
                    className="border border-dark-200 bg-dark-300 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`rank-badge ${
                            idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : 'rank-n'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <ExchangeLogo exchange={item.exchange} />
                        <div>
                          <p className={`text-sm font-semibold ${isTop ? 'text-brand-400' : 'text-bnb-text'}`}>
                            {fmtEx(item.exchange)}
                          </p>
                          <p className="text-[11px] text-bnb-muted">{item.market_type}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-data font-semibold ${isTop ? 'text-brand-400' : 'text-bnb-text'}`}>
                          {fmtPrice(item.price, item.currency)}
                          <span className="ml-1 text-xs text-bnb-muted font-sans">₩</span>
                        </p>
                      </div>
                    </div>

                    {/* Price bar */}
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-dark-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full price-bar-fill"
                          style={{ width: `${bw}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-data text-bnb-muted shrink-0">{bw.toFixed(0)}%</span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-dark-200 pt-3">
                      <div>
                        <p className="section-label">메이커</p>
                        <p className="mt-1 font-data text-sm text-bnb-text">{fmtFee(item.maker_fee_pct)}</p>
                      </div>
                      <div>
                        <p className="section-label">테이커</p>
                        <p className="mt-1 font-data text-sm text-bnb-text">{fmtFee(item.taker_fee_pct)}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
          </div>
        </section>
      )}

      {/* USD/USDT 거래소 */}
      {usdItems.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <p className="section-label">달러 마켓</p>
            <span className="rounded-full bg-dark-200 px-2 py-0.5 text-[10px] font-data text-bnb-muted">
              USD / USDT
            </span>
          </div>

          <div className="hidden md:block border border-dark-200 overflow-hidden">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-dark-400 border-b border-dark-200">
                <tr>
                  <th className="px-4 py-3 section-label">#</th>
                  <th className="px-4 py-3 section-label">거래소</th>
                  <th className="px-4 py-3 section-label">마켓</th>
                  <th className="px-4 py-3 text-right section-label">BTC 가격</th>
                  <th className="px-4 py-3 section-label">통화</th>
                  <th className="px-4 py-3 text-right section-label">메이커</th>
                  <th className="px-4 py-3 text-right section-label">테이커</th>
                </tr>
              </thead>
              <tbody className="bg-dark-300 divide-y divide-dark-200">
                {usdItems.map((item, idx) => (
                  <tr
                    key={`${item.exchange}-${item.market_type}`}
                    className="transition-colors hover:bg-dark-400"
                  >
                    <td className="px-4 py-3">
                      <span className="rank-badge rank-n">{idx + 1}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ExchangeLogo exchange={item.exchange} />
                        <span className="font-medium text-bnb-text">{fmtEx(item.exchange)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-bnb-muted text-xs">{item.market_type}</td>
                    <td className="px-4 py-3 text-right font-data font-semibold text-bnb-text">
                      {fmtPrice(item.price, item.currency)}
                    </td>
                    <td className="px-4 py-3 text-xs text-bnb-muted">{item.currency}</td>
                    <td className="px-4 py-3 text-right font-data text-bnb-text">
                      {fmtFee(item.maker_fee_pct)}
                    </td>
                    <td className="px-4 py-3 text-right font-data text-bnb-text">
                      {fmtFee(item.taker_fee_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {usdItems.map((item, idx) => (
              <article
                key={`mobile-usd-${item.exchange}-${item.market_type}`}
                className="border border-dark-200 bg-dark-300 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="rank-badge rank-n">{idx + 1}</span>
                    <ExchangeLogo exchange={item.exchange} />
                    <div>
                      <p className="text-sm font-semibold text-bnb-text">{fmtEx(item.exchange)}</p>
                      <p className="text-[11px] text-bnb-muted">{item.market_type} · {item.currency}</p>
                    </div>
                  </div>
                  <p className="font-data font-semibold text-bnb-text">
                    {fmtPrice(item.price, item.currency)}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-dark-200 pt-3">
                  <div>
                    <p className="section-label">메이커</p>
                    <p className="mt-1 font-data text-sm text-bnb-text">{fmtFee(item.maker_fee_pct)}</p>
                  </div>
                  <div>
                    <p className="section-label">테이커</p>
                    <p className="mt-1 font-data text-sm text-bnb-text">{fmtFee(item.taker_fee_pct)}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
