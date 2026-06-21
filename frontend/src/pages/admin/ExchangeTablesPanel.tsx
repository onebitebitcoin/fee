import { EditCell, FieldRow } from './adminHelpers';
import type { KoreanExchangeNode, GlobalExchangeNode } from '../../lib/adminSettings';

export function KoreanExchangeTable({
  nodes, onChange,
}: {
  nodes: KoreanExchangeNode[];
  onChange: (nodes: KoreanExchangeNode[]) => void;
}) {
  function update(idx: number, patch: Partial<KoreanExchangeNode>) {
    onChange(nodes.map((n, i) => i === idx ? { ...n, ...patch } : n));
  }

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-sys-separator">
              {['거래소', '거래 수수료 (%)', '1회 KRW 제한', '일일 BTC 한도', '개인지갑 요건', '비고'].map(h => (
                <th key={h} className="text-left py-2 px-3 text-label-tertiary font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nodes.map((node, i) => (
              <tr key={node.id} className="border-b border-sys-separator hover:bg-fill-primary transition-colors">
                <td className="py-2.5 px-3 font-semibold text-label-primary">{node.name}</td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.takerFeePct} type="number" onSave={v => update(i, { takerFeePct: Number(v) })} /></td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.perTxKrwLimit} type="number" nullable onSave={v => update(i, { perTxKrwLimit: v === null ? null : Number(v) })} /></td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.dailyBtcLimitVerified} type="number" nullable onSave={v => update(i, { dailyBtcLimitVerified: v === null ? null : Number(v) })} /></td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.personalWalletNote} onSave={v => update(i, { personalWalletNote: String(v ?? '') })} /></td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.notes} onSave={v => update(i, { notes: String(v ?? '') })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-label-tertiary mt-2 px-3">공개 정보 기준 추정치. 실제 한도는 각 거래소 확인 필요.</p>
      </div>

      <div className="md:hidden space-y-3">
        {nodes.map((node, i) => (
          <div key={node.id} className="ios-card rounded-2xl p-4">
            <p className="font-semibold text-sm text-label-primary mb-3">{node.name}</p>
            <FieldRow label="거래 수수료 (%)"><EditCell value={node.takerFeePct} type="number" onSave={v => update(i, { takerFeePct: Number(v) })} /></FieldRow>
            <FieldRow label="1회 KRW 제한"><EditCell value={node.perTxKrwLimit} type="number" nullable onSave={v => update(i, { perTxKrwLimit: v === null ? null : Number(v) })} /></FieldRow>
            <FieldRow label="일일 BTC 한도"><EditCell value={node.dailyBtcLimitVerified} type="number" nullable onSave={v => update(i, { dailyBtcLimitVerified: v === null ? null : Number(v) })} /></FieldRow>
            <FieldRow label="개인지갑 요건"><EditCell value={node.personalWalletNote} onSave={v => update(i, { personalWalletNote: String(v ?? '') })} /></FieldRow>
            <FieldRow label="비고"><EditCell value={node.notes} onSave={v => update(i, { notes: String(v ?? '') })} /></FieldRow>
          </div>
        ))}
        <p className="text-[11px] text-label-tertiary px-1">공개 정보 기준 추정치. 실제 한도는 각 거래소 확인 필요.</p>
      </div>
    </>
  );
}

