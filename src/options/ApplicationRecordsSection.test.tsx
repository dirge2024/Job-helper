import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import { ApplicationRecordsSection } from './ApplicationRecordsSection.tsx';
import { MessageService } from '../shared/message.ts';
import type { ApplicationRecord, Message, MessageResponse } from '../shared/types.ts';

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

function getCardTitles(root: TestRenderer.ReactTestInstance): string[] {
  return root
    .findAll(node => node.type === 'article' && node.props.className === 'application-record-card')
    .map(card => card.findByType('h3').children.join(''));
}

function getText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map(child => typeof child === 'string' ? child : getText(child))
    .join('');
}

function getAlertTexts(root: TestRenderer.ReactTestInstance): string[] {
  return root.findAll(node => node.props.role === 'alert').map(getText);
}

function findButton(root: TestRenderer.ReactTestInstance, text: string): TestRenderer.ReactTestInstance {
  return root.findAllByType('button').find(node => getText(node) === text)
    ?? (() => {
      throw new Error(`未找到按钮：${text}`);
    })();
}

function findInputByAriaLabel(root: TestRenderer.ReactTestInstance, label: string): TestRenderer.ReactTestInstance {
  return root.findAll(
    node => (node.type === 'input' || node.type === 'select') && node.props['aria-label'] === label,
  )[0];
}

function withMockedSendMessage(
  implementation: (message: Message) => Promise<MessageResponse<any>>,
  run: () => Promise<void>,
): Promise<void> {
  const original = MessageService.sendMessage;
  MessageService.sendMessage = implementation as typeof MessageService.sendMessage;
  return run().finally(() => {
    MessageService.sendMessage = original;
  });
}

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

test('筛选条件变化时列表结果会同步变化', async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<ApplicationRecordsSection initialRecords={records} />);
  });

  assert.deepEqual(getCardTitles(renderer.root), ['字节跳动', '腾讯']);

  await act(async () => {
    findInputByAriaLabel(renderer.root, '公司名').props.onChange({ target: { value: '腾讯' } });
  });
  assert.deepEqual(getCardTitles(renderer.root), ['腾讯']);

  await act(async () => {
    findInputByAriaLabel(renderer.root, '公司名').props.onChange({ target: { value: '' } });
    findInputByAriaLabel(renderer.root, '岗位名').props.onChange({ target: { value: '前端' } });
  });
  assert.deepEqual(getCardTitles(renderer.root), ['字节跳动']);

  await act(async () => {
    findInputByAriaLabel(renderer.root, '岗位名').props.onChange({ target: { value: '' } });
    findInputByAriaLabel(renderer.root, '状态').props.onChange({ target: { value: '面试' } });
  });
  assert.deepEqual(getCardTitles(renderer.root), ['腾讯']);
});

test('UPDATE_APPLICATION_RECORD 发送失败时展示失败提示', async () => {
  const sentMessages: Message[] = [];

  await withMockedSendMessage(async message => {
    sentMessages.push(message);
    if (message.type === 'UPDATE_APPLICATION_RECORD') {
      return { success: false, error: '更新失败' };
    }
    return { success: true, data: null };
  }, async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ApplicationRecordsSection initialRecords={records} />);
    });

    await act(async () => {
      findButton(renderer.root, '编辑').props.onClick();
    });

    await act(async () => {
      findButton(renderer.root, '保存修改').props.onClick();
    });

    assert.equal(sentMessages.at(-1)?.type, 'UPDATE_APPLICATION_RECORD');
    assert.match(getAlertTexts(renderer.root).join('\n'), /更新失败/);
  });
});

test('DELETE_APPLICATION_RECORD 发送失败时展示失败提示', async () => {
  const sentMessages: Message[] = [];

  await withMockedSendMessage(async message => {
    sentMessages.push(message);
    if (message.type === 'DELETE_APPLICATION_RECORD') {
      return { success: false, error: '删除失败' };
    }
    return { success: true, data: null };
  }, async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ApplicationRecordsSection initialRecords={records} />);
    });

    await act(async () => {
      findButton(renderer.root, '删除').props.onClick();
    });

    assert.equal(sentMessages.at(-1)?.type, 'DELETE_APPLICATION_RECORD');
    assert.match(getAlertTexts(renderer.root).join('\n'), /删除失败/);
  });
});

test('EXPORT_APPLICATION_RECORDS_CSV 发送失败时展示失败提示', async () => {
  const sentMessages: Message[] = [];

  await withMockedSendMessage(async message => {
    sentMessages.push(message);
    if (message.type === 'EXPORT_APPLICATION_RECORDS_CSV') {
      return { success: false, error: '导出失败' };
    }
    return { success: true, data: null };
  }, async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ApplicationRecordsSection initialRecords={records} />);
    });

    await act(async () => {
      findButton(renderer.root, '导出 CSV').props.onClick();
    });

    assert.equal(sentMessages.at(-1)?.type, 'EXPORT_APPLICATION_RECORDS_CSV');
    assert.match(getAlertTexts(renderer.root).join('\n'), /导出失败/);
  });
});

test('IMPORT_APPLICATION_RECORDS_CSV 发送失败时展示失败提示', async () => {
  const sentMessages: Message[] = [];
  const file = {
    async text() {
      return 'companyName\n字节跳动';
    },
  };

  await withMockedSendMessage(async message => {
    sentMessages.push(message);
    if (message.type === 'IMPORT_APPLICATION_RECORDS_CSV') {
      return { success: false, error: '导入失败' };
    }
    return { success: true, data: null };
  }, async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ApplicationRecordsSection initialRecords={records} />);
    });

    const fileInput = renderer.root.findAll(node => node.type === 'input' && node.props.type === 'file')[0];
    const target = { files: [file], value: 'records.csv' };

    await act(async () => {
      await fileInput.props.onChange({ target });
    });

    assert.equal(sentMessages.at(-1)?.type, 'IMPORT_APPLICATION_RECORDS_CSV');
    assert.equal((sentMessages.at(-1) as Extract<Message, { type: 'IMPORT_APPLICATION_RECORDS_CSV' }>).payload.csv, 'companyName\n字节跳动');
    assert.equal(target.value, '');
    assert.match(getAlertTexts(renderer.root).join('\n'), /导入失败/);
  });
});

test('initialMode 为 new 时不会把现有记录误当作新建草稿直接进入编辑', async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <ApplicationRecordsSection
        initialMode="new"
        initialRecords={records}
      />,
    );
  });

  assert.match(getText(renderer.root), /选择记录后可编辑/);
  assert.doesNotMatch(getText(renderer.root), /编辑投递记录/);
});
