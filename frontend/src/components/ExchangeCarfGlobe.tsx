import { geoGraticule, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, MapPin, RotateCcw, Route } from 'lucide-react';

import { CARF_GROUP_LABELS, CarfGroup, ExchangeCarfInfo } from '../data/carfData';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import worldData from 'world-atlas/countries-110m.json';

// Pre-compute land feature once (topojson → geojson, expensive)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LAND_FEATURE = feature(worldData as any, (worldData as any).objects.land);

type Rotation = [number, number, number];

type ExchangeCarfGlobeProps = {
  exchanges: ExchangeCarfInfo[];
  selectedSourceId: string;
  selectedDestinationId: string;
};

const GLOBE_SIZE = 400;
const GLOBE_SCALE = 175;
const INITIAL_ROTATION: Rotation = [-80, -20, 0];

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

function formatTiming(exchange: ExchangeCarfInfo): string {
  const collection = exchange.carfDataCollectionStart
    ? `${exchange.carfDataCollectionStart} 수집`
    : '수집 시기 미정';
  const first = exchange.carfFirstExchange
    ? `${exchange.carfFirstExchange} 첫 교환`
    : '교환 일정 미정';
  return `${collection} · ${first}`;
}

/** 구면 법칙(코사인)으로 점이 현재 보이는 반구에 있는지 판별. */
function isOnFrontHemisphere(lng: number, lat: number, rotation: Rotation): boolean {
  const centerLng = -rotation[0];
  const centerLat = -rotation[1];
  const Δλ = (lng - centerLng) * (Math.PI / 180);
  const φc = centerLat * (Math.PI / 180);
  const φp = lat * (Math.PI / 180);
  return Math.sin(φc) * Math.sin(φp) + Math.cos(φc) * Math.cos(φp) * Math.cos(Δλ) > 0;
}

