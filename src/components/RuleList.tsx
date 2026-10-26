import { ArrowRight, Ban, Cpu, Globe, Hash, Network, Plus, Route, Server, ShieldCheck, Split, Wifi } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { type Rule, uid } from '../lib/dae/model';
import type { FuncSpec } from '../lib/dae/schema';
import { describeCond, outboundText, ruleText } from '../lib/dae/text';
import { useAddSignal } from './FieldInput';
import { type OutboundOption, RuleDialog } from './RuleEditor';
import { ItemCard, SortableList } from './SortableList';
import { cx } from './ui';

const ICONS: Record<string, ReactNode> = {
  domain: <Globe size={18} className="text-sky-600 dark:text-sky-400" />,
  qname: <Globe size={18} className="text-sky-600 dark:text-sky-400" />,
  dip: <Network size={18} className="text-violet-600 dark:text-violet-400" />,
  sip: <Network size={18} className="text-fuchsia-600 dark:text-fuchsia-400" />,
  ip: <Network size={18} className="text-violet-600 dark:text-violet-400" />,
  dport: <Hash size={18} className="text-amber-600 dark:text-amber-400" />,
  sport: <Hash size={18} className="text-amber-600 dark:text-amber-400" />,
  l4proto: <Route size={18} className="text-teal-600 dark:text-teal-400" />,
  ipversion: <Route size={18} className="text-teal-600 dark:text-teal-400" />,
  pname: <Cpu size={18} className="text-slate-600 dark:text-slate-400" />,
  mac: <Wifi size={18} className="text-pink-600 dark:text-pink-400" />,
  sub: <Server size={18} className="text-orange-600 dark:text-orange-400" />,
  node: <Server size={18} className="text-indigo-600 dark:text-indigo-400" />,
  subnode: <Server size={18} className="text-indigo-600 dark:text-indigo-400" />,
  upstream: <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400" />,
};

export function outboundTone(name: string): string {
  if (name === 'block' || name === 'reject') return 'bg-danger/10 text-danger';
  if (name === 'direct' || name === 'must_direct' || name === 'accept' || name === 'asis') return 'bg-accent/20 text-success-ink';
  return 'bg-info/10 text-info';
}

export function OutboundPill({ name, label }: { name: string; label?: string }) {
  return (
    <span className={cx('inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 font-mono text-xs font-medium', outboundTone(name))}>
      {name === 'block' || name === 'reject' ? <Ban size={12} /> : <ArrowRight size={12} />}
      {label ?? name}
    </span>
  );
}

export function RuleList({
  rules,
  onChange,
  funcs,
  outbounds,
  advancedOutbound,
  newRule,
  listenAdd,
  hideAdd,
  footer,
}: {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  funcs: FuncSpec[];
  outbounds: OutboundOption[];
  advancedOutbound?: boolean;
  newRule: () => Omit<Rule, 'id'>;
  /** Open the add dialog when the page header calls store.requestAdd(). */
  listenAdd?: boolean;
  /** Hide the list's own add button when the page header already has one. */
  hideAdd?: boolean;
  footer?: ReactNode;
}) {
  const [editing, setEditing] = useState<{ rule: Rule; isNew: boolean } | null>(null);
  const openAdd = () => setEditing({ isNew: true, rule: { ...newRule(), id: uid() } });
  useAddSignal(() => listenAdd && openAdd());

  return (
    <div className="flex flex-col gap-1.5">
      {rules.length > 0 && (
        <SortableList
          items={rules}
          onReorder={onChange}
          render={(r, i) => (
            <ItemCard
              key={r.id}
              id={r.id}
              name={`规则 ${i + 1}`}
              disabled={r.disabled}
              icon={ICONS[r.conds[0]?.name] ?? <Split size={18} className="text-ink/75" />}
              title={
                <span className="flex items-center gap-2">
                  <span className="shrink-0 font-mono text-xs text-ink/65">{i + 1}</span>
                  <span className="truncate">{r.conds.map((c) => describeCond(c, funcs)).join(' 且 ')}</span>
                </span>
              }
              subtitle={<span className="font-mono">{ruleText(r)}</span>}
              right={<OutboundPill name={r.outbound.name} label={outboundText(r.outbound)} />}
              onToggle={() => onChange(rules.map((x) => (x.id === r.id ? { ...x, disabled: !x.disabled } : x)))}
              onEdit={() => setEditing({ rule: r, isNew: false })}
              onDelete={() => onChange(rules.filter((x) => x.id !== r.id))}
            />
          )}
        />
      )}
      {footer}
      {!hideAdd && (
        <button className="btn-soft self-start" onClick={openAdd}>
          <Plus size={16} /> 添加规则
        </button>
      )}
      {editing && (
        <RuleDialog
          title={editing.isNew ? '添加规则' : '修改规则'}
          initial={editing.rule}
          funcs={funcs}
          outbounds={outbounds}
          advancedOutbound={advancedOutbound}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            onChange(editing.isNew ? [...rules, r] : rules.map((x) => (x.id === r.id ? r : x)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
