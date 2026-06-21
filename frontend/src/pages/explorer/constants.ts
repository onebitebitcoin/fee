// ── 정적 데이터 · 타입 · 헬퍼 ─────────────────────────────────────────────────────
// 거래소 메타데이터, 위험도 라벨, 애니메이션 프리셋, 경로 계산 헬퍼.

import type { CheapestPathEntry, CheapestPathResponse, TickerRow } from '../../types';

export interface AllData {
  byGlobal: Record<string, CheapestPathResponse>;
  tickers: TickerRow[];
  latestRunAt: number | null;
}

export const GLOBAL_EXCHANGES = ['binance', 'okx', 'bybit', 'bitget', 'kraken', 'coinbase', 'gate'] as const;
export type GlobalExchange = typeof GLOBAL_EXCHANGES[number];

// ── 국내 거래소 정보 ──────────────────────────────────────────────────────────────

export interface DomesticInfo {
  bank: string;
  carf: number;
  country: string;
  url: string;
  lightning: boolean;
  // 온체인 출금 한도 (공개 정책 기준, 변경 가능)
  krw_per_tx_limit: number | null;  // 1회 KRW 환산 한도 (null=제한없음)
  btc_per_tx_max: number | null;    // 1회 최대 BTC (null=제한없음)
  btc_daily_verified: number;       // KYC 인증 완료 시 일일 BTC 한도
  personal_wallet_req: string;      // 개인 지갑 등록 요건 요약
  source_note: string;              // 정책 신뢰도/경고
}

export const DOMESTIC_INFO: Record<string, DomesticInfo> = {
  upbit: {
    bank: '케이뱅크', carf: 2027, country: '대한민국', url: 'https://upbit.com', lightning: false,
    krw_per_tx_limit: 1_000_000, btc_per_tx_max: null, btc_daily_verified: 100,
    personal_wallet_req: '업비트 앱 → 출금관리 → 외부지갑 등록 (화이트리스트)',
    source_note: '업비트 고객센터 공개 정보 기준 (레벨별 상이)',
  },
  bithumb: {
    bank: 'NH농협은행', carf: 2027, country: '대한민국', url: 'https://bithumb.com', lightning: false,
    krw_per_tx_limit: 1_000_000, btc_per_tx_max: 16, btc_daily_verified: 16,
    personal_wallet_req: '빗썸 앱 → 출금 → 개인지갑 사전 등록',
    source_note: '빗썸 공식 영문 고객지원 기준 (en.bithumb.com) — 1일 16 BTC 한도',
  },
  coinone: {
    bank: '신한은행', carf: 2027, country: '대한민국', url: 'https://coinone.co.kr', lightning: false,
    krw_per_tx_limit: 1_000_000, btc_per_tx_max: null, btc_daily_verified: 50,
    personal_wallet_req: '코인원 앱 → 자산 → 출금 → 주소록 등록',
    source_note: '코인원 공개 정보 기준 (추정, 실제 확인 권장)',
  },
  korbit: {
    bank: '우리은행', carf: 2027, country: '대한민국', url: 'https://korbit.co.kr', lightning: false,
    krw_per_tx_limit: null, btc_per_tx_max: 5, btc_daily_verified: 10,
    personal_wallet_req: '코빗 앱 → 출금 → 지갑 추가 (KYC 완료 필요)',
    source_note: '코빗: 1회 KRW 제한 없음으로 추정 (확인 권장)',
  },
  gopax: {
    bank: '전북은행', carf: 2027, country: '대한민국', url: 'https://gopax.co.kr', lightning: false,
    krw_per_tx_limit: 1_000_000, btc_per_tx_max: 2, btc_daily_verified: 5,
    personal_wallet_req: '고팍스 고객센터 확인 필요 (정책 불분명)',
    source_note: '⚠️ 추정치 — 고파이 사태 이후 정책 변동 가능, 반드시 확인',
  },
};

// ── 해외 거래소 정보 ──────────────────────────────────────────────────────────────

export interface GlobalInfo {
  country: string;
  carf: number;
  risk: 'low' | 'med' | 'high';
  fatca: boolean;
  url: string;
  lightning: boolean;
  vol24hB: number;  // 24H 거래량 (단위: 억 USD, 정적 참고값)
}

export const GLOBAL_INFO: Record<string, GlobalInfo> = {
  binance:  { country: 'UAE',    carf: 2028, risk: 'med',  fatca: false, url: 'https://binance.com',  lightning: true,  vol24hB: 200 },
  okx:      { country: '세이셸', carf: 2028, risk: 'low',  fatca: false, url: 'https://okx.com',      lightning: true,  vol24hB: 40  },
  bybit:    { country: 'UAE',    carf: 2028, risk: 'med',  fatca: false, url: 'https://bybit.com',    lightning: false, vol24hB: 30  },
  bitget:   { country: '세이셸', carf: 2028, risk: 'low',  fatca: false, url: 'https://bitget.com',   lightning: false, vol24hB: 10  },
  kraken:   { country: '미국',   carf: 2028, risk: 'med',  fatca: true,  url: 'https://kraken.com',   lightning: false, vol24hB: 5   },
  coinbase: { country: '미국',   carf: 2028, risk: 'high', fatca: true,  url: 'https://coinbase.com', lightning: false, vol24hB: 15  },
  gate:     { country: '파나마', carf: 2028, risk: 'med',  fatca: false, url: 'https://gate.io',       lightning: false, vol24hB: 25  },
};

export const RISK_LABEL: Record<string, string> = { low: '낮음', med: '중간', high: '높음' };
export const RISK_COLOR: Record<string, string> = {
  low:  'text-acc-green bg-acc-green/10',
  med:  'text-acc-amber bg-acc-amber/10',
  high: 'text-acc-red bg-acc-red/10',
};

// ── 애니메이션 프리셋 ─────────────────────────────────────────────────────────────

export const SPRING_FAST = { type: 'spring', stiffness: 480, damping: 30 } as const;
export const SPRING_SLOW = { type: 'spring', stiffness: 300, damping: 28 } as const;

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────────

export function bestByFee(paths: CheapestPathEntry[]): CheapestPathEntry | null {
  if (!paths.length) return null;
  return paths.reduce((a, b) => {
    const af = a.total_fee_krw ?? Infinity;
    const bf = b.total_fee_krw ?? Infinity;
    if (af !== bf) return af < bf ? a : b;
    return (a.btc_received ?? 0) > (b.btc_received ?? 0) ? a : b;
  });
}

export function fmtKst(ts: number | null): string {
  if (!ts) return '–';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(ts * 1000));
}

// BTC amount_text → sats when value is tiny (e.g. "1e-06 BTC" → "100 sats")
export function fmtAmountText(text: string | null | undefined): string | null {
  if (!text) return null;
  // "X BTC" 또는 "X BTC (N회)" 형태 → sats 변환, 접미사는 유지
  const m = text.match(/^([0-9.e+\-]+)\s*BTC(\s*\(.+\))?$/i);
  if (m) {
    const btc = parseFloat(m[1]);
    if (!isNaN(btc) && btc < 0.001) {
      const suffix = m[2] ? ` ${m[2].trim()}` : '';
      return `${Math.round(btc * 1e8)} sats${suffix}`;
    }
  }
  return text;
}
