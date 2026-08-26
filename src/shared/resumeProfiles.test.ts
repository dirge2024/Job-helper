import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResumeProfileLibrary, UserProfile } from './types.ts';
import { StorageService } from './storage.ts';
import {
  createEmptyUserProfile, createResumeProfile, deleteResumeProfile, duplicateResumeProfile,
  normalizeResumeProfileLibrary, renameResumeProfile, switchResumeProfile, uniqueProfileName,
  updateActiveUserProfile,
} from './resumeProfiles.ts';

const NOW = '2026-08-25T00:00:00.000Z';
const LATER = '2026-08-26T00:00:00.000Z';
const originalChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
test.afterEach(() => {
  if (originalChrome) Object.defineProperty(globalThis, 'chrome', originalChrome);
  else delete (globalThis as { chrome?: unknown }).chrome;
});
function createProfile(name: string): UserProfile {
  return { personal: { name, gender: '', birthDate: '', phone: '', email: '' }, education: [], experience: [], projects: [], customInformation: [], skills: [], certifications: [] };
}
function makeTwoProfileLibrary() {
  const library = createResumeProfile(normalizeResumeProfileLibrary(undefined, createProfile('张三')), '第二份', NOW);
  return switchResumeProfile(library, library.profiles[0].id);
}

function installChromeStorageMock(initial: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = structuredClone(initial);
  let setCalls = 0;
  const local = {
    async get(keys: string | string[]) {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested.filter(key => key in values).map(key => [key, values[key]]));
    },
    async set(updates: Record<string, unknown>) {
      setCalls++;
      Object.assign(values, structuredClone(updates));
    },
  };
  Object.assign(globalThis, { chrome: { storage: { local } } });
  return { values, get setCalls() { return setCalls; } };
}

test('读取时把旧 userProfile 迁移并写回资料库', async () => {
  const mock = installChromeStorageMock({ userProfile: createProfile('张三') });
  const library = await StorageService.getResumeProfileLibrary();
  assert.equal(library.profiles[0].profile.personal.name, '张三');
  assert.deepEqual(mock.values.resumeProfileLibrary, library);
  assert.deepEqual(mock.values.userProfile, createProfile('张三'));
});

test('读取无数据存储时初始化并持久化默认资料库', async () => {
  const mock = installChromeStorageMock();
  const library = await StorageService.getResumeProfileLibrary();
  assert.equal(library.profiles.length, 1);
  assert.deepEqual(library.profiles[0].profile, createEmptyUserProfile());
  assert.deepEqual(mock.values.resumeProfileLibrary, library);
});

test('损坏的新资料库回退到有效旧资料且保留旧键', async () => {
  const legacy = createProfile('李四');
  const mock = installChromeStorageMock({ resumeProfileLibrary: { schemaVersion: 1, profiles: [] }, userProfile: legacy });
  const library = await StorageService.getResumeProfileLibrary();
  assert.equal(library.profiles[0].profile.personal.name, '李四');
  assert.deepEqual(mock.values.resumeProfileLibrary, library);
  assert.deepEqual(mock.values.userProfile, legacy);
});

test('保存资料库时写入独立的新存储键', async () => {
  const legacy = createProfile('旧资料');
  const mock = installChromeStorageMock({ userProfile: legacy });
  const library: ResumeProfileLibrary = normalizeResumeProfileLibrary(undefined, createProfile('新资料'));
  await StorageService.saveResumeProfileLibrary(library);
  assert.deepEqual(mock.values.resumeProfileLibrary, library);
  assert.deepEqual(mock.values.userProfile, legacy);
});

test('旧 saveUserProfile 写入活动资料库条目并保留其他条目和旧键', async () => {
  const legacy = createProfile('只读旧键');
  const library = makeTwoProfileLibrary();
  const inactiveBefore = structuredClone(library.profiles[1]);
  const mock = installChromeStorageMock({ resumeProfileLibrary: library, userProfile: legacy });

  assert.equal(await StorageService.saveUserProfile(createProfile('活动资料已保存')), true);

  const stored = mock.values.resumeProfileLibrary as ResumeProfileLibrary;
  assert.equal(stored.profiles[0].profile.personal.name, '活动资料已保存');
  assert.deepEqual(stored.profiles[1], inactiveBefore);
  assert.deepEqual(mock.values.userProfile, legacy);
});

test('旧 updateUserProfile 基于活动条目更新且不覆盖其他条目和旧键', async () => {
  const legacy = createProfile('只读旧键');
  const library = makeTwoProfileLibrary();
  const activeBefore = library.profiles[0].profile;
  const inactiveBefore = structuredClone(library.profiles[1]);
  const mock = installChromeStorageMock({ resumeProfileLibrary: library, userProfile: legacy });

  assert.equal(await StorageService.updateUserProfile({
    personal: { ...activeBefore.personal, name: '活动资料已更新' },
  }), true);

  const stored = mock.values.resumeProfileLibrary as ResumeProfileLibrary;
  assert.equal(stored.profiles[0].profile.personal.name, '活动资料已更新');
  assert.deepEqual(stored.profiles[1], inactiveBefore);
  assert.deepEqual(mock.values.userProfile, legacy);
});

