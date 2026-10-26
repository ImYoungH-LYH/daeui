import { AlertTriangle, ArrowRight, CheckCircle2, CirclePause, CirclePlay, FileUp, Play, RefreshCw, XCircle, Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from '../components/feedback';
import { OutboundPill } from '../components/RuleList';
import { cx } from '../components/ui';
import { api } from '../lib/api';
import { GLOBAL_FIELDS } from '../lib/dae/schema';
import { outboundText } from '../lib/dae/text';
import type { Issue } from '../lib/dae/validate';
import { useDirty, useServer } from '../server';
import { type Tab, useStore } from '../store';

function fmtUptime(since?: string) {
  if (!since) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d} 天 ${h} 小时` : h ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
}

/** Router mode: is dae healthy, and is the router running what the editor shows? */
function StatusStrip() {
  const { status, appliedAt, setStatus, refreshStatus } = useServer();
  const dirty = useDirty();
  const go = useStore((s) => s.go);
  const [busy, setBusy] = useState(false);
  if (!status) return null;

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.action(status.running ? 'reload' : 'start');
      setStatus(r.status);
      toast(status.running ? '已热重载，现有连接不受影响' : 'dae 已启动');
    } catch (e) {
      toast(`${status.running ? '热重载' : '启动'}失败：${(e as Error).message}`, 'error', 6000);
      refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const facts = [
    status.running && status.startedAt ? `已运行 ${fmtUptime(status.startedAt)}` : null,
    status.btf ? null : '内核缺少 BTF',
    dirty ? null : appliedAt ? `${new Date(appliedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} 应用` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className={cx('inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-sm font-medium', status.running ? 'bg-accent/20 text-success-ink' : 'bg-ink/[0.07] text-ink/80')}>
        {status.running ? <CirclePlay size={15} /> : <CirclePause size={15} />}
        dae {status.running ? '运行中' : '已停止'}
      </span>
      {facts.length > 0 && <span className={cx('text-sm', status.btf ? 'text-ink/75' : 'text-danger')}>{facts.join(' · ')}</span>}
      {dirty && <span className="text-sm text-info">有未应用的修改，点右上角“应用到 dae”生效</span>}
      <div className="ml-auto flex gap-2">
        <button className="btn-soft" onClick={run} disabled={busy || !status.installed} title={status.running ? '重新读取配置，不中断已建立的连接' : '启动 dae 服务'}>
          {busy ? <RefreshCw size={15} className="animate-spin" /> : status.running ? <Zap size={15} /> : <Play size={15} />}
          {status.running ? '热重载' : '启动'}
        </button>
        <button className="btn-ghost" onClick={() => go('service')}>
          运行详情 <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

export function OverviewPage({ issues, onImport }: { issues: Issue[]; onImport: () => void }) {
  const { config, go } = useStore();
  const routerMode = useServer((s) => s.phase === 'ready');
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  const active = <T extends { disabled: boolean }>(xs: T[]) => xs.filter((x) => !x.disabled).length;

  const counts: { tab: Tab; label: string; value: number }[] = [
    { tab: 'subscription', label: '订阅', value: active(config.subscriptions) },
    { tab: 'node', label: '节点', value: active(config.nodes) },
    { tab: 'group', label: '节点组', value: active(config.groups) },
    { tab: 'routing', label: '分流规则', value: active(config.routing.rules) },
    { tab: 'dns', label: 'DNS 上游', value: active(config.dns.upstreams) },
  ];

  const pageTab: Record<string, Tab> = { global: 'global', subscription: 'subscription', node: 'node', group: 'group', routing: 'routing', dns: 'dns' };
  const changed = Object.keys(config.global).filter((k) => GLOBAL_FIELDS.find((f) => f.key === k)?.default !== config.global[k]);

  return (
    <div className="flex flex-col gap-2">
      <section className="card flex flex-col gap-4 px-5 py-4">
        {routerMode ? (
          <StatusStrip />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold">dae 配置</h2>
              <p className="mt-0.5 text-xs text-ink/75">在「配置」里编辑，完成后到「预览导出」下载 config.dae。</p>
            </div>
            <button className="btn-soft" onClick={onImport}>
              <FileUp size={16} /> 导入已有配置
            </button>
          </div>
        )}
        <nav className="flex flex-wrap gap-1.5" aria-label="配置内容">
          {counts.map((c) => (
            <button key={c.tab} onClick={() => go('editor', c.tab)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink/[0.05] px-3 text-sm transition-colors hover:bg-ink/[0.1]">
              <span className="text-ink/80">{c.label}</span>
              <span className="font-semibold tabular-nums">{c.value}</span>
            </button>
          ))}
        </nav>
      </section>

      <div className="grid gap-2 lg:grid-cols-[1.4fr_1fr]">
        <section className="card px-5 py-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            {errors.length ? <XCircle size={18} className="text-danger" /> : <CheckCircle2 size={18} className="text-success-ink" />}
            配置检查
            {issues.length > 0 && (
              <span className="text-sm font-normal text-ink/75">
                {errors.length} 个错误 · {warns.length} 个提醒
              </span>
            )}
          </h2>
          {issues.length === 0 ? (
            <p className="mt-1.5 text-sm text-ink/75">
              没有发现问题。{routerMode ? '应用时还会由路由器上的 dae validate 再校验一次。' : '部署前建议在设备上运行 dae validate -c config.dae。'}
            </p>
          ) : (
            <>
              <ul className="mt-2 flex flex-col gap-0.5">
                {[...errors, ...warns].map((i, k) => (
                  <li key={k}>
                    <button onClick={() => go('editor', pageTab[i.page])} className="flex w-full items-start gap-2.5 rounded-2xl px-3 py-2 text-left text-sm hover:bg-ink/[0.04]">
                      {i.level === 'error' ? <XCircle size={16} className="mt-0.5 shrink-0 text-danger" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />}
                      <span>
                        <span className="font-medium">{i.where}</span>
                        <span className="text-ink/75">：{i.message}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink/75">这里只做静态检查，最终以 dae validate 为准。</p>
            </>
          )}

          <h3 className="mb-2 mt-5 text-[14px] font-semibold">已修改的全局设置</h3>
          <div className="flex flex-wrap gap-1.5">
            {changed.length ? (
              changed.map((k) => (
                <button key={k} onClick={() => go('editor', 'global')} className="chip font-mono hover:text-ink">
                  {k}: {config.global[k]}
                </button>
              ))
            ) : (
              <span className="text-sm text-ink/75">全部使用默认值</span>
            )}
          </div>
        </section>

        <section className="card px-5 py-4">
          <h2 className="mb-3 text-[15px] font-semibold">流量走向</h2>
          <ol className="flex flex-col gap-1.5 text-sm">
            {config.routing.rules
              .filter((r) => !r.disabled)
              .slice(0, 8)
              .map((r, i) => (
                <li key={r.id} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-ink/75">{i + 1}</span>
                  <code className="min-w-0 flex-1 truncate text-xs">{r.conds.map((c) => `${c.not ? '!' : ''}${c.name}(${c.params.map((p) => (p.key ? `${p.key}:${p.val}` : p.val)).join(',')})`).join(' && ')}</code>
                  <OutboundPill name={r.outbound.name} label={outboundText(r.outbound)} />
                </li>
              ))}
            {active(config.routing.rules) > 8 && (
              <li>
                <button className="pl-7 text-xs text-ink/75 hover:text-ink" onClick={() => go('editor', 'routing')}>
                  … 还有 {active(config.routing.rules) - 8} 条
                </button>
              </li>
            )}
            <li className="mt-1 flex items-center gap-2 border-t border-ink/10 pt-2">
              <span className="w-5" />
              <span className="flex-1 text-xs text-ink/75">其余流量</span>
              <OutboundPill name={config.routing.fallback.name} label={outboundText(config.routing.fallback)} />
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
