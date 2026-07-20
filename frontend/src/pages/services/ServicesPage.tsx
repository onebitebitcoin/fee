import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretRight, CircleNotch, MagnifyingGlass, Warning } from '@phosphor-icons/react';
import { BoardLayout } from '../board/BoardLayout';
import { ExFavicon, Chip } from '../explorer/ui';
import {
  SERVICE_TYPE_LABEL,
  filterServiceNodes,
  type ServiceTypeFilter,
} from './serviceDirectory';
import { useServiceNodes } from './useServiceNodes';

const TYPE_FILTERS: { key: ServiceTypeFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'domestic', label: '국내 거래소' },
  { key: 'global', label: '해외 거래소' },
  { key: 'lightning', label: '라이트닝' },
];

const KYC_LABEL: Record<string, { text: string; color: 'red' | 'green' | 'amber' }> = {
  kyc: { text: 'KYC 필요', color: 'red' },
  non_kyc: { text: 'KYC 불필요', color: 'green' },
  mixed: { text: 'KYC 조건부', color: 'amber' },
};

export default function ServicesPage() {
  const navigate = useNavigate();
  const { nodes, loading, error } = useServiceNodes();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ServiceTypeFilter>('all');

  const visible = useMemo(
    () => filterServiceNodes(nodes, query, typeFilter),
    [nodes, query, typeFilter],
  );

  return (
    <BoardLayout title="서비스 검색" onBack={() => navigate('/')}>
      {/* 검색 + 타입 필터 */}
      <div className="space-y-2.5">
        <div className="ios-card rounded-2xl px-3.5 py-2.5 flex items-center gap-2">
          <MagnifyingGlass className="w-4 h-4 text-label-tertiary shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="거래소·라이트닝 서비스 이름 검색"
            className="flex-1 bg-transparent text-sm text-label-primary placeholder:text-label-quaternary outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={[
                'shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors',
                typeFilter === f.key
                  ? 'bg-acc-amber text-white'
                  : 'bg-fill-secondary text-label-secondary hover:bg-fill-primary',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="ios-card rounded-2xl py-10 flex flex-col items-center gap-2">
          <CircleNotch className="w-5 h-5 text-label-tertiary animate-spin" />
          <p className="text-xs text-label-tertiary">서비스 정보 불러오는 중…</p>
        </div>
      )}

      {error && (
        <div className="ios-card rounded-2xl px-4 py-6 text-center">
          <p className="text-sm text-acc-red">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="ios-card rounded-2xl overflow-hidden divide-y divide-sys-separator">
          {visible.map(node => {
            const kyc = node.kycStatus ? KYC_LABEL[node.kycStatus] : null;
            return (
              <button
                key={node.id}
                onClick={() => navigate(`/services/${node.id}`)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-fill-primary/50 transition-colors"
              >
                <ExFavicon id={node.id} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-label-primary">{node.name}</span>
                    <span className="text-[10px] text-label-tertiary bg-fill-secondary px-1.5 py-0.5 rounded-md">
                      {SERVICE_TYPE_LABEL[node.type]}
                    </span>
                    {node.caution && (
                      <span className="text-[10px] font-semibold text-acc-red bg-acc-red/10 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                        <Warning className="w-2.5 h-2.5" weight="bold" /> 유의
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {kyc && <Chip color={kyc.color}>{kyc.text}</Chip>}
                    {node.lightning && <Chip color="blue">라이트닝</Chip>}
                    {node.noticeCount > 0 && <Chip color="neutral">공지 {node.noticeCount}</Chip>}
                  </div>
                </div>
                <CaretRight className="w-3.5 h-3.5 text-label-quaternary shrink-0" />
              </button>
            );
          })}
          {visible.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-label-tertiary">검색 결과가 없어요</p>
            </div>
          )}
        </div>
      )}
    </BoardLayout>
  );
}
