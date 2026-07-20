// ── 마법사 진행 타임라인 순수 로직 ────────────────────────────────────────────
// 현재 phase까지 FLOW를 따라가며 "거쳐온 단계 + 각 단계에서 고른 값"을 만든다.
// 경로 분기(USDT / BTC 경유 / BTC 직접, 라이트닝 종착지 등)는 flow.ts FLOW가 단일 기준이므로
// 여기서 분기 규칙을 다시 쓰지 않고 flowNext()를 반복 적용해 실제 경로를 얻는다.

import { fmtEx } from '../../lib/exchangeNames';
import { flowNext, type CoinType, type Destination, type FlowState, type Phase } from './flow';

export interface TimelineSelection extends FlowState {
  domestic: string | null;
  global: string | null;
  network: string | null;
  btcMethod: 'onchain' | 'lightning' | null;
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

const COIN_LABEL: Record<CoinType, string> = {
  USDT: 'USDT 경유',
  BTC: 'BTC 직접',
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
export function timelinePhases(sel: TimelineSelection, current: Phase): Phase[] {
  if (!PHASE_LABEL[current]) return [];   // input/recommendation 등 마법사 밖
  const out: Phase[] = [];
  let phase: Phase = 'domestic';
  // FLOW 길이보다 넉넉한 상한 — 분기 오류로 인한 무한 루프 방지
  for (let i = 0; i < 12; i++) {
    out.push(phase);
    if (phase === current || phase === 'result') break;
    const next = flowNext(phase, sel);
    if (next === phase) break;
    phase = next;
  }
  return out;
}

function valueFor(phase: Phase, sel: TimelineSelection): { value: string | null; iconId: string | null } {
  switch (phase) {
    case 'domestic':
      return { value: sel.domestic ? fmtEx(sel.domestic) : null, iconId: sel.domestic };
    case 'coin':
      return { value: sel.coin ? COIN_LABEL[sel.coin] : null, iconId: null };
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
export function buildTimeline(sel: TimelineSelection, current: Phase): TimelineStep[] {
  return timelinePhases(sel, current).map(phase => {
    const { value, iconId } = valueFor(phase, sel);
    return {
      phase,
      label: PHASE_LABEL[phase] ?? phase,
      value,
      iconId,
      state: phase === current ? 'current' : 'done',
    };
  });
}
