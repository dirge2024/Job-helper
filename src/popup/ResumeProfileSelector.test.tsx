import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ResumeProfileSummary, UserProfile } from '../shared/types';
import { claimPopupSwitch, createPopupRequestGate, executePopupInitialLoad, executePopupProfileSwitch, isPopupInteractionDisabled, ResumeProfileSelector } from './ResumeProfileSelector';

const profiles: ResumeProfileSummary['profiles'] = [
  { id: 'p1', name: '后端开发', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'p2', name: '前端开发', createdAt: '2026-01-02', updatedAt: '2026-01-02' },
];
const summary = (activeProfileId: string): ResumeProfileSummary => ({ profiles, activeProfileId });
const user = (name: string) => ({ personal: { name } } as UserProfile);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('弹窗显示当前简历但不显示管理入口', () => {
  const html = renderToStaticMarkup(<ResumeProfileSelector profiles={profiles} activeProfileId="p1" disabled={false} onSwitch={() => {}} />);
  assert.match(html, /当前简历/); assert.match(html, /后端开发/); assert.doesNotMatch(html, /管理简历/);
});

test('忙碌期间禁用当前简历选择器', () => {
  const html = renderToStaticMarkup(<ResumeProfileSelector profiles={profiles} activeProfileId="p1" disabled onSwitch={() => {}} />);
  assert.match(html, /disabled=""/);
});

test('填充、AI、框选或切换任一进行中均统一禁用', () => {
  const idle = { switching: false, filling: false, aiScanning: false, startingAIRegion: false };
  assert.equal(isPopupInteractionDisabled(idle), false);
  for (const key of Object.keys(idle) as Array<keyof typeof idle>) assert.equal(isPopupInteractionDisabled({ ...idle, [key]: true }), true, key);
});

test('同步 pending 门闩拒绝快速重复切换', () => {
  const pending = { current: false };
  assert.equal(claimPopupSwitch(pending), true);
  assert.equal(claimPopupSwitch(pending), false);
});

test('切换成功后传入明确目标并刷新摘要和当前用户资料', async () => {
  const calls: string[] = [];
  await executePopupProfileSwitch('p2', 'p1', {
    switchProfile: async id => { calls.push(`switch:${id}`); return { success: true, data: summary('p2') }; },
    loadSummary: async () => { calls.push('summary'); return summary('p1'); },
    loadProfile: async () => { calls.push('profile'); return user('新资料'); },
    commitSummary: value => calls.push(`commit-summary:${value.activeProfileId}`),
    commitProfile: value => calls.push(`commit-profile:${value.personal.name}`),
    rollback: () => calls.push('rollback'), showError: error => calls.push(`error:${error}`), isCurrent: () => true,
  });
  assert.deepEqual(calls, ['switch:p2', 'commit-summary:p2', 'summary', 'profile', 'commit-summary:p2', 'commit-profile:新资料']);
});

test('SWITCH API 失败才回滚选择并显示服务端错误', async () => {
  const calls: string[] = [];
  await executePopupProfileSwitch('p2', 'p1', {
    switchProfile: async () => ({ success: false, error: '切换失败' }), loadSummary: async () => summary('p2'), loadProfile: async () => user('x'),
    commitSummary: () => calls.push('commit'), commitProfile: () => calls.push('profile'), rollback: id => calls.push(`rollback:${id}`),
    showError: error => calls.push(`error:${error}`), isCurrent: () => true,
  });
  assert.deepEqual(calls, ['rollback:p1', 'error:切换失败']);
});

test('切换成功但摘要刷新失败时保留 mutation 的新 active id 且不回滚', async () => {
  let active = 'p1'; const errors: string[] = [];
  await executePopupProfileSwitch('p2', 'p1', {
    switchProfile: async () => ({ success: true, data: summary('p2') }), loadSummary: async () => { throw new Error('summary down'); }, loadProfile: async () => user('新资料'),
    commitSummary: value => { active = value.activeProfileId; }, commitProfile: () => {}, rollback: () => { active = 'p1'; }, showError: value => errors.push(value), isCurrent: () => true,
  });
  assert.equal(active, 'p2'); assert.deepEqual(errors, ['切换成功，但简历列表刷新失败']);
});

test('切换成功但资料刷新失败时选择器保持新 ID 并显示明确错误', async () => {
  let active = 'p1'; let error = '';
  await executePopupProfileSwitch('p2', 'p1', {
    switchProfile: async () => ({ success: true, data: summary('p2') }), loadSummary: async () => summary('p2'), loadProfile: async () => { throw new Error('profile down'); },
    commitSummary: value => { active = value.activeProfileId; }, commitProfile: () => {}, rollback: () => { active = 'p1'; }, showError: value => { error = value; }, isCurrent: () => true,
  });
  assert.equal(active, 'p2'); assert.equal(error, '切换成功，但资料刷新失败');
});

test('迟到的初始化 GET 不得覆盖切换刷新结果', async () => {
  const gate = createPopupRequestGate(); const initialSummary = deferred<ResumeProfileSummary>(); const initialProfile = deferred<UserProfile>();
  let active = ''; let name = '';
  const initialToken = gate.begin();
  const initial = executePopupInitialLoad({ loadSummary: () => initialSummary.promise, loadProfile: () => initialProfile.promise, commitSummary: value => { active = value.activeProfileId; }, commitProfile: value => { name = value.personal.name; }, showError: () => {}, isCurrent: () => gate.isCurrent(initialToken) });
  const switchToken = gate.begin();
  await executePopupProfileSwitch('p2', 'p1', { switchProfile: async () => ({ success: true, data: summary('p2') }), loadSummary: async () => summary('p2'), loadProfile: async () => user('切换后'), commitSummary: value => { active = value.activeProfileId; }, commitProfile: value => { name = value.personal.name; }, rollback: () => {}, showError: () => {}, isCurrent: () => gate.isCurrent(switchToken) });
  initialSummary.resolve(summary('p1')); initialProfile.resolve(user('初始化旧资料')); await initial;
  assert.equal(active, 'p2'); assert.equal(name, '切换后');
});

test('初始化加载失败会产生用户可见错误', async () => {
  const errors: string[] = [];
  await executePopupInitialLoad({
    loadSummary: async () => { throw new Error('down'); },
    loadProfile: async () => { throw new Error('down'); },
    commitSummary: () => {}, commitProfile: () => {}, showError: value => errors.push(value), isCurrent: () => true,
  });
  assert.deepEqual(errors, ['简历列表加载失败；个人资料加载失败']);
});

test('组件卸载后初始化和切换请求均不得提交状态', async () => {
  const gate = createPopupRequestGate(); const token = gate.begin(); const calls: string[] = []; gate.unmount();
  await executePopupProfileSwitch('p2', 'p1', { switchProfile: async () => ({ success: false, error: '迟到错误' }), loadSummary: async () => summary('p2'), loadProfile: async () => user('x'), commitSummary: () => calls.push('summary'), commitProfile: () => calls.push('profile'), rollback: () => calls.push('rollback'), showError: () => calls.push('error'), isCurrent: () => gate.isCurrent(token) });
  assert.deepEqual(calls, []);
});
