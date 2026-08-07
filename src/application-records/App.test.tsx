import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import App from './App.tsx';
import { MessageService } from '../shared/message.ts';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const [firstArg] = args;
  if (
    typeof firstArg === 'string'
    && (
      firstArg.includes('react-test-renderer is deprecated')
      || firstArg.includes('The current testing environment is not configured to support act')
    )
  ) {
    return;
  }

  originalConsoleError(...args);
};

test('新建记录页默认显示已投递状态并保留空岗位名输入框', () => {
  const html = renderToStaticMarkup(<App />);
  assert.match(html, /已投递/);
  assert.match(html, /岗位名/);
});

test('命中同公司同链接时新建页显示已存在提示但保留继续保存按钮', async () => {
  const originalWindow = globalThis.window;
  const originalSendMessage = MessageService.sendMessage;

  const mockedWindow = {
    location: {
      search: '?draftId=duplicate-draft',
    },
  } as Window & typeof globalThis;

  globalThis.window = mockedWindow;
  MessageService.sendMessage = (async () => ({
    success: true,
    data: {
      draft: {
        companyName: '字节跳动',
        jobTitle: '',
        sourceSite: 'jobs.bytedance.com',
        sourceUrl: 'https://jobs.bytedance.com/example',
        status: '已投递',
        notes: '',
        appliedAt: '2026-08-07',
        location: '',
      },
      duplicate: {
        id: 'existing-record',
        companyName: '字节跳动',
        jobTitle: '',
        sourceSite: 'jobs.bytedance.com',
        sourceUrl: 'https://jobs.bytedance.com/example',
        status: '已投递',
        notes: '',
        appliedAt: '2026-08-07',
        location: '',
        createdAt: '2026-08-07T10:00:00.000Z',
        updatedAt: '2026-08-07T10:00:00.000Z',
      },
    },
  })) as typeof MessageService.sendMessage;

  try {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<App />);
    });

    const text = renderer.root.findAll(node => typeof node.type === 'string').map(node => node.children.join('')).join('\n');
    const submitButtonText = renderer.root.findAllByType('button')
      .find(node => node.props.type === 'submit')
      ?.children
      .join('');
    assert.match(text, /已存在/);
    assert.equal(submitButtonText, '继续保存');
  } finally {
    MessageService.sendMessage = originalSendMessage;
    globalThis.window = originalWindow;
  }
});
