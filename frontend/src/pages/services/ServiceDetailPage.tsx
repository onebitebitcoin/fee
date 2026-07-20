import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowSquareOut, CircleNotch, Lightning, Warning } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import { getExchangeDomain, getLightningServiceInfo } from '../../lib/exchangeNames';
import { getDomesticGates, getGlobalGates, type GateItem, type GateLevel } from '../../lib/gatemanRegistry';
import { BoardLayout } from '../board/BoardLayout';
import { ExFavicon, Chip, SectionLabel } from '../explorer/ui';
import { DOMESTIC_INFO, GLOBAL_INFO, RISK_LABEL, RISK_COLOR } from '../explorer/constants';
import type { ServiceNode } from './serviceDirectory';
import { SERVICE_TYPE_LABEL } from './serviceDirectory';
import { useServiceNodes } from './useServiceNodes';

const KYC_META: Record<string, { text: string; color: 'red' | 'green' | 'amber'; desc: string }> = {
  kyc: { text: 'KYC 필요', color: 'red', desc: '본인 인증(신원 확인)이 필요한 서비스입니다.' },
  non_kyc: { text: 'KYC 불필요', color: 'green', desc: '본인 인증 없이 사용할 수 있습니다.' },
  mixed: { text: 'KYC 조건부', color: 'amber', desc: '조건(금액·기능)에 따라 본인 인증이 필요할 수 있습니다.' },
};

const GATE_LEVEL_META: Record<GateLevel, { label: string; color: 'red' | 'amber' | 'blue' }> = {
  required: { label: '필수', color: 'red' },
  conditional: { label: '조건부', color: 'amber' },
  info: { label: '참고', color: 'blue' },
};

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ios-card rounded-2xl px-4 py-3.5">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}

function InfoRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-xs text-label-tertiary shrink-0">{k}</span>
      <span className="text-xs text-label-primary text-right">{v}</span>
    </div>
  );
}

function fmtSats(v: number | null | undefined): string | null {
  if (v == null) return null;
  return `${v.toLocaleString()} sats`;
}

