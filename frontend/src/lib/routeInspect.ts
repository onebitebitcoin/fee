export interface InspectResult {
  path_id: string;
  severity: 'ok' | 'warning' | 'error';
  issues: string[];
}

export interface InspectSummary {
  total: number;
  ok: number;
  warnings: number;
  errors: number;
}

export interface RouteInspectResponse {
  results: InspectResult[];
  summary: InspectSummary;
}

export async function fetchRouteInspect(amountKrw = 1_000_000): Promise<RouteInspectResponse> {
  const res = await fetch(`/api/v1/market/path-finder/inspect?amount_krw=${amountKrw}`);
  if (!res.ok) throw new Error(`경로 검사 실패: ${res.status}`);
  return res.json() as Promise<RouteInspectResponse>;
}
