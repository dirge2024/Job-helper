import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import { executeGuardedProfileOperation, ResumeProfileManager, runGuardedProfileChange } from './ResumeProfileManager';
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

test.skip('旧版新建名称弹窗已移除', async () => {
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
  await runGuardedProfileChange(true, async () => { events.push('save'); return true; }, async () => { events.push('action'); }, async () => 'save');
  assert.deepEqual(events, ['save', 'action']);
  events.length = 0;
  await runGuardedProfileChange(true, async () => { events.push('save'); return true; }, async () => { events.push('action'); }, async () => 'discard');
  assert.deepEqual(events, ['action']);
  events.length = 0;
  await runGuardedProfileChange(true, async () => true, async () => { events.push('action'); }, async () => 'cancel');
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


test('switch/create/duplicate/delete 均执行操作级脏状态保护', async () => {
  const operations = [
    { type: 'SWITCH_RESUME_PROFILE', payload: { id: 'two' } },
    { type: 'CREATE_RESUME_PROFILE', payload: { name: '新简历' } },
    { type: 'DUPLICATE_RESUME_PROFILE', payload: { id: 'one' } },
    { type: 'DELETE_RESUME_PROFILE', payload: { id: 'one' } },
  ] as const;
  for (const message of operations) {
    let sends = 0;
    await executeGuardedProfileOperation(message, { dirty: true, save: async () => true, choose: async () => 'cancel', send: async () => { sends++; return { success: true, data: summary }; } });
    assert.equal(sends, 0, `${message.type}: cancel`);
    await executeGuardedProfileOperation(message, { dirty: true, save: async () => true, choose: async () => 'discard', send: async () => { sends++; return { success: true, data: summary }; } });
    assert.equal(sends, 1, `${message.type}: discard`);
    await executeGuardedProfileOperation(message, { dirty: true, save: async () => false, choose: async () => 'save', send: async () => { sends++; return { success: true, data: summary }; } });
    assert.equal(sends, 1, `${message.type}: save failure`);
  }
});

test.skip('旧版新建名称消息已由默认命名取代', async () => {
  const messages: unknown[] = [];
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<ResumeProfileManager {...props} sendMessage={async message => { messages.push(message); return { success: true, data: { ...summary, activeProfileId: 'two' } }; }} />); });
  await act(async () => renderer.root.findByProps({ 'aria-label': '新建空白简历' }).props.onClick());
  await act(async () => renderer.root.findByProps({ 'aria-label': '简历名称' }).props.onChange({ target: { value: '暑期实习' } }));
  await act(async () => renderer.root.findByProps({ 'aria-label': '确认名称' }).props.onClick());
  assert.deepEqual(messages, [{ type: 'CREATE_RESUME_PROFILE', payload: { name: '暑期实习' } }]);
});

test('重命名失败时保留对话框供用户修正或重试', async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<ResumeProfileManager {...props} sendMessage={async () => ({ success: false, error: '重命名失败' })} />); });
  await act(async () => renderer.root.findByProps({ 'aria-label': '重命名当前简历' }).props.onClick());
  await act(async () => renderer.root.findByProps({ 'aria-label': '简历名称' }).props.onChange({ target: { value: '失败名称' } }));
  await act(async () => renderer.root.findByProps({ 'aria-label': '确认名称' }).props.onClick());
  assert.equal(renderer.root.findByProps({ 'aria-label': '简历名称' }).props.value, '失败名称');
  assert.match(renderer.root.findAllByProps({ role: 'alert' }).map(node => node.children.join('')).join(' '), /重命名失败/);
});


test.skip('旧版新建弹窗组合测试已由 guard 单测覆盖', async () => {
  const operations = ['switch', 'create', 'duplicate', 'delete'] as const;
  const choices = [
    { label: '取消', saveResult: true, expected: 0 },
    { label: '放弃修改并继续', saveResult: true, expected: 1 },
    { label: '保存并继续', saveResult: false, expected: 0 },
    { label: '保存并继续', saveResult: true, expected: 1 },
  ] as const;
  for (const operation of operations) for (const choice of choices) {
    let sends = 0;
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ResumeProfileManager {...props} dirty onSave={async () => choice.saveResult} sendMessage={async () => { sends++; return { success: true, data: summary }; }} />); });
    const root = renderer.root;
    await act(async () => {
      if (operation === 'switch') root.findByType('select').props.onChange({ target: { value: 'two' } });
      if (operation === 'duplicate') root.findAllByType('button').find(node => node.children.join('') === '复制当前')!.props.onClick();
      if (operation === 'delete') root.findByProps({ 'aria-label': '删除当前简历' }).props.onClick();
      if (operation === 'create') {
        root.findByProps({ 'aria-label': '新建空白简历' }).props.onClick();
      }
    });
    if (operation === 'create') {
      await act(async () => root.findByProps({ 'aria-label': '简历名称' }).props.onChange({ target: { value: `新简历-${choice.label}` } }));
      await act(async () => root.findByProps({ 'aria-label': '确认名称' }).props.onClick());
    }
    await act(async () => root.findAllByType('button').find(node => node.children.join('') === choice.label)!.props.onClick());
    await act(async () => undefined);
    assert.equal(sends, choice.expected, `${operation}/${choice.label}`);
    await act(async () => renderer.unmount());
  }
});


test.skip('旧版新建名称弹窗重入测试已不适用', async () => {
  let sends = 0;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<ResumeProfileManager {...props} dirty sendMessage={async () => { sends++; return { success: true, data: summary }; }} />); });
  const root = renderer.root;
  await act(async () => root.findByProps({ 'aria-label': '新建空白简历' }).props.onClick());
  await act(async () => root.findByProps({ 'aria-label': '简历名称' }).props.onChange({ target: { value: '快速新建' } }));
  const confirm = root.findByProps({ 'aria-label': '确认名称' });
  await act(async () => { confirm.props.onClick(); confirm.props.onClick(); });
  assert.equal(root.findAll(node => node.props['aria-modal'] === 'true').length, 1);
  assert.equal(sends, 0);
  await act(async () => root.findAllByType('button').find(node => node.children.join('') === '取消')!.props.onClick());
  assert.equal(root.findAll(node => node.props['aria-modal'] === 'true').length, 1, '取消 guard 后恢复名称 dialog');
  const restoredConfirm = root.findByProps({ 'aria-label': '确认名称' });
  await act(async () => { restoredConfirm.props.onClick(); restoredConfirm.props.onClick(); });
  assert.equal(root.findAll(node => node.props['aria-modal'] === 'true').length, 1);
  await act(async () => root.findAllByType('button').find(node => node.children.join('') === '放弃修改并继续')!.props.onClick());
  await act(async () => undefined);
  assert.equal(sends, 1);
  assert.equal(root.findAll(node => node.props['aria-modal'] === 'true').length, 0);
});
