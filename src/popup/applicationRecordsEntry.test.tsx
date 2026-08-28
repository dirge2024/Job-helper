import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { openApplicationRecordOptions } from './App.tsx';

test('popup 视觉重构保留全部现有入口且不引入额外功能', async () => {
  const popupModule = await import('./App.tsx');
  const html = renderToStaticMarkup(React.createElement(popupModule.default));
  assert.match(html, /popup-record-actions/);
  assert.match(html, /popup-primary-action/);
  assert.match(html, /popup-ai-actions/);
  assert.match(html, /popup-support-actions/);
  for (const label of [
    '新建投递记录',
    '打开投递记录',
    '打开信息窗口',
    '快速填充',
    'AI 扫描填充',
    'AI 框选补填',
    '设置个人信息',
  ]) assert.match(html, new RegExp(label));
  assert.match(html, /icons\/icon128\.png/);
  assert.doesNotMatch(html, /复制全部信息|清空表单/);
});

test('打开投递记录入口打开带 query 的设置页标签', async () => {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  const createdTabs: Array<{ url?: string }> = [];

  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      getURL(path: string) {
        return `chrome-extension://test/${path}`;
      },
    },
    tabs: {
      async create(options: { url?: string }) {
        createdTabs.push(options);
      },
    },
  };

  try {
    await openApplicationRecordOptions();
    assert.equal(createdTabs.length, 1);
    assert.equal(
      createdTabs[0]?.url,
      'chrome-extension://test/src/options/index.html?tab=application-records',
    );
  } finally {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
  }
});
