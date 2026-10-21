import { useState } from 'react';
import type { Outbound, Rule } from '../lib/dae/model';
import type { FuncSpec } from '../lib/dae/schema';
import { parseRuleText, ruleText } from '../lib/dae/text';
import { CondEditor } from './CondEditor';
import { Field, Modal, Select, Switch } from './ui';

export interface OutboundOption {
  value: string;
  label: string;
}

export function OutboundPicker({ value, onChange, options, advanced }: { value: Outbound; onChange: (o: Outbound) => void; options: OutboundOption[]; advanced?: boolean }) {
  const opts = options.some((o) => o.value === value.name) || !value.name ? options : [...options, { value: value.name, label: `${value.name}（未定义）` }];
  const must = value.params.some((p) => !p.key && p.val === 'must');
  const mark = value.params.find((p) => p.key === 'mark')?.val ?? '';
  const others = value.params.filter((p) => !(p.key === '' && p.val === 'must') && p.key !== 'mark');
  const rebuild = (m: boolean, mk: string) => onChange({ name: value.name, params: [...(m ? [{ key: '', val: 'must' }] : []), ...(mk ? [{ key: 'mark', val: mk }] : []), ...others] });
  return (
    <div className="flex flex-col gap-3">
      <Select value={value.name} onChange={(v) => onChange({ ...value, name: v })} options={opts} placeholder="选择出站" />
      {advanced && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-[20px] bg-ink/[0.04] px-3.5 py-2.5">
            <span className="text-sm">
              不劫持 DNS <code className="text-xs text-ink/60">(must)</code>
              <span className="block text-xs text-ink/60">用于避免 DNS 流量回环</span>
            </span>
            <Switch checked={must} onChange={(v) => rebuild(v, mark)} />
          </label>
          <Field label="fwmark（可选）" hint="给流量打标，配合 ip rule 转发到指定网卡">
            <input className="input font-mono" value={mark} placeholder="0x800" onChange={(e) => rebuild(must, e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}

export function RuleDialog({
  title,
  initial,
  funcs,
  outbounds,
  advancedOutbound,
  onClose,
  onSave,
}: {
  title: string;
  initial: Rule;
  funcs: FuncSpec[];
  outbounds: OutboundOption[];
  advancedOutbound?: boolean;
  onClose: () => void;
  onSave: (r: Rule) => void;
}) {
  const [rule, setRule] = useState<Rule>(structuredClone(initial));
  const [mode, setMode] = useState<'visual' | 'text'>('visual');
  const [text, setText] = useState('');
  const [textErr, setTextErr] = useState('');

  const switchMode = (m: 'visual' | 'text') => {
    if (m === mode) return;
    if (m === 'text') {
      setText(rule.conds.length ? ruleText(rule) : '');
      setTextErr('');
      setMode('text');
      return;
    }
    try {
      setRule({ ...rule, ...parseRuleText(text) });
      setMode('visual');
    } catch (e) {
      setTextErr((e as Error).message);
    }
  };

  const save = () => {
    if (mode === 'text') {
      try {
        onSave({ ...rule, ...parseRuleText(text) });
      } catch (e) {
        setTextErr((e as Error).message);
      }
      return;
    }
    onSave(rule);
  };

  const incomplete = mode === 'visual' && (!rule.conds.length || !rule.outbound.name || rule.conds.some((c) => c.params.some((p) => !p.val.trim())));

  return (
    <Modal
      open
      wide
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={save} disabled={incomplete}>保存</button>
        </>
      }
    >
      <div className="segmented mb-4">
        {(['visual', 'text'] as const).map((m) => (
          <button key={m} data-active={mode === m} onClick={() => switchMode(m)}>
            {m === 'visual' ? '可视化' : '文本'}
          </button>
        ))}
      </div>
      {mode === 'visual' ? (
        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-2 text-sm font-medium">匹配条件（全部满足时命中）</div>
            <CondEditor conds={rule.conds} funcs={funcs} onChange={(conds) => setRule({ ...rule, conds })} />
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">出站</div>
            <OutboundPicker value={rule.outbound} onChange={(outbound) => setRule({ ...rule, outbound })} options={outbounds} advanced={advancedOutbound} />
          </div>
          {rule.conds.length > 0 && rule.outbound.name && <code className="block break-all rounded-2xl bg-ink/[0.04] px-3.5 py-2 text-xs text-ink/70">{ruleText(rule)}</code>}
        </div>
      ) : (
        <Field label="dae 规则语法" hint={textErr ? <span className="text-danger">{textErr}</span> : '例如：domain(geosite:cn) && l4proto(tcp) -> direct'}>
          <textarea className="input h-36 resize-y py-2 font-mono text-[12px]" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        </Field>
      )}
    </Modal>
  );
}
