// ── 마법사 진행 타임라인 순수 로직 ────────────────────────────────────────────
// 현재 phase까지 FLOW를 따라가며 "거쳐온 단계 + 각 단계에서 고른 값"을 만든다.
// 경로 분기(USDT / BTC 경유 / BTC 직접, 라이트닝 종착지 등)는 flow.ts FLOW가 단일 기준이므로
// 여기서 분기 규칙을 다시 쓰지 않고 flowNext()를 반복 적용해 실제 경로를 얻는다.

import type { PathMode } from '../../types';
import { fmtEx } from '../../lib/exchangeNames';
import { flowNext, flowStart, type CoinType, type Destination, type FlowState, type Phase } from './flow';

export interface TimelineSelection extends FlowState {
  domestic: string | null;
  global: string | null;
  network: string | null;
}

export interface TimelineStep {
  phase: Phase;
  label: string;             // 단계 이름 ('국내 거래소')
  value: string | null;      // 고른 값 ('업비트'), 미선택이면 null
  iconId: string | null;     // ExFavicon용 id (거래소·스왑 서비스만)
  state: 'done' | 'current' | 'upcoming';
}

/** 마법사 단계 라벨. input/recommendation은 마법사 이전이라 타임라인에 넣지 않는다. */
const PHASE_LABEL: Partial<Record<Phase, string>> = {
  domestic: '국내 거래소',
  coin: '이동 방식',
  btc_method: '출금 방식',
  global: '해외 거래소',
  network: '네트워크',
  global_exit_method: '해외 출금',
  destination: '종착지',
  swap_service: '스왑 서비스',
  result: '결과',
};

// 팔 때는 자금이 개인 지갑에서 거래소로 흐르므로, '출금'이라는 말이 방향을 거꾸로 읽히게 한다.
// 뜻이 달라지는 단계만 라벨을 덮어쓰고 나머지는 위 기본값을 쓴다.
const SELL_PHASE_LABEL: Partial<Record<Phase, string>> = {
  btc_method: '전송 방식',
  coin: '매도 경로',
};

function phaseLabel(phase: Phase, mode: PathMode): string {
  const override = mode === 'sell' ? SELL_PHASE_LABEL[phase] : undefined;
  return override ?? PHASE_LABEL[phase] ?? phase;
}

const COIN_LABEL: Record<CoinType, string> = {
  USDT: 'USDT 경유',
  BTC: 'BTC 직접',
  BTC_GLOBAL: 'BTC 경유',
};

// 팔 때의 매도 경로 선택값. BTC_GLOBAL 은 팔 때 존재하지 않지만 타입을 채우려고 둔다.
const SELL_COIN_LABEL: Record<CoinType, string> = {
  USDT: '해외 경유',
  BTC: '국내 직접',
  BTC_GLOBAL: 'BTC 경유',
};

const EXIT_LABEL: Record<string, string> = {
  onchain: '온체인',
  lightning: '라이트닝',
  none: '출금 안 함',
};

const DESTINATION_LABEL: Record<Destination, string> = {
  personal: '개인지갑',
  lightning_wallet: '라이트닝 지갑',
};

/** 현재 phase까지 실제로 거쳐온 단계 목록. FLOW를 따라가므로 분기 규칙 중복이 없다. */
export function timelinePhases(sel: TimelineSelection, current: Phase, mode: PathMode = 'buy'): Phase[] {
  if (!PHASE_LABEL[current]) return [];   // input/recommendation 등 마법사 밖
  const out: Phase[] = [];
  let phase: Phase = flowStart(mode);
  // FLOW 길이보다 넉넉한 상한 — 분기 오류로 인한 무한 루프 방지
  for (let i = 0; i < 12; i++) {
    out.push(phase);
    if (phase === current || phase === 'result') break;
    const next = flowNext(phase, sel, mode);
    if (next === phase) break;
    phase = next;
  }
  return out;
}

function valueFor(phase: Phase, sel: TimelineSelection, mode: PathMode): { value: string | null; iconId: string | null } {
  switch (phase) {
    case 'domestic':
      return { value: sel.domestic ? fmtEx(sel.domestic) : null, iconId: sel.domestic };
    case 'coin':
      return { value: sel.coin ? (mode === 'sell' ? SELL_COIN_LABEL : COIN_LABEL)[sel.coin] : null, iconId: null };
    case 'btc_method':
      return { value: sel.btcMethod ? EXIT_LABEL[sel.btcMethod] ?? sel.btcMethod : null, iconId: null };
    case 'global':
      return { value: sel.global ? fmtEx(sel.global) : null, iconId: sel.global };
    case 'network':
      return { value: sel.network, iconId: null };
    case 'global_exit_method':
      return { value: sel.globalExitMethod ? EXIT_LABEL[sel.globalExitMethod] ?? sel.globalExitMethod : null, iconId: null };
    case 'destination':
      return { value: sel.destination ? DESTINATION_LABEL[sel.destination] : null, iconId: null };
    case 'swap_service':
      return { value: sel.swapSvc ? fmtEx(sel.swapSvc) : null, iconId: sel.swapSvc };
    default:
      return { value: null, iconId: null };
  }
}

/** 타임라인 렌더 데이터. 현재 단계는 'current', 그 이전은 'done'. */
export function buildTimeline(sel: TimelineSelection, current: Phase, mode: PathMode = 'buy'): TimelineStep[] {
  return timelinePhases(sel, current, mode).map(phase => {
    const { value, iconId } = valueFor(phase, sel, mode);
    return {
      phase,
      label: phaseLabel(phase, mode),
      value,
      iconId,
      state: phase === current ? 'current' : 'done',
    };
  });
}
