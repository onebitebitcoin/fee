import { useState, useEffect } from 'react';
import type { AdminSettings } from '../../lib/adminSettings';
import type { GateItem } from '../../lib/gatemanRegistry';
import { KoreanExchangeCards, GlobalExchangeCards, EdgePropertiesSection } from './ExchangeTablesPanel';
import { CautionPanel } from './CautionPanel';
import { WithdrawalFeePanel } from './WithdrawalFeePanel';
import { api } from '../../lib/api';

type ExchangeTab = 'korean' | 'global' | 'edges';

type GateRegistry = {
  domestic: Record<string, GateItem[]>;
  global: Record<string, GateItem[]>;
};

export function ExchangeTabContent({
  tab, settings, onSettingsChange,
}: {
  tab: ExchangeTab;
  settings: AdminSettings;
  onSettingsChange: (s: AdminSettings) => void;
}) {
  const [gates, setGates] = useState<GateRegistry>({ domestic: {}, global: {} });

  useEffect(() => {
    api.getGatemanRegistry()
      .then(res => {
        const d = res.data as GateRegistry;
        setGates({ domestic: d.domestic ?? {}, global: d.global ?? {} });
      })
      .catch(() => {});
  }, []);

  const currentNodes = tab === 'korean' ? settings.koreanNodes : settings.globalNodes;
  const exchanges = currentNodes.map(n => ({ id: n.id, name: n.name }));

  return (
    <div className="space-y-4">
      {tab === 'korean' && (
        <KoreanExchangeCards
          nodes={settings.koreanNodes}
          gates={gates.domestic}
          onChange={nodes => onSettingsChange({ ...settings, koreanNodes: nodes })}
        />
      )}
      {tab === 'global' && (
        <GlobalExchangeCards
          nodes={settings.globalNodes}
          gates={gates.global}
          onChange={nodes => onSettingsChange({ ...settings, globalNodes: nodes })}
        />
      )}
      {tab === 'edges' && (
        <div className="ios-card rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-sys-separator">
            <p className="text-xs text-label-secondary">출금 엣지(Transfer Edge) 속성 정의 — 크롤링 데이터는 실시간 갱신됨.</p>
          </div>
          <div className="p-4">
            <EdgePropertiesSection />
          </div>
        </div>
      )}

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
              정적은 공개 API 미제공 항목으로 코드 상수로 관리됩니다.
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
