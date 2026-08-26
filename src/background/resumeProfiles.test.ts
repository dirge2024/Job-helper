import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { STORAGE_KEYS, StorageService } from '../shared/storage.ts';
import type {
  Message,
  ResumeProfileLibrary,
  ResumeProfileMutationResult,
  ResumeProfileSummary,
  UserProfile,
} from '../shared/types.ts';
import {
  createResumeProfileHandler,
  deleteResumeProfileHandler,
  duplicateResumeProfileHandler,
  getResumeProfilesHandler,
  renameResumeProfileHandler,
  switchResumeProfileHandler,
  type ResumeProfileHandlerDependencies,
} from './resumeProfiles.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type SummaryKeysAreExact = Assert<Equal<keyof ResumeProfileSummary, 'activeProfileId' | 'profiles'>>;
type MutationResultHasSync = Assert<'sync' extends keyof ResumeProfileMutationResult ? true : false>;
void (0 as unknown as SummaryKeysAreExact);
void (0 as unknown as MutationResultHasSync);

const originalGet = StorageService.getResumeProfileLibrary;
const originalSave = StorageService.saveResumeProfileLibrary;
let library: ResumeProfileLibrary;
let queued: string[];
let failSave = false;
let loads = 0;
let saves = 0;

function profile(id: string, name: string) {
  return {
    id, name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    profile: {
      personal: { name, gender: '', birthDate: '', phone: '', email: '' },
      education: [], experience: [], projects: [], customInformation: [], skills: [], certifications: [],
      resume: { fileName: 'large.pdf', fileData: 'base64-data', fileType: 'application/pdf', uploadDate: '2026-01-01' },
    },
  };
}

const deps: ResumeProfileHandlerDependencies = {
  now: () => '2026-02-01T00:00:00.000Z',
  queueAutoSync: async reason => { queued.push(reason); return 'queued'; },
};

beforeEach(() => {
  library = { schemaVersion: 1, activeProfileId: 'profile-1', profiles: [profile('profile-1', '第一份'), profile('profile-2', '第二份')] };
  queued = [];
  failSave = false;
  loads = 0;
  saves = 0;
  StorageService.getResumeProfileLibrary = async () => { loads += 1; return structuredClone(library); };
  StorageService.saveResumeProfileLibrary = async next => {
    saves += 1;
    if (failSave) throw new Error('磁盘已满');
    library = structuredClone(next);
  };
});

afterEach(() => {
  StorageService.getResumeProfileLibrary = originalGet;
  StorageService.saveResumeProfileLibrary = originalSave;
});

function assertSinglePersistence() {
  assert.equal(loads, 1, '每次成功 mutation 只读取一次');
  assert.equal(saves, 1, '每次成功 mutation 只保存一次');
}

test('列表摘要包含精确键集合，不返回大型 profile 和附件', async () => {
  const response = await getResumeProfilesHandler();
  assert.equal(response.success, true);
  assert.deepEqual(Object.keys(response.data!).sort(), ['activeProfileId', 'profiles']);
  assert.deepEqual(Object.keys(response.data!.profiles[0]).sort(), ['createdAt', 'id', 'name', 'updatedAt']);
  assert.deepEqual(response.data!.profiles.map(item => item.name), ['第一份', '第二份']);
});

test('切换只更新当前 ID，且只读写一次', async () => {
  const before = structuredClone(library.profiles);
  const response = await switchResumeProfileHandler({ id: 'profile-2' }, deps);
  assert.equal(response.success, true);
  assert.equal(library.activeProfileId, 'profile-2');
  assert.deepEqual(library.profiles, before);
  assertSinglePersistence();
  assert.deepEqual(queued, ['resume-profile-switch']);
});

test('创建以传入名称原子追加一个空白资料并设为活动资料', async () => {
  const response = await createResumeProfileHandler({ name: '暑期实习' }, deps);
  assert.equal(response.success, true);
  assert.equal(library.profiles.length, 3);
  assert.equal(library.activeProfileId, library.profiles[2].id);
  assert.equal(library.profiles[2].name, '暑期实习');
  assertSinglePersistence();
  assert.deepEqual(queued, ['resume-profile-create']);
});

