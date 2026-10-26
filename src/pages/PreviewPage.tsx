import { Check, Copy, Download } from 'lucide-react';
import { Fragment, type ReactNode, useMemo, useState } from 'react';
import { type DaeConfig, toDae } from '../lib/dae/model';
import { useServer } from '../server';
import { useStore } from '../store';

export function downloadConfig(c: DaeConfig) {
  const blob = new Blob([toDae(c)], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'config.dae';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const TOKEN_RE = /(#.*$)|('[^']*'|"[^"]*")|(->|&&)|(\b[a-zA-Z_][\w-]*(?=\s*\())|(^\s*[a-zA-Z_][\w.\-]*(?=\s*[:{]))/g;

function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN_RE)) {
    if (m.index! > last) out.push(line.slice(last, m.index));
    const [text, comment, str, op, fn] = m;
    const cls = comment ? (text.startsWith('#@off') ? 'text-ink/60 line-through' : 'text-ink/75') : str ? 'text-success-ink' : op ? 'text-warn font-semibold' : fn ? 'text-info' : 'text-ink font-semibold';
    out.push(
      <span key={m.index} className={cls}>
        {text}
      </span>,
    );
    last = m.index! + text.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function PreviewPage() {
  const config = useStore((s) => s.config);
  const routerMode = useServer((s) => s.phase === 'ready');
  const configPath = useServer((s) => s.status?.configPath ?? '/etc/dae/config.dae');
  const text = useMemo(() => toDae(config), [config]);
  const [copied, setCopied] = useState(false);
  const lines = text.split('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked outside secure contexts.
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="card flex flex-wrap items-center gap-3 px-5 py-3">
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">config.dae</div>
          {routerMode ? (
            <div className="text-xs text-ink/75">
              这是点击“应用到 dae”时将写入 <code>{configPath}</code> 的内容（先经 <code>dae validate</code> 校验，权限 0600）。
            </div>
          ) : (
            <div className="text-xs text-ink/75">
              放到 <code>/usr/local/etc/dae/config.dae</code>（或你的配置目录），dae 要求权限为 0600 或 0640：
              <code className="ml-1">chmod 0600 config.dae</code>，然后执行 <code>dae reload</code> 热重载。
            </div>
          )}
        </div>
        <button className="btn-soft" onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? '已复制' : '复制'}
        </button>
        <button className="btn-primary" onClick={() => downloadConfig(config)}>
          <Download size={16} /> 下载
        </button>
      </div>
      <div className="card overflow-x-auto p-0">
        <pre className="py-3 font-mono text-[12px] leading-6">
          {lines.map((l, i) => (
            <Fragment key={i}>
              <span className="inline-block w-12 select-none pr-4 text-right text-ink/60">{i + 1}</span>
              {highlight(l)}
              {'\n'}
            </Fragment>
          ))}
        </pre>
      </div>
    </div>
  );
}
