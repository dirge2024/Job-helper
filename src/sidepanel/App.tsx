import { useEffect, useRef, useState } from 'react';
import { MessageService } from '../shared/message';
import { APPLICATION_RECORD_STATUSES, normalizeApplicationRecordStatus } from '../shared/applicationRecords.ts';
import type {
  ApplicationRecord,
  ApplicationRecordDraft,
  ApplicationRecordStatus,
  FocusedFieldWriteResult,
  UserProfile,
} from '../shared/types';
import {
  getSidepanelModeFromSearch,
  getTargetWindowIdFromSearch,
  openInfoFloatWindow,
} from './navigation';
import { ProfileSections } from './ProfileSections.tsx';
import { shouldReloadProfile } from '../shared/profileStorageChange';

type DocumentPictureInPictureApi = {
  window: Window | null;
  requestWindow(options?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
    preferInitialWindowPlacement?: boolean;
  }): Promise<Window>;
};

const locationSearch = typeof window === 'undefined' ? '' : window.location.search;
const targetWindowId = getTargetWindowIdFromSearch(locationSearch);
const subtitleText = '点击下方信息字段即可自动复制对应内容；若先点击网页输入框再点击字段，可自动写入，写入失败时也可手动粘贴';
const hasTargetWindowId = typeof targetWindowId === 'number';
// 提示气泡显示时长（毫秒）
const TOAST_DURATION_MS = 1000;
// 浮动小窗与原生侧边栏共用本页面，按模式决定右上角按钮：
// - 浮窗(float)：可置顶小窗，但隐藏「打开浮窗」，避免在浮窗里再开浮窗
// - 侧边栏(panel)：可再开浮窗，但隐藏仅浮窗可用的「置顶小窗」
const sidepanelMode = getSidepanelModeFromSearch(locationSearch);
const isFloatMode = sidepanelMode === 'float';

const EMPTY_CAPTURE: ApplicationRecord = {
  id: '', companyName: '', jobTitle: '', sourceSite: '', sourceUrl: '', status: '已投递',
  notes: '', appliedAt: new Date().toISOString().slice(0, 10), location: '', createdAt: '', updatedAt: '',
};

