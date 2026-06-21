import { useState } from 'react';
import { PencilSimple, Check, X } from '@phosphor-icons/react';

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-label-tertiary uppercase tracking-[0.12em] mb-2 px-1">
      {children}
    </p>
  );
}

export function EditCell({
  value, onSave, type = 'text', nullable = false,
}: {
  value: string | number | null;
  onSave: (v: string | number | null) => void;
  type?: 'text' | 'number';
  nullable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null ? '' : String(value));

  function commit() {
    if (nullable && draft === '') { onSave(null); }
    else if (type === 'number') { onSave(Number(draft)); }
    else { onSave(draft); }
    setEditing(false);
  }
  function cancel() { setDraft(value === null ? '' : String(value)); setEditing(false); }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-left hover:text-acc-amber transition-colors group"
      >
        <span>
          {value === null
            ? <span className="text-label-disabled italic">없음</span>
            : String(value)}
        </span>
        <PencilSimple className="w-3 h-3 text-label-disabled group-hover:text-acc-amber flex-shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus type={type} value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
        className="w-full bg-white border border-[rgba(160,100,40,0.25)] rounded-lg px-1.5 py-0.5 text-xs outline-none focus:border-acc-amber/50"
      />
      <button onClick={commit} className="text-acc-green"><Check className="w-3.5 h-3.5" /></button>
      <button onClick={cancel} className="text-acc-red"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-sys-separator last:border-0">
      <span className="text-xs text-label-tertiary flex-shrink-0 mt-0.5 w-28">{label}</span>
      <div className="flex-1 text-right text-xs text-label-primary">{children}</div>
    </div>
  );
}
