import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('content script 注入右侧简历助手入口并通过 background 打开侧边栏', () => {
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(source, /job-helper-floating-launcher/);
  assert.match(source, /display:block!important;position:fixed!important;right:0!important;top:50%/);
  assert.match(source, /textContent = '简历助手'/);
  assert.match(source, /type: 'OPEN_SIDE_PANEL'/);
  assert.match(source, /Ctrl\+Shift\+A/);
  assert.match(source, /attachShadow\(\{ mode: 'closed' \}\)/);
});

test('消息协议声明打开侧边栏类型', () => {
  const source = readFileSync(new URL('../shared/types.ts', import.meta.url), 'utf8');
  assert.match(source, /type: 'OPEN_SIDE_PANEL'/);
});
