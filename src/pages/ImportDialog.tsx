import { FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { confirmAction, toast } from '../components/feedback';
import { Modal } from '../components/ui';
import { emptyConfig, parseConfig, starterConfig } from '../lib/dae/model';
import { useStore } from '../store';

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const replace = useStore((s) => s.replace);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setErr('');
    onClose();
  };

  const doImport = () => {
    try {
      replace(parseConfig(text));
      setText('');
      close();
      toast('已导入，可用撤销恢复之前的配置');
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const reset = async (empty: boolean) => {
    const ok = await confirmAction({
      title: empty ? '清空当前配置？' : '载入入门模板？',
      body: empty ? '编辑器里的配置会被清空。可以用撤销恢复。' : '入门模板会替换编辑器里的当前配置。可以用撤销恢复。',
      confirmLabel: empty ? '清空' : '载入模板',
      danger: empty,
    });
    if (!ok) return;
    replace(empty ? emptyConfig() : starterConfig());
    close();
  };

  return (
    <Modal
      open={open}
      wide
      title="导入配置"
      onClose={close}
      footer={
        <>
          <button className="btn-ghost mr-auto text-danger" onClick={() => reset(true)}>清空</button>
          <button className="btn-ghost" onClick={() => reset(false)}>载入入门模板</button>
          <button className="btn-primary" onClick={doImport} disabled={!text.trim()}>导入</button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink/75">
        粘贴或选择一个 .dae 文件。导入会替换当前配置（可撤销）。注释不会保留；<code>include</code> 等未识别的配置块会原样保留。
      </p>
      <button className="btn-soft mb-3" onClick={() => fileRef.current?.click()}>
        <FileUp size={16} /> 选择文件
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".dae,.conf,.txt,text/plain"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setText(await f.text());
          e.target.value = '';
        }}
      />
      <textarea
        className="input h-72 resize-y py-2 font-mono text-[12px]"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setErr('');
        }}
        placeholder={'global {\n    ...\n}'}
        spellCheck={false}
      />
      {err && <div className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">解析失败：{err}</div>}
    </Modal>
  );
}
