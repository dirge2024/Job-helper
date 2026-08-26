import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ResumeProfileSummary, UserProfile } from '../shared/types';
import { executePopupProfileSwitch, ResumeProfileSelector } from './ResumeProfileSelector';

const profiles: ResumeProfileSummary['profiles'] = [
  { id: 'p1', name: '后端开发', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'p2', name: '前端开发', createdAt: '2026-01-02', updatedAt: '2026-01-02' },
];

test('弹窗显示当前简历但不显示管理入口', () => {
  const html = renderToStaticMarkup(
    <ResumeProfileSelector profiles={profiles} activeProfileId="p1" disabled={false} onSwitch={() => {}} />,
  );
  assert.match(html, /当前简历/);
  assert.match(html, /后端开发/);
  assert.doesNotMatch(html, /管理简历/);
});

test('忙碌期间禁用当前简历选择器', () => {
  const html = renderToStaticMarkup(
    <ResumeProfileSelector profiles={profiles} activeProfileId="p1" disabled onSwitch={() => {}} />,
  );
  assert.match(html, /disabled=""/);
});

test('切换成功后刷新简历摘要和当前用户资料', async () => {
  const calls: string[] = [];
  const profile = {} as UserProfile;
  await executePopupProfileSwitch('p2', 'p1', {
    switchProfile: async () => ({ success: true, data: { profiles, activeProfileId: 'p2' } }),
    loadSummary: async () => { calls.push('summary'); return { profiles, activeProfileId: 'p2' }; },
    loadProfile: async () => { calls.push('profile'); return profile; },
    commit: (summary, loadedProfile) => calls.push(`commit:${summary.activeProfileId}:${loadedProfile === profile}`),
    rollback: () => calls.push('rollback'),
    showError: error => calls.push(`error:${error}`),
    isCurrent: () => true,
  });
  assert.deepEqual(calls, ['summary', 'profile', 'commit:p2:true']);
});

test('切换失败时回滚选择并显示服务端错误', async () => {
  const calls: string[] = [];
  await executePopupProfileSwitch('p2', 'p1', {
    switchProfile: async () => ({ success: false, error: '切换失败' }),
    loadSummary: async () => { throw new Error('不应刷新'); },
    loadProfile: async () => { throw new Error('不应刷新'); },
    commit: () => calls.push('commit'),
    rollback: id => calls.push(`rollback:${id}`),
    showError: error => calls.push(`error:${error}`),
    isCurrent: () => true,
  });
  assert.deepEqual(calls, ['rollback:p1', 'error:切换失败']);
});

test('过期请求或组件卸载后不再提交、回滚或报错', async () => {
  const calls: string[] = [];
  await executePopupProfileSwitch('p2', 'p1', {
    switchProfile: async () => ({ success: false, error: '迟到错误' }),
    loadSummary: async () => ({ profiles, activeProfileId: 'p2' }),
    loadProfile: async () => ({} as UserProfile),
    commit: () => calls.push('commit'),
    rollback: () => calls.push('rollback'),
    showError: () => calls.push('error'),
    isCurrent: () => false,
  });
  assert.deepEqual(calls, []);
});
