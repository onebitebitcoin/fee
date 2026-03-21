import { Bot, Mail, Send, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const CONTACT_EMAIL = 'onebitebitcoin@proton.me';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function ContactPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || '오류가 발생했습니다.');
      }
      const data = await res.json();
      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
    } catch (e) {
      setMessages([
        ...newMessages,
        { role: 'assistant', content: `오류: ${e instanceof Error ? e.message : '알 수 없는 오류'}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-bnb-text font-display tracking-tight">문의 / 제보</h1>
        <p className="mt-1 text-sm text-bnb-muted">수수료, 데이터, 서비스 관련 궁금한 점을 물어보세요.</p>
      </div>

      {/* 채팅 인터페이스 */}
      <div className="border border-dark-200 bg-dark-400/40 flex flex-col" style={{ height: '480px' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-200 text-[11px] font-semibold uppercase tracking-[0.2em] text-bnb-muted">
          <Bot size={12} />
          <span>AI 어시스턴트</span>
        </div>

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <p className="text-sm text-bnb-muted/60 text-center mt-8">
              거래소 수수료, 출금 방법, 최저 경로 등을 질문해보세요.
            </p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 w-6 h-6 bg-brand-500/20 flex items-center justify-center mt-0.5">
                  <Bot size={12} className="text-brand-400" />
                </div>
              )}
              <div
                className={`max-w-[80%] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-brand-500/20 text-bnb-text'
                    : 'bg-dark-300 text-bnb-text'
                }`}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="flex-shrink-0 w-6 h-6 bg-dark-300 flex items-center justify-center mt-0.5">
                  <User size={12} className="text-bnb-muted" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 justify-start">
              <div className="flex-shrink-0 w-6 h-6 bg-brand-500/20 flex items-center justify-center mt-0.5">
                <Bot size={12} className="text-brand-400" />
              </div>
              <div className="bg-dark-300 px-3 py-2 text-sm text-bnb-muted">
                <span className="animate-pulse">응답 중...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 입력창 */}
        <div className="border-t border-dark-200 px-4 py-3 flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="질문을 입력하세요. (Enter로 전송, Shift+Enter 줄바꿈)"
            className="flex-1 bg-dark-500 border border-dark-200 px-3 py-2 text-sm text-bnb-text placeholder:text-bnb-muted/40 focus:outline-none focus:border-brand-500/50 resize-none"
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 self-end bg-brand-500 px-3 py-2 text-dark-500 hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </div>

      {/* 직접 연락 */}
      <div className="border border-dark-200 bg-dark-400/40 px-4 py-4 space-y-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-bnb-muted">
          <Mail size={12} />
          <span>직접 연락</span>
        </div>
        <p className="text-sm text-bnb-muted">
          직접 이메일로 문의하려면 아래 주소로 보내주세요.
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
