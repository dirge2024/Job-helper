import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { StorageService } from '../shared/storage.ts';
import type { ResumeProfileLibrary } from '../shared/types.ts';
import {
  createResumeProfileHandler,
  deleteResumeProfileHandler,
  duplicateResumeProfileHandler,
  getResumeProfilesHandler,
  renameResumeProfileHandler,
  switchResumeProfileHandler,
  type ResumeProfileHandlerDependencies,
} from './resumeProfiles.ts';

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

test('创建只追加一个空白资料并设为活动资料', async () => {
  const response = await createResumeProfileHandler({}, deps);
  assert.equal(response.success, true);
  assert.equal(library.profiles.length, 3);
  assert.equal(library.activeProfileId, library.profiles[2].id);
  assert.equal(library.profiles[2].name, '未命名简历');
  assertSinglePersistence();
  assert.deepEqual(queued, ['resume-profile-create']);
});

test('复制只追加一个深拷贝并生成唯一名称', async () => {
  const response = await duplicateResumeProfileHandler({ id: 'profile-1' }, deps);
  assert.equal(response.success, true);
  assert.equal(library.profiles.length, 3);
  assert.equal(library.profiles[2].name, '第一份 副本');
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

  const first = createResumeProfileHandler({}, deps);
  await new Promise(resolve => setTimeout(resolve, 0));
  const second = createResumeProfileHandler({}, deps);
  releaseFirstSave();
  const responses = await Promise.all([first, second]);

  assert.equal(responses.every(item => item.success), true);
  assert.equal(library.profiles.length, 4);
  assert.deepEqual(library.profiles.slice(2).map(item => item.name), ['未命名简历', '未命名简历 2']);
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
