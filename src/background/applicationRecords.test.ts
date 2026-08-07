import assert from 'node:assert/strict';
import test from 'node:test';
import type { Message } from '../shared/types.ts';
import type { ApplicationRecord } from '../shared/types.ts';
import {
  handleCreateApplicationRecord,
  handleCreateApplicationRecordDraft,
  handleDeleteApplicationRecord,
  handleExportApplicationRecordsCsv,
  handleGetApplicationRecordDraft,
  handleGetApplicationRecords,
  handleImportApplicationRecordsCsv,
  handleUpdateApplicationRecord,
} from './applicationRecords.ts';

function installChromeStub() {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  const storageState: Record<string, unknown> = {};
  const sentMessages: Message[] = [];

  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: storageState[key] }),
        set: async (values: Record<string, unknown>) => Object.assign(storageState, values),
      },
    },
    tabs: {
      get: async (tabId: number) => ({
        id: tabId,
        url: 'https://jobs.bytedance.com/campus',
      }),
      sendMessage: async (_tabId: number, message: Message) => {
        sentMessages.push(message);
        return {
          success: true,
          data: {
            companyName: '字节跳动',
            sourceSite: 'jobs.bytedance.com',
            sourceUrl: 'https://jobs.bytedance.com/campus',
            pageTitle: '字节跳动校园招聘',
          },
        };
      },
    },
  };

  return {
    storageState,
    sentMessages,
    restore() {
      (globalThis as { chrome?: unknown }).chrome = originalChrome;
    },
  };
}

function buildRecord(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: 'r1',
    companyName: '字节跳动',
    jobTitle: '',
    sourceSite: 'jobs.bytedance.com',
    sourceUrl: 'https://jobs.bytedance.com/campus',
    status: '已投递',
    notes: '',
    appliedAt: '2026-08-07',
    location: '',
    createdAt: '2026-08-07T10:00:00.000Z',
    updatedAt: '2026-08-07T10:00:00.000Z',
    ...overrides,
  };
}

test('创建草稿时返回 duplicate 但不阻止后续创建', async () => {
  const stub = installChromeStub();

  try {
    const first = await handleCreateApplicationRecord(buildRecord());
    assert.equal(first.success, true);
    assert.equal(first.data?.duplicate, null);

    const createdDraft = await handleCreateApplicationRecordDraft(1);
    assert.equal(createdDraft.success, true);

    const second = await handleGetApplicationRecordDraft(createdDraft.data!.draftId);
    assert.equal(second.success, true);
    assert.equal(second.data?.draft.companyName, '字节跳动');
    assert.equal(second.data?.duplicate?.id, 'r1');
    assert.deepEqual(stub.sentMessages, [{
      type: 'GET_APPLICATION_PAGE_METADATA',
      payload: null,
    }]);
  } finally {
    stub.restore();
  }
});

test('背景层 CRUD 与 CSV handler 可独立运行', async () => {
  const stub = installChromeStub();

  try {
    await handleCreateApplicationRecord(buildRecord());

    const listResponse = await handleGetApplicationRecords();
    assert.equal(listResponse.success, true);
    assert.equal(listResponse.data?.length, 1);

    const updated = buildRecord({
      status: '面试',
      notes: '一面通过',
      updatedAt: '2026-08-08T10:00:00.000Z',
    });
    const updateResponse = await handleUpdateApplicationRecord(updated);
    assert.equal(updateResponse.success, true);
    assert.equal((await handleGetApplicationRecords()).data?.[0]?.status, '面试');

    const exportResponse = await handleExportApplicationRecordsCsv();
    assert.equal(exportResponse.success, true);
    assert.match(exportResponse.data?.filename || '', /^application-records-/);
    assert.match(exportResponse.data?.csv || '', /companyName,jobTitle,sourceSite,sourceUrl,status/);

    const importResponse = await handleImportApplicationRecordsCsv(exportResponse.data!.csv);
    assert.equal(importResponse.success, true);
    assert.equal(importResponse.data?.imported, 1);
    assert.deepEqual(importResponse.data?.warnings, []);

    const deleteResponse = await handleDeleteApplicationRecord('r1');
    assert.equal(deleteResponse.success, true);
    assert.deepEqual((await handleGetApplicationRecords()).data, []);
  } finally {
    stub.restore();
  }
});
