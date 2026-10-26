import { ArrowDown, Link2, Plus, Rss, Server, X } from 'lucide-react';
import { useState } from 'react';
import { useAddSignal } from '../components/FieldInput';
import { StarterTemplateButton } from '../components/feedback';
import { ItemCard, SortableList } from '../components/SortableList';
import { Empty, Field, Modal, SectionTitle } from '../components/ui';
import { joinChain, linkInfo, splitChain } from '../lib/links';
import { type Link, starterConfig, uid } from '../lib/dae/model';
import { useStore } from '../store';

type Kind = 'subscription' | 'node';

const TEXT = {
  subscription: {
    title: '订阅管理 subscription',
    desc: '订阅解析出的节点会并入全局节点池。给订阅加标签后，可在节点组中用 subtag() 按订阅筛选节点。',
    empty: '还没有订阅',
    add: '添加订阅',
    edit: '修改订阅',
    tagLabel: '订阅标签',
    tagHint: '可选。只能用字母、数字、下划线，用于 subtag() 筛选。',
    linkLabel: '订阅链接',
    linkHint: '支持 https://、file://（相对 /etc/dae 的路径）以及 https-file://（拉取失败时回退到本地缓存）。',
    placeholder: 'https://example.com/subscription/link',
  },
  node: {
    title: '节点 node',
    desc: '手动添加的节点并入全局节点池。支持 socks5、http(s)、ss、ssr、vmess、vless、trojan、tuic、juicity、hysteria2 等协议，可用链式代理串联多个节点。',
    empty: '还没有手动添加的节点',
    add: '添加节点',
    edit: '修改节点',
    tagLabel: '节点名称',
    tagHint: '可选。用于在节点组中用 name() 精确筛选。',
    linkLabel: '节点链接',
    linkHint: '',
    placeholder: 'vless://…',
  },
} as const;

