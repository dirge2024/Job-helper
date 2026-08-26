import React, { useEffect, useRef, useState } from 'react';
import { MessageService } from '../shared/message';
import type { Message, MessageResponse, ResumeProfileSummary } from '../shared/types';

export type UnsavedChoice = 'save' | 'discard' | 'cancel';
type SendMessage = (message: Message) => Promise<MessageResponse<ResumeProfileSummary>>;

export async function runGuardedProfileChange(
  dirty: boolean,
  save: () => Promise<boolean>,
  action: () => Promise<boolean | void>,
  choose: () => Promise<UnsavedChoice>,
): Promise<boolean> {
  if (dirty) {
    const choice = await choose();
    if (choice === 'cancel') return false;
    if (choice === 'save' && !await save()) return false;
  }
  return await action() !== false;
}

export async function executeGuardedProfileOperation(
  message: Message,
  dependencies: {
    dirty: boolean;
    save: () => Promise<boolean>;
    choose: () => Promise<UnsavedChoice>;
    send: SendMessage;
  },
): Promise<MessageResponse<ResumeProfileSummary> | null> {
  let response: MessageResponse<ResumeProfileSummary> | null = null;
  await runGuardedProfileChange(dependencies.dirty, dependencies.save, async () => {
    response = await dependencies.send(message);
    return response.success;
  }, dependencies.choose);
  return response;
}

interface Props {
  summary: ResumeProfileSummary;
  dirty: boolean;
  onSave: () => Promise<boolean>;
  onSummaryChange: (summary: ResumeProfileSummary) => void;
  onActiveProfileChange: (id: string) => Promise<void>;
  sendMessage?: SendMessage;
}

type NameMode = 'create' | 'rename';

function AccessibleDialog({ labelledBy, describedBy, initialFocus, onClose, children }: {
  labelledBy: string;
  describedBy?: string;
  initialFocus?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? []);
    (initialFocus?.current ?? focusable()[0])?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog?.addEventListener('keydown', onKeyDown);
    return () => { dialog?.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, [initialFocus]);
  return <div className="dialog-backdrop" role="presentation"><div ref={dialogRef} className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy}>{children}</div></div>;
}

export function ResumeProfileManager({ summary, dirty, onSave, onSummaryChange, onActiveProfileChange, sendMessage = message => MessageService.sendMessage<ResumeProfileSummary>(message) }: Props) {
  const [nameMode, setNameMode] = useState<NameMode | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);
  const guardResolver = useRef<((choice: UnsavedChoice) => void) | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const guardCancelRef = useRef<HTMLButtonElement>(null);
  const active = summary.profiles.find(item => item.id === summary.activeProfileId) ?? summary.profiles[0];

  useEffect(() => () => { guardResolver.current?.('cancel'); guardResolver.current = null; }, []);

  const chooseUnsaved = () => new Promise<UnsavedChoice>(resolve => { guardResolver.current = resolve; setGuardOpen(true); });
  const resolveGuard = (choice: UnsavedChoice) => { setGuardOpen(false); guardResolver.current?.(choice); guardResolver.current = null; };

  const apply = async (message: Message, reload: boolean): Promise<boolean> => {
    setBusy(true); setError('');
    try {
      const response = await sendMessage(message);
      if (!response.success || !response.data) { setError(response.error || '操作失败，请稍后重试'); return false; }
      onSummaryChange(response.data);
      if (reload) await onActiveProfileChange(response.data.activeProfileId);
      return true;
    } catch { setError('操作失败，请稍后重试'); return false; }
    finally { setBusy(false); }
  };

  const guarded = (action: () => Promise<boolean>) => {
    setError('');
    return runGuardedProfileChange(dirty, onSave, action, chooseUnsaved);
  };

  const openNameDialog = (mode: NameMode) => { setError(''); setName(mode === 'rename' ? active?.name || '' : ''); setNameError(''); setNameMode(mode); };
  const closeNameDialog = () => { if (!busy) setNameMode(null); };

  const submitName = async () => {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) return setNameError('简历名称不能为空');
    if (summary.profiles.some(item => item.name === trimmed && (nameMode !== 'rename' || item.id !== active?.id))) return setNameError('该简历名称已存在');
    setNameError('');
    if (nameMode === 'rename' && active) {
      if (await apply({ type: 'RENAME_RESUME_PROFILE', payload: { id: active.id, name: trimmed } }, false)) setNameMode(null);
      return;
    }
    if (nameMode === 'create') {
      if (await guarded(() => apply({ type: 'CREATE_RESUME_PROFILE', payload: { name: trimmed } }, true))) setNameMode(null);
    }
  };

  return <section className="profile-manager" aria-labelledby="profile-manager-title">
    <div className="profile-manager-heading"><div><span id="profile-manager-title" className="profile-manager-label">当前简历</span><strong>{active?.name || '默认简历'}</strong></div>
      <label className="profile-switcher"><span className="sr-only">切换简历</span><select value={active?.id || ''} disabled={busy} onChange={event => { const id = event.target.value; void guarded(() => apply({ type: 'SWITCH_RESUME_PROFILE', payload: { id } }, true)); }}>{summary.profiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
    <div className="profile-manager-actions">
      <button type="button" className="btn btn-secondary" aria-label="新建空白简历" disabled={busy} onClick={() => openNameDialog('create')}>新建空白</button>
      <button type="button" className="btn btn-secondary" disabled={busy || !active} onClick={() => active && void guarded(() => apply({ type: 'DUPLICATE_RESUME_PROFILE', payload: { id: active.id } }, true))}>复制当前</button>
      <button type="button" className="btn btn-secondary" aria-label="重命名当前简历" disabled={busy || !active} onClick={() => openNameDialog('rename')}>重命名</button>
      <button type="button" className="btn btn-danger" aria-label="删除当前简历" disabled={busy || summary.profiles.length <= 1 || !active} onClick={() => active && void guarded(() => apply({ type: 'DELETE_RESUME_PROFILE', payload: { id: active.id } }, true))}>删除</button>
    </div>
    {error && <p className="profile-manager-error" role="alert">{error}</p>}
    {nameMode && <AccessibleDialog labelledBy="name-dialog-title" initialFocus={nameInputRef} onClose={closeNameDialog}><h2 id="name-dialog-title">{nameMode === 'create' ? '新建空白简历' : '重命名简历'}</h2><label>简历名称<input ref={nameInputRef} aria-label="简历名称" value={name} disabled={busy} onChange={event => { setName(event.target.value); setNameError(''); }} onKeyDown={event => { if (event.key === 'Enter') void submitName(); }} /></label>{nameError && <p role="alert">{nameError}</p>}<div className="profile-dialog-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={closeNameDialog}>取消</button><button type="button" className="btn btn-primary" aria-label="确认名称" disabled={busy} onClick={() => void submitName()}>{busy ? '处理中...' : '确认'}</button></div></AccessibleDialog>}
    {guardOpen && <AccessibleDialog labelledBy="unsaved-title" describedBy="unsaved-description" initialFocus={guardCancelRef} onClose={() => resolveGuard('cancel')}><h2 id="unsaved-title">有未保存的修改</h2><p id="unsaved-description">继续此操作会影响当前简历中尚未保存的表单内容。</p><div className="profile-dialog-actions three-way"><button ref={guardCancelRef} type="button" className="btn btn-secondary" onClick={() => resolveGuard('cancel')}>取消</button><button type="button" className="btn btn-danger" onClick={() => resolveGuard('discard')}>放弃修改并继续</button><button type="button" className="btn btn-primary" onClick={() => resolveGuard('save')}>保存并继续</button></div></AccessibleDialog>}
  </section>;
}
