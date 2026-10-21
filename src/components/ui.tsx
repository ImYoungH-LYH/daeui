import { X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/20 backdrop-blur-[3px] p-0 sm:p-4" onMouseDown={onClose}>
      <div
        className={cx('flex max-h-[92vh] w-full flex-col rounded-t-[26px] sm:rounded-[20px] bg-surface shadow-pop', wide ? 'sm:max-w-3xl' : 'sm:max-w-xl')}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 pb-4 pt-1">{footer}</div>}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border-2 transition-colors', checked ? 'border-accent bg-accent' : 'border-ink/25 bg-transparent')}
    >
      <span className={cx('inline-block h-4 w-4 rounded-full transition-transform', checked ? 'translate-x-[18px] bg-white' : 'translate-x-0.5 bg-ink/40')} />
    </button>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs leading-relaxed text-ink/60">{hint}</span>}
    </label>
  );
}

export function Select({
  value,
  onChange,
  options,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  placeholder?: string;
}) {
  return (
    <select className={cx('input appearance-none pr-8 bg-no-repeat', className)} style={{ backgroundImage: chevron, backgroundPosition: 'right 12px center' }} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

export function Empty({ icon, title, desc, action }: { icon: ReactNode; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="mb-1 text-ink/40">{icon}</div>
      <div className="font-medium">{title}</div>
      {desc && <div className="max-w-md text-xs text-ink/60">{desc}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function SectionTitle({ title, desc, right }: { title: ReactNode; desc?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 pt-1">
      <div>
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {desc && <p className="mt-0.5 text-xs text-ink/60">{desc}</p>}
      </div>
      {right}
    </div>
  );
}
