import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('content script 使用网页覆盖层，不创建额外浏览器窗口', () => {
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(source, /job-helper-floating-launcher/);
  assert.match(source, /src\/sidepanel\/index\.html\?mode=float/);
  assert.doesNotMatch(source, /windows\.create/);
});

test('消息协议声明打开侧边栏类型', () => {
  const source = readFileSync(new URL('../shared/types.ts', import.meta.url), 'utf8');
  assert.match(source, /type: 'OPEN_SIDE_PANEL'/);
});

test('快捷键由 background 转发为悬浮面板切换消息', () => {
  const source = readFileSync(new URL('../background/index.ts', import.meta.url), 'utf8');
  assert.match(source, /TOGGLE_FLOATING_PANEL/);
  assert.match(source, /executeScript\(\{ target: \{ tabId \}, files: \['content\.js'\] \}\)/);
});