test('复制只追加一个深拷贝并生成唯一名称', async () => {
  const response = await duplicateResumeProfileHandler({ id: 'profile-1' }, deps);
  assert.equal(response.success, true);
  assert.equal(library.profiles.length, 3);
  assert.equal(library.profiles[2].name, '第一份 - 副本');
  assert.deepEqual(library.profiles[2].profile, library.profiles[0].profile);
  assert.notEqual(library.profiles[2].profile, library.profiles[0].profile);
  assertSinglePersistence();
  assert.deepEqual(queued, ['resume-profile-duplicate']);
});

test('重命名只更新目标一次', async () => {
  const response = await renameResumeProfileHandler({ id: 'profile-1', name: ' 新名称 ' }, deps);
  assert.equal(response.success, true);
  assert.deepEqual(library.profiles.map(item => item.name), ['新名称', '第二份']);
  assert.equal(library.profiles[0].updatedAt, '2026-02-01T00:00:00.000Z');
  assertSinglePersistence();
  assert.deepEqual(queued, ['resume-profile-rename']);
});

test('删除活动资料时只删除一次并切换到剩余资料', async () => {
  const response = await deleteResumeProfileHandler({ id: 'profile-1' }, deps);
  assert.equal(response.success, true);
  assert.deepEqual(library.profiles.map(item => item.id), ['profile-2']);
  assert.equal(library.activeProfileId, 'profile-2');
  assertSinglePersistence();
  assert.deepEqual(queued, ['resume-profile-delete']);
});

test('非法 ID 返回可读错误且不保存、不排队同步', async () => {
  const response = await switchResumeProfileHandler({ id: 'missing' }, deps);
  assert.deepEqual(response, { success: false, error: '简历不存在' });
  assert.equal(loads, 1);
  assert.equal(saves, 0);
  assert.deepEqual(queued, []);
});

test('重复名称返回可读错误且不保存、不排队同步', async () => {
  const response = await renameResumeProfileHandler({ id: 'profile-1', name: '第二份' }, deps);
  assert.deepEqual(response, { success: false, error: '简历名称已存在' });
  assert.equal(saves, 0);
  assert.deepEqual(queued, []);
});

test('空白名称返回可读错误且不保存、不排队同步', async () => {
  const response = await renameResumeProfileHandler({ id: 'profile-1', name: '   ' }, deps);
  assert.deepEqual(response, { success: false, error: '简历名称不能为空' });
  assert.equal(saves, 0);
  assert.deepEqual(queued, []);
});

test('删除最后一份资料返回可读错误且不保存、不排队同步', async () => {
  library = { ...library, profiles: [library.profiles[0]] };
  const response = await deleteResumeProfileHandler({ id: 'profile-1' }, deps);
  assert.deepEqual(response, { success: false, error: '至少保留一套简历' });
  assert.equal(saves, 0);
  assert.deepEqual(queued, []);
});

test('存储失败返回失败，且不 queueAutoSync', async () => {
  failSave = true;
  const response = await deleteResumeProfileHandler({ id: 'profile-2' }, deps);
  assert.deepEqual(response, { success: false, error: '磁盘已满' });
  assert.equal(saves, 1);
  assert.deepEqual(queued, []);
});

test('同步排队失败不回滚本地提交，返回成功和 sync warning', async () => {
  const syncFailureDeps: ResumeProfileHandlerDependencies = {
    ...deps,
    queueAutoSync: async reason => { queued.push(reason); throw new Error('同步服务暂不可用'); },
  };
  const response = await renameResumeProfileHandler({ id: 'profile-1', name: '已本地保存' }, syncFailureDeps);
  assert.equal(response.success, true);
  assert.equal(library.profiles[0].name, '已本地保存');
  assert.equal(response.data!.sync, 'error');
  assert.equal(response.data!.syncError, '同步服务暂不可用');
  assertSinglePersistence();
  assert.deepEqual(queued, ['resume-profile-rename']);
});

test('并发 mutation 串行读取最新状态，不丢失更新', async () => {
  let releaseFirstSave!: () => void;
  const firstSaveBlocked = new Promise<void>(resolve => { releaseFirstSave = resolve; });
  const normalSave = StorageService.saveResumeProfileLibrary;
  StorageService.saveResumeProfileLibrary = async next => {
    if (saves === 0) await firstSaveBlocked;
    await normalSave(next);
  };

  const first = createResumeProfileHandler({ name: '并发简历一' }, deps);
  await new Promise(resolve => setTimeout(resolve, 0));
  const second = createResumeProfileHandler({ name: '并发简历二' }, deps);
  releaseFirstSave();
  const responses = await Promise.all([first, second]);

  assert.equal(responses.every(item => item.success), true);
  assert.equal(library.profiles.length, 4);
  assert.deepEqual(library.profiles.slice(2).map(item => item.name), ['并发简历一', '并发简历二']);
  assert.equal(loads, 2);
  assert.equal(saves, 2);
  assert.deepEqual(queued, ['resume-profile-create', 'resume-profile-create']);
});

