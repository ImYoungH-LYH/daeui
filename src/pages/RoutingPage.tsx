import { CornerDownRight, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { OutboundPicker } from '../components/RuleEditor';
import { OutboundPill, RuleList } from '../components/RuleList';
import { Modal, SectionTitle } from '../components/ui';
import { BUILTIN_OUTBOUNDS, ROUTING_FUNCS } from '../lib/dae/schema';
import { type Rule, uid } from '../lib/dae/model';
import { outboundText, parseRuleText } from '../lib/dae/text';
import { useStore } from '../store';

const PRESETS: { title: string; desc: string; rules: string[] }[] = [
  { title: '本机网络管理器直连', desc: '避免绑定 WAN 时联网检测误判', rules: ['pname(NetworkManager) -> direct'] },
  { title: '组播、私有地址直连', desc: '广播 / 组播 / 局域网地址不走代理', rules: ["dip(224.0.0.0/3, 'ff00::/8') -> direct", 'dip(geoip:private) -> direct'] },
  { title: '中国大陆直连', desc: 'geoip:cn 与 geosite:cn 直连', rules: ['dip(geoip:cn) -> direct', 'domain(geosite:cn) -> direct'] },
  { title: '拦截广告域名', desc: 'geosite:category-ads-all 拦截', rules: ['domain(geosite:category-ads-all) -> block'] },
  { title: '禁用 QUIC', desc: '拦截 UDP 443，浏览器会回退到 TCP', rules: ['l4proto(udp) && dport(443) -> block'] },
  { title: 'BT 流量直连', desc: '按 DSCP 0x4 识别（需在 BT 客户端设置）', rules: ['dscp(0x4) -> direct'] },
];

export function RoutingPage() {
  const { config, update } = useStore();
  const [presetOpen, setPresetOpen] = useState(false);
  const groups = config.groups.filter((g) => !g.disabled);
  const outbounds = [
    ...BUILTIN_OUTBOUNDS.map((b) => ({ value: b.name, label: `${b.label}  ${b.name}` })),
    ...groups.map((g) => ({ value: g.name, label: `节点组  ${g.name}` })),
  ];
  const defaultOut = groups[0]?.name ?? 'direct';

  const addPreset = (rules: string[]) => {
    const parsed: Rule[] = rules.map((t) => ({ id: uid(), disabled: false, ...parseRuleText(t) }));
    update((c) => void c.routing.rules.push(...parsed));
    setPresetOpen(false);
  };

  return (
    <div>
      <SectionTitle
        title="分流规则 routing"
        desc="从上往下匹配，先命中的生效；都未命中时走兜底出站。按域名分流需要 DNS 流量经过 dae。"
        right={
          <button className="btn-soft" onClick={() => setPresetOpen(true)}>
            <Sparkles size={16} /> 常用规则
          </button>
        }
      />
      <RuleList
        listenAdd
        rules={config.routing.rules}
        onChange={(rules) => update((c) => void (c.routing.rules = rules))}
        funcs={ROUTING_FUNCS}
        outbounds={outbounds}
        advancedOutbound
        newRule={() => ({ conds: [{ name: 'domain', not: false, params: [{ key: 'geosite', val: '' }] }], outbound: { name: defaultOut, params: [] }, disabled: false })}
        footer={
          <div className="card flex flex-wrap items-center gap-3 border border-dashed border-ink/10 px-4 py-3">
            <CornerDownRight size={18} className="text-ink/60" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">兜底出站 fallback</div>
              <div className="text-[12px] text-ink/60">以上规则都未命中时使用</div>
            </div>
            <OutboundPill name={config.routing.fallback.name} label={outboundText(config.routing.fallback)} />
            <div className="w-full sm:w-72">
              <OutboundPicker value={config.routing.fallback} options={outbounds} onChange={(o) => update((c) => void (c.routing.fallback = o))} />
            </div>
          </div>
        }
      />
      <Modal open={presetOpen} title="添加常用规则" onClose={() => setPresetOpen(false)}>
        <p className="mb-3 text-sm text-ink/60">规则会追加到列表末尾，可拖动调整顺序。</p>
        <div className="flex flex-col gap-2">
          {PRESETS.map((p) => (
            <button key={p.title} className="rounded-2xl border border-ink/10 px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent/5" onClick={() => addPreset(p.rules)}>
              <div className="font-medium">{p.title}</div>
              <div className="text-xs text-ink/60">{p.desc}</div>
              {p.rules.map((r) => (
                <code key={r} className="mt-1 block text-xs text-ink/60">{r}</code>
              ))}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
