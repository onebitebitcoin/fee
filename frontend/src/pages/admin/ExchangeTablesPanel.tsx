import { EditCell } from './adminHelpers';
import type { KoreanExchangeNode, GlobalExchangeNode } from '../../lib/adminSettings';
import type { GateLevel, GateItem } from '../../lib/gatemanRegistry';

const LEVEL_CFG: Record<GateLevel, { badge: string; label: string }> = {
  required:    { badge: 'bg-acc-red/10 text-acc-red',     label: '필수' },
  conditional: { badge: 'bg-acc-amber/10 text-acc-amber', label: '조건부' },
  info:        { badge: 'bg-acc-blue/10 text-acc-blue',   label: '참고' },
};

function GateSection({ gates }: { gates: GateItem[] }) {
  if (!gates || gates.length === 0) return null;
  return (
    <div className="mt-3 pt-3 border-t border-sys-separator space-y-1.5">
      {gates.map((g, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 font-medium ${LEVEL_CFG[g.level]?.badge ?? ''}`}>
            {LEVEL_CFG[g.level]?.label ?? g.level}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] text-label-primary leading-snug">{g.label}</p>
            {g.condition && (
              <p className="text-[10px] text-label-tertiary">{g.condition}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function NodeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-sys-separator last:border-0">
      <span className="text-[11px] text-label-tertiary flex-shrink-0">{label}</span>
      <div className="text-[11px] text-label-primary text-right flex items-center gap-0.5">{children}</div>
    </div>
  );
}

export function KoreanExchangeCards({
  nodes, gates, onChange,
}: {
  nodes: KoreanExchangeNode[];
  gates: Record<string, GateItem[]>;
  onChange: (nodes: KoreanExchangeNode[]) => void;
}) {
  function update(idx: number, patch: Partial<KoreanExchangeNode>) {
    onChange(nodes.map((n, i) => i === idx ? { ...n, ...patch } : n));
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {nodes.map((node, i) => (
        <div key={node.id} className="ios-card rounded-2xl p-4">
          <p className="text-sm font-bold text-label-primary mb-3">{node.name}</p>
          <div>
            <NodeRow label="거래 수수료">
              <EditCell value={node.takerFeePct} type="number" onSave={v => update(i, { takerFeePct: Number(v) })} />
              <span className="text-label-tertiary text-[10px]">%</span>
            </NodeRow>
            <NodeRow label="1회 KRW 제한">
              <EditCell value={node.perTxKrwLimit} type="number" nullable onSave={v => update(i, { perTxKrwLimit: v === null ? null : Number(v) })} />
            </NodeRow>
            <NodeRow label="일일 BTC 한도">
              <EditCell value={node.dailyBtcLimitVerified} type="number" nullable onSave={v => update(i, { dailyBtcLimitVerified: v === null ? null : Number(v) })} />
              {node.dailyBtcLimitVerified !== null && <span className="text-label-tertiary text-[10px]">BTC</span>}
            </NodeRow>
            <NodeRow label="개인지갑 등록">
              <EditCell value={node.personalWalletNote} onSave={v => update(i, { personalWalletNote: String(v ?? '') })} />
            </NodeRow>
            {node.notes ? (
              <NodeRow label="비고">
                <EditCell value={node.notes} onSave={v => update(i, { notes: String(v ?? '') })} />
              </NodeRow>
            ) : null}
          </div>
          <GateSection gates={gates[node.id] ?? []} />
        </div>
      ))}
    </div>
  );
}

export function GlobalExchangeCards({
  nodes, gates, onChange,
}: {
  nodes: GlobalExchangeNode[];
  gates: Record<string, GateItem[]>;
  onChange: (nodes: GlobalExchangeNode[]) => void;
}) {
  function update(idx: number, patch: Partial<GlobalExchangeNode>) {
    onChange(nodes.map((n, i) => i === idx ? { ...n, ...patch } : n));
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {nodes.map((node, i) => (
        <div key={node.id} className="ios-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-label-primary">{node.name}</p>
            <button
              onClick={() => update(i, { fatca: !node.fatca })}
              className={`text-[9px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                node.fatca
                  ? 'bg-acc-red/10 text-acc-red'
                  : 'bg-fill-secondary text-label-disabled hover:text-label-tertiary'
              }`}
            >
              FATCA {node.fatca ? '대상' : '비대상'}
            </button>
          </div>
          <div>
            <NodeRow label="국가">
              <EditCell value={node.country} onSave={v => update(i, { country: String(v ?? '') })} />
            </NodeRow>
            <NodeRow label="CARF 시행">
              <EditCell value={node.carfYear} type="number" nullable onSave={v => update(i, { carfYear: v === null ? null : Number(v) })} />
              {node.carfYear && <span className="text-label-tertiary text-[10px]">년</span>}
            </NodeRow>
            <NodeRow label="거래 수수료">
              <EditCell value={node.takerFeePct} type="number" onSave={v => update(i, { takerFeePct: Number(v) })} />
              <span className="text-label-tertiary text-[10px]">%</span>
            </NodeRow>
            {node.notes ? (
              <NodeRow label="비고">
                <EditCell value={node.notes} onSave={v => update(i, { notes: String(v ?? '') })} />
              </NodeRow>
            ) : null}
          </div>
          <GateSection gates={gates[node.id] ?? []} />
        </div>
      ))}
    </div>
  );
}

export function EdgePropertiesSection() {
  const sourceCls = (s: string) =>
    s === '크롤링'      ? 'bg-acc-blue/10 text-acc-blue'   :
    s === '어드민 설정' ? 'bg-acc-amber/10 text-acc-amber' :
                          'bg-fill-secondary text-label-tertiary';

  const sections = [
    {
      title: '국내 USDT 출금 엣지', color: 'blue',
      props: [
        { name: 'fee',            desc: '출금 수수료 (USDT)',   source: '크롤링' },
        { name: 'network',        desc: 'TRC20, ERC20 등',     source: '크롤링' },
        { name: 'min_withdrawal', desc: '최소 출금량',          source: '크롤링' },
        { name: 'enabled',        desc: '출금 활성 여부',       source: '크롤링' },
      ],
    },
    {
      title: '국내 BTC 출금 엣지 (개인 지갑)', color: 'amber',
      props: [
        { name: 'fee',           desc: '출금 수수료 (BTC)',     source: '크롤링' },
        { name: 'network',       desc: '비트코인, 라이트닝 등', source: '크롤링' },
        { name: 'perTxKrwLimit', desc: '1회 KRW 출금 제한',    source: '어드민 설정' },
        { name: 'dailyBtcLimit', desc: '일일 BTC 한도',         source: '어드민 설정' },
      ],
    },
    {
      title: '국내 BTC → 해외 경유 엣지', color: 'green',
      props: [
        { name: 'koreanFee',  desc: '국내 BTC 출금 수수료',            source: '크롤링' },
        { name: 'globalFee',  desc: '해외 BTC 재출금 수수료',          source: '크롤링' },
        { name: 'perTxLimit', desc: '1회 KRW 제한 없음 (거래소 주소)', source: '규정' },
      ],
    },
    {
      title: '해외 BTC 출금 엣지', color: 'neutral',
      props: [
        { name: 'fee',     desc: '출금 수수료 (BTC)', source: '크롤링' },
        { name: 'network', desc: '전송 네트워크',     source: '크롤링' },
        { name: 'enabled', desc: '출금 활성 여부',    source: '크롤링' },
      ],
    },
  ];

  const dotCls = (c: string) =>
    c === 'blue'  ? 'bg-acc-blue'  :
    c === 'amber' ? 'bg-acc-amber' :
    c === 'green' ? 'bg-acc-green' : 'bg-label-disabled';

  return (
    <div className="space-y-3">
      <p className="text-xs text-label-tertiary">수수료는 실시간 크롤 데이터. 아래는 각 엣지 속성 정의입니다.</p>
      {sections.map(sec => (
        <div key={sec.title} className="ios-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls(sec.color)}`} />
            <span className="text-xs font-semibold text-label-primary">{sec.title}</span>
          </div>
          <div className="space-y-2">
            {sec.props.map(p => (
              <div key={p.name} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] font-mono text-acc-amber block">{p.name}</span>
                  <span className="text-[11px] text-label-secondary">{p.desc}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${sourceCls(p.source)}`}>
                  {p.source}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