test('串行队列在一次存储失败后仍可处理后续 mutation', async () => {
  let attempts = 0;
  StorageService.saveResumeProfileLibrary = async next => {
    attempts += 1;
    saves += 1;
    if (attempts === 1) throw new Error('首次写入失败');
    library = structuredClone(next);
  };

  const first = renameResumeProfileHandler({ id: 'profile-1', name: '失败名称' }, deps);
  const second = renameResumeProfileHandler({ id: 'profile-2', name: '恢复成功' }, deps);
  const [failed, recovered] = await Promise.all([first, second]);

  assert.deepEqual(failed, { success: false, error: '首次写入失败' });
  assert.equal(recovered.success, true);
  assert.deepEqual(library.profiles.map(item => item.name), ['第一份', '恢复成功']);
  assert.equal(loads, 2);
  assert.equal(saves, 2);
  assert.deepEqual(queued, ['resume-profile-rename']);
});


async function withBackgroundHandler<T>(run: (handleMessage: typeof import('./index.ts').handleMessage) => Promise<T>): Promise<T> {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      onMessage: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
    },
  };
  try {
    const moduleUrl = new URL(`./index.ts?profile-compat=${Date.now()}-${Math.random()}`, import.meta.url).href;
    const background = await import(moduleUrl);
    return await run(background.handleMessage);
  } finally {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
  }
}

function activeProfile(): UserProfile {
  return library.profiles.find(item => item.id === library.activeProfileId)!.profile;
}

test('GET_USER_PROFILE 只返回当前简历', async () => {
  library.activeProfileId = 'profile-2';
  await withBackgroundHandler(async handleMessage => {
    const response = await handleMessage({ type: 'GET_USER_PROFILE' } as Message, {} as chrome.runtime.MessageSender);
    assert.equal(response.success, true);
    assert.deepEqual(response.data, library.profiles[1].profile);
  });
});

test('SAVE_USER_PROFILE 只更新当前简历，保留其它 entry 和附件并返回同步语义', async () => {
  const otherBefore = structuredClone(library.profiles[1]);
  const updatedProfile = structuredClone(activeProfile());
  updatedProfile.personal.name = '当前简历已更新';
  const originalGetWebDAV = StorageService.getWebDAVConfig;
  StorageService.getWebDAVConfig = async () => undefined;

  try {
    await withBackgroundHandler(async handleMessage => {
      const response = await handleMessage({
        type: 'SAVE_USER_PROFILE',
        payload: updatedProfile,
      } as Message, {} as chrome.runtime.MessageSender);
      assert.deepEqual(response, { success: true, data: { localSaved: true, sync: 'disabled' } });
    });
    assert.deepEqual(activeProfile(), updatedProfile);
    assert.deepEqual(library.profiles[1], otherBefore);
  } finally {
    StorageService.getWebDAVConfig = originalGetWebDAV;
  }
});

test('PARSE_RESUME 只合并当前简历和附件，保留其它 entry 与附件', async () => {
  const otherBefore = structuredClone(library.profiles[1]);
  const originalGetWebDAV = StorageService.getWebDAVConfig;
  StorageService.getWebDAVConfig = async () => undefined;
  const parsedText = JSON.stringify({
    basic: { name: '解析后的姓名' },
    education: [], experience: [], projects: [], skills: [],
  });

  try {
    await withBackgroundHandler(async handleMessage => {
      const response = await handleMessage({
        type: 'PARSE_RESUME',
        payload: { file: 'new-file-data', fileType: 'json', fileName: 'backend.json', rawText: parsedText },
      } as Message, {} as chrome.runtime.MessageSender);
      assert.equal(response.success, true);
    });
    assert.equal(activeProfile().personal.name, '解析后的姓名');
    assert.equal(activeProfile().resume?.fileName, 'backend.json');
    assert.equal(activeProfile().resume?.fileData, 'new-file-data');
    assert.deepEqual(library.profiles[1], otherBefore);
  } finally {
    StorageService.getWebDAVConfig = originalGetWebDAV;
  }
});


