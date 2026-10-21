import { Trash2 } from 'lucide-react';
import { FieldInput } from '../components/FieldInput';
import { GLOBAL_FIELDS, GLOBAL_GROUPS } from '../lib/dae/schema';
import { useStore } from '../store';

export function GlobalPage() {
  const { config, update } = useStore();
  const setKey = (k: string, v: string | undefined) =>
    update((c) => {
      if (v === undefined) delete c.global[k];
      else c.global[k] = v;
    });
  const unknown = Object.keys(config.global).filter((k) => !GLOBAL_FIELDS.some((f) => f.key === k));

  return (
    <div className="flex flex-col gap-2">
      {GLOBAL_GROUPS.map((g) => (
        <section key={g.title} className="card px-4 pb-3 pt-3.5">
          <h3 className="mb-1 text-[14px] font-semibold">{g.title}</h3>
          <div className="grid gap-x-10 lg:grid-cols-2">
            {g.fields.map((f) => (
              <FieldInput key={f.key} spec={f} value={config.global[f.key]} onChange={(v) => setKey(f.key, v)} />
            ))}
          </div>
        </section>
      ))}
      {unknown.length > 0 && (
        <section className="card px-4 pb-3 pt-3.5">
          <h3 className="text-[14px] font-semibold">其他字段</h3>
          <p className="mb-2 text-xs text-ink/60">导入的配置中包含 DaeUI 未识别的字段，将原样保留。</p>
          <div className="grid gap-x-10 lg:grid-cols-2">
            {unknown.map((k) => (
              <div key={k} className="flex min-h-[44px] items-center gap-2 border-b border-ink/10 py-1.5">
                <code className="w-48 shrink-0 truncate text-[12px]">{k}</code>
                <input className="input font-mono text-[12px]" value={config.global[k]} onChange={(e) => setKey(k, e.target.value)} />
                <button className="icon-btn hover:text-danger" onClick={() => setKey(k, undefined)} aria-label="删除">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="px-3 py-1 text-xs text-ink/60">带绿点的项已修改；未修改的项不会写入配置文件，dae 使用默认值。</p>
    </div>
  );
}