export default function ServiceDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { nodes, loading, error } = useServiceNodes();
  const [gates, setGates] = useState<GateItem[] | null>(null);

  const node: ServiceNode | undefined = nodes.find(n => n.id === id.toLowerCase());

  // 게이트맨 레지스트리 (거래소만) — live 우선, 실패 시 정적 폴백
  useEffect(() => {
    if (!node || node.type === 'lightning') return;
    let cancelled = false;
    (async () => {
      let live: Record<string, GateItem[]> | undefined;
      try {
        const reg = await api.getGatemanRegistry();
        const data = reg.data as { domestic?: Record<string, GateItem[]>; global?: Record<string, GateItem[]> };
        live = node.type === 'domestic' ? data.domestic : data.global;
      } catch {
        live = undefined;
      }
      if (cancelled) return;
      setGates(node.type === 'domestic' ? getDomesticGates(node.id, live) : getGlobalGates(node.id, live));
    })();
    return () => { cancelled = true; };
  }, [node]);

  if (loading) {
    return (
      <BoardLayout title="서비스 정보" onBack={() => navigate('/services')}>
        <div className="ios-card rounded-2xl py-10 flex flex-col items-center gap-2">
          <CircleNotch className="w-5 h-5 text-label-tertiary animate-spin" />
          <p className="text-xs text-label-tertiary">서비스 정보 불러오는 중…</p>
        </div>
      </BoardLayout>
    );
  }

  if (error || !node) {
    return (
      <BoardLayout title="서비스 정보" onBack={() => navigate('/services')}>
        <div className="ios-card rounded-2xl px-4 py-8 text-center space-y-3">
          <p className="text-sm text-label-secondary">{error ?? '서비스를 찾을 수 없어요'}</p>
          <button
            onClick={() => navigate('/services')}
            className="text-xs font-semibold text-acc-amber"
          >
            서비스 목록으로
          </button>
        </div>
      </BoardLayout>
    );
  }

  const domesticInfo = node.type === 'domestic' ? DOMESTIC_INFO[node.id] : null;
  const globalInfo = node.type === 'global' ? GLOBAL_INFO[node.id] : null;
  const lnInfo = node.type === 'lightning' ? getLightningServiceInfo(node.id) : null;
  const kyc = node.kycStatus ? KYC_META[node.kycStatus] : null;
  const domain = getExchangeDomain(node.id);
  const url = domesticInfo?.url ?? globalInfo?.url ?? (domain ? `https://${domain}` : null);
  const wdRows = (node.statusNode?.withdrawal_rows ?? []).filter(r => r.coin === 'BTC' || r.coin === 'USDT');
  const notices = node.statusNode?.notices ?? [];
  const carf = node.carf;

  return (
    <BoardLayout title="서비스 정보" onBack={() => navigate('/services')}>
      {/* 개요 */}
      <div className="ios-card rounded-2xl px-4 py-4">
        <div className="flex items-center gap-3">
          <ExFavicon id={node.id} size={36} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-label-primary">{node.name}</h1>
              <span className="text-[10px] text-label-tertiary bg-fill-secondary px-1.5 py-0.5 rounded-md">
                {SERVICE_TYPE_LABEL[node.type]}
              </span>
            </div>
            {url && (
              <a
                href={url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-acc-blue flex items-center gap-0.5 mt-0.5"
              >
                {url.replace('https://', '')} <ArrowSquareOut className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </div>
        {lnInfo && <p className="text-xs text-label-secondary mt-3">{lnInfo.description}</p>}
        <div className="mt-3 space-y-0.5">
          {domesticInfo && (
            <>
              <InfoRow k="국가" v={domesticInfo.country} />
              <InfoRow k="제휴 은행" v={domesticInfo.bank} />
            </>
          )}
          {globalInfo && (
            <>
              <InfoRow k="등록 국가" v={carf?.registeredCountry ?? globalInfo.country} />
              <InfoRow
                k="위험도"
                v={
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${RISK_COLOR[globalInfo.risk]}`}>
                    {RISK_LABEL[globalInfo.risk]}
                  </span>
                }
              />
            </>
          )}
        </div>
      </div>

      {/* 유의 (있을 때만) */}
      {node.caution && (
        <div className="ios-card rounded-2xl px-4 py-3.5 border border-acc-red/30">
          <div className="flex items-center gap-1.5">
            <Warning className="w-4 h-4 text-acc-red" weight="bold" />
            <span className="text-sm font-bold text-acc-red">유의 서비스</span>
          </div>
          {node.cautionReason && (
            <p className="text-xs text-label-secondary mt-1.5">{node.cautionReason}</p>
          )}
        </div>
      )}

      {/* KYC */}
      <Card label="KYC (본인 인증)">
        {kyc ? (
          <div className="flex items-start gap-2">
            <Chip color={kyc.color}>{kyc.text}</Chip>
            <p className="text-xs text-label-secondary flex-1">{kyc.desc}</p>
          </div>
        ) : (
          <p className="text-xs text-label-tertiary">KYC 정보가 수집되지 않았어요</p>
        )}
        {lnInfo && lnInfo.tags.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {lnInfo.tags.map(t => <Chip key={t} color="neutral">{t}</Chip>)}
          </div>
        )}
      </Card>

      {/* 라이트닝 */}
      <Card label="라이트닝 네트워크">
        {node.type === 'lightning' ? (
          node.swapFee ? (
            <div className="space-y-0.5">
              <InfoRow k="스왑 수수료율" v={node.swapFee.fee_pct != null ? `${node.swapFee.fee_pct}%` : '미수집'} />
              {fmtSats(node.swapFee.fee_fixed_sat) && <InfoRow k="고정 수수료" v={fmtSats(node.swapFee.fee_fixed_sat)} />}
              {fmtSats(node.swapFee.min_amount_sat) && <InfoRow k="최소 금액" v={fmtSats(node.swapFee.min_amount_sat)} />}
              {fmtSats(node.swapFee.max_amount_sat) && <InfoRow k="최대 금액" v={fmtSats(node.swapFee.max_amount_sat)} />}
              <InfoRow k="상태" v={node.swapFee.enabled ? '정상' : '중단'} />
              {node.swapFee.source_url && (
                <InfoRow
                  k="출처"
                  v={
                    <a href={node.swapFee.source_url} target="_blank" rel="noopener noreferrer" className="text-acc-blue flex items-center gap-0.5">
                      바로가기 <ArrowSquareOut className="w-2.5 h-2.5" />
                    </a>
                  }
                />
              )}
            </div>
          ) : (
            <p className="text-xs text-label-tertiary">실시간 스왑 수수료가 수집되지 않았어요</p>
          )
        ) : (
          <div className="flex items-center gap-2">
            <Lightning className={`w-4 h-4 ${node.lightning ? 'text-acc-amber' : 'text-label-quaternary'}`} weight="fill" />
            <p className="text-xs text-label-secondary">
              {node.lightning ? '라이트닝 출금을 지원합니다' : '라이트닝 출금을 지원하지 않습니다'}
            </p>
          </div>
        )}
      </Card>

      {/* CARF / 규제 (거래소만) */}
      {node.type !== 'lightning' && (
        <Card label="CARF · 규제">
          <div className="space-y-0.5">
            <InfoRow
              k="CARF 첫 정보교환"
              v={carf?.carfFirstExchange ?? (domesticInfo ? `${domesticInfo.carf}년` : globalInfo ? `${globalInfo.carf}년` : '정보 없음')}
            />
            {carf?.carfDataCollectionStart && <InfoRow k="정보수집 시작" v={carf.carfDataCollectionStart} />}
            {carf?.koreaService && <InfoRow k="한국 서비스" v={carf.koreaService} />}
            {carf?.travelRuleKorea && <InfoRow k="트래블룰(한국)" v={carf.travelRuleKorea} />}
            {carf?.koreaImpact && <p className="text-xs text-label-secondary mt-2">{carf.koreaImpact}</p>}
            {carf?.travelRuleNote && <p className="text-[11px] text-label-tertiary mt-1">{carf.travelRuleNote}</p>}
          </div>
        </Card>
      )}

      {/* 출금 수수료 (BTC/USDT) */}
      {wdRows.length > 0 && (
        <Card label="출금 수수료">
          <div className="overflow-x-auto scrollbar-none">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-label-tertiary text-left">
                  <th className="font-medium py-1 pr-3">코인</th>
                  <th className="font-medium py-1 pr-3">네트워크</th>
                  <th className="font-medium py-1 pr-3 text-right">수수료</th>
                  <th className="font-medium py-1 text-right">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sys-separator">
                {wdRows.map((r, i) => (
                  <tr key={i} className="text-label-primary">
                    <td className="py-1.5 pr-3 font-medium">{r.coin}</td>
                    <td className="py-1.5 pr-3 text-label-secondary">{r.network_label}</td>
                    <td className="py-1.5 pr-3 text-right num">
                      {r.fee_pct != null
                        ? `${r.fee_pct}%`
                        : r.fee != null ? `${r.fee} ${r.coin}` : '미수집'}
                    </td>
                    <td className="py-1.5 text-right">
                      <span className={r.enabled ? 'text-acc-green' : 'text-acc-red'}>
                        {r.enabled ? '정상' : '중단'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 출금 한도 (국내만) */}
      {domesticInfo && (
        <Card label="출금 한도">
          <div className="space-y-0.5">
            <InfoRow
              k="1회 한도 (KRW 환산)"
              v={domesticInfo.krw_per_tx_limit ? `₩${domesticInfo.krw_per_tx_limit.toLocaleString()}` : '제한 없음'}
            />
            <InfoRow
              k="1회 최대 BTC"
              v={domesticInfo.btc_per_tx_max != null ? `${domesticInfo.btc_per_tx_max} BTC` : '제한 없음'}
            />
            <InfoRow k="일일 한도 (KYC 완료)" v={`${domesticInfo.btc_daily_verified} BTC`} />
            <InfoRow k="개인지갑 등록" v={domesticInfo.personal_wallet_req} />
          </div>
          <p className="text-[11px] text-label-tertiary mt-2">{domesticInfo.source_note}</p>
        </Card>
      )}

      {/* 출금 규칙 (게이트맨) */}
      {gates && gates.length > 0 && (
        <Card label="출금 규칙">
          <div className="space-y-2.5">
            {gates.map((g, i) => {
              const meta = GATE_LEVEL_META[g.level];
              return (
                <div key={i}>
                  <div className="flex items-center gap-1.5">
                    <Chip color={meta.color}>{meta.label}</Chip>
                    <span className="text-xs font-semibold text-label-primary">{g.label}</span>
                  </div>
                  <p className="text-[11px] text-label-secondary mt-0.5">{g.desc}</p>
                  {g.source && <p className="text-[10px] text-label-quaternary mt-0.5">{g.source}</p>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 공지사항 */}
      {notices.length > 0 && (
        <Card label="관련 공지사항">
          <div className="space-y-2">
            {notices.map((n, i) => (
              <div key={i}>
                {n.url ? (
                  <a
                    href={n.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-acc-blue flex items-start gap-1"
                  >
                    <span className="flex-1">{n.title}</span>
                    <ArrowSquareOut className="w-3 h-3 shrink-0 mt-0.5" />
                  </a>
                ) : (
                  <p className="text-xs text-label-secondary">{n.title}</p>
                )}
                {n.published_at && (
                  <p className="text-[10px] text-label-quaternary mt-0.5">
                    {new Date(n.published_at * 1000).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </BoardLayout>
  );
}