test('SAVE_USER_PROFILE 同步配置读取失败仍报告本地成功，且先保存后同步', async () => {
  const events: string[] = [];
  const normalSave = StorageService.saveResumeProfileLibrary;
  StorageService.saveResumeProfileLibrary = async next => {
    events.push('save');
    await normalSave(next);
  };
  const originalGetWebDAV = StorageService.getWebDAVConfig;
  StorageService.getWebDAVConfig = async () => {
    events.push('sync');
    throw new Error('WebDAV 配置读取失败');
  };
  const updated = structuredClone(activeProfile());
  updated.personal.name = '已本地保存';

  try {
    await withBackgroundHandler(async handleMessage => {
      const response = await handleMessage({ type: 'SAVE_USER_PROFILE', payload: updated } as Message, {} as chrome.runtime.MessageSender);
      assert.deepEqual(response, {
        success: true,
        data: { localSaved: true, sync: 'error', syncError: 'WebDAV 配置读取失败' },
      });
    });
    assert.equal(activeProfile().personal.name, '已本地保存');
    assert.deepEqual(events, ['save', 'sync']);
  } finally {
    StorageService.getWebDAVConfig = originalGetWebDAV;
  }
});

test('PARSE_RESUME 同步配置读取失败仍保留解析结果并返回 warning', async () => {
  const originalGetWebDAV = StorageService.getWebDAVConfig;
  StorageService.getWebDAVConfig = async () => { throw new Error('同步不可用'); };
  try {
    await withBackgroundHandler(async handleMessage => {
      const response = await handleMessage({
        type: 'PARSE_RESUME',
        payload: {
          file: 'parsed-file', fileType: 'json', fileName: 'parsed.json',
          rawText: JSON.stringify({ basic: { name: '本地解析成功' } }),
        },
      } as Message, {} as chrome.runtime.MessageSender);
      assert.equal(response.success, true);
      assert.equal((response.data as { sync: string }).sync, 'error');
      assert.equal((response.data as { syncError: string }).syncError, '同步不可用');
    });
    assert.equal(activeProfile().personal.name, '本地解析成功');
    assert.equal(activeProfile().resume?.fileName, 'parsed.json');
  } finally {
    StorageService.getWebDAVConfig = originalGetWebDAV;
  }
});

test('SAVE 与 SWITCH 共用 FIFO mutation queue，保存目标由入队顺序确定', async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const normalSave = StorageService.saveResumeProfileLibrary;
  StorageService.saveResumeProfileLibrary = async next => {
    if (saves === 0) await blocked;
    await normalSave(next);
  };
  const originalGetWebDAV = StorageService.getWebDAVConfig;
  StorageService.getWebDAVConfig = async () => undefined;
  const updated = structuredClone(activeProfile());
  updated.personal.name = '先保存第一份';

  try {
    await withBackgroundHandler(async handleMessage => {
      const save = handleMessage({ type: 'SAVE_USER_PROFILE', payload: updated } as Message, {} as chrome.runtime.MessageSender);
      await new Promise(resolve => setTimeout(resolve, 0));
      const switched = handleMessage({ type: 'SWITCH_RESUME_PROFILE', payload: { id: 'profile-2' } } as Message, {} as chrome.runtime.MessageSender);
      release();
      const [saveResponse, switchResponse] = await Promise.all([save, switched]);
      assert.equal(saveResponse.success, true);
      assert.equal(switchResponse.success, true);
    });
    assert.equal(library.profiles[0].profile.personal.name, '先保存第一份');
    assert.equal(library.profiles[1].profile.personal.name, '第二份');
    assert.equal(library.activeProfileId, 'profile-2');
    assert.equal(loads, 2);
    assert.equal(saves, 2);
  } finally {
    StorageService.getWebDAVConfig = originalGetWebDAV;
  }
});

