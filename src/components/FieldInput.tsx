import { CircleHelp, RotateCcw } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import type { FieldSpec } from '../lib/dae/schema';
import { useStore } from '../store';
import { Select, Switch, cx } from './ui';

/** Small "?" icon that reveals a description on hover or focus. */
export function Tip({ children }: { children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      <button type="button" className="text-ink/60 hover:text-ink/80 focus:text-ink/80" aria-label="说明">
        <CircleHelp size={14} />
      </button>
      <span className="pointer-events-none invisible absolute left-1/2 top-full z-30 mt-1.5 w-72 -translate-x-1/2 rounded-2xl bg-pill px-3 py-2 text-xs leading-relaxed text-pill-ink opacity-0 shadow-pop transition-opacity group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:opacity-100">
        {children}
      </span>
    </span>
  );
}

const WIDTH: Record<FieldSpec['type'], string> = {
  bool: '',
  enum: 'w-40',
  int: 'w-32',
  duration: 'w-32',
  string: 'w-full max-w-[14rem]',
  list: 'w-full max-w-[20rem]',
};

/**
 * One config key as a settings row. An absent key means "use dae's default"; the reset button removes it.
 */
export function FieldInput({ spec, value, onChange }: { spec: FieldSpec; value: string | undefined; onChange: (v: string | undefined) => void }) {
  const set = value !== undefined;
  const effective = value ?? spec.default ?? '';
  let control;
  if (spec.type === 'bool') {
    control = <Switch checked={effective === 'true'} onChange={(v) => onChange(String(v))} label={spec.label} />;
  } else if (spec.type === 'enum') {
    control = (
      <Select
        className={WIDTH.enum}
        ariaLabel={spec.label}
        value={value ?? ''}
        onChange={(v) => onChange(v === '' ? undefined : v)}
        placeholder={spec.default !== undefined ? `默认 ${spec.default}` : (spec.placeholder ?? '不设置')}
        options={spec.options!.map((o) => ({ value: o, label: o }))}
      />
    );
  } else {
    control = (
      <input
        aria-label={spec.label}
        className={cx('input', WIDTH[spec.type], spec.type !== 'string' && 'font-mono text-[12px]', spec.type === 'int' || spec.type === 'duration' ? 'text-center' : '')}
        inputMode={spec.type === 'int' ? 'numeric' : undefined}
        value={value ?? ''}
        placeholder={spec.default !== undefined ? spec.default : spec.placeholder}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      />
    );
  }
  const wide = spec.type === 'list' || spec.type === 'string';
  return (
    <div className={cx('flex min-h-[44px] gap-x-3 gap-y-1.5 border-b border-ink/10 py-1.5', 'items-center justify-between')}>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="whitespace-nowrap">{spec.label}</span>
        <Tip>
          <code className="mb-1 block font-mono text-[11px] opacity-70">{spec.key}</code>
          {spec.desc}
        </Tip>
        {set && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-info" title="已修改（会写入配置）" aria-label="已修改" />}
      </div>
      <div className={cx('flex items-center justify-end gap-1', wide && 'min-w-0 flex-1')}>
        {set && (
          <button className="icon-btn !h-7 !w-7 shrink-0" onClick={() => onChange(undefined)} title="恢复默认（不写入配置）" aria-label="恢复默认">
            <RotateCcw size={13} />
          </button>
        )}
        {control}
      </div>
    </div>
  );
}

/** Run `cb` whenever the green "+" button is pressed while this page is mounted. */
export function useAddSignal(cb: () => void) {
  const signal = useStore((s) => s.addSignal);
  const first = useRef(signal);
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (signal !== first.current) ref.current();
  }, [signal]);
}