test('旧资料迁移为默认简历且内容不丢失', () => {
  const legacy = createProfile('张三'); const library = normalizeResumeProfileLibrary(undefined, legacy);
  assert.equal(library.profiles[0].name, '默认简历'); assert.deepEqual(library.profiles[0].profile, legacy); assert.equal(library.activeProfileId, library.profiles[0].id);
});
test('无旧资料时创建包含空资料的默认简历', () => {
  const library = normalizeResumeProfileLibrary(undefined); assert.equal(library.profiles.length, 1); assert.equal(library.profiles[0].name, '默认简历'); assert.deepEqual(library.profiles[0].profile, createEmptyUserProfile());
});
test('修复无效的活动简历 ID', () => {
  const library = makeTwoProfileLibrary(); const repaired = normalizeResumeProfileLibrary({ ...library, activeProfileId: 'missing' }); assert.equal(repaired.activeProfileId, repaired.profiles[0].id);
});
test('创建简历时使用校验后的名称并切换到新简历', () => {
  const first = normalizeResumeProfileLibrary(undefined); const second = createResumeProfile(first, '实习简历', NOW); const third = createResumeProfile(second, '校招简历', LATER);
  assert.deepEqual(third.profiles.map(({ name }) => name), ['默认简历', '实习简历', '校招简历']); assert.equal(third.activeProfileId, third.profiles[2].id);
  assert.throws(() => createResumeProfile(third, '  ', LATER), /不能为空/);
  assert.throws(() => createResumeProfile(third, '实习简历', LATER), /已存在/);
});
test('唯一名称会去除空白并递增后缀', () => { assert.equal(uniqueProfileName(' 简历 ', ['简历', '简历 2']), '简历 3'); assert.equal(uniqueProfileName('  ', []), '未命名简历'); });
test('复制后修改副本不影响来源', () => {
  const library = normalizeResumeProfileLibrary(undefined, createProfile('张三')); const next = duplicateResumeProfile(library, library.activeProfileId, NOW);
  next.profiles[1].profile.personal.name = '李四'; assert.equal(next.profiles[0].profile.personal.name, '张三'); assert.equal(next.activeProfileId, next.profiles[1].id);
});
test('重命名会去除空白并更新时间', () => {
  const library = normalizeResumeProfileLibrary(undefined); const next = renameResumeProfile(library, library.activeProfileId, ' 求职简历 ', NOW);
  assert.equal(next.profiles[0].name, '求职简历'); assert.equal(next.profiles[0].updatedAt, NOW); assert.equal(library.profiles[0].name, '默认简历');
});
test('拒绝空名称和重复名称', () => {
  const library = makeTwoProfileLibrary(); assert.throws(() => renameResumeProfile(library, library.activeProfileId, '  ', NOW), /不能为空/); assert.throws(() => renameResumeProfile(library, library.activeProfileId, library.profiles[1].name, NOW), /已存在/);
});
test('切换简历且不修改原值', () => {
  const library = makeTwoProfileLibrary(); const next = switchResumeProfile(library, library.profiles[1].id); assert.equal(next.activeProfileId, library.profiles[1].id); assert.equal(library.activeProfileId, library.profiles[0].id);
});
test('删除活动简历后回退到第一套', () => {
  const library = makeTwoProfileLibrary(); const next = deleteResumeProfile(library, library.activeProfileId); assert.equal(next.profiles.length, 1); assert.equal(next.activeProfileId, next.profiles[0].id);
});
test('仅剩一套简历时禁止删除', () => {
  const library = normalizeResumeProfileLibrary(undefined, createProfile('张三')); assert.throws(() => deleteResumeProfile(library, library.activeProfileId), /至少保留一套/);
});
test('更新活动资料时深拷贝且更新时间', () => {
  const library = normalizeResumeProfileLibrary(undefined); const profile = createProfile('王五'); const next = updateActiveUserProfile(library, profile, NOW); profile.personal.name = '改变'; assert.equal(next.profiles[0].profile.personal.name, '王五'); assert.equal(next.profiles[0].updatedAt, NOW);
});
test('严格校验拒绝重复 ID 和名称', () => {
  const library = makeTwoProfileLibrary();
  assert.throws(() => normalizeResumeProfileLibrary({ ...library, profiles: library.profiles.map(profile => ({ ...profile, id: 'same' })) }), /ID.*重复|重复.*ID/);
  assert.throws(() => normalizeResumeProfileLibrary({ ...library, profiles: library.profiles.map(profile => ({ ...profile, name: 'same' })) }), /名称.*重复|重复.*名称/);
});

