import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApplicationRecordsSection } from './ApplicationRecordsSection.tsx';
import type { ApplicationRecord } from '../shared/types.ts';

const records: ApplicationRecord[] = [
  {
    id: 'r1',
    companyName: '字节跳动',
    jobTitle: '前端开发',
    sourceSite: 'jobs.bytedance.com',
    sourceUrl: 'https://jobs.bytedance.com/example-1',
    status: '已投递',
    notes: '一志愿',
    appliedAt: '2026-08-07',
    location: '北京',
    createdAt: '2026-08-07T10:00:00.000Z',
    updatedAt: '2026-08-07T10:00:00.000Z',
  },
  {
    id: 'r2',
    companyName: '腾讯',
    jobTitle: '产品经理',
    sourceSite: 'join.qq.com',
    sourceUrl: 'https://join.qq.com/example-2',
    status: '面试',
    notes: '',
    appliedAt: '2026-08-06',
    location: '深圳',
    createdAt: '2026-08-06T10:00:00.000Z',
    updatedAt: '2026-08-06T10:00:00.000Z',
  },
];

test('记录页渲染公司名/岗位名/状态筛选控件', () => {
  const html = renderToStaticMarkup(<ApplicationRecordsSection initialRecords={records} />);
  assert.match(html, /公司名/);
  assert.match(html, /岗位名/);
  assert.match(html, /状态/);
});

test('记录页渲染来源链接按钮', () => {
  const html = renderToStaticMarkup(<ApplicationRecordsSection initialRecords={records} />);
  assert.match(html, /打开来源链接/);
});

test('设置页新增投递记录标签，并位于数据与同步后面', async () => {
  const optionsModule = await import('./App.tsx');
  const html = renderToStaticMarkup(React.createElement(optionsModule.default));
  assert.ok(html.indexOf('数据与同步') < html.indexOf('投递记录'));
});