const TAG_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function LinksPage({ kind }: { kind: Kind }) {
  const { config, update, replace } = useStore();
  const t = TEXT[kind];
  const list = kind === 'subscription' ? config.subscriptions : config.nodes;
  const [editing, setEditing] = useState<Link | null>(null);
  const [isNew, setIsNew] = useState(false);

  const mutate = (fn: (l: Link[]) => Link[]) =>
    update((c) => {
      if (kind === 'subscription') c.subscriptions = fn(c.subscriptions);
      else c.nodes = fn(c.nodes);
    });

  const openAdd = () => {
    setIsNew(true);
    setEditing({ id: uid(), tag: '', value: '', disabled: false });
  };
  useAddSignal(openAdd);

  return (
    <div>
      <SectionTitle
        title={t.title}
        desc={t.desc}
        right={
          <button className="btn-primary" onClick={openAdd}>
            <Plus size={16} /> {t.add}
          </button>
        }
      />
      {list.length === 0 ? (
        <Empty icon={kind === 'subscription' ? <Rss size={32} /> : <Server size={32} />} title={t.empty} action={
            <div className="flex flex-wrap justify-center gap-2">
              <button className="btn-primary" onClick={openAdd}>
                <Plus size={16} />
                {t.add}
              </button>
              <StarterTemplateButton onLoad={() => replace(starterConfig())} />
            </div>
          }
        />
      ) : (
        <SortableList
          items={list}
          onReorder={(items) => mutate(() => items)}
          render={(l) => {
            const hops = kind === 'node' ? splitChain(l.value) : [l.value];
            const info = linkInfo(hops[hops.length - 1] ?? '');
            return (
              <ItemCard
                key={l.id}
                id={l.id}
                name={l.tag || info.name || l.value}
                disabled={l.disabled}
                icon={kind === 'subscription' ? <Rss size={18} /> : hops.length > 1 ? <Link2 size={18} /> : <Server size={18} />}
                title={l.tag || info.name || (kind === 'subscription' ? '未命名订阅' : '未命名节点')}
                badges={
                  <>
                    <span className="chip font-mono uppercase">{hops.length > 1 ? hops.map((h) => linkInfo(h).scheme).join(' → ') : info.scheme}</span>
                    {!l.tag && <span className="chip">无标签</span>}
                    {hops.length > 1 && <span className="chip">链式 {hops.length} 跳</span>}
                  </>
                }
                subtitle={<span className="font-mono">{kind === 'node' && info.host ? `${info.host}` : l.value}</span>}
                onToggle={() => mutate((ls) => ls.map((x) => (x.id === l.id ? { ...x, disabled: !x.disabled } : x)))}
                onEdit={() => {
                  setIsNew(false);
                  setEditing(l);
                }}
                onDelete={() => mutate((ls) => ls.filter((x) => x.id !== l.id))}
              />
            );
          }}
        />
      )}
      {editing && (
        <LinkDialog
          kind={kind}
          initial={editing}
          isNew={isNew}
          existing={list}
          onClose={() => setEditing(null)}
          onSave={(items) => {
            mutate((ls) => (isNew ? [...ls, ...items] : ls.map((x) => (x.id === items[0].id ? items[0] : x))));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function LinkDialog({
  kind,
  initial,
  isNew,
  existing,
  onClose,
  onSave,
}: {
  kind: Kind;
  initial: Link;
  isNew: boolean;
  existing: Link[];
  onClose: () => void;
  onSave: (items: Link[]) => void;
}) {
  const t = TEXT[kind];
  const [tag, setTag] = useState(initial.tag);
  const [hops, setHops] = useState<string[]>(kind === 'node' ? (splitChain(initial.value).length ? splitChain(initial.value) : ['']) : [initial.value]);
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const tagErr = tag && !TAG_RE.test(tag) ? '只能以字母或下划线开头，由字母、数字、下划线组成' : existing.some((x) => x.id !== initial.id && x.tag && x.tag === tag) ? '名称已存在' : '';
  const value = kind === 'node' ? joinChain(hops) : hops[0].trim();

  const save = () => {
    if (bulk) {
      const lines = bulkText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      onSave(lines.map((v) => ({ id: uid(), tag: '', value: v, disabled: false })));
    } else {
      onSave([{ ...initial, tag: tag.trim(), value }]);
    }
  };

  return (
    <Modal
      open
      title={isNew ? t.add : t.edit}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={save} disabled={bulk ? !bulkText.trim() : !value || !!tagErr}>保存</button>
        </>
      }
    >
      {isNew && (
        <div className="segmented mb-4">
          {['单个添加', '批量添加'].map((l, i) => (
            <button key={l} data-active={bulk === (i === 1)} onClick={() => setBulk(i === 1)}>
              {l}
            </button>
          ))}
        </div>
      )}
      {bulk ? (
        <Field label="每行一个链接" hint="批量添加的条目没有标签，可稍后单独编辑。">
          <textarea className="input h-48 resize-y py-2 font-mono text-[12px]" value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={t.placeholder} />
        </Field>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label={t.tagLabel} hint={tagErr ? <span className="text-danger">{tagErr}</span> : t.tagHint}>
            <input className="input font-mono" value={tag} onChange={(e) => setTag(e.target.value)} placeholder={kind === 'subscription' ? 'my_sub' : 'node1'} />
          </Field>
          {kind === 'subscription' ? (
            <Field label={t.linkLabel} hint={t.linkHint}>
              <input className="input font-mono" value={hops[0]} onChange={(e) => setHops([e.target.value])} placeholder={t.placeholder} />
            </Field>
          ) : (
            <div>
              <span className="label">{hops.length > 1 ? '链式代理（流量从上往下依次经过）' : t.linkLabel}</span>
              <div className="flex flex-col gap-1.5">
                {hops.map((h, i) => (
                  <div key={i}>
                    {i > 0 && (
                      <div className="flex justify-center py-0.5 text-ink/75">
                        <ArrowDown size={14} />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {hops.length > 1 && <span className="w-12 shrink-0 text-xs text-ink/75">{i === 0 ? '前置' : i === hops.length - 1 ? '出口' : `第 ${i + 1} 跳`}</span>}
                      <input className="input font-mono" aria-label={hops.length > 1 ? `第 ${i + 1} 跳链接` : t.linkLabel} value={h} placeholder={t.placeholder} onChange={(e) => setHops(hops.map((x, j) => (j === i ? e.target.value : x)))} />
                      {hops.length > 1 && (
                        <button className="icon-btn hover:text-danger" onClick={() => setHops(hops.filter((_, j) => j !== i))} aria-label="移除">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn-ghost mt-2 !h-8 !px-2 text-[12px] text-ink/75" onClick={() => setHops([...hops, ''])}>
                <Plus size={15} /> 添加一跳（链式代理）
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
