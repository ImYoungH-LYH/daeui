import { ChevronDown, Layers, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CondEditor } from '../components/CondEditor';
import { FieldInput, useAddSignal } from '../components/FieldInput';
import { StarterTemplateButton, confirmAction } from '../components/feedback';
import { ItemCard, SortableList } from '../components/SortableList';
import { Empty, Field, Modal, SectionTitle, Select, cx } from '../components/ui';
import { type Filter, type Group, starterConfig, uid } from '../lib/dae/model';
import { GROUP_FILTER_FUNCS, GROUP_OVERRIDE_FIELDS, POLICIES } from '../lib/dae/schema';
import { condsText, describeCond } from '../lib/dae/text';
import { useStore } from '../store';

export function GroupPage() {
  const { config, update, replace } = useStore();
  const [editing, setEditing] = useState<{ group: Group; isNew: boolean } | null>(null);

  const openAdd = () => setEditing({ isNew: true, group: { id: uid(), name: '', filters: [], policy: { name: 'min_moving_avg', params: [] }, overrides: {}, disabled: false } });
  useAddSignal(openAdd);

  const usedBy = (name: string) => config.routing.rules.filter((r) => r.outbound.name === name || r.outbound.name === `must_${name}`).length + (config.routing.fallback.name === name ? 1 : 0);

  return (
    <div>
      <SectionTitle
        title="节点组 group"
        desc="节点组从全局节点池中筛选节点，并按策略为每个连接选出一个节点。节点组可在分流规则中作为出站使用。"
        right={
          <button className="btn-primary" onClick={openAdd}>
            <Plus size={16} /> 添加节点组
          </button>
        }
      />
      {config.groups.length === 0 ? (
        <Empty icon={<Layers size={32} />} title="还没有节点组" desc="至少需要一个节点组作为代理出站。" action={
            <div className="flex flex-wrap justify-center gap-2">
              <button className="btn-primary" onClick={openAdd}>
                <Plus size={16} />
                添加节点组
              </button>
              <StarterTemplateButton onLoad={() => replace(starterConfig())} />
            </div>
          }
        />
      ) : (
        <SortableList
          items={config.groups}
          onReorder={(groups) => update((c) => void (c.groups = groups))}
          render={(g) => {
            const policy = POLICIES.find((p) => p.name === g.policy.name);
            const n = usedBy(g.name);
            const overrides = Object.keys(g.overrides).length;
            return (
              <ItemCard
                key={g.id}
                id={g.id}
                name={g.name}
                disabled={g.disabled}
                icon={<Layers size={18} />}
                title={g.name || '未命名'}
                badges={
                  <>
                    <span className="chip">
                      {policy?.label ?? g.policy.name}
                      {g.policy.params.length ? ` (${g.policy.params.map((p) => p.val).join(',')})` : ''}
                    </span>
                    {n > 0 && <span className="chip">被 {n} 处引用</span>}
                    {overrides > 0 && <span className="chip">覆盖 {overrides} 项检测设置</span>}
                  </>
                }
                subtitle={
                  g.filters.length
                    ? g.filters
                        .map((f) => {
                          const lat = f.annotation.find((a) => a.key === 'add_latency')?.val;
                          return f.conds.map((c) => describeCond(c, GROUP_FILTER_FUNCS)).join(' 且 ') + (lat ? `（延迟 ${lat}）` : '');
                        })
                        .join('  或  ')
                    : '不筛选，使用全部节点'
                }
                onToggle={() => update((c) => void c.groups.forEach((x) => x.id === g.id && (x.disabled = !x.disabled)))}
                onEdit={() => setEditing({ group: g, isNew: false })}
                onDelete={async () => {
                  if (
                    n > 0 &&
                    !(await confirmAction({
                      title: `删除节点组 ${g.name}？`,
                      body: `它被 ${n} 处分流规则或兜底出站引用。删除后这些引用会失效，配置将无法通过校验，需要再改为其他出站。可以用撤销恢复。`,
                      confirmLabel: '仍然删除',
                      danger: true,
                    }))
                  )
                    return;
                  update((c) => void (c.groups = c.groups.filter((x) => x.id !== g.id)));
                }}
              />
            );
          }}
        />
      )}
      {editing && (
        <GroupDialog
          initial={editing.group}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={(g) => {
            update((c) => {
              if (editing.isNew) c.groups.push(g);
              else {
                const old = c.groups.find((x) => x.id === g.id)!;
                // Keep routing references valid when a group is renamed.
                if (old.name && old.name !== g.name) {
                  for (const r of c.routing.rules) {
                    if (r.outbound.name === old.name) r.outbound.name = g.name;
                    if (r.outbound.name === `must_${old.name}`) r.outbound.name = `must_${g.name}`;
                  }
                  if (c.routing.fallback.name === old.name) c.routing.fallback.name = g.name;
                }
                c.groups = c.groups.map((x) => (x.id === g.id ? g : x));
              }
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function GroupDialog({ initial, isNew, onClose, onSave }: { initial: Group; isNew: boolean; onClose: () => void; onSave: (g: Group) => void }) {
  const groups = useStore((s) => s.config.groups);
  const subs = useStore((s) => s.config.subscriptions);
  const [g, setG] = useState<Group>(structuredClone(initial));
  const [showAdvanced, setShowAdvanced] = useState(Object.keys(initial.overrides).length > 0);

  const nameErr = !g.name
    ? '请填写组名'
    : !/^[a-zA-Z_][a-zA-Z0-9_\-.]*$/.test(g.name)
      ? '只能以字母或下划线开头，由字母、数字、_ - . 组成'
      : ['direct', 'block', 'must_direct', 'must_rules'].includes(g.name) || g.name.startsWith('must_')
        ? '不能使用内置出站名或 must_ 前缀'
        : groups.some((x) => x.id !== g.id && x.name === g.name)
          ? '组名已存在'
          : '';
  const fixedIdx = g.policy.params[0]?.val ?? '0';
  const setFilter = (i: number, f: Partial<Filter>) => setG({ ...g, filters: g.filters.map((x, j) => (j === i ? { ...x, ...f } : x)) });
  const latency = (f: Filter) => f.annotation.find((a) => a.key === 'add_latency')?.val ?? '';

  return (
    <Modal
      open
      wide
      title={isNew ? '添加节点组' : `修改节点组 ${initial.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" disabled={!!nameErr} onClick={() => onSave(g)}>保存</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="组名" hint={nameErr && g.name ? <span className="text-danger">{nameErr}</span> : '在分流规则中用作出站名。'}>
          <input className="input font-mono" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="proxy" autoFocus={isNew} />
        </Field>
        <div className="flex gap-2">
          <Field label="选择策略 policy" className="flex-1" hint={POLICIES.find((p) => p.name === g.policy.name)?.desc}>
            <Select
              value={g.policy.name}
              onChange={(v) => setG({ ...g, policy: { name: v, params: v === 'fixed' ? [{ key: '', val: '0' }] : [] } })}
              options={POLICIES.map((p) => ({ value: p.name, label: `${p.label}  ${p.name}` }))}
            />
          </Field>
          {g.policy.name === 'fixed' && (
            <Field label="节点序号" className="w-24">
              <input className="input font-mono" value={fixedIdx} onChange={(e) => setG({ ...g, policy: { name: 'fixed', params: [{ key: '', val: e.target.value }] } })} />
            </Field>
          )}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-medium">节点筛选 filter</span>
          <span className="text-xs text-ink/75">不添加则使用全部节点；多条筛选之间是“或”关系</span>
        </div>
        {subs.some((s) => s.tag) && (
          <div className="mb-2 text-xs text-ink/75">
            可用订阅标签：{subs.filter((s) => s.tag).map((s) => <code key={s.id} className="mr-1.5">{s.tag}</code>)}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {g.filters.map((f, i) => (
            <div key={f.id} className="rounded-2xl border border-ink/10 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium">{i === 0 ? '筛选 1' : `或 筛选 ${i + 1}`}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink/75">延迟偏移</span>
                  <input
                    aria-label="延迟偏移 add_latency"
                    className="input !h-8 !w-28 font-mono text-xs"
                    placeholder="如 -500ms"
                    value={latency(f)}
                    onChange={(e) => {
                      const rest = f.annotation.filter((a) => a.key !== 'add_latency');
                      setFilter(i, { annotation: e.target.value ? [...rest, { key: 'add_latency', val: e.target.value }] : rest });
                    }}
                    title="add_latency：给这批节点的测速结果加上固定偏移，可用于实现基于延迟的故障转移"
                  />
                  <button className="icon-btn hover:text-danger" onClick={() => setG({ ...g, filters: g.filters.filter((_, j) => j !== i) })} aria-label="删除筛选">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <CondEditor conds={f.conds} funcs={GROUP_FILTER_FUNCS} onChange={(conds) => setFilter(i, { conds })} />
              {f.conds.length > 0 && <code className="mt-3 block truncate rounded-xl bg-ink/[0.04] px-2.5 py-1.5 text-xs text-ink/75">filter: {condsText(f.conds)}</code>}
            </div>
          ))}
          <button
            className="btn-soft self-start"
            onClick={() => setG({ ...g, filters: [...g.filters, { id: uid(), conds: [{ name: 'name', not: false, params: [{ key: 'keyword', val: '' }] }], annotation: [] }] })}
          >
            <Plus size={16} /> 添加筛选
          </button>
        </div>
      </div>

      <button className="mt-5 flex items-center gap-1 text-sm font-medium" onClick={() => setShowAdvanced(!showAdvanced)}>
        <ChevronDown size={16} className={cx('transition-transform', !showAdvanced && '-rotate-90')} /> 覆盖全局检测设置
      </button>
      {showAdvanced && (
        <div className="mt-2">
          {GROUP_OVERRIDE_FIELDS.map((f) => (
            <FieldInput
              key={f.key}
              spec={f}
              value={g.overrides[f.key]}
              onChange={(v) => {
                const o = { ...g.overrides };
                if (v === undefined) delete o[f.key];
                else o[f.key] = v;
                setG({ ...g, overrides: o });
              }}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}
