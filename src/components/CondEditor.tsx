import { Plus, Trash2, X } from 'lucide-react';
import type { FuncSpec } from '../lib/dae/schema';
import type { Cond, Param } from '../lib/dae/model';
import { cx, Select } from './ui';

const KEY_PLACEHOLDERS: Record<string, string> = {
  geosite: 'cn / google / category-ads-all',
  geoip: 'cn / private',
  ext: 'yourdatfile.dat:yourtag',
  regex: '\\.goo.*\\.com$',
  keyword: 'google',
  full: 'dns.google',
};

/** Edits a list of key/value parameters, e.g. the values inside `domain(...)`. */
export function ParamsEditor({
  params,
  onChange,
  keys,
  placeholder,
  addLabel = '添加值',
}: {
  params: Param[];
  onChange: (p: Param[]) => void;
  keys?: { key: string; label: string }[];
  placeholder?: string;
  addLabel?: string;
}) {
  const set = (i: number, patch: Partial<Param>) => onChange(params.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const keyOptions = keys ?? [];
  return (
    <div className="flex flex-col gap-2">
      {params.map((p, i) => {
        const known = keyOptions.some((k) => k.key === p.key);
        const opts = known || !p.key ? keyOptions : [...keyOptions, { key: p.key, label: p.key }];
        return (
          <div key={i} className="flex items-center gap-2">
            {opts.length > 1 || (opts.length === 1 && opts[0].key) ? (
              <Select className="!w-40 shrink-0" value={p.key} onChange={(v) => set(i, { key: v })} options={opts.map((k) => ({ value: k.key, label: k.label }))} />
            ) : null}
            <input className="input font-mono" value={p.val} placeholder={KEY_PLACEHOLDERS[p.key] ?? placeholder} onChange={(e) => set(i, { val: e.target.value })} />
            <button className="icon-btn shrink-0 hover:text-danger" onClick={() => onChange(params.filter((_, j) => j !== i))} aria-label="删除值">
              <X size={16} />
            </button>
          </div>
        );
      })}
      <button className="btn-ghost self-start !h-8 !px-2 text-[12px] text-ink/60" onClick={() => onChange([...params, { key: keyOptions[0]?.key ?? '', val: '' }])}>
        <Plus size={15} /> {addLabel}
      </button>
    </div>
  );
}

/** Edits an AND-chain of matching functions. */
export function CondEditor({ conds, onChange, funcs }: { conds: Cond[]; onChange: (c: Cond[]) => void; funcs: FuncSpec[] }) {
  const set = (i: number, patch: Partial<Cond>) => onChange(conds.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="flex flex-col gap-3">
      {conds.map((c, i) => {
        const spec = funcs.find((f) => f.name === c.name);
        const options = funcs.map((f) => ({ value: f.name, label: `${f.label} ${f.name}` }));
        if (!spec) options.push({ value: c.name, label: c.name });
        return (
          <div key={i}>
            {i > 0 && <div className="mb-3 flex items-center gap-2 text-xs text-ink/50"><span className="h-px flex-1 bg-ink/10" />并且 &amp;&amp;<span className="h-px flex-1 bg-ink/10" /></div>}
            <div className="rounded-[20px] bg-ink/[0.04] p-3">
              <div className="mb-2.5 flex items-center gap-2">
                <button
                  className={cx('btn !px-3 shrink-0 border', c.not ? 'border-danger/40 bg-danger/10 text-danger' : 'border-ink/[0.12] bg-surface text-ink/70')}
                  onClick={() => set(i, { not: !c.not })}
                  title="取反（!）"
                >
                  {c.not ? '不匹配' : '匹配'}
                </button>
                <Select
                  value={c.name}
                  onChange={(v) => {
                    const ns = funcs.find((f) => f.name === v);
                    set(i, { name: v, params: c.params.map((p) => ({ ...p, key: ns?.keys.some((k) => k.key === p.key) ? p.key : (ns?.keys[0]?.key ?? '') })) });
                  }}
                  options={options}
                />
                <button className="icon-btn shrink-0 hover:text-danger" onClick={() => onChange(conds.filter((_, j) => j !== i))} aria-label="删除条件">
                  <Trash2 size={16} />
                </button>
              </div>
              {spec?.hint && <div className="mb-2 text-xs text-ink/60">{spec.hint}</div>}
              <ParamsEditor params={c.params} onChange={(p) => set(i, { params: p })} keys={spec?.keys} placeholder={spec?.placeholder} />
            </div>
          </div>
        );
      })}
      <button
        className="btn-soft self-start"
        onClick={() => onChange([...conds, { name: funcs[0].name, not: false, params: [{ key: funcs[0].keys[0]?.key ?? '', val: '' }] }])}
      >
        <Plus size={16} /> 添加条件
      </button>
    </div>
  );
}