export function GlobalExchangeTable({
  nodes, onChange,
}: {
  nodes: GlobalExchangeNode[];
  onChange: (nodes: GlobalExchangeNode[]) => void;
}) {
  function update(idx: number, patch: Partial<GlobalExchangeNode>) {
    onChange(nodes.map((n, i) => i === idx ? { ...n, ...patch } : n));
  }

  const FatcaBtn = ({ node, i }: { node: GlobalExchangeNode; i: number }) => (
    <button
      onClick={() => update(i, { fatca: !node.fatca })}
      className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
        node.fatca ? 'bg-acc-red/10 text-acc-red' : 'bg-fill-secondary text-label-tertiary'
      }`}
    >
      {node.fatca ? '대상' : '비대상'}
    </button>
  );

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-sys-separator">
              {['거래소', '국가', 'CARF 연도', '거래 수수료 (%)', 'FATCA', '비고'].map(h => (
                <th key={h} className="text-left py-2 px-3 text-label-tertiary font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nodes.map((node, i) => (
              <tr key={node.id} className="border-b border-sys-separator hover:bg-fill-primary transition-colors">
                <td className="py-2.5 px-3 font-semibold text-label-primary">{node.name}</td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.country} onSave={v => update(i, { country: String(v ?? '') })} /></td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.carfYear} type="number" nullable onSave={v => update(i, { carfYear: v === null ? null : Number(v) })} /></td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.takerFeePct} type="number" onSave={v => update(i, { takerFeePct: Number(v) })} /></td>
                <td className="py-2.5 px-3"><FatcaBtn node={node} i={i} /></td>
                <td className="py-2.5 px-3 text-label-secondary"><EditCell value={node.notes} onSave={v => update(i, { notes: String(v ?? '') })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {nodes.map((node, i) => (
          <div key={node.id} className="ios-card rounded-2xl p-4">
            <p className="font-semibold text-sm text-label-primary mb-3">{node.name}</p>
            <FieldRow label="국가"><EditCell value={node.country} onSave={v => update(i, { country: String(v ?? '') })} /></FieldRow>
            <FieldRow label="CARF 연도"><EditCell value={node.carfYear} type="number" nullable onSave={v => update(i, { carfYear: v === null ? null : Number(v) })} /></FieldRow>
            <FieldRow label="거래 수수료 (%)"><EditCell value={node.takerFeePct} type="number" onSave={v => update(i, { takerFeePct: Number(v) })} /></FieldRow>
            <FieldRow label="FATCA"><FatcaBtn node={node} i={i} /></FieldRow>
            <FieldRow label="비고"><EditCell value={node.notes} onSave={v => update(i, { notes: String(v ?? '') })} /></FieldRow>
          </div>
        ))}
      </div>
    </>
  );
}

export function EdgePropertiesSection() {
  const sourceCls = (s: string) =>
    s === '크롤링'     ? 'bg-acc-blue/10 text-acc-blue'   :
    s === '어드민 설정' ? 'bg-acc-amber/10 text-acc-amber' :
                          'bg-fill-secondary text-label-tertiary';

  const sections = [
    {
      title: '국내 USDT 출금 엣지', color: 'blue',
      props: [
        { name: 'fee', desc: '출금 수수료 (USDT)', source: '크롤링' },
        { name: 'network', desc: 'TRC20, ERC20 등', source: '크롤링' },
        { name: 'min_withdrawal', desc: '최소 출금량', source: '크롤링' },
        { name: 'enabled', desc: '출금 활성 여부', source: '크롤링' },
      ],
    },
    {
      title: '국내 BTC 출금 엣지 (개인 지갑)', color: 'amber',
      props: [
        { name: 'fee', desc: '출금 수수료 (BTC)', source: '크롤링' },
        { name: 'network', desc: '비트코인, 라이트닝 등', source: '크롤링' },
        { name: 'perTxKrwLimit', desc: '1회 KRW 출금 제한', source: '어드민 설정' },
        { name: 'dailyBtcLimit', desc: '일일 BTC 한도', source: '어드민 설정' },
      ],
    },
    {
      title: '국내 BTC → 해외 경유 엣지', color: 'green',
      props: [
        { name: 'koreanFee', desc: '국내 BTC 출금 수수료', source: '크롤링' },
        { name: 'globalFee', desc: '해외 BTC 재출금 수수료', source: '크롤링' },
        { name: 'perTxLimit', desc: '1회 KRW 제한 없음 (거래소 주소)', source: '규정' },
      ],
    },
    {
      title: '해외 BTC 출금 엣지', color: 'neutral',
      props: [
        { name: 'fee', desc: '출금 수수료 (BTC)', source: '크롤링' },
        { name: 'network', desc: '전송 네트워크', source: '크롤링' },
        { name: 'enabled', desc: '출금 활성 여부', source: '크롤링' },
      ],
    },
  ];

  const dotCls = (c: string) =>
    c === 'blue' ? 'bg-acc-blue' :
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
