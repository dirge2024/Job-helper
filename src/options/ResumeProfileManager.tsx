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
  const [pending, setPending] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const operationPending = useRef(false);
  const guardResolver = useRef<((choice: UnsavedChoice) => void) | null>(null);
  const suspendedNameMode = useRef<NameMode | null>(null);
  const mounted = useRef(true);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const guardCancelRef = useRef<HTMLButtonElement>(null);
  const active = summary.profiles.find(item => item.id === summary.activeProfileId) ?? summary.profiles[0];

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      guardResolver.current?.('cancel');
      guardResolver.current = null;
      operationPending.current = false;
      suspendedNameMode.current = null;
    };
  }, []);


  useEffect(() => {
    if (!menuOpen || typeof document === 'undefined') return;
    const closeOnOutside = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('mousedown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [menuOpen]);

  const chooseUnsaved = (): Promise<UnsavedChoice> => {
    if (guardResolver.current) return Promise.resolve('cancel');
    return new Promise(resolve => { guardResolver.current = resolve; setGuardOpen(true); });
  };
  const resolveGuard = (choice: UnsavedChoice) => {
    const resolve = guardResolver.current;
    guardResolver.current = null;
    setGuardOpen(false);
    resolve?.(choice);
  };

  const apply = async (message: Message, reload: boolean): Promise<boolean> => {
    setBusy(true); setError('');
    try {
      const response = await sendMessage(message);
      if (!response.success || !response.data) { setError(response.error || '操作失败，请稍后重试'); return false; }
      onSummaryChange(response.data);
      if (reload) await onActiveProfileChange(response.data.activeProfileId);
      if ('sync' in response.data && response.data.sync === 'error') {
        setError(`本地操作已完成，但自动同步失败：${('syncError' in response.data && typeof response.data.syncError === 'string' ? response.data.syncError : '未知错误')}`);
      }
      return true;
    } catch { setError('操作失败，请稍后重试'); return false; }
    finally { setBusy(false); }
  };

  const guarded = async (action: () => Promise<boolean>, suspendNameDialog = false): Promise<boolean> => {
    if (operationPending.current) return false;
    operationPending.current = true;
    setPending(true);
    setError('');
    if (suspendNameDialog && nameMode) {
      suspendedNameMode.current = nameMode;
      setNameMode(null);
    }
    try {
      const completed = await runGuardedProfileChange(dirty, onSave, action, chooseUnsaved);
      if (!completed && suspendedNameMode.current && mounted.current) setNameMode(suspendedNameMode.current);
      return completed;
    } finally {
      suspendedNameMode.current = null;
      operationPending.current = false;
      if (mounted.current) setPending(false);
    }
  };

  const openNameDialog = (mode: NameMode, target = active) => { setError(''); setRenameTargetId(target?.id ?? null); setName(mode === 'rename' ? target?.name || '' : ''); setNameError(''); setNameMode(mode); setMenuOpen(false); };
  const closeNameDialog = () => { if (!busy && !pending) setNameMode(null); };

  const submitName = async () => {
    if (busy || operationPending.current) return;
    const trimmed = name.trim();
    if (!trimmed) return setNameError('简历名称不能为空');
    if (summary.profiles.some(item => item.name === trimmed && (nameMode !== 'rename' || item.id !== active?.id))) return setNameError('该简历名称已存在');
    setNameError('');
    const renameTarget = summary.profiles.find(item => item.id === renameTargetId);
    if (nameMode === 'rename' && renameTarget) {
      if (await apply({ type: 'RENAME_RESUME_PROFILE', payload: { id: renameTarget.id, name: trimmed } }, false)) setNameMode(null);
      return;
    }
    if (nameMode === 'create') {
      if (await guarded(() => apply({ type: 'CREATE_RESUME_PROFILE', payload: { name: trimmed } }, true), true)) setNameMode(null);
    }
  };

  return <section className="profile-manager" aria-label="简历选择">
    <div className="resume-menu" ref={menuRef}>
      <button type="button" className="resume-menu-trigger" aria-haspopup="menu" aria-expanded={menuOpen} disabled={busy || pending} onClick={() => setMenuOpen(open => !open)}><span>{active?.name || '默认简历'}</span><span aria-hidden="true">⌄</span></button>
      <div className="resume-menu-popover" role="menu" hidden={!menuOpen}>
        {summary.profiles.map(item => <div className={item.id === active?.id ? 'resume-menu-row active' : 'resume-menu-row'} key={item.id}>
          <button type="button" className="resume-menu-name" role="menuitem" disabled={busy || pending} onClick={() => { setMenuOpen(false); if (item.id !== active?.id) void guarded(() => apply({ type: 'SWITCH_RESUME_PROFILE', payload: { id: item.id } }, true)); }}>{item.id === active?.id && <span aria-hidden="true">✓</span>}<span>{item.name}</span></button>
          <div className="resume-menu-row-actions"><button type="button" aria-label={item.id === active?.id ? '重命名当前简历' : '重命名' + item.name} disabled={busy || pending} onClick={() => openNameDialog('rename', item)}>重命名</button><button type="button" aria-label={item.id === active?.id ? '复制当前简历' : '复制' + item.name} disabled={busy || pending} onClick={() => { setMenuOpen(false); void guarded(() => apply({ type: 'DUPLICATE_RESUME_PROFILE', payload: { id: item.id } }, true)); }}>复制</button><button type="button" className="danger" aria-label={item.id === active?.id ? '删除当前简历' : '删除' + item.name} disabled={busy || pending || summary.profiles.length <= 1} onClick={() => { setMenuOpen(false); void guarded(async () => { const confirmed = typeof window === 'undefined' || typeof window.confirm !== 'function' || window.confirm('确定删除这份简历吗？此操作无法撤销。'); return confirmed ? apply({ type: 'DELETE_RESUME_PROFILE', payload: { id: item.id } }, true) : false; }); }}>删除</button></div>
        </div>)}
        <button type="button" className="resume-menu-create" role="menuitem" disabled={busy || pending} onClick={() => { setMenuOpen(false); void guarded(() => apply({ type: 'CREATE_RESUME_PROFILE', payload: {} }, true)); }}>新建空白</button>
      </div>
    </div>
    {error && <p className="profile-manager-error" role="alert">{error}</p>}
    {nameMode && <AccessibleDialog labelledBy="name-dialog-title" initialFocus={nameInputRef} onClose={closeNameDialog}><h2 id="name-dialog-title">{nameMode === 'create' ? '新建空白简历' : '重命名简历'}</h2><label>简历名称<input ref={nameInputRef} aria-label="简历名称" value={name} disabled={busy || pending} onChange={event => { setName(event.target.value); setNameError(''); }} onKeyDown={event => { if (event.key === 'Enter') void submitName(); }} /></label>{nameError && <p role="alert">{nameError}</p>}<div className="profile-dialog-actions"><button type="button" className="btn btn-secondary" disabled={busy || pending} onClick={closeNameDialog}>取消</button><button type="button" className="btn btn-primary" aria-label="确认名称" disabled={busy || pending} onClick={() => void submitName()}>{busy ? '处理中...' : '确认'}</button></div></AccessibleDialog>}
    {guardOpen && <AccessibleDialog labelledBy="unsaved-title" describedBy="unsaved-description" initialFocus={guardCancelRef} onClose={() => resolveGuard('cancel')}><h2 id="unsaved-title">有未保存的修改</h2><p id="unsaved-description">继续此操作会影响当前简历中尚未保存的表单内容。</p><div className="profile-dialog-actions three-way"><button ref={guardCancelRef} type="button" className="btn btn-secondary" onClick={() => resolveGuard('cancel')}>取消</button><button type="button" className="btn btn-danger" onClick={() => resolveGuard('discard')}>放弃修改并继续</button><button type="button" className="btn btn-primary" onClick={() => resolveGuard('save')}>保存并继续</button></div></AccessibleDialog>}
  </section>;
}
