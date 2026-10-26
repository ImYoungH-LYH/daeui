import { CircleCheck, CirclePause, CirclePlay, Download, KeyRound, LogOut, Pause, Play, RefreshCw, RotateCw, Square, TriangleAlert, Zap } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Tip } from '../components/FieldInput';
import { confirmAction, toast } from '../components/feedback';
import { Field, Modal, Switch, cx } from '../components/ui';
import { type ServiceAction, api } from '../lib/api';
import { useServer } from '../server';

function fmtBytes(n?: number) {
  if (!n) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function fmtUptime(since?: string) {
  if (!since) return '—';
  const s = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} 天 ${h} 小时`;
  if (h) return `${h} 小时 ${m} 分钟`;
  return `${m} 分钟`;
}

function fmtDate(t?: string) {
  if (!t) return '未下载';
  return new Date(t).toLocaleString();
}

// `confirm` marks actions that interrupt traffic for the whole network; they ask first and look weaker.
const ACTIONS: { id: ServiceAction; label: string; icon: ReactNode; tip: string; when: 'running' | 'stopped' | 'any'; confirm?: string }[] = [
  { id: 'start', label: '启动', icon: <Play size={15} />, tip: '启动 dae 服务', when: 'stopped' },
  { id: 'reload', label: '热重载', icon: <Zap size={15} />, tip: '重新读取配置，不中断已建立的连接', when: 'running' },
  { id: 'restart', label: '重启', icon: <RotateCw size={15} />, tip: '完全重启 dae，会中断现有连接', when: 'running', confirm: '重启会断开所有已建立的连接（下载、视频、SSH 等），数秒后恢复。只是改了配置的话，用“热重载”即可，不会断线。' },
  { id: 'suspend', label: '挂起', icon: <Pause size={15} />, tip: '进入空载状态（所有流量直连），用热重载恢复', when: 'running', confirm: '挂起后 dae 不再分流，所有流量直连（代理暂时失效），直到你点“热重载”恢复。' },
  { id: 'stop', label: '停止', icon: <Square size={14} />, tip: '停止 dae 服务', when: 'running', confirm: '停止后代理和分流全部失效，所有流量直连；已建立的代理连接会断开。' },
];

export function ServicePage() {
  const { status, refreshStatus, setStatus, logout } = useServer();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; output?: string } | null>(null);
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    refreshStatus();
    const t = setInterval(refreshStatus, 5000);
    return () => clearInterval(t);
  }, [refreshStatus]);

  const act = async (a: ServiceAction, label: string, confirmText?: string) => {
    if (confirmText && !(await confirmAction({ title: `${label} dae？`, body: confirmText, confirmLabel: label, danger: true }))) return;
    setBusy(a);
    setMsg(null);
    try {
      const r = await api.action(a);
      setStatus(r.status);
      if (r.output) setMsg({ ok: true, text: `${label}完成`, output: r.output });
      else toast(`${label}完成`);
    } catch (e) {
      setMsg({ ok: false, text: `${label}失败：${(e as Error).message}`, output: (e as { output?: string }).output });
      refreshStatus();
    } finally {
      setBusy(null);
    }
  };

  const s = status;
  const rows: { label: string; value: ReactNode }[] = s
    ? [
        { label: 'dae 版本', value: s.installed ? s.version || '未知' : <span className="text-danger">未安装</span> },
        { label: '进程', value: s.running ? `PID ${s.pid}` : '—' },
        { label: '运行时长', value: s.running ? fmtUptime(s.startedAt) : '—' },
        { label: '内存占用', value: s.running ? fmtBytes(s.memRss) : '—' },
        { label: '内核', value: s.kernel || '—' },
        {
          label: '内核 BTF',
          value: s.btf ? (
            <span className="text-success-ink">{s.btf === 'builtin' ? '内核自带' : '外置 vmlinux-btf'}</span>
          ) : (
            <span className="text-danger">缺失，dae 无法启动</span>
          ),
        },
        { label: '配置文件', value: <code className="text-xs" title={s.configPath}>{s.configPath}{s.configExists ? '' : '（不存在）'}</code> },
      ]
    : [];

  return (
    <div className="flex flex-col gap-2">
      <section className="card px-4 pb-4 pt-3.5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold">dae 服务</h2>
          {s && (
            <span className={cx('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium', s.running ? 'bg-accent/20 text-success-ink' : 'bg-ink/[0.07] text-ink/80')}>
              {s.running ? <CirclePlay size={13} /> : <CirclePause size={13} />}
              {s.running ? '运行中' : '已停止'}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 text-sm">
            开机自启
            <Switch checked={!!s?.enabled} onChange={(v) => act(v ? 'enable' : 'disable', v ? '开启自启' : '关闭自启')} label="开机自启" />
            <button className="icon-btn" onClick={refreshStatus} title="刷新" aria-label="刷新">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
        {s && !s.btf && (
          <div className="mb-3 flex gap-2 rounded-2xl bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
            <TriangleAlert size={16} className="shrink-0" />
            <span>
              当前内核 {s.kernel} 没有 BTF 信息，dae 的 eBPF 程序无法加载。请安装与内核版本完全一致的 vmlinux-btf 包，或刷入开启 CONFIG_DEBUG_INFO_BTF 的固件。
            </span>
          </div>
        )}
        <div className="grid gap-x-10 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="flex min-h-[38px] min-w-0 flex-col justify-center gap-0.5 border-b border-ink/10 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="shrink-0 whitespace-nowrap text-ink/75">{r.label}</span>
              <span className="min-w-0 max-w-full truncate sm:text-right">{r.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {ACTIONS.filter((a) => a.when === 'any' || (s?.running ? a.when === 'running' : a.when === 'stopped')).map((a, i, list) => (
            <span key={a.id} className="contents">
              {/* Separate the actions that cut connections from the safe ones. */}
              {a.confirm && !list[i - 1]?.confirm && <span className="mx-1 hidden h-5 w-px bg-ink/15 sm:block" aria-hidden />}
              <button
                className={a.id === 'start' || a.id === 'reload' ? 'btn-primary' : a.id === 'suspend' ? 'btn-soft' : 'btn-caution'}
                disabled={!!busy || !s?.installed}
                onClick={() => act(a.id, a.label, a.confirm)}
                title={a.tip}
              >
                {busy === a.id ? <RefreshCw size={15} className="animate-spin" /> : a.icon}
                {a.label}
              </button>
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink/75">改了配置用“热重载”即可，不会断开现有连接；状态每 5 秒自动刷新。</p>
        {msg && (
          <div className={cx('mt-3 rounded-2xl px-3.5 py-2.5 text-xs', msg.ok ? 'bg-accent/15 text-success-ink' : 'bg-danger/10 text-danger')}>
            <div className="flex items-center gap-1.5">
              {msg.ok ? <CircleCheck size={14} /> : <TriangleAlert size={14} />}
              {msg.text}
            </div>
            {msg.output && <pre className="mt-2 max-h-[45vh] overflow-auto whitespace-pre-wrap font-mono text-[12px] text-ink/85">{msg.output}</pre>}
          </div>
        )}
      </section>

      <div className="grid gap-2 lg:grid-cols-2">
        <GeoCard running={!!s?.running} geoip={s?.geoip.modTime} geosite={s?.geosite.modTime} sizes={[s?.geoip.size, s?.geosite.size]} onDone={refreshStatus} />
        <section className="card px-4 pb-4 pt-3.5">
          <h2 className="mb-2 text-[15px] font-semibold">账户</h2>
          <p className="mb-3 text-xs text-ink/75">面板密码只保存为 bcrypt 哈希。修改密码会让其他已登录的浏览器下线。</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-soft" onClick={() => setPwOpen(true)}>
              <KeyRound size={15} /> 修改密码
            </button>
            <button className="btn-soft" onClick={logout}>
              <LogOut size={15} /> 退出登录
            </button>
          </div>
        </section>
      </div>

      <LogCard />
      {pwOpen && <PasswordDialog onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function GeoCard({ running, geoip, geosite, sizes, onDone }: { running: boolean; geoip?: string; geosite?: string; sizes: (number | undefined)[]; onDone: () => void }) {
  const [mirror, setMirror] = useState(() => {
    try {
      return localStorage.getItem('daeui.mirror') ?? '';
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const update = async () => {
    setBusy(true);
    setMsg(null);
    try {
      localStorage.setItem('daeui.mirror', mirror);
    } catch {
      // ignore
    }
    try {
      await api.geoUpdate(mirror.trim(), true);
      setMsg({ ok: true, text: running ? '已更新并热重载 dae' : '已更新' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
      onDone();
    }
  };

  return (
    <section className="card px-4 pb-4 pt-3.5">
      <div className="mb-2 flex items-center gap-1.5">
        <h2 className="text-[15px] font-semibold">规则数据库</h2>
        <Tip>从 v2fly 下载 geoip.dat 与 geosite.dat（dlc.dat）到 /usr/share/dae。dae 运行中时会自动热重载。</Tip>
      </div>
      <div className="mb-3 grid gap-1 text-xs text-ink/80">
        <div className="flex justify-between">
          <span>geoip.dat</span>
          <span>
            {fmtDate(geoip)} · {fmtBytes(sizes[0])}
          </span>
        </div>
        <div className="flex justify-between">
          <span>geosite.dat</span>
          <span>
            {fmtDate(geosite)} · {fmtBytes(sizes[1])}
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <input className="input" aria-label="下载镜像前缀" value={mirror} onChange={(e) => setMirror(e.target.value)} placeholder="下载镜像前缀（可选），如 https://ghfast.top/" />
        <button className="btn-primary shrink-0" onClick={update} disabled={busy}>
          {busy ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
          {busy ? '下载中' : '更新'}
        </button>
      </div>
      {msg && <div className={cx('mt-2 text-xs', msg.ok ? 'text-success-ink' : 'text-danger')}>{msg.text}</div>}
    </section>
  );
}

const LEVEL_TONE: [RegExp, string][] = [
  [/level=(error|fatal|panic)|\b(ERRO|FATA|PANI)\b/, 'text-danger'],
  [/level=warn|\bWARN\b/, 'text-warn'],
  [/level=debug|level=trace|\b(DEBU|TRAC)\b/, 'text-ink/75'],
];

function LogCard() {
  const [lines, setLines] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [level, setLevel] = useState<'all' | 'warn' | 'error'>('all');
  const [connected, setConnected] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const es = new EventSource('/api/logs/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      if (pausedRef.current) return;
      setLines((ls) => {
        const next = ls.length > 2000 ? ls.slice(-1500) : ls.slice();
        next.push(ev.data);
        return next;
      });
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (el && !paused) el.scrollTop = el.scrollHeight;
  }, [lines, paused]);

  const needle = filter.toLowerCase();
  const shown = lines.filter(
    (l) =>
      (!needle || l.toLowerCase().includes(needle)) &&
      (level === 'all' || LEVEL_TONE[0][0].test(l) || (level === 'warn' && LEVEL_TONE[1][0].test(l))),
  );

  return (
    <section className="card px-4 pb-4 pt-3.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold">实时日志</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink/75">
          <span className={cx('h-2 w-2 rounded-full', connected ? 'bg-accent' : 'bg-ink/35')} aria-hidden />
          {connected ? '已连接' : '未连接'}
        </span>
        <div className="segmented ml-auto" role="group" aria-label="日志级别">
          {(
            [
              ['all', '全部'],
              ['warn', '警告及以上'],
              ['error', '仅错误'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} data-active={level === v} aria-pressed={level === v} onClick={() => setLevel(v)}>
              {label}
            </button>
          ))}
        </div>
        <input className="input !w-40" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="搜索日志" aria-label="搜索日志" />
        <button className="btn-soft" onClick={() => setPaused(!paused)}>
          {paused ? <Play size={14} /> : <Pause size={14} />}
          {paused ? '继续' : '暂停'}
        </button>
        <button className="btn-soft" onClick={() => setLines([])}>
          清屏
        </button>
      </div>
      <div ref={boxRef} role="log" aria-label="dae 日志" tabIndex={0} className="h-[420px] max-h-[60vh] overflow-auto rounded-2xl bg-surface/80 px-3 py-2 font-mono text-[12px] leading-5">
        {shown.length === 0 ? (
          <div className="py-10 text-center text-ink/75">暂无日志</div>
        ) : (
          shown.map((l, i) => (
            <div key={i} className={cx('whitespace-pre-wrap break-all', LEVEL_TONE.find(([re]) => re.test(l))?.[1])}>
              {l}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [old, setOld] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const save = async () => {
    setErr('');
    if (pw !== pw2) return setErr('两次输入的新密码不一致');
    try {
      await api.changePassword(old, pw);
      setDone(true);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <Modal
      open
      title="修改密码"
      onClose={onClose}
      footer={
        done ? (
          <button className="btn-primary" onClick={onClose}>完成</button>
        ) : (
          <>
            <button className="btn-ghost" onClick={onClose}>取消</button>
            <button className="btn-primary" onClick={save} disabled={!old || !pw}>保存</button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-sm">密码已修改，其他浏览器的登录已失效。</p>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="原密码">
            <input className="input" type="password" autoComplete="current-password" value={old} onChange={(e) => setOld(e.target.value)} />
          </Field>
          <Field label="新密码" hint="至少 6 位">
            <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Field label="确认新密码">
            <input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
          {err && <div className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{err}</div>}
        </div>
      )}
    </Modal>
  );
}
