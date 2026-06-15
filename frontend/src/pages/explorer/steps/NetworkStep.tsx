import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, ArrowSquareOut, Warning } from '@phosphor-icons/react';
import { NetworkIcon } from '../../../components/NetworkIcon';
import { SPRING_FAST, SPRING_SLOW, fmtAmountText } from '../constants';
import { OptionCard } from '../ui';
import { useExplorer } from '../ExplorerContext';

const NOTICE_URL: Record<string, string> = {
  bithumb: 'https://feed.bithumb.com/notice',
  upbit:   'https://upbit.com/service_center/notice',
  coinone: 'https://coinone.co.kr/support/notice',
  korbit:  'https://www.korbit.co.kr/board/notice',
  gopax:   'https://www.gopax.co.kr/help-center',
};

function formatReason(reason: string | null | undefined): string {
  if (!reason) return '출금 중단';
  if (reason === 'System Maintenance') return '점검 중';
  return reason;
}

const SUSPENSION_MESSAGE_KO: Record<string, string> = {
  'In order to protect your assets, we have temporarily disabled withdrawals and deposits.':
    '자산 보호를 위해 입출금이 일시 중단되었습니다.',
  'Deposits and withdrawals are temporarily suspended.': '입출금이 일시 중단되었습니다.',
  'Withdrawals are temporarily suspended.': '출금이 일시 중단되었습니다.',
  'Deposits are temporarily suspended.': '입금이 일시 중단되었습니다.',
};

function formatSuspensionMessage(msg: string | null | undefined): string | null {
  if (!msg) return null;
  return SUSPENSION_MESSAGE_KO[msg] ?? msg;
}

export function NetworkStep() {
  const {
    network, setNetwork, setSwapSvc, stepEndRef, scrollToStepEnd, networkOptions,
    disabledNetworkOptions, domestic, handleBack, handleNext,
  } = useExplorer();

  const noticeUrl = domestic ? NOTICE_URL[domestic] : undefined;

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-label-primary tracking-tight">네트워크</h1>
        <p className="text-sm text-label-secondary mt-1">출금 네트워크를 선택해요</p>
      </div>
      <div className="space-y-2.5">
        {networkOptions.map(({ network: n, best }, i) => (
          <motion.div key={n}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_SLOW, delay: i * 0.06 }}>
            <OptionCard
              selected={network === n}
              onClick={() => { setNetwork(n); setSwapSvc(null); scrollToStepEnd(); }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <NetworkIcon network={n} size={16} />
                    <p className="text-sm font-bold text-label-primary">{n}</p>
                  </div>
                  {(() => {
                    const wdFee = best.breakdown?.components.find(c => c.is_fixed === true);
                    const amt = wdFee ? fmtAmountText(wdFee.amount_text) : null;
                    return (
                      <p className="text-[10px] text-label-tertiary mt-0.5">
                        거래소 고정 출금 수수료{amt ? <> <span className="text-acc-blue font-medium num">{amt}</span></> : ''}
                      </p>
                    );
                  })()}
                </div>
              </div>
            </OptionCard>
          </motion.div>
        ))}

        {disabledNetworkOptions.map(({ network: n, reason, suspension_message, notice_url, notice_published_at, notice_title }, i) => {
          const linkUrl = notice_url ?? noticeUrl;
          const dateStr = notice_published_at
            ? new Date(typeof notice_published_at === 'number' ? notice_published_at * 1000 : notice_published_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'short', day: 'numeric' })
            : null;
          return (
            <motion.div key={`disabled-${n}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING_SLOW, delay: (networkOptions.length + i) * 0.06 }}>
              <div className="rounded-2xl ios-card px-4 py-3 opacity-50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <NetworkIcon network={n} size={16} />
                      <p className="text-sm font-bold text-label-primary">{n}</p>
                      <span className="text-[10px] font-medium text-label-tertiary bg-fill-tertiary px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <Warning className="w-3 h-3" weight="bold" />
                        {formatReason(reason)}
                      </span>
                    </div>
                    {(notice_title || formatSuspensionMessage(suspension_message)) && (
                      <p className="text-[10px] text-label-tertiary mt-0.5 leading-tight max-w-[240px]">{notice_title || formatSuspensionMessage(suspension_message)}</p>
                    )}
                  </div>
                  {linkUrl && (
                    <a
                      href={linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-end gap-0.5 shrink-0 ml-2"
                      onClick={e => e.stopPropagation()}
                    >
                      <span className="flex items-center gap-0.5 text-[10px] text-acc-blue">
                        {notice_url ? '공지' : '공지 목록'} <ArrowSquareOut className="w-3 h-3" />
                      </span>
                      {dateStr && <span className="text-[9px] text-label-tertiary">{dateStr}</span>}
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      <p className="text-[10px] text-label-tertiary text-center px-2">Bitcoin 채굴 수수료(네트워크 수수료)와 별개로 거래소가 부과하는 고정 출금 수수료입니다</p>
      {network && (
        <motion.button
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={SPRING_FAST}
          onClick={() => handleNext('network')}
          className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
        >
          다음 <ArrowRight className="w-4 h-4" />
        </motion.button>
      )}
      <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
        <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
      </button>
      <div ref={stepEndRef} />
    </>
  );
}
