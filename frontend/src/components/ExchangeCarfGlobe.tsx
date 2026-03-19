import { Clock3, MapPin, Route } from 'lucide-react';

import { CARF_GROUP_LABELS, CarfGroup, ExchangeCarfInfo } from '../data/carfData';

type ExchangeCarfGlobeProps = {
  exchanges: ExchangeCarfInfo[];
  selectedSourceId: string;
  selectedDestinationId: string;
};

type Point = { x: number; y: number };

const MERIDIAN_LONGITUDES = [-120, -60, 0, 60, 120];
const PARALLEL_LATITUDES = [-45, 0, 45];
const GLOBE_BOUNDS = { left: 12, top: 12, width: 76, height: 76 };
const CONTINENT_PATHS = [
  'M20 28C18 23 19 18 24 15C30 11 38 13 40 19C42 24 39 29 35 32C31 35 30 40 31 45C32 51 30 58 24 63C19 67 13 65 11 59C9 53 12 47 15 43C18 39 22 35 20 28Z',
  'M43 18C48 14 56 15 61 20C65 24 66 29 63 34C61 38 61 43 64 46C68 49 70 56 66 61C61 67 52 67 48 61C45 57 43 51 41 47C38 42 34 38 35 31C35 25 38 21 43 18Z',
  'M63 24C68 20 76 20 82 24C87 28 89 35 86 41C83 47 76 48 72 45C68 42 64 42 60 44C56 46 50 45 48 40C45 33 52 28 57 28C60 27 61 26 63 24Z',
];

function carfTone(group: CarfGroup): string {
  if (group === '2027') return 'text-bnb-green';
  if (group === '2028') return 'text-brand-400';
  if (group === '2029') return 'text-bnb-muted';
  return 'text-bnb-red';
}

function markerFill(group: CarfGroup): string {
  if (group === '2027') return '#0ECB81';
  if (group === '2028') return '#F0B90B';
  if (group === '2029') return '#8A8F98';
  return '#F6465D';
}

function projectPoint(latitude: number, longitude: number): Point {
  const x = GLOBE_BOUNDS.left + ((longitude + 180) / 360) * GLOBE_BOUNDS.width;
  const y = GLOBE_BOUNDS.top + ((90 - latitude) / 180) * GLOBE_BOUNDS.height;
  return { x, y };
}

function formatTiming(exchange: ExchangeCarfInfo): string {
  const collection = exchange.carfDataCollectionStart ? `${exchange.carfDataCollectionStart} 수집` : '수집 시기 미정';
  const first = exchange.carfFirstExchange ? `${exchange.carfFirstExchange} 첫 교환` : '교환 일정 미정';
  return `${collection} · ${first}`;
}

function selectionWeight(exchangeId: string, selectedSourceId: string, selectedDestinationId: string) {
  if (exchangeId === selectedSourceId || exchangeId === selectedDestinationId) return 0;
  return 1;
}

function buildGraticuleLine(longitude: number): string {
  const start = projectPoint(75, longitude);
  const end = projectPoint(-75, longitude);
  return `M${start.x} ${start.y} L${end.x} ${end.y}`;
}

function buildParallelArc(latitude: number): string {
  const left = projectPoint(latitude, -170);
  const right = projectPoint(latitude, 170);
  return `M${left.x} ${left.y} Q50 ${left.y - (latitude === 0 ? 0 : 2)} ${right.x} ${right.y}`;
}

