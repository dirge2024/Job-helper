import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import { ResumeProfileManager, runGuardedProfileChange } from './ResumeProfileManager';
import type { ResumeProfileSummary } from '../shared/types';

const summary: ResumeProfileSummary = {
  activeProfileId: 'one',
  profiles: [
    { id: 'one', name: '校招简历', createdAt: '', updatedAt: '' },
    { id: 'two', name: '社招简历', createdAt: '', updatedAt: '' },
  ],
};

const props = {
  summary,
  dirty: false,
  onSave: async () => true,
  onSummaryChange: () => undefined,
  onActiveProfileChange: async () => undefined,
  sendMessage: async () => ({ success: true, data: summary }),
};

test('显示当前名称和全部管理操作', () => {
  const html = renderToStaticMarkup(<ResumeProfileManager {...props} />);
  assert.match(html, /校招简历/);
  for (const text of ['新建空白', '复制当前', '重命名', '删除']) assert.match(html, new RegExp(text));
});

test('仅剩一套时删除按钮禁用', () => {
  const html = renderToStaticMarkup(<ResumeProfileManager {...props} summary={{ ...summary, profiles: [summary.profiles[0]] }} />);
  assert.match(html, /aria-label="删除当前简历"[^>]*disabled/);
});

test('空名和重名均阻止创建', async () => {
  let calls = 0;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<ResumeProfileManager {...props} sendMessage={async () => { calls++; return { success: true, data: summary }; }} />); });
  const root = renderer.root;
  await act(async () => root.findByProps({ 'aria-label': '新建空白简历' }).props.onClick());
  const input = root.findByProps({ 'aria-label': '简历名称' });
  await act(async () => root.findByProps({ 'aria-label': '确认名称' }).props.onClick());
  assert.match(root.findByProps({ role: 'alert' }).children.join(''), /不能为空/);
  await act(async () => input.props.onChange({ target: { value: ' 校招简历 ' } }));
  await act(async () => root.findByProps({ 'aria-label': '确认名称' }).props.onClick());
  assert.match(root.findByProps({ role: 'alert' }).children.join(''), /已存在/);
  assert.equal(calls, 0);
});

test('脏状态保护覆盖保存、放弃和取消', async () => {
  const events: string[] = [];
  await runGuardedProfileChange(true, async () => { events.push('save'); return true; }, async () => events.push('action'), async () => 'save');
  assert.deepEqual(events, ['save', 'action']);
  events.length = 0;
  await runGuardedProfileChange(true, async () => { events.push('save'); return true; }, async () => events.push('action'), async () => 'discard');
  assert.deepEqual(events, ['action']);
  events.length = 0;
  await runGuardedProfileChange(true, async () => true, async () => events.push('action'), async () => 'cancel');
  assert.deepEqual(events, []);
});

test('保存失败时不执行切换', async () => {
  let changed = false;
  await runGuardedProfileChange(true, async () => false, async () => { changed = true; }, async () => 'save');
  assert.equal(changed, false);
});

test('重命名不经过脏状态保护且不触发资料重载', async () => {
  const messages: string[] = [];
  let reloads = 0;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<ResumeProfileManager {...props} dirty sendMessage={async message => { messages.push(message.type); return { success: true, data: summary }; }} onActiveProfileChange={async () => { reloads++; }} />); });
  await act(async () => renderer.root.findByProps({ 'aria-label': '重命名当前简历' }).props.onClick());
  await act(async () => renderer.root.findByProps({ 'aria-label': '简历名称' }).props.onChange({ target: { value: '新名称' } }));
  await act(async () => renderer.root.findByProps({ 'aria-label': '确认名称' }).props.onClick());
  assert.deepEqual(messages, ['RENAME_RESUME_PROFILE']);
  assert.equal(reloads, 0);
});
