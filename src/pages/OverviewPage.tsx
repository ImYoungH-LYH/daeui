import { AlertTriangle, CheckCircle2, FileUp, Globe, Layers, Rss, Server, Split, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { OutboundPill } from '../components/RuleList';
import { cx } from '../components/ui';
import { GLOBAL_FIELDS } from '../lib/dae/schema';
import { outboundText } from '../lib/dae/text';
import type { Issue } from '../lib/dae/validate';
import { type Tab, useStore } from '../store';

export function OverviewPage({ issues, onImport }: { issues: Issue[]; onImport: () => void }) {
  const { config, go } = useStore();
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  const active = <T extends { disabled: boolean }>(xs: T[]) => xs.filter((x) => !x.disabled).length;

  const tiles: { tab: Tab; label: string; value: number; sub: string; icon: ReactNode }[] = [
    { tab: 'subscription', label: '订阅', value: active(config.subscriptions), sub: `${config.subscriptions.length} 个，含停用`, icon: <Rss size={18} /> },
    { tab: 'node', label: '节点', value: active(config.nodes), sub: `${config.nodes.filter((n) => n.value.includes('->')).length} 个链式代理`, icon: <Server size={18} /> },
    { tab: 'group', label: '节点组', value: active(config.groups), sub: config.groups.map((g) => g.name).slice(0, 3).join('、') || '—', icon: <Layers size={18} /> },
    { tab: 'routing', label: '分流规则', value: active(config.routing.rules), sub: `兜底 → ${outboundText(config.routing.fallback)}`, icon: <Split size={18} /> },
    { tab: 'dns', label: 'DNS 上游', value: active(config.dns.upstreams), sub: `${config.dns.request.rules.length} 条请求规则`, icon: <Globe size={18} /> },
  ];

  const pageTab: Record<string, Tab> = { global: 'global', subscription: 'subscription', node: 'node', group: 'group', routing: 'routing', dns: 'dns' };
  const changed = Object.keys(config.global).filter((k) => GLOBAL_FIELDS.find((f) => f.key === k)?.default !== config.global[k]);

  return (
    <div className="flex flex-col gap-2">
      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold">配置概览</h2>
          <button className="btn-soft" onClick={onImport}>
            <FileUp size={16} /> 导入已有配置
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {tiles.map((t) => (
            <button key={t.tab} onClick={() => go('editor', t.tab)} className="rounded-[20px] bg-ink/[0.04] px-4 py-3 text-left transition-colors hover:bg-ink/[0.08]">
              <div className="flex items-center justify-between text-ink/60">
                <span className="text-sm">{t.label}</span>
                {t.icon}
              </div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">{t.value}</div>
              <div className="mt-1 truncate text-xs text-ink/60">{t.sub}</div>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-2 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            {errors.length ? <XCircle size={18} className="text-danger" /> : <CheckCircle2 size={18} className="text-accent" />}
            配置检查
            <span className="text-sm font-normal text-ink/60">
              {errors.length} 个错误 · {warns.length} 个提醒
            </span>
          </h3>
          {issues.length === 0 ? (
            <p className="text-sm text-ink/60">没有发现问题，可以到「预览导出」下载 config.dae。</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {[...errors, ...warns].map((i, k) => (
                <li key={k}>
                  <button onClick={() => go('editor', pageTab[i.page])} className="flex w-full items-start gap-2.5 rounded-2xl px-3 py-2 text-left text-sm hover:bg-ink/[0.04]">
                    {i.level === 'error' ? <XCircle size={16} className="mt-0.5 shrink-0 text-danger" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-glow" />}
                    <span>
                      <span className="font-medium">{i.where}</span>
                      <span className="text-ink/60">：{i.message}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-ink/60">这里只做静态检查；部署前建议在设备上运行 <code>dae validate -c config.dae</code>。</p>
        </section>

        <section className="card p-5">
          <h3 className="mb-3 font-semibold">流量走向</h3>
          <ol className="flex flex-col gap-1.5 text-sm">
            {config.routing.rules
              .filter((r) => !r.disabled)
              .slice(0, 8)
              .map((r, i) => (
                <li key={r.id} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-ink/60">{i + 1}</span>
                  <code className="min-w-0 flex-1 truncate text-xs">{r.conds.map((c) => `${c.not ? '!' : ''}${c.name}(${c.params.map((p) => (p.key ? `${p.key}:${p.val}` : p.val)).join(',')})`).join(' && ')}</code>
                  <OutboundPill name={r.outbound.name} label={outboundText(r.outbound)} />
                </li>
              ))}
            {active(config.routing.rules) > 8 && <li className="pl-7 text-xs text-ink/60">… 还有 {active(config.routing.rules) - 8} 条</li>}
            <li className="mt-1 flex items-center gap-2 border-t border-ink/10 pt-2">
              <span className="w-5" />
              <span className="flex-1 text-xs text-ink/60">其余流量</span>
              <OutboundPill name={config.routing.fallback.name} label={outboundText(config.routing.fallback)} />
            </li>
          </ol>
          <h3 className="mb-2 mt-5 font-semibold">已修改的全局设置</h3>
          <div className="flex flex-wrap gap-1.5">
            {changed.length ? (
              changed.map((k) => (
                <button key={k} onClick={() => go('editor', 'global')} className={cx('chip font-mono hover:text-ink')}>
                  {k}: {config.global[k]}
                </button>
              ))
            ) : (
              <span className="text-sm text-ink/60">全部使用默认值</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
