// 추천 경로/결과 화면의 "제보하기" 링크 → 게시판 글쓰기 프리필 템플릿 빌더.

export interface ReportContext {
  koreanExchange?: string | null;
  globalExchange?: string | null;
  coin?: string | null;
  network?: string | null;
  amountKrw?: number | null;
  feeText?: string | null;
}

const REPORT_PARAM_KEYS = ['kx', 'gx', 'coin', 'net', 'amt', 'fee'] as const;

/** ReportContext → 글쓰기 화면으로 넘길 쿼리스트링 (template=report 포함) */
export function buildReportQuery(ctx: ReportContext): string {
  const qs = new URLSearchParams({ template: 'report' });
  if (ctx.koreanExchange) qs.set('kx', ctx.koreanExchange);
  if (ctx.globalExchange) qs.set('gx', ctx.globalExchange);
  if (ctx.coin) qs.set('coin', ctx.coin);
  if (ctx.network) qs.set('net', ctx.network);
  if (ctx.amountKrw != null) qs.set('amt', String(ctx.amountKrw));
  if (ctx.feeText) qs.set('fee', ctx.feeText);
  return qs.toString();
}

/** 쿼리 파라미터(URLSearchParams)에서 ReportContext 복원 */
export function parseReportContext(params: URLSearchParams): ReportContext {
  const amt = params.get('amt');
  return {
    koreanExchange: params.get('kx'),
    globalExchange: params.get('gx'),
    coin: params.get('coin'),
    network: params.get('net'),
    amountKrw: amt != null && amt !== '' ? Number(amt) : null,
    feeText: params.get('fee'),
  };
}

/** ReportContext → 게시글 제목/본문 프리필 텍스트 */
export function buildReportTemplate(ctx: ReportContext): { title: string; content: string } {
  const routeParts: string[] = [];
  if (ctx.koreanExchange) routeParts.push(ctx.koreanExchange);
  if (ctx.globalExchange) routeParts.push(ctx.globalExchange);
  const routeLabel = routeParts.length ? routeParts.join(' → ') : '(경로 미지정)';

  const coinNet = [ctx.coin, ctx.network].filter(Boolean).join(', ');
  const amountLine =
    ctx.amountKrw != null && !Number.isNaN(ctx.amountKrw)
      ? `${ctx.amountKrw.toLocaleString('ko-KR')}원`
      : '(금액 미지정)';

  const lines = [
    `- 경로: ${routeLabel}${coinNet ? ` (${coinNet})` : ''}`,
    `- 금액: ${amountLine}`,
  ];
  if (ctx.feeText) lines.push(`- 표시된 수수료: ${ctx.feeText}`);
  lines.push('', '■ 문제점', '(여기에 작성해 주세요)', '', '■ 의견', '(여기에 작성해 주세요)');

  return {
    title: `[제보] ${routeLabel} 경로 관련`,
    content: lines.join('\n'),
  };
}

export const isReportTemplate = (params: URLSearchParams): boolean =>
  params.get('template') === 'report';

export { REPORT_PARAM_KEYS };
