import { Mail, MessageSquare, Send } from 'lucide-react';
import { useState } from 'react';

const CONTACT_EMAIL = 'onebitebitcoin@proton.me';

export function ContactPage() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const mailtoHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-bnb-text font-display tracking-tight">문의 / 제보</h1>
        <p className="mt-1 text-sm text-bnb-muted">수수료 오류, 데이터 제보, 기능 요청 등을 보내주세요.</p>
      </div>

      <div className="border border-dark-200 bg-dark-400/40 px-4 py-4 space-y-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-bnb-muted">
          <Mail size={12} />
          <span>이메일로 문의</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.18em] text-bnb-muted mb-1.5">
              제목
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="예: 업비트 BTC 출금 수수료 오류"
              className="w-full bg-dark-500 border border-dark-200 px-3 py-2 text-sm text-bnb-text placeholder:text-bnb-muted/40 focus:outline-none focus:border-brand-500/50"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.18em] text-bnb-muted mb-1.5">
              내용
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="문의 내용을 자세히 작성해주세요."
              className="w-full bg-dark-500 border border-dark-200 px-3 py-2 text-sm text-bnb-text placeholder:text-bnb-muted/40 focus:outline-none focus:border-brand-500/50 resize-none"
            />
          </div>

          <a
            href={mailtoHref}
            className="inline-flex items-center gap-2 bg-brand-500 px-4 py-2 text-sm font-semibold text-dark-500 hover:bg-brand-400 transition-colors"
          >
            <Send size={13} />
            이메일 클라이언트로 열기
          </a>
        </div>
      </div>

      <div className="border border-dark-200 bg-dark-400/40 px-4 py-4 space-y-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-bnb-muted">
          <MessageSquare size={12} />
          <span>직접 연락</span>
        </div>
        <p className="text-sm text-bnb-muted">
          이메일 클라이언트가 없다면 아래 주소로 직접 보내주세요.
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="inline-block font-mono text-sm text-brand-400 hover:text-brand-300 transition-colors"
        >
          {CONTACT_EMAIL}
        </a>
      </div>
    </div>
  );
}
