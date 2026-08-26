import { useEffect, useRef, useState } from 'react';
import { MessageService } from '../shared/message';
import type {
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

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadInitialData();
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

  if (loading) {
    return <main className="panel-state">正在加载信息...</main>;
  }

  if (!profile) {
    return (
      <main className="panel-state">
        <h1>网申信息浮窗</h1>
        <p>尚未保存个人信息。</p>
        <button className="primary-action" onClick={() => chrome.runtime.openOptionsPage()}>
          设置个人信息
        </button>
      </main>
    );
  }

  return (
    <main className="panel">
      <header className="panel-header">
        <div>
            <h1>网申信息浮窗</h1>
            <p className="panel-subtitle">{subtitleText}</p>
        </div>
        <div className="header-actions">
          {!isFloatMode && (
            <button className="pip-button" onClick={() => void handleOpenFloatWindow()}>
              打开浮窗
            </button>
          )}
          {isFloatMode && (
            <button className="pip-button" onClick={handlePictureInPicture}>
              {pipWindow && !pipWindow.closed ? '退出置顶' : '置顶小窗'}
            </button>
          )}
          <button className="settings-button" onClick={() => chrome.runtime.openOptionsPage()}>
            设置
          </button>
        </div>
      </header>

      <ProfileSections
        profile={profile}
        workingKey={workingKey}
        onFieldClick={handleFieldClick}
      />

      {toast && <div className="copy-toast" role="status">{toast}</div>}
    </main>
  );
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
