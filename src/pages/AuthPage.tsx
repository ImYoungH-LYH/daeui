import { LockKeyhole } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api';
import { useServer } from '../server';

export function AuthPage({ mode }: { mode: 'setup' | 'login' }) {
  const afterAuth = useServer((s) => s.afterAuth);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setup = mode === 'setup';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (setup && pw !== pw2) return setErr('两次输入的密码不一致');
    setBusy(true);
    try {
      if (setup) await api.setup(pw);
      else await api.login(pw);
      await afterAuth();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="mb-1 flex items-center gap-2">
          <img src="./favicon.svg" alt="" className="h-7 w-7" />
          <span className="text-lg font-bold tracking-tight">DAEUI</span>
        </div>
        <h1 className="mt-4 text-lg font-semibold">{setup ? '设置管理密码' : '密码登录'}</h1>
        <p className="mb-4 mt-1 text-xs text-ink/60">{setup ? '首次使用，请设置访问本面板的密码（至少 6 位）。' : '请输入访问密码后继续。'}</p>
        <label className="label">{setup ? '新密码' : '访问密码'}</label>
        <input className="input" type="password" autoComplete={setup ? 'new-password' : 'current-password'} autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
        {setup && (
          <>
            <label className="label mt-3">确认密码</label>
            <input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </>
        )}
        {err && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{err}</div>}
        <button className="btn-primary mt-5 w-full" disabled={busy || !pw}>
          <LockKeyhole size={15} /> {busy ? '请稍候…' : setup ? '设置并进入' : '登录'}
        </button>
      </form>
    </div>
  );
}
