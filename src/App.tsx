import { Activity, CircleGauge, Download, FileCode2, FileUp, Globe, Layers, Moon, PanelLeftClose, PanelLeftOpen, Plus, Redo2, Rss, Server, Settings2, SlidersHorizontal, Split, Sun, Undo2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ImportDialog } from './pages/ImportDialog';
import { DnsPage } from './pages/DnsPage';
import { GlobalPage } from './pages/GlobalPage';
import { GroupPage } from './pages/GroupPage';
import { LinksPage } from './pages/LinksPage';
import { OverviewPage } from './pages/OverviewPage';
import { PreviewPage, downloadConfig } from './pages/PreviewPage';
import { RoutingPage } from './pages/RoutingPage';
import { ServicePage } from './pages/ServicePage';
import { ApplyButton } from './components/ApplyButton';
import { useServer } from './server';
import { cx } from './components/ui';
import { validate } from './lib/dae/validate';
import { type Page, type Tab, useStore } from './store';

const PAGES: { id: Page; label: string; icon: ReactNode }[] = [
  { id: 'overview', label: '概览', icon: <CircleGauge size={18} /> },
  { id: 'editor', label: '配置', icon: <SlidersHorizontal size={18} /> },
  { id: 'preview', label: '预览导出', icon: <FileCode2 size={18} /> },
];

const SERVICE_PAGE = { id: 'service' as Page, label: '运行', icon: <Activity size={18} /> };

const TABS: { id: Tab; label: string; icon: ReactNode; addable?: boolean }[] = [
  { id: 'global', label: '全局设置', icon: <Settings2 size={16} /> },
  { id: 'subscription', label: '订阅管理', icon: <Rss size={16} />, addable: true },
  { id: 'node', label: '节点', icon: <Server size={16} />, addable: true },
  { id: 'group', label: '节点组', icon: <Layers size={16} />, addable: true },
  { id: 'routing', label: '分流规则', icon: <Split size={16} />, addable: true },
  { id: 'dns', label: 'DNS 设置', icon: <Globe size={16} /> },
];

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const v = localStorage.getItem('daeui.theme');
      if (v) return v === 'dark';
    } catch {
      // ignore
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('daeui.theme', dark ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [dark]);
  return [dark, setDark] as const;
}

