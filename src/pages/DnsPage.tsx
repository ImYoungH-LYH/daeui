import { CornerDownRight, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { FieldInput } from '../components/FieldInput';
import { confirmAction } from '../components/feedback';
import { RuleList } from '../components/RuleList';
import { ItemCard, SortableList } from '../components/SortableList';
import { Field, Modal, SectionTitle, Select, Switch } from '../components/ui';
import { type Link, uid } from '../lib/dae/model';
import { DNS_FIELDS, DNS_REQUEST_FUNCS, DNS_RESPONSE_FUNCS } from '../lib/dae/schema';
import { useStore } from '../store';

const SCHEMES = ['udp', 'tcp', 'tcp+udp', 'https', 'tls', 'quic', 'h3', 'http3'];

export function DnsPage() {
  const { config, update } = useStore();
  const dns = config.dns;
  const [editing, setEditing] = useState<{ link: Link; isNew: boolean } | null>(null);
  const ups = dns.upstreams.filter((u) => !u.disabled && u.tag);
  const upOptions = ups.map((u) => ({ value: u.tag, label: `上游  ${u.tag}` }));
  const reqOutbounds = [...upOptions, { value: 'asis', label: '原样转发  asis' }, { value: 'reject', label: '拒绝  reject' }];
  const resOutbounds = [{ value: 'accept', label: '接受  accept' }, { value: 'reject', label: '拒绝  reject' }, ...upOptions.map((o) => ({ ...o, label: `用 ${o.value} 重新查询` }))];

  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionTitle
          title="DNS 上游 upstream"
          desc="按域名分流要求 DNS 流量经过 dae。dial_mode 为 ip 时上游应答不能被污染，不建议使用国内公共 DNS 作为代理域名的上游。"
          right={
            <button className="btn-primary" onClick={() => setEditing({ isNew: true, link: { id: uid(), tag: '', value: 'udp://', disabled: false } })}>
              <Plus size={16} /> 添加上游
            </button>
          }
        />
        {dns.upstreams.length === 0 ? (
          <div className="card px-4 py-6 text-center text-sm text-ink/75">还没有上游</div>
        ) : (
          <SortableList
            items={dns.upstreams}
            onReorder={(u) => update((c) => void (c.dns.upstreams = u))}
            render={(u) => (
              <ItemCard
                key={u.id}
                id={u.id}
                name={u.tag || '上游'}
                disabled={u.disabled}
                icon={<ShieldCheck size={18} />}
                title={u.tag || '未命名'}
                badges={<span className="chip font-mono uppercase">{u.value.split('://')[0]}</span>}
                subtitle={<span className="font-mono">{u.value}</span>}
                onToggle={() => update((c) => void c.dns.upstreams.forEach((x) => x.id === u.id && (x.disabled = !x.disabled)))}
                onEdit={() => setEditing({ link: u, isNew: false })}
                onDelete={async () => {
                  const refs =
                    [...dns.request.rules, ...(dns.response.enabled ? dns.response.rules : [])].filter((r) => r.outbound.name === u.tag).length +
                    (dns.request.fallback === u.tag ? 1 : 0) +
                    (dns.response.enabled && dns.response.fallback === u.tag ? 1 : 0);
                  if (
                    refs > 0 &&
                    !(await confirmAction({
                      title: `删除上游 ${u.tag}？`,
                      body: `它被 ${refs} 处 DNS 规则或兜底引用。删除后这些引用会失效，配置将无法通过校验。可以用撤销恢复。`,
                      confirmLabel: '仍然删除',
                      danger: true,
                    }))
                  )
                    return;
                  update((c) => void (c.dns.upstreams = c.dns.upstreams.filter((x) => x.id !== u.id)));
                }}
              />
            )}
          />
        )}
      </section>

      <section>
        <SectionTitle title="请求分流 routing.request" desc="根据查询决定使用哪个上游，从上往下匹配。sub / node / subnode 用于 dae 自身拉取订阅、解析节点的请求，只能指向上游。" />
        <RuleList
          rules={dns.request.rules}
          onChange={(rules) => update((c) => void (c.dns.request.rules = rules))}
          funcs={DNS_REQUEST_FUNCS}
          outbounds={reqOutbounds}
          newRule={() => ({ conds: [{ name: 'qname', not: false, params: [{ key: 'geosite', val: '' }] }], outbound: { name: ups[0]?.tag ?? 'asis', params: [] }, disabled: false })}
          footer={<Fallback value={dns.request.fallback} options={reqOutbounds} onChange={(v) => update((c) => void (c.dns.request.fallback = v))} />}
        />
      </section>

      <section>
        <SectionTitle
          title="应答分流 routing.response"
          desc="根据应答决定接受，或换一个上游重新查询，常用于识别被污染的结果。"
          right={
            <label className="flex items-center gap-2 text-sm">
              启用
              <Switch checked={dns.response.enabled} onChange={(v) => update((c) => void (c.dns.response.enabled = v))} />
            </label>
          }
        />
        {dns.response.enabled && (
          <RuleList
            rules={dns.response.rules}
            onChange={(rules) => update((c) => void (c.dns.response.rules = rules))}
            funcs={DNS_RESPONSE_FUNCS}
            outbounds={resOutbounds}
            newRule={() => ({ conds: [{ name: 'upstream', not: false, params: [{ key: '', val: ups[0]?.tag ?? '' }] }], outbound: { name: 'accept', params: [] }, disabled: false })}
            footer={<Fallback value={dns.response.fallback} options={resOutbounds} onChange={(v) => update((c) => void (c.dns.response.fallback = v))} />}
          />
        )}
      </section>

      <section className="card px-4 pb-4 pt-3.5">
        <h2 className="mb-1 text-[15px] font-semibold">缓存与监听</h2>
        <div className="grid gap-x-10 lg:grid-cols-2">
          {DNS_FIELDS.map((f) => (
            <FieldInput
              key={f.key}
              spec={f}
              value={dns.params[f.key]}
              onChange={(v) =>
                update((c) => {
                  if (v === undefined) delete c.dns.params[f.key];
                  else c.dns.params[f.key] = v;
                })
              }
            />
          ))}
        </div>
        <h3 className="mb-1 mt-5 text-[14px] font-semibold">固定 TTL fixed_domain_ttl</h3>
        <p className="mb-3 text-xs text-ink/75">为指定域名设置固定 TTL，0 表示每次都向上游查询、不缓存。</p>
        <div className="flex flex-col gap-2">
          {dns.fixedTtl.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <input className="input font-mono" aria-label="域名" value={t.domain} placeholder="ddns.example.org" onChange={(e) => update((c) => void c.dns.fixedTtl.forEach((x) => x.id === t.id && (x.domain = e.target.value)))} />
              <input className="input !w-32 font-mono" aria-label="TTL（秒）" value={t.ttl} placeholder="TTL" onChange={(e) => update((c) => void c.dns.fixedTtl.forEach((x) => x.id === t.id && (x.ttl = e.target.value)))} />
              <button className="icon-btn hover:text-danger" onClick={() => update((c) => void (c.dns.fixedTtl = c.dns.fixedTtl.filter((x) => x.id !== t.id)))} aria-label="删除">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button className="btn-soft self-start" onClick={() => update((c) => void c.dns.fixedTtl.push({ id: uid(), domain: '', ttl: '0' }))}>
            <Plus size={16} /> 添加域名
          </button>
        </div>
      </section>

      {editing && (
        <UpstreamDialog
          initial={editing.link}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={(l) => {
            update((c) => {
              if (editing.isNew) c.dns.upstreams.push(l);
              else {
                const old = c.dns.upstreams.find((x) => x.id === l.id)!;
                // Keep DNS routing references valid when an upstream is renamed.
                if (old.tag && old.tag !== l.tag) {
                  for (const r of [...c.dns.request.rules, ...c.dns.response.rules]) if (r.outbound.name === old.tag) r.outbound.name = l.tag;
                  if (c.dns.request.fallback === old.tag) c.dns.request.fallback = l.tag;
                  if (c.dns.response.fallback === old.tag) c.dns.response.fallback = l.tag;
                }
                c.dns.upstreams = c.dns.upstreams.map((x) => (x.id === l.id ? l : x));
              }
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Fallback({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const opts = options.some((o) => o.value === value) ? options : [...options, { value, label: `${value}（未定义）` }];
  return (
    <div className="card flex flex-wrap items-center gap-3 border border-dashed border-ink/10 px-4 py-3">
      <CornerDownRight size={18} className="text-ink/75" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">兜底 fallback</div>
        <div className="text-[12px] text-ink/75">以上规则都未命中时使用</div>
      </div>
      <div className="w-full sm:w-72">
        <Select ariaLabel="兜底上游" value={value} onChange={onChange} options={opts} />
      </div>
    </div>
  );
}

function UpstreamDialog({ initial, isNew, onClose, onSave }: { initial: Link; isNew: boolean; onClose: () => void; onSave: (l: Link) => void }) {
  const ups = useStore((s) => s.config.dns.upstreams);
  const m = /^([a-z0-9+]+):\/\/(.*)$/.exec(initial.value);
  const [tag, setTag] = useState(initial.tag);
  const [scheme, setScheme] = useState(m?.[1] ?? 'udp');
  const [addr, setAddr] = useState(m?.[2] ?? initial.value);
  const tagErr = !tag ? '请填写名称' : !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tag) ? '只能以字母或下划线开头，由字母、数字、下划线组成' : ups.some((u) => u.id !== initial.id && u.tag === tag) ? '名称已存在' : '';
  return (
    <Modal
      open
      title={isNew ? '添加 DNS 上游' : '修改 DNS 上游'}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" disabled={!!tagErr || !addr} onClick={() => onSave({ ...initial, tag, value: `${scheme}://${addr.trim()}` })}>保存</button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="名称" hint={tagErr && tag ? <span className="text-danger">{tagErr}</span> : '在请求分流中引用。'}>
          <input className="input font-mono" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="googledns" />
        </Field>
        <div className="flex gap-2">
          <Field label="协议" className="w-36 shrink-0">
            <Select value={scheme} onChange={setScheme} options={SCHEMES.map((s) => ({ value: s, label: s }))} />
          </Field>
          <Field label="地址" className="flex-1" hint="host:port；https / h3 / http3 可带自定义路径，如 dns.example.com:443/dns-query">
            <input className="input font-mono" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="dns.google:53" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
