const SIDEPANEL_ENTRY = 'src/sidepanel/index.html';

/** 信息面板的呈现形态：原生侧边栏 or 独立浮动小窗 */
export type SidepanelMode = 'panel' | 'float';

export function getTargetWindowIdFromSearch(search: string): number | undefined {
  const rawValue = new URLSearchParams(search).get('targetWindowId');
  if (rawValue === null) return undefined;

  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/** 从 URL 判断当前信息面板是浮动小窗还是原生侧边栏，缺省视为侧边栏 */
export function getSidepanelModeFromSearch(search: string): SidepanelMode {
  return new URLSearchParams(search).get('mode') === 'float' ? 'float' : 'panel';
}

export function buildSidepanelUrl({
  targetWindowId,
  mode,
}: {
  targetWindowId?: number;
  mode?: SidepanelMode;
}): string {
  const params = new URLSearchParams();
  if (Number.isInteger(targetWindowId) && (targetWindowId as number) >= 0) {
    params.set('targetWindowId', String(targetWindowId));
  }
  if (mode === 'float') {
    params.set('mode', 'float');
  }
  const query = params.toString();
  return query ? `${SIDEPANEL_ENTRY}?${query}` : SIDEPANEL_ENTRY;
}

/**
 * 以独立浮动小窗的形式打开信息面板（复用侧边栏页面）。
 * 供 popup 的「打开信息窗口」回退路径，以及侧边栏内「打开浮窗」按钮共用。
 * @param targetWindowId 目标网页所在窗口，用于写回聚焦字段；缺省时由页面自行按当前窗口查询。
 */
export async function openInfoFloatWindow(targetWindowId?: number): Promise<void> {
  const currentWindow = await chrome.windows.getCurrent();
  const resolvedTargetWindowId =
    typeof targetWindowId === 'number' ? targetWindowId : currentWindow.id;
  const width = 420;
  const height = Math.max(640, Math.min(900, currentWindow.height || 800));
  const left =
    currentWindow.left !== undefined && currentWindow.width !== undefined
      ? currentWindow.left + Math.max(0, currentWindow.width - width)
      : undefined;
  const top = currentWindow.top;

  await chrome.windows.create({
    url: chrome.runtime.getURL(
      buildSidepanelUrl({ targetWindowId: resolvedTargetWindowId, mode: 'float' })
    ),
    type: 'popup',
    width,
    height,
    left,
    top,
    focused: true,
  });
}