export default function App() {
  const { page, tab, go, undo, redo, past, future, config, requestAdd } = useStore();
  const [dark, setDark] = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const issues = useMemo(() => validate(config), [config]);
  const errors = issues.filter((i) => i.level === 'error').length;
  const { phase, status, loadError } = useServer();
  const routerMode = phase === 'ready';
  const pages = routerMode ? [PAGES[0], SERVICE_PAGE, PAGES[1], PAGES[2]] : PAGES;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const activeTab = TABS.find((t) => t.id === tab)!;
  const stats = [
    { label: '订阅', value: config.subscriptions.filter((x) => !x.disabled).length },
    { label: '节点', value: config.nodes.filter((x) => !x.disabled).length },
    { label: '节点组', value: config.groups.filter((x) => !x.disabled).length },
    { label: '分流规则', value: config.routing.rules.filter((x) => !x.disabled).length },
  ];

  return (
    <div className="flex h-full bg-sunken/20 dark:bg-canvas/40">
      {/* Sidebar */}
      <aside className={cx('hidden md:flex shrink-0 flex-col bg-sunken/75 p-2 backdrop-blur-[7px] transition-[width] duration-200 dark:bg-canvas/75', collapsed ? 'w-[60px]' : 'w-64')}>
        <div className={cx('mb-3 flex h-10 items-center', collapsed ? 'justify-center' : 'justify-between pl-2')}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <img src="./favicon.svg" alt="" className="h-6 w-6" />
              <span className="text-[16px] font-bold tracking-tight">DAEUI</span>
              <span className="rounded-full bg-ink/[0.07] px-1.5 font-mono text-[10px] text-ink/60">dae v2.1.1</span>
            </div>
          )}
          <button className="icon-btn" onClick={() => setCollapsed(!collapsed)} aria-label="折叠侧栏">
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
        <nav className="flex flex-col gap-0.5">
          {pages.map((p) => (
            <button
              key={p.id}
              onClick={() => go(p.id)}
              title={p.label}
              className={cx(
                'flex h-9 items-center gap-2.5 rounded-full px-3 text-sm transition-colors',
                collapsed && 'justify-center px-0',
                page === p.id ? 'bg-pill text-pill-ink' : 'text-ink hover:bg-ink/[0.07]',
              )}
            >
              {p.icon}
              {!collapsed && <span>{p.label}</span>}
              {!collapsed && p.id === 'overview' && errors > 0 && <span className="ml-auto rounded-full bg-danger px-1.5 text-[11px] leading-4 text-white">{errors}</span>}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        {!collapsed && (
          <div className="card mb-2 grid grid-cols-2 gap-x-3 gap-y-2 p-3">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-xs text-ink/70">{s.label}</div>
                <div className="text-sm tabular-nums">{s.value}</div>
              </div>
            ))}
            <div className="col-span-2 mt-1 flex items-center gap-1.5 border-t border-ink/10 pt-2 text-xs">
              <span className={cx('h-2 w-2 rounded-full', errors ? 'bg-danger' : 'bg-accent')} />
              <span className={errors ? 'text-danger' : 'text-ink/70'}>{errors ? `${errors} 个错误` : '配置有效'}</span>
            </div>
            {routerMode && status && (
              <button className="col-span-2 flex items-center gap-1.5 text-left text-xs" onClick={() => go('service')}>
                <span className={cx('h-2 w-2 rounded-full', status.running ? 'bg-accent' : 'bg-ink/30')} />
                <span className="text-ink/70">dae {status.running ? '运行中' : '已停止'}</span>
              </button>
            )}
          </div>
        )}
        <div className={cx('flex gap-2', collapsed ? 'flex-col items-center' : 'items-center justify-end')}>
          {[
            { label: '导入 .dae', icon: <FileUp size={16} />, on: () => setImportOpen(true) },
            { label: '下载 config.dae', icon: <Download size={16} />, on: () => downloadConfig(config) },
            { label: '切换主题', icon: dark ? <Sun size={16} /> : <Moon size={16} />, on: () => setDark(!dark) },
          ].map((b) => (
            <button key={b.label} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.07] text-ink/80 transition-colors hover:bg-ink/[0.12] hover:text-ink" onClick={b.on} title={b.label} aria-label={b.label}>
              {b.icon}
            </button>
          ))}
        </div>
      </aside>

      {/* Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 px-2">
          {page === 'editor' ? (
            <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => go('editor', t.id)}
                  className={cx(
                    'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition-colors',
                    tab === t.id ? 'bg-pill text-pill-ink' : 'text-ink hover:bg-ink/[0.07]',
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex-1 px-2 text-[14px] font-semibold">{pages.find((p) => p.id === page)?.label}</div>
          )}
          <div className="flex shrink-0 items-center gap-1">
            <button className="icon-btn" onClick={undo} disabled={!past.length} title="撤销 (Ctrl+Z)" aria-label="撤销">
              <Undo2 size={16} />
            </button>
            <button className="icon-btn" onClick={redo} disabled={!future.length} title="重做 (Ctrl+Shift+Z)" aria-label="重做">
              <Redo2 size={16} />
            </button>
            {routerMode && <ApplyButton errors={errors} />}
            {page === 'editor' && activeTab.addable && (
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-ink transition hover:brightness-95" onClick={requestAdd} title="新增" aria-label="新增">
                <Plus size={18} />
              </button>
            )}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-2 pb-24 md:pb-3">
          <div>
            {routerMode && loadError && page !== 'service' && (
              <div className="card mb-2 border border-danger/30 px-4 py-3 text-xs text-danger">
                路由器上的 config.dae 无法被编辑器解析（{loadError}），当前显示的是本地草稿。点击“应用到 dae”会覆盖路由器上的配置。
              </div>
            )}
            {page === 'service' && routerMode && <ServicePage />}
            {page === 'overview' && <OverviewPage issues={issues} onImport={() => setImportOpen(true)} />}
            {page === 'preview' && <PreviewPage />}
            {page === 'editor' && tab === 'global' && <GlobalPage />}
            {page === 'editor' && tab === 'subscription' && <LinksPage kind="subscription" />}
            {page === 'editor' && tab === 'node' && <LinksPage kind="node" />}
            {page === 'editor' && tab === 'group' && <GroupPage />}
            {page === 'editor' && tab === 'routing' && <RoutingPage />}
            {page === 'editor' && tab === 'dns' && <DnsPage />}
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="glass fixed inset-x-0 bottom-0 z-40 flex border-t border-ink/10 md:hidden">
        {pages.map((p) => (
          <button key={p.id} onClick={() => go(p.id)} className={cx('flex flex-1 flex-col items-center gap-0.5 py-2 text-xs', page === p.id ? 'text-ink' : 'text-ink/60')}>
            {p.icon}
            {p.label}
          </button>
        ))}
        <button onClick={() => setImportOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-ink/60">
          <FileUp size={18} />
          导入
        </button>
        <button onClick={() => setDark(!dark)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-ink/60">
          {dark ? <Sun size={18} /> : <Moon size={18} />}
          主题
        </button>
      </nav>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
