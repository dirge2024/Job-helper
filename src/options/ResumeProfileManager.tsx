import React, { useRef, useState } from 'react';
import { MessageService } from '../shared/message';
import type { Message, MessageResponse, ResumeProfileSummary } from '../shared/types';

export type UnsavedChoice = 'save' | 'discard' | 'cancel';

export async function runGuardedProfileChange(
  dirty: boolean,
  save: () => Promise<boolean>,
  action: () => Promise<void>,
  choose: () => Promise<UnsavedChoice>,
): Promise<void> {
  if (!dirty) return action();
  const choice = await choose();
  if (choice === 'cancel') return;
  if (choice === 'save' && !await save()) return;
  await action();
}

type SendMessage = (message: Message) => Promise<MessageResponse<ResumeProfileSummary>>;

interface Props {
  summary: ResumeProfileSummary;
  dirty: boolean;
  onSave: () => Promise<boolean>;
  onSummaryChange: (summary: ResumeProfileSummary) => void;
  onActiveProfileChange: (id: string) => Promise<void>;
  sendMessage?: SendMessage;
}

type NameMode = 'create' | 'rename';

export function ResumeProfileManager({
  summary,
  dirty,
  onSave,
  onSummaryChange,
  onActiveProfileChange,
  sendMessage = message => MessageService.sendMessage<ResumeProfileSummary>(message),
}: Props) {
  const [nameMode, setNameMode] = useState<NameMode | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);
  const guardResolver = useRef<((choice: UnsavedChoice) => void) | null>(null);
  const active = summary.profiles.find(item => item.id === summary.activeProfileId) ?? summary.profiles[0];

  const chooseUnsaved = () => new Promise<UnsavedChoice>(resolve => {
    guardResolver.current = resolve;
    setGuardOpen(true);
  });

  const resolveGuard = (choice: UnsavedChoice) => {
    setGuardOpen(false);
    guardResolver.current?.(choice);
    guardResolver.current = null;
  };

  const apply = async (message: Message, reload: boolean) => {
    setBusy(true);
    setError('');
    try {
      const response = await sendMessage(message);
      if (!response.success || !response.data) {
        setError(response.error || '操作失败，请稍后重试');
        return;
      }
      onSummaryChange(response.data);
      if (reload) await onActiveProfileChange(response.data.activeProfileId);
    } catch {
      setError('操作失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const guarded = (action: () => Promise<void>) =>
    runGuardedProfileChange(dirty, onSave, action, chooseUnsaved);

  const submitName = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setNameError('简历名称不能为空');
    if (summary.profiles.some(item => item.name === trimmed && (nameMode !== 'rename' || item.id !== active?.id))) {
      return setNameError('该简历名称已存在');
    }
    setNameError('');
    if (nameMode === 'rename' && active) {
      await apply({ type: 'RENAME_RESUME_PROFILE', payload: { id: active.id, name: trimmed } }, false);
      setNameMode(null);
      return;
    }
    await guarded(async () => {
      setBusy(true);
      try {
        const created = await sendMessage({ type: 'CREATE_RESUME_PROFILE' });
        if (!created.success || !created.data) throw new Error(created.error);
        const id = created.data.activeProfileId;
        const renamed = await sendMessage({ type: 'RENAME_RESUME_PROFILE', payload: { id, name: trimmed } });
        if (!renamed.success || !renamed.data) throw new Error(renamed.error);
        onSummaryChange(renamed.data);
        await onActiveProfileChange(id);
        setNameMode(null);
      } catch {
        setError('新建简历失败，请稍后重试');
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <section className="profile-manager" aria-labelledby="profile-manager-title">
      <div className="profile-manager-heading">
        <div>
          <span id="profile-manager-title" className="profile-manager-label">当前简历</span>
          <strong>{active?.name || '默认简历'}</strong>
        </div>
        <label className="profile-switcher">
          <span className="sr-only">切换简历</span>
          <select value={active?.id || ''} disabled={busy} onChange={event => {
            const id = event.target.value;
            void guarded(() => apply({ type: 'SWITCH_RESUME_PROFILE', payload: { id } }, true));
          }}>
            {summary.profiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>
      <div className="profile-manager-actions">
        <button type="button" className="btn btn-secondary" aria-label="新建空白简历" disabled={busy} onClick={() => { setName(''); setNameError(''); setNameMode('create'); }}>新建空白</button>
        <button type="button" className="btn btn-secondary" disabled={busy || !active} onClick={() => active && void guarded(() => apply({ type: 'DUPLICATE_RESUME_PROFILE', payload: { id: active.id } }, true))}>复制当前</button>
        <button type="button" className="btn btn-secondary" aria-label="重命名当前简历" disabled={busy || !active} onClick={() => { setName(active?.name || ''); setNameError(''); setNameMode('rename'); }}>重命名</button>
        <button type="button" className="btn btn-danger" aria-label="删除当前简历" disabled={busy || summary.profiles.length <= 1 || !active} onClick={() => active && void guarded(() => apply({ type: 'DELETE_RESUME_PROFILE', payload: { id: active.id } }, true))}>删除</button>
      </div>
      {error && <p className="profile-manager-error" role="alert">{error}</p>}

      {nameMode && <div className="dialog-backdrop" role="presentation"><div className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="name-dialog-title">
        <h2 id="name-dialog-title">{nameMode === 'create' ? '新建空白简历' : '重命名简历'}</h2>
        <label>简历名称<input autoFocus aria-label="简历名称" value={name} onChange={event => { setName(event.target.value); setNameError(''); }} /></label>
        {nameError && <p role="alert">{nameError}</p>}
        <div className="profile-dialog-actions"><button type="button" className="btn btn-secondary" onClick={() => setNameMode(null)}>取消</button><button type="button" className="btn btn-primary" aria-label="确认名称" onClick={() => void submitName()}>确认</button></div>
      </div></div>}

      {guardOpen && <div className="dialog-backdrop" role="presentation"><div className="profile-dialog" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title" aria-describedby="unsaved-description">
        <h2 id="unsaved-title">有未保存的修改</h2><p id="unsaved-description">切换简历会丢失尚未保存的表单内容。</p>
        <div className="profile-dialog-actions three-way"><button type="button" className="btn btn-secondary" onClick={() => resolveGuard('cancel')}>取消</button><button type="button" className="btn btn-danger" onClick={() => resolveGuard('discard')}>放弃修改并切换</button><button type="button" className="btn btn-primary" onClick={() => resolveGuard('save')}>保存并切换</button></div>
      </div></div>}
    </section>
  );
}
