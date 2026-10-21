import { CircleCheck, RefreshCw, Upload } from 'lucide-react';
import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { toDae } from '../lib/dae/model';
import { useDirty, useServer } from '../server';
import { useStore } from '../store';
import { Modal } from './ui';

/** Validates, saves and hot-reloads the config on the router. */
export function ApplyButton({ errors }: { errors: number }) {
  const config = useStore((s) => s.config);
  const { markSaved, refreshStatus, status, loadRemoteConfig } = useServer();
  const dirty = useDirty();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; title: string; output?: string } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const apply = async () => {
    const text = toDae(config);
    setBusy(true);
    try {
      const r = await api.saveConfig(text, true);
      markSaved(text);
      setResult({ ok: true, title: status?.running ? '已保存并热重载，现有连接不受影响。' : '已保存并启动 dae。', output: r.output || undefined });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 422) setResult({ ok: false, title: 'dae 校验未通过，路由器上的配置未改动。', output: err.output });
      else if (err.status === 502) {
        markSaved(text);
        setResult({ ok: false, title: err.message, output: err.output });
      } else setResult({ ok: false, title: `应用失败：${err.message}` });
    } finally {
      setBusy(false);
      refreshStatus();
    }
  };

  return (
    <>
      {dirty && (
        <button className="btn-ghost !px-3 text-xs text-ink/70" onClick={() => setConfirmDiscard(true)} title="丢弃本地修改，重新读取路由器上的配置">
          放弃更改
        </button>
      )}
      <button
        className={dirty ? 'btn-primary' : 'btn-soft'}
        onClick={apply}
        disabled={busy}
        title={errors ? `存在 ${errors} 个静态检查错误，dae 校验可能不通过` : '用 dae validate 校验后保存，并热重载'}
      >
        {busy ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
        {dirty ? '应用到 dae' : '已同步'}
        {dirty && <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" />}
      </button>
      {result && (
        <Modal open title={result.ok ? '已应用' : '未能应用'} onClose={() => setResult(null)} footer={<button className="btn-primary" onClick={() => setResult(null)}>好的</button>}>
          <div className={result.ok ? 'flex items-center gap-2 text-sm' : 'text-sm text-danger'}>
            {result.ok && <CircleCheck size={16} className="text-[rgb(28,130,72)]" />}
            {result.title}
          </div>
          {result.output && <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-ink/[0.05] px-3 py-2 font-mono text-[11.5px]">{result.output}</pre>}
        </Modal>
      )}
      {confirmDiscard && (
        <Modal
          open
          title="放弃更改"
          onClose={() => setConfirmDiscard(false)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setConfirmDiscard(false)}>取消</button>
              <button
                className="btn-primary"
                onClick={async () => {
                  setConfirmDiscard(false);
                  await loadRemoteConfig();
                }}
              >
                重新读取
              </button>
            </>
          }
        >
          <p className="text-sm">丢弃尚未应用的修改，重新读取路由器上的配置？可以用撤销找回。</p>
        </Modal>
      )}
    </>
  );
}
