import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from './types.ts';
import {
  createEmptyUserProfile, createResumeProfile, deleteResumeProfile, duplicateResumeProfile,
  normalizeResumeProfileLibrary, renameResumeProfile, switchResumeProfile, uniqueProfileName,
  updateActiveUserProfile,
} from './resumeProfiles.ts';

const NOW = '2026-08-25T00:00:00.000Z';
const LATER = '2026-08-26T00:00:00.000Z';
function createProfile(name: string): UserProfile {
  return { personal: { name, gender: '', birthDate: '', phone: '', email: '' }, education: [], experience: [], projects: [], customInformation: [], skills: [], certifications: [] };
}
function makeTwoProfileLibrary() {
  const library = createResumeProfile(normalizeResumeProfileLibrary(undefined, createProfile('张三')), NOW);
  return switchResumeProfile(library, library.profiles[0].id);
}

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
test('创建简历时生成唯一名称并切换到新简历', () => {
  const first = normalizeResumeProfileLibrary(undefined); const second = createResumeProfile(first, NOW); const third = createResumeProfile(second, LATER);
  assert.deepEqual(third.profiles.map(({ name }) => name), ['默认简历', '未命名简历', '未命名简历 2']); assert.equal(third.activeProfileId, third.profiles[2].id);
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
