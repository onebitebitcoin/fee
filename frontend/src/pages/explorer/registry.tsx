// ── Step Registry ──────────────────────────────────────────────────────────────
// phase → 렌더할 단계 컴포넌트 + 모션 래퍼 className 매핑.
// 새 단계 추가: steps/XStep.tsx 작성 → 여기 등록 → flow.ts의 FLOW에 끼워넣기.

import type { FC } from 'react';
import type { Phase } from './flow';
import { InputStep } from './steps/InputStep';
import { RecommendationStep } from './steps/RecommendationStep';
import { DomesticStep } from './steps/DomesticStep';
import { CoinStep } from './steps/CoinStep';
import { BtcMethodStep } from './steps/BtcMethodStep';
import { GlobalStep } from './steps/GlobalStep';
import { GlobalExitMethodStep } from './steps/GlobalExitMethodStep';
import { NetworkStep } from './steps/NetworkStep';
import { DestinationStep } from './steps/DestinationStep';
import { SwapServiceStep } from './steps/SwapServiceStep';
import { ResultStep } from './steps/ResultStep';

export interface StepEntry {
  Component: FC;
  className?: string;  // 모션 래퍼에 적용할 클래스
}

export const STEP_REGISTRY: Record<Phase, StepEntry> = {
  input:              { Component: InputStep,            className: 'space-y-3 pt-1' },
  recommendation:     { Component: RecommendationStep,   className: 'space-y-4 pt-2' },
  domestic:           { Component: DomesticStep,         className: 'space-y-4 pt-2' },
  coin:               { Component: CoinStep,             className: 'space-y-4 pt-2' },
  btc_method:         { Component: BtcMethodStep,        className: 'space-y-4 pt-2' },
  global:             { Component: GlobalStep,           className: 'space-y-4 pt-2' },
  network:            { Component: NetworkStep,          className: 'space-y-4 pt-2' },
  global_exit_method: { Component: GlobalExitMethodStep, className: 'space-y-4 pt-2' },
  destination:        { Component: DestinationStep,      className: 'space-y-4 pt-2' },
  swap_service:       { Component: SwapServiceStep,      className: 'space-y-4 pt-2' },
  result:             { Component: ResultStep,           className: 'space-y-5 pt-2' },
};
