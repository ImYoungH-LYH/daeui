import { CircleCheck, RefreshCw, TriangleAlert, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { type DiffResult, diffConfig } from '../lib/diff';
import { toDae } from '../lib/dae/model';
import { useDirty, useServer } from '../server';
import { useStore } from '../store';
import { confirmAction, toast } from './feedback';
import { Modal, cx } from './ui';

const SECTION_LABEL: Record<string, string> = {
  global: '全局设置',
  subscription: '订阅',
  node: '节点',
  group: '节点组',
  routing: '分流规则',
  dns: 'DNS',
  include: 'include',
};

const hhmm = (t: number) => new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

function DiffView({ diff }: { diff: DiffResult }) {
  return (
    <div className="max-h-[50vh] overflow-auto rounded-2xl bg-ink/[0.04] py-1.5 font-mono text-[12px] leading-5">
      {diff.hunks.map((h, i) => (
        <div key={i} className={cx(i > 0 && 'mt-1.5 border-t border-dashed border-ink/15 pt-1.5')}>
          {h.lines.map((l, j) => (
            <div
              key={j}
              className={cx(
                'whitespace-pre px-3',
                l.kind === 'add' && 'bg-accent/15 text-success-ink',
                l.kind === 'del' && 'bg-danger/10 text-danger',
                l.kind === 'same' && 'text-ink/80',
              )}
            >
              <span className="mr-2 inline-block w-3 select-none">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span>
              {l.text || ' '}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Previews the change, then validates, saves and hot-reloads the config on the router. */
export function ApplyButton({ errors }: { errors: number }) {
  const config = useStore((s) => s.config);
  const { markSaved, refreshStatus, status, loadRemoteConfig, baseline, appliedAt } = useServer();
  const dirty = useDirty();
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [failure, setFailure] = useState<{ title: string; output?: string } | null>(null);

  const next = useMemo(() => (reviewing ? toDae(config, { header: false }) : ''), [reviewing, config]);
  const diff = useMemo(() => (reviewing && baseline !== null ? diffConfig(baseline, next) : null), [reviewing, baseline, next]);

  const apply = async () => {
    setReviewing(false);
    const text = toDae(config);
    setBusy(true);
    try {
      await api.saveConfig(text, true);
      markSaved(text, true);
      toast(status?.running ? '已应用并热重载，现有连接不受影响' : '已应用并启动 dae');
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 422) setFailure({ title: 'dae 校验未通过，路由器上的配置未改动。', output: err.output });
      else if (err.status === 502) {
        markSaved(text);
        setFailure({ title: err.message, output: err.output });
      } else setFailure({ title: `应用失败：${err.message}` });
    } finally {
      setBusy(false);
      refreshStatus();
    }
  };

  // Ctrl/⌘+S opens the review instead of the browser's "save page".
  const openRef = useRef(() => {});
  openRef.current = () => {
    if (dirty && !busy) setReviewing(true);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        openRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const discard = async () => {
    const ok = await confirmAction({
      title: '放弃更改',
      body: '丢弃尚未应用的修改，重新读取路由器上的配置？可以用撤销找回。',
      confirmLabel: '重新读取',
    });
    if (ok) await loadRemoteConfig();
  };

  const sections = diff?.sections.map((s) => SECTION_LABEL[s] ?? s).join('、');

  return (
    <>
      {dirty && (
        <button className="btn-ghost hidden !px-3 text-xs text-ink/80 sm:inline-flex" onClick={discard} title="丢弃本地修改，重新读取路由器上的配置">
          放弃更改
        </button>
      )}
      {dirty || busy ? (
        <button className="btn-primary" onClick={() => setReviewing(true)} disabled={busy} title="预览变更后，用 dae validate 校验、保存并热重载（Ctrl+S）">
          {busy ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
          {busy ? '应用中…' : '应用到 dae'}
        </button>
      ) : (
        // Nothing to do: a status, not a control.
        <span className="inline-flex h-8 items-center gap-1.5 px-2 text-sm text-ink/80" title="路由器上的配置与编辑器一致" role="status">
          <CircleCheck size={15} className="text-success-ink" />
          {appliedAt ? `已应用 ${hhmm(appliedAt)}` : '已同步'}
        </span>
      )}

      {reviewing && (
        <Modal
          open
          wide
          title="应用到 dae"
          onClose={() => setReviewing(false)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setReviewing(false)}>取消</button>
              <button className="btn-primary" onClick={apply} data-autofocus>
                <Upload size={15} /> 确认应用
              </button>
            </>
          }
        >
          <div className="mb-3 flex flex-col gap-1.5 text-sm">
            {diff ? (
              baseline === '' ? (
                <p>路由器上还没有 config.dae，将新建 {diff.added} 行配置。</p>
              ) : (
                <p>
                  将修改 <span className="font-medium text-success-ink">+{diff.added}</span> / <span className="font-medium text-danger">−{diff.removed}</span> 行
                  {sections ? `，涉及 ${sections}` : ''}。
                </p>
              )
            ) : (
              <p>路由器上的配置无法解析，无法对比差异；确认后将整体覆盖它。</p>
            )}
            <p className="text-xs text-ink/75">
              先由 dae validate 校验，通过后保存并{status?.running ? '热重载（不中断现有连接）' : '启动 dae'}；校验失败不会改动路由器上的配置。
            </p>
            {errors > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-warn">
                <TriangleAlert size={14} className="shrink-0" /> 静态检查有 {errors} 个错误，dae 校验很可能不通过。
              </p>
            )}
          </div>
          {diff && diff.hunks.length > 0 && <DiffView diff={diff} />}
        </Modal>
      )}

      {failure && (
        <Modal open title="未能应用" onClose={() => setFailure(null)} footer={<button className="btn-primary" onClick={() => setFailure(null)} data-autofocus>好的</button>}>
          <div className="flex items-start gap-2 text-sm text-danger">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            {failure.title}
          </div>
          {failure.output && <pre className="mt-3 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-2xl bg-ink/[0.05] px-3 py-2 font-mono text-[12px]">{failure.output}</pre>}
        </Modal>
      )}
    </>
  );
}
