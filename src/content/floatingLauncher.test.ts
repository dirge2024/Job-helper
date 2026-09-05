import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('content script 不创建额外的网页浮动窗口', () => {
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /job-helper-floating-launcher/);
  assert.doesNotMatch(source, /windows\.create/);
});

test('消息协议声明打开侧边栏类型', () => {
  const source = readFileSync(new URL('../shared/types.ts', import.meta.url), 'utf8');
  assert.match(source, /type: 'OPEN_SIDE_PANEL'/);
});