test('PARSE 与 SWITCH 共用 FIFO mutation queue，不会把附件写到切换后的 entry', async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const normalSave = StorageService.saveResumeProfileLibrary;
  StorageService.saveResumeProfileLibrary = async next => {
    if (saves === 0) await blocked;
    await normalSave(next);
  };
  const originalGetWebDAV = StorageService.getWebDAVConfig;
  StorageService.getWebDAVConfig = async () => undefined;

  try {
    await withBackgroundHandler(async handleMessage => {
      const parse = handleMessage({
        type: 'PARSE_RESUME',
        payload: {
          file: 'queued-file', fileType: 'json', fileName: 'queued.json',
          rawText: JSON.stringify({ basic: { name: '队列解析' } }),
        },
      } as Message, {} as chrome.runtime.MessageSender);
      await new Promise(resolve => setTimeout(resolve, 0));
      const switched = handleMessage({ type: 'SWITCH_RESUME_PROFILE', payload: { id: 'profile-2' } } as Message, {} as chrome.runtime.MessageSender);
      release();
      await Promise.all([parse, switched]);
    });
    assert.equal(library.profiles[0].profile.resume?.fileName, 'queued.json');
    assert.equal(library.profiles[1].profile.resume?.fileName, 'large.pdf');
    assert.equal(library.activeProfileId, 'profile-2');
  } finally {
    StorageService.getWebDAVConfig = originalGetWebDAV;
  }
});

test('并发 SAVE 按 FIFO 顺序提交，后入队结果确定性生效且两次更新均持久化', async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const normalSave = StorageService.saveResumeProfileLibrary;
  StorageService.saveResumeProfileLibrary = async next => {
    if (saves === 0) await blocked;
    await normalSave(next);
  };
  const originalGetWebDAV = StorageService.getWebDAVConfig;
  StorageService.getWebDAVConfig = async () => undefined;
  const firstProfile = structuredClone(activeProfile());
  firstProfile.personal.name = '第一次保存';
  const secondProfile = structuredClone(activeProfile());
  secondProfile.personal.name = '第二次保存';

  try {
    await withBackgroundHandler(async handleMessage => {
      const first = handleMessage({ type: 'SAVE_USER_PROFILE', payload: firstProfile } as Message, {} as chrome.runtime.MessageSender);
      await new Promise(resolve => setTimeout(resolve, 0));
      const second = handleMessage({ type: 'SAVE_USER_PROFILE', payload: secondProfile } as Message, {} as chrome.runtime.MessageSender);
      release();
      const responses = await Promise.all([first, second]);
      assert.equal(responses.every(response => response.success), true);
    });
    assert.equal(activeProfile().personal.name, '第二次保存');
    assert.equal(loads, 2);
    assert.equal(saves, 2);
  } finally {
    StorageService.getWebDAVConfig = originalGetWebDAV;
  }
});

test('GET_USER_PROFILE 对有效资料库只读且不改写任何字节', async () => {
  const stored = structuredClone(library);
  const serializedBefore = JSON.stringify(stored);
  const writes: unknown[] = [];
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  const mockedGet = StorageService.getResumeProfileLibrary;
  const mockedSave = StorageService.saveResumeProfileLibrary;
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: async () => ({ [STORAGE_KEYS.RESUME_PROFILE_LIBRARY]: stored }),
        set: async (value: unknown) => { writes.push(value); },
      },
    },
  };
  StorageService.getResumeProfileLibrary = originalGet;
  StorageService.saveResumeProfileLibrary = originalSave;

  try {
    const result = await StorageService.getResumeProfileLibrary();
    assert.equal(JSON.stringify(stored), serializedBefore);
    assert.equal(JSON.stringify(result), serializedBefore);
    assert.deepEqual(writes, []);
  } finally {
    StorageService.getResumeProfileLibrary = mockedGet;
    StorageService.saveResumeProfileLibrary = mockedSave;
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
  }
});

test('活动 entry 缺失时 GET_USER_PROFILE 返回显式失败', async () => {
  library.activeProfileId = 'missing';
  await withBackgroundHandler(async handleMessage => {
    const response = await handleMessage({ type: 'GET_USER_PROFILE' } as Message, {} as chrome.runtime.MessageSender);
    assert.deepEqual(response, { success: false, error: '当前简历不存在' });
  });
});


test('创建会原子校验空名和重名且失败时不写入', async () => {
  for (const name of ['   ', '第一份']) {
    loads = 0;
    saves = 0;
    const response = await createResumeProfileHandler({ name }, deps);
    assert.equal(response.success, false);
    assert.match(response.error || '', name.trim() ? /已存在/ : /不能为空/);
    assert.equal(saves, 0);
    assert.equal(library.profiles.length, 2);
  }
});