function SelectedExchangeCard({ exchange, label }: { exchange: ExchangeCarfInfo; label: string }) {
  return (
    <div className="rounded border border-dark-200 bg-dark-400/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-bnb-muted">{label}</p>
          <p className="mt-1 text-sm font-semibold text-bnb-text">{exchange.name}</p>
        </div>
        <span className={`rounded border border-current/20 px-2 py-0.5 text-[10px] font-semibold ${carfTone(exchange.carfGroup)}`}>
          {CARF_GROUP_LABELS[exchange.carfGroup]}
        </span>
      </div>

      <div className="mt-3 space-y-2 text-xs text-bnb-muted">
        <div className="flex items-start gap-2">
          <MapPin size={12} className="mt-0.5 shrink-0 text-brand-400" />
          <div>
            <p className="text-bnb-text">{exchange.mapLocation.label}</p>
            <p className="text-[11px]">{exchange.mapLocation.focusLabel}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Clock3 size={12} className="mt-0.5 shrink-0 text-brand-400" />
          <div>
            <p className="text-bnb-text">{formatTiming(exchange)}</p>
            <p className="text-[11px]">CARF 관할: {exchange.registeredCountry}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExchangeCarfGlobe({ exchanges, selectedSourceId, selectedDestinationId }: ExchangeCarfGlobeProps) {
  const selectedSource = exchanges.find((exchange) => exchange.id === selectedSourceId) ?? exchanges[0];
  const selectedDestination = exchanges.find((exchange) => exchange.id === selectedDestinationId) ?? exchanges[0];
  const selectedLineStart = projectPoint(selectedSource.mapLocation.latitude, selectedSource.mapLocation.longitude);
  const selectedLineEnd = projectPoint(selectedDestination.mapLocation.latitude, selectedDestination.mapLocation.longitude);
  const sortedExchanges = [...exchanges].sort((left, right) => {
    const weightDiff = selectionWeight(left.id, selectedSourceId, selectedDestinationId) - selectionWeight(right.id, selectedSourceId, selectedDestinationId);
    if (weightDiff !== 0) return weightDiff;
    return left.name.localeCompare(right.name, 'ko');
  });

  return (
    <div className="border border-dark-200 bg-dark-500/40" data-testid="exchange-globe-section">
      <div className="border-b border-dark-200 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-bnb-muted">지구본 보기</span>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="overflow-hidden rounded border border-dark-200 bg-[radial-gradient(circle_at_top,_rgba(240,185,11,0.12),_rgba(12,14,18,0.08)_35%,_rgba(12,14,18,0.92)_75%)]">
          <div className="border-b border-dark-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-bnb-text">지구본으로 보는 거래소 위치</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-bnb-muted">
              각 거래소의 주요 거점 또는 CARF 관련 관할 위치를 한 화면에서 보고, 선택한 경로를 바로 강조합니다.
            </p>
          </div>

          <div className="px-3 pb-3 pt-4">
            <svg
              viewBox="0 0 100 100"
              className="mx-auto block aspect-square w-full max-w-[420px]"
              role="img"
              aria-label="거래소 위치 지구본"
              data-testid="exchange-globe"
            >
              <defs>
                <clipPath id="exchange-globe-clip">
                  <circle cx="50" cy="50" r="38" />
                </clipPath>
              </defs>

              <circle cx="50" cy="50" r="38" fill="rgba(17,24,39,0.85)" stroke="rgba(240,185,11,0.18)" strokeWidth="0.8" />
              <circle cx="50" cy="50" r="36" fill="rgba(17,24,39,0.55)" stroke="rgba(255,255,255,0.05)" strokeWidth="0.4" />

              <g clipPath="url(#exchange-globe-clip)">
                {CONTINENT_PATHS.map((path, index) => (
                  <path key={index} d={path} fill="rgba(240,185,11,0.08)" stroke="rgba(240,185,11,0.08)" strokeWidth="0.2" />
                ))}

                {MERIDIAN_LONGITUDES.map((longitude) => (
                  <path key={`meridian-${longitude}`} d={buildGraticuleLine(longitude)} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.25" />
                ))}
                {PARALLEL_LATITUDES.map((latitude) => (
                  <path key={`parallel-${latitude}`} d={buildParallelArc(latitude)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.25" />
                ))}

                <line
                  x1={selectedLineStart.x}
                  y1={selectedLineStart.y}
                  x2={selectedLineEnd.x}
                  y2={selectedLineEnd.y}
                  stroke="rgba(240,185,11,0.65)"
                  strokeWidth="0.7"
                  strokeDasharray="1.6 1.2"
                />
              </g>

              {sortedExchanges.map((exchange) => {
                const point = projectPoint(exchange.mapLocation.latitude, exchange.mapLocation.longitude);
                const isSelected = exchange.id === selectedSourceId || exchange.id === selectedDestinationId;

                return (
                  <g key={exchange.id} transform={`translate(${point.x} ${point.y})`}>
                    {isSelected ? <circle r="2.7" fill="rgba(240,185,11,0.18)" stroke="rgba(240,185,11,0.55)" strokeWidth="0.25" /> : null}
                    <circle r={isSelected ? '1.65' : '1.2'} fill={markerFill(exchange.carfGroup)} stroke="rgba(12,14,18,0.95)" strokeWidth="0.4" />
                    <title>{`${exchange.name} · ${exchange.mapLocation.label} · ${formatTiming(exchange)}`}</title>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-dark-200 px-4 py-3 text-[11px] text-bnb-muted">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-bnb-green" />2027년 교환</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-brand-400" />2028년 교환</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-bnb-muted" />2029년 교환</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-bnb-red" />미가입 / 불명확</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded border border-dark-200 bg-dark-400/30" data-testid="selected-route-summary">
            <div className="border-b border-dark-200 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Route size={13} className="text-brand-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-bnb-muted">선택 경로 포커스</span>
              </div>
            </div>
            <div className="space-y-3 p-3">
              <SelectedExchangeCard exchange={selectedSource} label="출발 거래소" />
              <SelectedExchangeCard exchange={selectedDestination} label="도착 거래소" />
            </div>
          </div>

          <div className="rounded border border-dark-200 bg-dark-400/30">
            <div className="border-b border-dark-200 px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-bnb-muted">전체 거래소 위치와 CARF 시기</span>
            </div>
            <div className="max-h-[360px] divide-y divide-dark-200 overflow-auto">
              {sortedExchanges.map((exchange) => {
                const isSelected = exchange.id === selectedSourceId || exchange.id === selectedDestinationId;

                return (
                  <div
                    key={exchange.id}
                    className={`px-4 py-3 ${isSelected ? 'bg-brand-500/5' : 'bg-transparent'}`}
                    data-testid={isSelected ? `selected-exchange-${exchange.id}` : undefined}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-bnb-text">{exchange.name}</p>
                        <p className="mt-1 text-[11px] text-bnb-muted">{exchange.mapLocation.label} · {exchange.mapLocation.focusLabel}</p>
                      </div>
                      <span className={`shrink-0 rounded border border-current/20 px-2 py-0.5 text-[10px] font-semibold ${carfTone(exchange.carfGroup)}`}>
                        {CARF_GROUP_LABELS[exchange.carfGroup]}
                      </span>
                    </div>

                    <div className="mt-2 grid gap-2 text-[11px] text-bnb-muted md:grid-cols-2">
                      <p>
                        <span className="text-bnb-text">CARF 관할:</span> {exchange.registeredCountry}
                      </p>
                      <p>
                        <span className="text-bnb-text">적용 시기:</span> {formatTiming(exchange)}
                      </p>
                    </div>

                    {exchange.mapLocation.note ? (
                      <p className="mt-2 text-[11px] leading-relaxed text-bnb-muted">{exchange.mapLocation.note}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
