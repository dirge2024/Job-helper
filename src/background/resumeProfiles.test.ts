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

function profile(id: string, name: string) {
  return {
    id,
    name,
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
  queueAutoSync: async reason => { queued.push(reason); },
};

beforeEach(() => {
  library = { schemaVersion: 1, activeProfileId: 'profile-1', profiles: [profile('profile-1', '第一份'), profile('profile-2', '第二份')] };
  queued = [];
  failSave = false;
  StorageService.getResumeProfileLibrary = async () => structuredClone(library);
  StorageService.saveResumeProfileLibrary = async next => {
    if (failSave) throw new Error('磁盘已满');
    library = structuredClone(next);
  };
});

afterEach(() => {
  StorageService.getResumeProfileLibrary = originalGet;
  StorageService.saveResumeProfileLibrary = originalSave;
});

test('列表只返回摘要，不返回大型 profile 和附件', async () => {
  const response = await getResumeProfilesHandler();
  assert.equal(response.success, true);
  assert.equal('profile' in response.data!.profiles[0], false);
  assert.deepEqual(response.data!.profiles.map(item => item.name), ['第一份', '第二份']);
});

test('切换只更新当前 ID，并在持久化成功后排队同步', async () => {
  const before = structuredClone(library.profiles);
  const response = await switchResumeProfileHandler({ id: 'profile-2' }, deps);
  assert.equal(response.success, true);
  assert.equal(library.activeProfileId, 'profile-2');
  assert.deepEqual(library.profiles, before);
  assert.deepEqual(queued, ['resume-profile-switch']);
});

test('创建空白资料并设为活动资料', async () => {
  const response = await createResumeProfileHandler({}, deps);
  assert.equal(response.success, true);
  assert.equal(library.profiles.length, 3);
  assert.equal(library.activeProfileId, library.profiles[2].id);
  assert.equal(library.profiles[2].name, '未命名简历');
});

test('复制资料会深拷贝内容并生成唯一名称', async () => {
  const response = await duplicateResumeProfileHandler({ id: 'profile-1' }, deps);
  assert.equal(response.success, true);
  assert.equal(library.profiles[2].name, '第一份 副本');
  assert.deepEqual(library.profiles[2].profile, library.profiles[0].profile);
  assert.notEqual(library.profiles[2].profile, library.profiles[0].profile);
});

test('重命名资料', async () => {
  const response = await renameResumeProfileHandler({ id: 'profile-1', name: ' 新名称 ' }, deps);
  assert.equal(response.success, true);
  assert.equal(library.profiles[0].name, '新名称');
  assert.equal(library.profiles[0].updatedAt, '2026-02-01T00:00:00.000Z');
});

test('删除活动资料后切换到剩余资料', async () => {
  const response = await deleteResumeProfileHandler({ id: 'profile-1' }, deps);
  assert.equal(response.success, true);
  assert.equal(library.profiles.length, 1);
  assert.equal(library.activeProfileId, 'profile-2');
});

test('非法 ID 返回可读错误且不保存、不排队同步', async () => {
  let saves = 0;
  StorageService.saveResumeProfileLibrary = async () => { saves += 1; };
  const response = await switchResumeProfileHandler({ id: 'missing' }, deps);
  assert.deepEqual(response, { success: false, error: '简历不存在' });
  assert.equal(saves, 0);
  assert.deepEqual(queued, []);
});

test('重复名称返回可读错误且不排队同步', async () => {
  const response = await renameResumeProfileHandler({ id: 'profile-1', name: '第二份' }, deps);
  assert.deepEqual(response, { success: false, error: '简历名称已存在' });
  assert.deepEqual(queued, []);
});

test('存储失败返回可读错误，且成功保存后才 queueAutoSync', async () => {
  failSave = true;
  const response = await deleteResumeProfileHandler({ id: 'profile-2' }, deps);
  assert.deepEqual(response, { success: false, error: '磁盘已满' });
  assert.deepEqual(queued, []);
});
