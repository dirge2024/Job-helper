import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.match(appSource, /className="popup-metrics-strip"/);
  for (const label of [
    '求职助手',
    '收录当前岗位',
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

test('popup 名称和主色与求职助手工作台保持一致', () => {
  const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  assert.match(appSource, /<h1>求职助手<\/h1>/);
  assert.match(css, /--color-primary:\s*#63876a;/);
});

test('打开投递记录入口打开新版工作台的投递管理页', async () => {
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
      'chrome-extension://test/src/dashboard/index.html?page=applications',
    );
  } finally {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
  }
});

test('收录当前岗位入口不再创建独立的大窗口', () => {
  const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  const handler = appSource.match(/const handleOpenApplicationRecordCreate[\s\S]*?\n  };/i)?.[0] || '';
  assert.match(handler, /openNativeSidePanel\(\)/);
  assert.doesNotMatch(handler, /openApplicationRecordCreateWindow\(\)/);
});


test('popup 保持浏览器扩展所需的固定基础宽度', () => {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  assert.match(css, /body\s*\{[^}]*min-width:\s*360px/s);
  assert.match(css, /\.popup-shell\s*\{[^}]*width:\s*360px/s);
});
