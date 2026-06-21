import type { AdminSettings } from '../../lib/adminSettings';
import { KoreanExchangeTable, GlobalExchangeTable, EdgePropertiesSection } from './ExchangeTablesPanel';
import { CautionPanel } from './CautionPanel';
import { WithdrawalFeePanel } from './WithdrawalFeePanel';

type ExchangeTab = 'korean' | 'global' | 'edges';

export function ExchangeTabContent({
  tab, settings, onSettingsChange,
}: {
  tab: ExchangeTab;
  settings: AdminSettings;
  onSettingsChange: (s: AdminSettings) => void;
}) {
  const currentNodes = tab === 'korean' ? settings.koreanNodes : settings.globalNodes;
  const exchanges = currentNodes.map(n => ({ id: n.id, name: n.name }));

  return (
    <div className="space-y-4">
      <div className="ios-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-sys-separator">
          <p className="text-xs text-label-secondary">
            {tab === 'korean' && '국내 거래소 노드 속성 — 셀을 클릭해 편집. 저장 후 메인 화면에 반영됩니다.'}
            {tab === 'global' && '해외 거래소 노드 속성 — 셀을 클릭해 편집. 미국세금신고(FATCA) 버튼으로 토글.'}
            {tab === 'edges'  && '출금 엣지(Transfer Edge) 속성 정의 — 크롤링 데이터는 실시간 갱신됨.'}
          </p>
        </div>
        <div className="p-4">
          {tab === 'korean' && (
            <KoreanExchangeTable
              nodes={settings.koreanNodes}
              onChange={nodes => onSettingsChange({ ...settings, koreanNodes: nodes })}
            />
          )}
          {tab === 'global' && (
            <GlobalExchangeTable
              nodes={settings.globalNodes}
              onChange={nodes => onSettingsChange({ ...settings, globalNodes: nodes })}
            />
          )}
          {tab === 'edges' && <EdgePropertiesSection />}
        </div>
      </div>

      {(tab === 'korean' || tab === 'global') && (
        <div className="ios-card rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-sys-separator">
            <p className="text-xs font-semibold text-label-primary">유의 거래소 설정</p>
            <p className="text-[11px] text-label-tertiary mt-0.5">유의로 설정하면 거래소 리스트에 "유의" 뱃지가 표시됩니다.</p>
          </div>
          <div className="p-4">
            <CautionPanel
              group={tab === 'korean' ? 'korea' : 'global'}
              exchanges={exchanges}
            />
          </div>
        </div>
      )}

      {(tab === 'korean' || tab === 'global') && (
        <div className="ios-card rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-sys-separator">
            <p className="text-xs font-semibold text-label-primary">출금 수수료 (현재값 · 출처)</p>
            <p className="text-[11px] text-label-tertiary mt-0.5">
              실시간 API / 스크래핑 / <span className="text-acc-amber font-semibold">정적</span> 등록값 구분.
              정적은 공개 API 미제공 항목(코인베이스 BTC 등)으로 코드 상수로 관리됩니다.
            </p>
          </div>
          <div className="p-4">
            <WithdrawalFeePanel exchanges={exchanges} />
          </div>
        </div>
      )}
    </div>
  );
}