function SelectedExchangeCard({ exchange, label }: { exchange: ExchangeCarfInfo; label: string }) {
  return (
    <div className="border-t border-dark-200/50 px-3 py-2.5 first:border-t-0">
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

export function ExchangeCarfGlobe({
  exchanges,
  selectedSourceId,
  selectedDestinationId,
}: ExchangeCarfGlobeProps) {
  // rotationRef = source of truth (written by both RAF and pointer events)
  // rotation state = triggers re-render, only written by RAF loop once per frame
  const rotationRef = useRef<Rotation>(INITIAL_ROTATION);
  const [rotation, setRotation] = useState<Rotation>(INITIAL_ROTATION);
  const dirtyRef = useRef(false);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const autoRotateActive = useRef(true);
  const autoRotateTimer = useRef<ReturnType<typeof setTimeout>>();
  const animRef = useRef<number>();

  const selectedSource =
    exchanges.find((e) => e.id === selectedSourceId) ?? exchanges[0];
  const selectedDestination =
    exchanges.find((e) => e.id === selectedDestinationId) ?? exchanges[0];

  // Single RAF loop: drives both auto-rotation and drag rendering.
  // Pointer events only write to rotationRef (no setState), so React never
  // re-renders mid-drag. setState is called at most once per frame here.
  useEffect(() => {
    let lastTime = 0;

    const tick = (time: number) => {
      const elapsed = lastTime === 0 ? 16 : time - lastTime;
      lastTime = time;

      if (autoRotateActive.current) {
        // Frame-rate-independent step: 0.25 deg per 16ms reference frame
        const step = 0.25 * (elapsed / 16);
        const r = rotationRef.current;
        rotationRef.current = [r[0] - step, r[1], r[2]];
        dirtyRef.current = true;
      }

      if (dirtyRef.current) {
        setRotation([...rotationRef.current] as Rotation);
        dirtyRef.current = false;
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      isDragging.current = true;
      autoRotateActive.current = false;
      clearTimeout(autoRotateTimer.current);
      lastPos.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      // Only update the ref — RAF loop will commit to state next frame.
      // This prevents 60-120 setState calls per second during drag.
      const r = rotationRef.current;
      rotationRef.current = [
        r[0] - dx * 0.4,
        Math.max(-80, Math.min(80, r[1] + dy * 0.4)),
        r[2],
      ];
      dirtyRef.current = true;
    },
    [],
  );

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    clearTimeout(autoRotateTimer.current);
    autoRotateTimer.current = setTimeout(() => {
      autoRotateActive.current = true;
    }, 3000);
  }, []);

  const handleReset = useCallback(() => {
    rotationRef.current = [...INITIAL_ROTATION] as Rotation;
    setRotation(INITIAL_ROTATION);
    autoRotateActive.current = true;
  }, []);

  // Compute all globe paths and visible marker positions
  const { landPath, gratPath, arcPath, markers } = useMemo(() => {
    const projection = geoOrthographic()
      .scale(GLOBE_SCALE)
      .translate([GLOBE_SIZE / 2, GLOBE_SIZE / 2])
      .rotate(rotation)
      .clipAngle(90);

    const pathGen = geoPath(projection);
    const graticule = geoGraticule()();

    const srcLng = selectedSource.mapLocation.longitude;
    const srcLat = selectedSource.mapLocation.latitude;
    const dstLng = selectedDestination.mapLocation.longitude;
    const dstLat = selectedDestination.mapLocation.latitude;

    const arcInterp = geoInterpolate([srcLng, srcLat], [dstLng, dstLat]);
    const arcLine = {
      type: 'LineString' as const,
      coordinates: Array.from({ length: 64 }, (_, i) => arcInterp(i / 63)),
    };

    const visible = exchanges
      .map((exchange) => {
        const { longitude, latitude } = exchange.mapLocation;
        if (!isOnFrontHemisphere(longitude, latitude, rotation)) return null;
        const pt = projection([longitude, latitude]);
        if (!pt) return null;
        return { exchange, x: pt[0], y: pt[1] };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      // Render selected markers last so they appear on top
      .sort((a, b) => {
        const aSelected =
          a.exchange.id === selectedSourceId ||
          a.exchange.id === selectedDestinationId;
        const bSelected =
          b.exchange.id === selectedSourceId ||
          b.exchange.id === selectedDestinationId;
        return (aSelected ? 1 : 0) - (bSelected ? 1 : 0);
      });

    return {
      landPath: pathGen(LAND_FEATURE) ?? '',
      gratPath: pathGen(graticule) ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      arcPath: pathGen(arcLine as any) ?? '',
      markers: visible,
    };
  }, [
    rotation,
    exchanges,
    selectedSource,
    selectedDestination,
    selectedSourceId,
    selectedDestinationId,
  ]);

  const sortedExchanges = useMemo(
    () =>
      [...exchanges].sort((a, b) => {
        const aSelected =
          a.id === selectedSourceId || a.id === selectedDestinationId;
        const bSelected =
          b.id === selectedSourceId || b.id === selectedDestinationId;
        if (aSelected !== bSelected) return aSelected ? -1 : 1;
        return a.name.localeCompare(b.name, 'ko');
      }),
    [exchanges, selectedSourceId, selectedDestinationId],
  );

  return (
    <div className="border border-dark-200 bg-dark-500/40" data-testid="exchange-globe-section">
      <div className="border-b border-dark-200 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-bnb-muted">
          지구본 보기
        </span>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        {/* 3D Globe */}
        <div className="overflow-hidden rounded border border-dark-200 bg-[radial-gradient(circle_at_30%_30%,_rgba(240,185,11,0.08),_rgba(8,12,20,0.98)_70%)]">
          <div className="flex items-center justify-between border-b border-dark-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-bnb-text">
                지구본으로 보는 거래소 위치
              </h2>
              <p className="mt-0.5 text-[11px] text-bnb-muted">
                드래그하여 회전 · 3초 후 자동 회전 재개
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded border border-dark-200 bg-dark-400/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-bnb-muted transition-colors hover:border-brand-500/40 hover:text-brand-400"
            >
              <RotateCcw size={10} />
              초기화
            </button>
          </div>

          <div className="px-3 pb-3 pt-4">
            <svg
              viewBox={`0 0 ${GLOBE_SIZE} ${GLOBE_SIZE}`}
              className="mx-auto block aspect-square w-full max-w-[420px] cursor-grab select-none active:cursor-grabbing"
              role="img"
              aria-label="거래소 위치 지구본"
              data-testid="exchange-globe"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <defs>
                <radialGradient id="globe-sphere-grad" cx="38%" cy="32%" r="65%">
                  <stop offset="0%" stopColor="rgba(22,36,60,1)" />
                  <stop offset="55%" stopColor="rgba(10,16,28,0.99)" />
                  <stop offset="100%" stopColor="rgba(4,7,14,1)" />
                </radialGradient>
                <radialGradient id="globe-rim" cx="50%" cy="50%" r="50%">
                  <stop offset="82%" stopColor="transparent" />
                  <stop offset="100%" stopColor="rgba(240,185,11,0.12)" />
                </radialGradient>
                <clipPath id="globe-clip-3d">
                  <circle cx={GLOBE_SIZE / 2} cy={GLOBE_SIZE / 2} r={GLOBE_SCALE} />
                </clipPath>
              </defs>

              {/* Base sphere */}
              <circle
                cx={GLOBE_SIZE / 2}
                cy={GLOBE_SIZE / 2}
                r={GLOBE_SCALE}
                fill="url(#globe-sphere-grad)"
                stroke="rgba(240,185,11,0.18)"
                strokeWidth="1"
              />

              <g clipPath="url(#globe-clip-3d)">
                {/* Graticule grid */}
                {gratPath && (
                  <path
                    d={gratPath}
                    fill="none"
                    stroke="rgba(255,255,255,0.055)"
                    strokeWidth="0.5"
                  />
                )}

                {/* Land masses */}
                {landPath && (
                  <path
                    d={landPath}
                    fill="rgba(240,185,11,0.09)"
                    stroke="rgba(240,185,11,0.25)"
                    strokeWidth="0.5"
                  />
                )}

                {/* Great circle arc */}
                {arcPath && (
                  <path
                    d={arcPath}
                    fill="none"
                    stroke="rgba(240,185,11,0.80)"
                    strokeWidth="1.8"
                    strokeDasharray="5 3"
                    strokeLinecap="round"
                  />
                )}

                {/* Exchange markers */}
                {markers.map(({ exchange, x, y }) => {
                  const isSelected =
                    exchange.id === selectedSourceId ||
                    exchange.id === selectedDestinationId;
                  const fill = markerFill(exchange.carfGroup);
                  return (
                    <g key={exchange.id} transform={`translate(${x},${y})`}>
                      {isSelected && (
                        <>
                          <circle r={12} fill={`${fill}12`} />
                          <circle
                            r={8}
                            fill={`${fill}22`}
                            stroke={fill}
                            strokeWidth="0.5"
                            strokeOpacity="0.6"
                          />
                        </>
                      )}
                      <circle
                        r={isSelected ? 5.5 : 3.5}
                        fill={fill}
                        stroke="rgba(0,0,0,0.88)"
                        strokeWidth={isSelected ? 1.4 : 0.9}
                      />
                      <title>{`${exchange.name} · ${exchange.mapLocation.label} · ${formatTiming(exchange)}`}</title>
                    </g>
                  );
                })}
              </g>

              {/* Atmosphere rim */}
              <circle
                cx={GLOBE_SIZE / 2}
                cy={GLOBE_SIZE / 2}
                r={GLOBE_SCALE}
                fill="url(#globe-rim)"
                stroke="rgba(240,185,11,0.12)"
                strokeWidth="2"
                pointerEvents="none"
              />

              {/* Specular highlight */}
              <ellipse
                cx={GLOBE_SIZE / 2 - GLOBE_SCALE * 0.28}
                cy={GLOBE_SIZE / 2 - GLOBE_SCALE * 0.32}
                rx={GLOBE_SCALE * 0.18}
                ry={GLOBE_SCALE * 0.13}
                fill="rgba(255,255,255,0.045)"
                pointerEvents="none"
              />
            </svg>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-dark-200 px-4 py-3 text-[11px] text-bnb-muted">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-bnb-green" />
              2027년 교환
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-400" />
              2028년 교환
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-bnb-muted" />
              2029년 교환
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-bnb-red" />
              미가입 / 불명확
            </span>
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <div className="rounded border border-dark-200 bg-dark-400/30" data-testid="selected-route-summary">
            <div className="border-b border-dark-200 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Route size={13} className="text-brand-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-bnb-muted">
                  선택 경로 포커스
                </span>
              </div>
            </div>
            <div>
              <SelectedExchangeCard exchange={selectedSource} label="출발 거래소" />
              <SelectedExchangeCard exchange={selectedDestination} label="도착 거래소" />
            </div>
          </div>

          <div className="rounded border border-dark-200 bg-dark-400/30">
            <div className="border-b border-dark-200 px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-bnb-muted">
                전체 거래소 위치와 CARF 시기
              </span>
            </div>
            <div className="max-h-[360px] divide-y divide-dark-200 overflow-auto">
              {sortedExchanges.map((exchange) => {
                const isSelected =
                  exchange.id === selectedSourceId ||
                  exchange.id === selectedDestinationId;

                return (
                  <div
                    key={exchange.id}
                    className={`px-4 py-3 ${isSelected ? 'bg-brand-500/5' : 'bg-transparent'}`}
                    data-testid={isSelected ? `selected-exchange-${exchange.id}` : undefined}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-bnb-text">{exchange.name}</p>
                        <p className="mt-1 text-[11px] text-bnb-muted">
                          {exchange.mapLocation.label} · {exchange.mapLocation.focusLabel}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded border border-current/20 px-2 py-0.5 text-[10px] font-semibold ${carfTone(exchange.carfGroup)}`}
                      >
                        {CARF_GROUP_LABELS[exchange.carfGroup]}
                      </span>
                    </div>

                    <div className="mt-2 grid gap-2 text-[11px] text-bnb-muted md:grid-cols-2">
                      <p>
                        <span className="text-bnb-text">CARF 관할:</span>{' '}
                        {exchange.registeredCountry}
                      </p>
                      <p>
                        <span className="text-bnb-text">적용 시기:</span>{' '}
                        {formatTiming(exchange)}
                      </p>
                    </div>

                    {exchange.mapLocation.note ? (
                      <p className="mt-2 text-[11px] leading-relaxed text-bnb-muted">
                        {exchange.mapLocation.note}
                      </p>
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
