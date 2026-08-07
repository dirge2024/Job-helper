import {
  createApplicationRecordDraft,
  findApplicationRecordDuplicate,
  parseApplicationRecordsCsv,
  serializeApplicationRecordsCsv,
} from '../shared/applicationRecords.ts';
import { StorageService } from '../shared/storage.ts';
import type {
  ApplicationPageMetadata,
  ApplicationRecord,
  ApplicationRecordDraft,
  Message,
  MessageResponse,
} from '../shared/types.ts';

const drafts = new Map<string, ApplicationRecordDraft>();

function createDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildExportFilename(date = new Date()): string {
  const compact = date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `application-records-${compact}.csv`;
}

async function requestApplicationPageMetadata(
  tabId: number,
  tabUrl: string,
): Promise<MessageResponse<ApplicationPageMetadata>> {
  const response = await chrome.tabs.sendMessage(tabId, {
    type: 'GET_APPLICATION_PAGE_METADATA',
    payload: null,
  } satisfies Message) as MessageResponse<ApplicationPageMetadata>;

  if (!response.success || !response.data) {
    return {
      success: false,
      error: response.error || '未能提取当前页面投递信息',
    };
  }

  return {
    success: true,
    data: {
      ...response.data,
      sourceUrl: response.data.sourceUrl || tabUrl,
      sourceSite: response.data.sourceSite || new URL(tabUrl).host,
    },
  };
}

export async function handleCreateApplicationRecordDraft(
  tabId: number,
): Promise<MessageResponse<{ draftId: string }>> {
  const tab = await chrome.tabs.get(tabId);
  const tabUrl = tab.url?.trim();
  if (!tabUrl) {
    return { success: false, error: '当前标签页缺少可用链接' };
  }

  const metadataResponse = await requestApplicationPageMetadata(tabId, tabUrl);
  if (!metadataResponse.success || !metadataResponse.data) {
    return { success: false, error: metadataResponse.error || '创建投递草稿失败' };
  }

  const draftId = createDraftId();
  drafts.set(draftId, createApplicationRecordDraft(new Date().toISOString(), metadataResponse.data));
  return { success: true, data: { draftId } };
}

export async function handleGetApplicationRecordDraft(
  draftId: string,
): Promise<MessageResponse<{ draft: ApplicationRecordDraft; duplicate: ApplicationRecord | null }>> {
  const draft = drafts.get(draftId);
  if (!draft) {
    return { success: false, error: '投递草稿不存在' };
  }

  const records = await StorageService.getApplicationRecords();
  const duplicate = findApplicationRecordDuplicate(records, draft);
  return {
    success: true,
    data: {
      draft,
      duplicate,
    },
  };
}

export async function handleGetApplicationRecords(): Promise<MessageResponse<ApplicationRecord[]>> {
  return {
    success: true,
    data: await StorageService.getApplicationRecords(),
  };
}

export async function handleCreateApplicationRecord(
  record: ApplicationRecord,
): Promise<MessageResponse<{ duplicate: ApplicationRecord | null }>> {
  const records = await StorageService.getApplicationRecords();
  const duplicate = findApplicationRecordDuplicate(records, record);
  await StorageService.saveApplicationRecords([...records, record]);
  return {
    success: true,
    data: { duplicate },
  };
}

export async function handleUpdateApplicationRecord(record: ApplicationRecord): Promise<MessageResponse> {
  await StorageService.updateApplicationRecord(record);
  return { success: true };
}

export async function handleDeleteApplicationRecord(id: string): Promise<MessageResponse> {
  await StorageService.deleteApplicationRecord(id);
  return { success: true };
}

export async function handleExportApplicationRecordsCsv(): Promise<MessageResponse<{ csv: string; filename: string }>> {
  const records = await StorageService.getApplicationRecords();
  return {
    success: true,
    data: {
      csv: serializeApplicationRecordsCsv(records),
      filename: buildExportFilename(),
    },
  };
}

export async function handleImportApplicationRecordsCsv(
  csv: string,
): Promise<MessageResponse<{ imported: number; warnings: string[] }>> {
  const existingRecords = await StorageService.getApplicationRecords();
  const { records, warnings } = parseApplicationRecordsCsv(csv);
  const importedRecords = records.map((record) => {
    const duplicate = findApplicationRecordDuplicate(existingRecords, record);
    return duplicate ? { ...record, id: duplicate.id } : record;
  });
  await StorageService.saveApplicationRecords(importedRecords);
  return {
    success: true,
    data: {
      imported: importedRecords.length,
      warnings,
    },
  };
}
