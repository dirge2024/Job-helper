import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from '../shared/types';
import { applyLoadedProfile, isProfileDirty, reloadAfterActiveProfileChange } from './profileState';

const oldProfile = { personal: { name: '旧资料' }, education: [], experience: [], projects: [], customInformation: [], skills: [], certifications: [] } as UserProfile;
const newProfile = { ...oldProfile, personal: { name: '新资料' } } as UserProfile;

test('活动 ID 成功变化后重载当前资料、递增 revision 并清除 dirty', async () => {
  let form = { ...oldProfile, personal: { name: '未保存修改' } } as UserProfile;
  let snapshot = JSON.stringify(oldProfile);
  let revision = 0;
  assert.equal(isProfileDirty(form, snapshot), true);
  await reloadAfterActiveProfileChange(async () => {
    applyLoadedProfile(newProfile, value => { form = value; }, value => { snapshot = value; });
  }, () => { revision++; });
  assert.equal(form.personal.name, '新资料');
  assert.equal(isProfileDirty(form, snapshot), false);
  assert.equal(revision, 1);
});

test('重载失败时不递增 revision', async () => {
  let revision = 0;
  await assert.rejects(() => reloadAfterActiveProfileChange(async () => { throw new Error('load failed'); }, () => { revision++; }));
  assert.equal(revision, 0);
});