function normalizeCaptureDraft(draft: ApplicationRecordDraft): ApplicationRecord {
  return { ...EMPTY_CAPTURE, ...draft, status: normalizeApplicationRecordStatus(draft.status) ?? '已投递', id: crypto.randomUUID() };
}

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureForm, setCaptureForm] = useState(EMPTY_CAPTURE);
  const [cityHistory, setCityHistory] = useState<string[]>([]);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [captureSaving, setCaptureSaving] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadInitialData();
    void chrome.storage.local.get('jobHelperCityHistory').then(result => {
      const history = result.jobHelperCityHistory;
      if (Array.isArray(history)) setCityHistory(history.filter((item): item is string => typeof item === 'string').slice(0, 8));
    });
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (shouldReloadProfile(changes, areaName)) {
        void loadInitialData();
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    const profileResponse = await MessageService.sendMessage<UserProfile>({
      type: 'GET_USER_PROFILE',
    });

    setProfile(profileResponse.success && profileResponse.data ? profileResponse.data : null);
    setLoading(false);
  };

  // 显示一个 1 秒后自动消失的提示气泡
  const showToast = (text: string) => {
    setToast(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  };

  const handleFieldClick = async (key: string, value: string) => {
    if (!value.trim() || workingKey) return;
    setWorkingKey(key);

    try {
      // 先尝试写入网页聚焦的输入框（成功与否都会继续尝试复制）
      const query = hasTargetWindowId
        ? { active: true, windowId: targetWindowId }
        : { active: true, currentWindow: true };
      const [tab] = await chrome.tabs.query(query);
      if (tab?.id) {
        await MessageService.sendMessage<FocusedFieldWriteResult>({
          type: 'WRITE_FOCUSED_FIELD',
          payload: { tabId: tab.id, value },
        }).catch(() => undefined);
      }
    } catch {
      // 写入失败无需单独提示，下面统一以「复制」为准
    } finally {
      // 不管是否成功写入，都尝试复制；仅在复制成功时弹出提示
      try {
        await navigator.clipboard.writeText(value);
        showToast('已复制到剪贴板');
      } catch {
        // 复制也失败时不弹提示（按需求仅保留复制成功提示）
      }
      setWorkingKey(null);
    }
  };

  const handlePictureInPicture = async () => {
    if (pipWindow && !pipWindow.closed) {
      pipWindow.close();
      return;
    }

    const api = (
      window as Window & { documentPictureInPicture?: DocumentPictureInPictureApi }
    ).documentPictureInPicture;
    if (!api?.requestWindow) {
      showToast('当前浏览器不支持置顶小窗');
      return;
    }

    try {
      const root = document.getElementById('root');
      if (!root) throw new Error('信息面板尚未加载完成');

      const openerDocument = document;
      const pictureWindow = await api.requestWindow({
        width: 420,
        height: 760,
        disallowReturnToOpener: true,
        preferInitialWindowPlacement: true,
      });

      copyStylesToPictureWindow(openerDocument, pictureWindow.document);
      pictureWindow.document.title = '网申信息置顶小窗';
      pictureWindow.document.body.appendChild(root);
      setPipWindow(pictureWindow);

      pictureWindow.addEventListener('pagehide', () => {
        if (root.ownerDocument !== openerDocument) {
          openerDocument.body.appendChild(root);
        }
        setPipWindow(null);
      }, { once: true });

      if (hasTargetWindowId) {
        await chrome.windows.update(targetWindowId, { focused: true }).catch(() => undefined);
      }
    } catch {
      showToast('当前浏览器不支持置顶小窗');
    }
  };

  const handleOpenFloatWindow = async () => {
    try {
      // 复用侧边栏页面以浮动小窗形式打开，沿用当前的目标网页窗口
      await openInfoFloatWindow(hasTargetWindowId ? targetWindowId : undefined);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开浮窗失败');
    }
  };

  const updateCapture = <K extends keyof ApplicationRecord>(field: K, value: ApplicationRecord[K]) => {
    setCaptureForm(current => ({ ...current, [field]: value }));
  };

  const openCapture = async () => {
    setCaptureOpen(true);
    setCaptureLoading(true);
    try {
      const query = hasTargetWindowId ? { active: true, windowId: targetWindowId } : { active: true, currentWindow: true };
      const [tab] = await chrome.tabs.query(query);
      if (!tab?.id) throw new Error('没有可用的当前页面');
      const draftResponse = await MessageService.sendMessage<{ draftId: string }>({ type: 'CREATE_APPLICATION_RECORD_DRAFT', payload: { tabId: tab.id } });
      if (!draftResponse.success || !draftResponse.data?.draftId) throw new Error(draftResponse.error || '无法识别当前岗位');
      const response = await MessageService.sendMessage<{ draft: ApplicationRecordDraft }>({ type: 'GET_APPLICATION_RECORD_DRAFT', payload: { draftId: draftResponse.data.draftId } });
      if (!response.success || !response.data?.draft) throw new Error(response.error || '无法读取岗位信息');
      setCaptureForm(normalizeCaptureDraft(response.data.draft));
    } catch (error) {
      showToast(error instanceof Error ? error.message : '无法识别当前岗位');
    } finally {
      setCaptureLoading(false);
    }
  };

  const saveCapture = async () => {
    if (!captureForm.companyName.trim() || !captureForm.jobTitle.trim()) {
      showToast('请填写公司名称和岗位名称');
      return;
    }
    setCaptureSaving(true);
    const now = new Date().toISOString();
    const record = { ...captureForm, companyName: captureForm.companyName.trim(), jobTitle: captureForm.jobTitle.trim(), location: captureForm.location.trim(), appliedAt: captureForm.appliedAt || now.slice(0, 10), createdAt: captureForm.createdAt || now, updatedAt: now };
    const response = await MessageService.sendMessage({ type: 'CREATE_APPLICATION_RECORD', payload: record });
    if (!response.success) showToast(response.error || '保存投递记录失败');
    else {
      const nextHistory = record.location && !cityHistory.includes(record.location) ? [record.location, ...cityHistory].slice(0, 8) : cityHistory;
      setCityHistory(nextHistory);
      await chrome.storage.local.set({ jobHelperCityHistory: nextHistory });
      setCaptureOpen(false);
      showToast('已确认存入看板');
    }
    setCaptureSaving(false);
  };

  const handleQuickFill = async () => {
    try {
      const query = hasTargetWindowId ? { active: true, windowId: targetWindowId } : { active: true, currentWindow: true };
      const [tab] = await chrome.tabs.query(query);
      if (!tab?.id) throw new Error('没有可用的当前页面');
      const response = await MessageService.sendMessageToTab(tab.id, { type: 'FILL_FORM' });
      if (!response.success) throw new Error(response.error || '快速填充失败');
      showToast('已开始快速填充');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '快速填充失败');
    }
  };

  if (loading) {
    return <main className="panel-state">正在加载信息...</main>;
  }

  const closeFloatingPanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'CLOSE_FLOATING_PANEL' }).catch(() => undefined);
  };

  return <main className="panel">
    <header className="panel-header"><div className="panel-brand"><img src={chrome.runtime.getURL('icons/icon128.png')} alt="" /><div><h1>求职助手</h1><p>让每一次投递更高效</p></div></div><span className="panel-shortcut">Ctrl+Shift+F</span>{isFloatMode && <button type="button" className="panel-close" onClick={() => void closeFloatingPanel()} aria-label="关闭求职助手">×</button>}</header>
    <div className="panel-scroll">
      <div className="panel-main-actions"><button type="button" className="panel-action panel-action-primary" onClick={() => void openCapture()}>收录当前岗位</button><button type="button" className="panel-action panel-action-secondary" onClick={() => void handleQuickFill()}>一键填充</button></div>
      {captureOpen && <section className="capture-panel" aria-label="收录当前岗位"><div className="capture-panel-heading"><strong>收录当前岗位</strong><button type="button" onClick={() => setCaptureOpen(false)}>收起</button></div>{captureLoading ? <p className="capture-loading">正在识别当前岗位...</p> : <><label>公司名称<input value={captureForm.companyName} onChange={event => updateCapture('companyName', event.target.value)} placeholder="自动识别或手动填写" /></label><label>岗位名称<input value={captureForm.jobTitle} onChange={event => updateCapture('jobTitle', event.target.value)} placeholder="自动识别或手动填写" /></label><div className="capture-grid"><label>目标城市<input list="capture-city-history" value={captureForm.location} onChange={event => updateCapture('location', event.target.value)} placeholder="例如：北京" /><datalist id="capture-city-history">{cityHistory.map(city => <option key={city} value={city} />)}</datalist></label><label>投递阶段<select value={captureForm.status} onChange={event => updateCapture('status', event.target.value as ApplicationRecordStatus)}>{APPLICATION_RECORD_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select></label></div><label>投递日期<input type="date" value={captureForm.appliedAt} onChange={event => updateCapture('appliedAt', event.target.value)} /></label><button type="button" className="capture-confirm" disabled={captureSaving} onClick={() => void saveCapture()}>{captureSaving ? '保存中...' : '确认存入看板'}</button></>}</section>}
      {captureOpen ? null : <p className="panel-fill-note">一键填充会自动填写当前网页中可识别的表单字段</p>}
    </div>
    <nav className="panel-footer"><button type="button" onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html?page=applications') })}>投递看板</button><button type="button" onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html?tab=personal') })}>简历配置</button></nav>
    {toast && <div className="copy-toast" role="status">{toast}</div>}
  </main>;
}

function copyStylesToPictureWindow(source: Document, target: Document): void {
  for (const styleSheet of Array.from(source.styleSheets)) {
    try {
      const style = target.createElement('style');
      style.textContent = Array.from(styleSheet.cssRules)
        .map(rule => rule.cssText)
        .join('\n');
      target.head.appendChild(style);
    } catch {
      if (!styleSheet.href) continue;
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = styleSheet.href;
      target.head.appendChild(link);
    }
  }
}