test('归一化后与输入资料库及共享资料引用完全隔离', () => {
  const sharedProfile = createProfile('共享');
  const source = makeTwoProfileLibrary();
  source.profiles[0].profile = sharedProfile;
  source.profiles[1].profile = sharedProfile;

  const normalized = normalizeResumeProfileLibrary(source);
  normalized.profiles[0].name = '已修改';
  normalized.profiles[0].profile.personal.name = '甲';
  normalized.profiles[1].profile.personal.name = '乙';

  assert.notStrictEqual(normalized.profiles[0], source.profiles[0]);
  assert.notStrictEqual(normalized.profiles[0].profile, source.profiles[0].profile);
  assert.notStrictEqual(normalized.profiles[0].profile, normalized.profiles[1].profile);
  assert.equal(source.profiles[0].name, '默认简历');
  assert.equal(source.profiles[0].profile.personal.name, '共享');
});

test('严格校验拒绝非字符串、空白及去空白后重复的名称', () => {
  const library = makeTwoProfileLibrary();
  assert.throws(() => normalizeResumeProfileLibrary({
    ...library,
    profiles: [{ ...library.profiles[0], name: 42 }, library.profiles[1]],
  }), /简历名称必须是非空字符串/);
  assert.throws(() => normalizeResumeProfileLibrary({
    ...library,
    profiles: [{ ...library.profiles[0], name: '   ' }, library.profiles[1]],
  }), /简历名称必须是非空字符串/);
  assert.throws(() => normalizeResumeProfileLibrary({
    ...library,
    profiles: [{ ...library.profiles[0], name: ' 求职简历 ' }, { ...library.profiles[1], name: '求职简历' }],
  }), /简历名称重复/);
});

test('严格校验每项基础字段并返回业务错误', () => {
  const library = normalizeResumeProfileLibrary(undefined);
  assert.throws(() => normalizeResumeProfileLibrary({
    ...library,
    profiles: [{ ...library.profiles[0], id: '' }],
  }), /简历 ID 必须是非空字符串/);
  assert.throws(() => normalizeResumeProfileLibrary({
    ...library,
    profiles: [{ ...library.profiles[0], createdAt: 123 }],
  }), /创建时间必须是有效字符串/);
  assert.throws(() => normalizeResumeProfileLibrary({
    ...library,
    profiles: [{ ...library.profiles[0], updatedAt: '' }],
  }), /更新时间必须是有效字符串/);
});

test('严格校验拒绝缺失或不完整的用户资料且不抛 TypeError', () => {
  const library = normalizeResumeProfileLibrary(undefined);
  for (const profile of [undefined, {}, { personal: {} }]) {
    assert.throws(() => normalizeResumeProfileLibrary({
      ...library,
      profiles: [{ ...library.profiles[0], profile }],
    }), /用户资料格式无效/);
  }
});


test('损坏资料库且无有效 legacy 时明确失败并且不写回', async () => {
  const originalLibrary = { schemaVersion: 1, profiles: [] };
  const mock = installChromeStorageMock({ resumeProfileLibrary: originalLibrary, userProfile: { broken: true } });
  await assert.rejects(() => StorageService.getResumeProfileLibrary(), /已损坏且无法从旧版资料恢复/);
  assert.equal(mock.setCalls, 0);
  assert.deepEqual(mock.values.resumeProfileLibrary, originalLibrary);
  assert.deepEqual(mock.values.userProfile, { broken: true });
});

test('默认新建和复制名称自动避重', () => {
  let library = normalizeResumeProfileLibrary(undefined, createProfile('一'));
  library = createResumeProfile(library, NOW);
  assert.equal(library.profiles.at(-1)?.name, '未命名简历');
  library = createResumeProfile(library, LATER);
  assert.equal(library.profiles.at(-1)?.name, '未命名简历 2');
  library = duplicateResumeProfile(library, library.profiles[0].id, LATER);
  assert.equal(library.profiles.at(-1)?.name, '默认简历 - 副本');
});

test('删除当前项按原位置优先下一项、末项回退上一项', () => {
  let library = normalizeResumeProfileLibrary(undefined, createProfile('一'));
  library = createResumeProfile(library, '二', NOW);
  library = createResumeProfile(library, '三', LATER);
  const [first, middle, last] = library.profiles;
  assert.equal(deleteResumeProfile({ ...library, activeProfileId: first.id }, first.id).activeProfileId, middle.id);
  assert.equal(deleteResumeProfile({ ...library, activeProfileId: middle.id }, middle.id).activeProfileId, last.id);
  assert.equal(deleteResumeProfile({ ...library, activeProfileId: last.id }, last.id).activeProfileId, middle.id);
});
