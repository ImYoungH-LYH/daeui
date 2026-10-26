// Non-blocking toasts and a promise-based confirm dialog that replaces window.confirm().

import { CircleCheck, TriangleAlert, X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { create } from 'zustand';
import { Modal, cx } from './ui';

interface Toast {
  id: number;
  tone: 'success' | 'error' | 'info';
  text: ReactNode;
}

interface ConfirmRequest {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface FeedbackState {
  toasts: Toast[];
  confirm: ConfirmRequest | null;
}

const useFeedback = create<FeedbackState>(() => ({ toasts: [], confirm: null }));
let seq = 0;

export function toast(text: ReactNode, tone: Toast['tone'] = 'success', ms = 4000) {
  const id = ++seq;
  useFeedback.setState((s) => ({ toasts: [...s.toasts, { id, tone, text }] }));
  setTimeout(() => useFeedback.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

/** Ask the user to confirm; resolves false when cancelled or dismissed. */
export function confirmAction(opts: { title: string; body: ReactNode; confirmLabel: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    useFeedback.getState().confirm?.resolve(false);
    useFeedback.setState({ confirm: { ...opts, resolve } });
  });
}

export function FeedbackHost() {
  const { toasts, confirm } = useFeedback();
  const close = (ok: boolean) => {
    confirm?.resolve(ok);
    useFeedback.setState({ confirm: null });
  };

  // A pending confirm must not leak if the host unmounts.
  useEffect(() => () => useFeedback.getState().confirm?.resolve(false), []);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl px-4 py-2.5 text-sm shadow-pop animate-[toast-in_180ms_cubic-bezier(0.16,1,0.3,1)]',
              t.tone === 'error' ? 'bg-danger text-white' : 'bg-pill text-pill-ink',
            )}
          >
            {t.tone === 'error' ? <TriangleAlert size={16} className="mt-0.5 shrink-0" /> : <CircleCheck size={16} className="mt-0.5 shrink-0 text-accent" />}
            <span className="min-w-0">{t.text}</span>
            <button
              className="-mr-1 ml-1 shrink-0 rounded-full p-0.5 opacity-70 hover:opacity-100"
              onClick={() => useFeedback.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }))}
              aria-label="关闭提示"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      {confirm && (
        <Modal
          open
          title={confirm.title}
          onClose={() => close(false)}
          footer={
            <>
              {/* For dangerous actions the safe choice takes focus, so Enter cannot trigger them. */}
              <button className="btn-ghost" onClick={() => close(false)} data-autofocus={confirm.danger || undefined}>
                取消
              </button>
              <button className={confirm.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)} data-autofocus={!confirm.danger || undefined}>
                {confirm.confirmLabel}
              </button>
            </>
          }
        >
          <div className="text-sm leading-relaxed">{confirm.body}</div>
        </Modal>
      )}
    </>
  );
}

/** Offers the starter template from empty states; replacing the config always asks first. */
export function StarterTemplateButton({ onLoad }: { onLoad: () => void }) {
  const load = async () => {
    const ok = await confirmAction({
      title: '载入入门模板？',
      body: '入门模板包含示例订阅、一个节点组、常用的直连规则和 DNS 分流，会替换编辑器里的当前配置。可以用撤销恢复。',
      confirmLabel: '载入模板',
    });
    if (ok) {
      onLoad();
      toast('已载入入门模板，记得把示例订阅换成你自己的');
    }
  };
  return (
    <button className="btn-soft" onClick={load}>
      载入入门模板
    </button>
  );
}
