# Multi-Resume Profile Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保存多套完整且互相独立的求职资料，并允许用户在插件弹窗中选择当前用于投递的简历。

**Architecture:** 使用单个 `resumeProfileLibrary` 存储全部完整 `UserProfile` 及当前 ID。后台继续通过既有 `GET_USER_PROFILE` 返回当前资料，使表单填充与 AI 链路保持兼容；备份升级为 V2，同时迁移旧存储与 V1 备份。

**Tech Stack:** TypeScript 6、React 19、Vite 8、Chrome Extension Manifest V3、Node test runner、tsx、chrome.storage.local

## Global Constraints

- 每套简历都是完整且相互独立的 `UserProfile`，不共享基本信息。
- 弹窗只提供简历切换，不提供“管理简历”入口。
- 设置页提供新建空白、复制当前、重命名和删除。
- 名称去除首尾空白后不能为空，同一资料库内不能重名。
- 复制必须深复制，修改副本不能影响来源。
- 至少保留一套简历。
- 旧 `userProfile` 自动迁移为“默认简历”。
- V2 备份和 WebDAV 包含全部简历及当前选择；V1 仍可导入。
- 投递记录不关联简历，数据结构和界面不变。

---

## File Map

- `src/shared/resumeProfiles.ts`：资料库规范化、迁移及 CRUD 纯函数。
- `src/shared/resumeProfiles.test.ts`：资料库行为测试。
- `src/shared/types.ts`：资料库、摘要及消息类型。
- `src/shared/storage.ts`：资料库存取和旧键迁移。
- `src/background/resumeProfiles.ts`：资料库消息处理器。
- `src/background/resumeProfiles.test.ts`：处理器与当前资料隔离测试。
- `src/background/index.ts`：消息路由及现有资料接口兼容。
- `src/options/ResumeProfileManager.tsx`：设置页管理栏。
- `src/options/ResumeProfileManager.test.tsx`：管理栏测试。
- `src/options/App.tsx`：当前资料加载、保存和脏状态保护。
- `src/popup/ResumeProfileSelector.tsx`：弹窗切换器。
- `src/popup/ResumeProfileSelector.test.tsx`：切换器测试。
- `src/popup/App.tsx`：加载摘要、切换并刷新当前资料。
- `src/shared/backup.ts`、`src/shared/backup-sync.test.ts`：V2 备份及 V1 迁移。
- `src/shared/sync.ts`：WebDAV 使用新业务数据。
- `src/options/DataSyncSettings.tsx`：备份摘要文案。
- `src/sidepanel/App.tsx`：资料库变化后刷新。
- `package.json`：接入新增测试。

### Task 1: 资料库类型与纯函数

**Files:**
- Create: `src/shared/resumeProfiles.ts`
- Create: `src/shared/resumeProfiles.test.ts`
- Modify: `src/shared/types.ts`

**Interfaces:**
- Consumes: `UserProfile` from `src/shared/types.ts`
- Produces:
  - `ResumeProfile { id; name; createdAt; updatedAt; profile }`
  - `ResumeProfileLibrary { schemaVersion: 1; activeProfileId; profiles }`
  - `createEmptyUserProfile(): UserProfile`
  - `normalizeResumeProfileLibrary(value, legacyProfile?): ResumeProfileLibrary`
  - `createResumeProfile(library, now): ResumeProfileLibrary`
  - `duplicateResumeProfile(library, id, now): ResumeProfileLibrary`
  - `renameResumeProfile(library, id, name, now): ResumeProfileLibrary`
  - `deleteResumeProfile(library, id): ResumeProfileLibrary`
  - `switchResumeProfile(library, id): ResumeProfileLibrary`
  - `updateActiveUserProfile(library, profile, now): ResumeProfileLibrary`

- [ ] **Step 1: Write failing tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deleteResumeProfile,
  duplicateResumeProfile,
  normalizeResumeProfileLibrary,
  renameResumeProfile,
} from './resumeProfiles.ts';

test('旧资料迁移为默认简历且内容不丢失', () => {
  const legacy = createProfile('张三');
  const library = normalizeResumeProfileLibrary(undefined, legacy);
  assert.equal(library.profiles[0].name, '默认简历');
  assert.deepEqual(library.profiles[0].profile, legacy);
  assert.equal(library.activeProfileId, library.profiles[0].id);
});

test('复制后修改副本不影响来源', () => {
  const library = normalizeResumeProfileLibrary(undefined, createProfile('张三'));
  const next = duplicateResumeProfile(library, library.activeProfileId, '2026-08-25T00:00:00.000Z');
  next.profiles[1].profile.personal.name = '李四';
  assert.equal(next.profiles[0].profile.personal.name, '张三');
});

test('拒绝空名称和重复名称', () => {
  const library = makeTwoProfileLibrary();
  assert.throws(() => renameResumeProfile(library, library.activeProfileId, '  ', NOW), /不能为空/);
  assert.throws(() => renameResumeProfile(library, library.activeProfileId, library.profiles[1].name, NOW), /已存在/);
});

test('仅剩一套简历时禁止删除', () => {
  const library = normalizeResumeProfileLibrary(undefined, createProfile('张三'));
  assert.throws(() => deleteResumeProfile(library, library.activeProfileId), /至少保留一套/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test src/shared/resumeProfiles.test.ts`

Expected: FAIL with `Cannot find module './resumeProfiles.ts'`.

- [ ] **Step 3: Implement minimal pure model**

```ts
export interface ResumeProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  profile: UserProfile;
}

export interface ResumeProfileLibrary {
  schemaVersion: 1;
  activeProfileId: string;
  profiles: ResumeProfile[];
}

export function uniqueProfileName(base: string, names: string[]): string {
  const value = base.trim() || '未命名简历';
  if (!names.includes(value)) return value;
  let index = 2;
  while (names.includes(`${value} ${index}`)) index += 1;
  return `${value} ${index}`;
}
```

Implement immutable transforms. Use `structuredClone` for profile duplication, generate IDs with `crypto.randomUUID()`, repair invalid active IDs to the first entry, and reject duplicate IDs/names in strict validation.

- [ ] **Step 4: Verify GREEN**

Run: `node --experimental-strip-types --test src/shared/resumeProfiles.test.ts`

Expected: PASS for migration, empty default, active-ID repair, unique naming, deep copy, rename, switch and delete fallback.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/resumeProfiles.ts src/shared/resumeProfiles.test.ts
git commit -m "feat: add multi-resume profile model"
```

### Task 2: Storage migration and persistence

**Files:**
- Modify: `src/shared/storage.ts`
- Test: `src/shared/resumeProfiles.test.ts`

**Interfaces:**
- Consumes: `normalizeResumeProfileLibrary()` from Task 1
- Produces:
  - `STORAGE_KEYS.RESUME_PROFILE_LIBRARY = 'resumeProfileLibrary'`
  - `StorageService.getResumeProfileLibrary(): Promise<ResumeProfileLibrary>`
  - `StorageService.saveResumeProfileLibrary(library): Promise<void>`

- [ ] **Step 1: Write failing storage test**

```ts
test('读取时把旧 userProfile 迁移并写回资料库', async () => {
  const mock = installChromeStorageMock({ userProfile: createProfile('张三') });
  const library = await StorageService.getResumeProfileLibrary();
  assert.equal(library.profiles[0].profile.personal.name, '张三');
  assert.deepEqual(mock.values.resumeProfileLibrary, library);
});
```

Also test no-data initialization and a corrupt new library falling back to a valid legacy profile without deleting the legacy key.

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test src/shared/resumeProfiles.test.ts`

Expected: FAIL because `getResumeProfileLibrary` does not exist.

- [ ] **Step 3: Implement storage migration**

```ts
static async getResumeProfileLibrary(): Promise<ResumeProfileLibrary> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.RESUME_PROFILE_LIBRARY,
    STORAGE_KEYS.USER_PROFILE,
  ]);
  const library = normalizeResumeProfileLibrary(
    result[STORAGE_KEYS.RESUME_PROFILE_LIBRARY],
    result[STORAGE_KEYS.USER_PROFILE] as UserProfile | undefined,
  );
  await chrome.storage.local.set({ [STORAGE_KEYS.RESUME_PROFILE_LIBRARY]: library });
  return library;
}
```

Keep `userProfile` as a read-only migration fallback. Do not update it after migration.

- [ ] **Step 4: Verify GREEN**

Run: `node --experimental-strip-types --test src/shared/resumeProfiles.test.ts`

Expected: PASS for migration, persistence and recovery.

- [ ] **Step 5: Commit**

```bash
git add src/shared/storage.ts src/shared/resumeProfiles.test.ts
git commit -m "feat: migrate legacy profile storage"
```

### Task 3: Background CRUD messages

**Files:**
- Create: `src/background/resumeProfiles.ts`
- Create: `src/background/resumeProfiles.test.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/background/index.ts`

**Interfaces:**
- Consumes: storage methods and pure transforms from Tasks 1–2
- Produces:
  - `ResumeProfileSummary { activeProfileId; profiles: Array<{ id; name; createdAt; updatedAt }> }`
  - messages `GET_RESUME_PROFILES`, `SWITCH_RESUME_PROFILE`, `CREATE_RESUME_PROFILE`, `DUPLICATE_RESUME_PROFILE`, `RENAME_RESUME_PROFILE`, `DELETE_RESUME_PROFILE`

- [ ] **Step 1: Write failing handler tests**

```ts
test('切换只更新当前 ID', async () => {
  const before = installTwoProfiles();
  await switchResumeProfileHandler({ id: 'profile-2' });
  const after = await StorageService.getResumeProfileLibrary();
  assert.equal(after.activeProfileId, 'profile-2');
  assert.deepEqual(after.profiles, before.profiles);
});

test('列表消息不返回大型 profile 和附件', async () => {
  const response = await getResumeProfilesHandler();
  assert.equal('profile' in response.profiles[0], false);
});
```

Cover create, duplicate, rename, delete, invalid ID, duplicate name and storage failure. Assert `queueAutoSync()` runs only after successful persistence.

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test src/background/resumeProfiles.test.ts`

Expected: FAIL because the handler module is missing.

- [ ] **Step 3: Implement handlers and routes**

```ts
export async function mutateResumeProfiles(
  transform: (library: ResumeProfileLibrary) => ResumeProfileLibrary,
): Promise<ResumeProfileSummary> {
  const current = await StorageService.getResumeProfileLibrary();
  const next = transform(current);
  await StorageService.saveResumeProfileLibrary(next);
  await queueAutoSync();
  return toResumeProfileSummary(next);
}
```

Route all six new message types in `handleMessage`. Return user-readable validation errors through the existing `MessageResponse` shape.

- [ ] **Step 4: Verify GREEN**

Run: `node --experimental-strip-types --test src/background/resumeProfiles.test.ts`

Expected: PASS with all CRUD, error and sync-queue assertions.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/background/resumeProfiles.ts src/background/resumeProfiles.test.ts src/background/index.ts
git commit -m "feat: add resume profile management messages"
```

### Task 4: Keep existing profile consumers compatible

**Files:**
- Modify: `src/background/index.ts`
- Test: `src/background/resumeProfiles.test.ts`

**Interfaces:**
- Consumes: `ResumeProfileLibrary`
- Produces: existing `GET_USER_PROFILE`, `SAVE_USER_PROFILE` and `PARSE_RESUME` operate only on the active entry

- [ ] **Step 1: Write failing compatibility tests**

```ts
test('SAVE_USER_PROFILE 只更新当前简历', async () => {
  await handleSaveUserProfile(updatedProfile);
  const library = await StorageService.getResumeProfileLibrary();
  assert.deepEqual(activeEntry(library).profile, updatedProfile);
  assert.deepEqual(library.profiles.find(item => item.id === 'other')!.profile, otherProfile);
});

test('PARSE_RESUME 只合并当前简历和附件', async () => {
  await handleParseResume(FILE_DATA, 'pdf', 'backend.pdf', PARSED_TEXT);
  const library = await StorageService.getResumeProfileLibrary();
  assert.equal(activeEntry(library).profile.resume?.fileName, 'backend.pdf');
  assert.equal(library.profiles.find(item => item.id === 'other')!.profile.resume, undefined);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test src/background/resumeProfiles.test.ts`

Expected: FAIL because old handlers still read/write `userProfile` directly.

- [ ] **Step 3: Adapt existing handlers**

```ts
async function handleSaveUserProfile(profile: UserProfile) {
  const library = await StorageService.getResumeProfileLibrary();
  const next = updateActiveUserProfile(library, profile, new Date().toISOString());
  await StorageService.saveResumeProfileLibrary(next);
  const sync = await queueAutoSync();
  return { success: true, data: { localSaved: true, sync } };
}
```

Make `GET_USER_PROFILE` return `activeEntry(library).profile`. Merge parse results into only that entry and preserve all other profiles byte-for-byte.

- [ ] **Step 4: Verify GREEN**

Run: `node --experimental-strip-types --test src/background/resumeProfiles.test.ts src/utils/resume-parse.test.ts`

Expected: PASS for get/save/parse isolation and existing parser behavior.

- [ ] **Step 5: Commit**

```bash
git add src/background/index.ts src/background/resumeProfiles.test.ts
git commit -m "refactor: route profile data through active resume"
```

### Task 5: Settings-page profile management

**Files:**
- Create: `src/options/ResumeProfileManager.tsx`
- Create: `src/options/ResumeProfileManager.test.tsx`
- Modify: `src/options/App.tsx`
- Modify: `src/options/index.css`

**Interfaces:**
- Consumes: summary and CRUD messages from Task 3
- Produces: `ResumeProfileManager` and a three-way unsaved-change guard

- [ ] **Step 1: Write failing UI tests**

```tsx
test('显示当前名称和全部管理操作', () => {
  const html = renderToStaticMarkup(<ResumeProfileManager {...props} />);
  for (const text of ['新建空白', '复制当前', '重命名', '删除']) {
    assert.match(html, new RegExp(text));
  }
});

test('仅剩一套时删除按钮禁用', () => {
  const html = renderToStaticMarkup(<ResumeProfileManager {...singleProfileProps} />);
  assert.match(html, /删除/);
  assert.match(html, /disabled/);
});
```

Add interaction tests for empty/duplicate names and `保存并切换`、`放弃修改并切换`、`取消`.

- [ ] **Step 2: Verify RED**

Run: `tsx --test src/options/ResumeProfileManager.test.tsx`

Expected: FAIL because the component is missing.

- [ ] **Step 3: Implement manager and dirty guard**

```ts
async function requestProfileChange(action: () => Promise<void>) {
  if (!dirty) return action();
  const choice = await openUnsavedChangesDialog();
  if (choice === 'cancel') return;
  if (choice === 'save') await handleSave();
  await action();
}
```

Place the manager above existing tabs. Route switch, create, duplicate and delete through the guard. Rename only changes metadata and must not discard form data. On successful current-ID change, reload the profile and clear dirty state.

- [ ] **Step 4: Verify GREEN**

Run: `tsx --test src/options/ResumeProfileManager.test.tsx`

Expected: PASS for rendering, name validation, delete guard and all unsaved-change branches.

- [ ] **Step 5: Commit**

```bash
git add src/options/ResumeProfileManager.tsx src/options/ResumeProfileManager.test.tsx src/options/App.tsx src/options/index.css
git commit -m "feat: manage resume profiles in options"
```

### Task 6: Popup quick switcher

**Files:**
- Create: `src/popup/ResumeProfileSelector.tsx`
- Create: `src/popup/ResumeProfileSelector.test.tsx`
- Modify: `src/popup/App.tsx`
- Modify: `src/popup/index.css`

**Interfaces:**
- Consumes: `GET_RESUME_PROFILES`, `SWITCH_RESUME_PROFILE`
- Produces: a selector with no management entry

- [ ] **Step 1: Write failing UI test**

```tsx
test('弹窗显示当前简历但不显示管理入口', () => {
  const html = renderToStaticMarkup(
    <ResumeProfileSelector profiles={profiles} activeProfileId="p1" disabled={false} onSwitch={() => {}} />,
  );
  assert.match(html, /当前简历/);
  assert.match(html, /后端开发/);
  assert.doesNotMatch(html, /管理简历/);
});
```

Test disabled state while filling and failure rollback in the App-level helper.

- [ ] **Step 2: Verify RED**

Run: `tsx --test src/popup/ResumeProfileSelector.test.tsx`

Expected: FAIL because the selector is missing.

- [ ] **Step 3: Implement selector and refresh flow**

```tsx
<ResumeProfileSelector
  profiles={resumeProfiles.profiles}
  activeProfileId={resumeProfiles.activeProfileId}
  disabled={switching || filling || aiScanning || startingAIRegion}
  onSwitch={handleProfileSwitch}
/>
```

On success reload both summary and current `UserProfile`; on failure restore the previous selected ID and show the returned error. Do not add a management link or button.

- [ ] **Step 4: Verify GREEN**

Run: `tsx --test src/popup/ResumeProfileSelector.test.tsx src/popup/applicationRecordsEntry.test.tsx`

Expected: PASS for rendering, disabled state, refresh, rollback and existing popup entry behavior.

- [ ] **Step 5: Commit**

```bash
git add src/popup/ResumeProfileSelector.tsx src/popup/ResumeProfileSelector.test.tsx src/popup/App.tsx src/popup/index.css
git commit -m "feat: switch active resume from popup"
```

### Task 7: Backup V2 and WebDAV compatibility

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/backup.ts`
- Modify: `src/shared/storage.ts`
- Modify: `src/shared/sync.ts`
- Modify: `src/shared/backup-sync.test.ts`
- Modify: `src/options/DataSyncSettings.tsx`

**Interfaces:**
- Consumes: `ResumeProfileLibrary`
- Produces: `BackupDocumentV2`, V1-to-V2 migration and V2 WebDAV business data

- [ ] **Step 1: Write failing backup tests**

```ts
test('V1 导入迁移为单套默认简历', () => {
  const result = parseAndValidateBackup(v1SingleProfileJson());
  assert.ok(result.success);
  if (!result.success) return;
  assert.equal(result.document.schemaVersion, 2);
  assert.equal(result.document.data.resumeProfileLibrary.profiles[0].name, '默认简历');
});

test('V2 往返保留全部简历及当前 ID', () => {
  const parsed = parseAndValidateBackup(serializeBackup(createBackupDocument(multiProfileData)));
  assert.ok(parsed.success);
  if (parsed.success) assert.deepEqual(parsed.document.data.resumeProfileLibrary, multiProfileData.resumeProfileLibrary);
});
```

Also reject empty profiles, duplicate IDs/names and invalid active IDs; test hash changes when either active ID or any profile changes; test WebDAV V1 download migration.

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test src/shared/backup-sync.test.ts`

Expected: FAIL because only schema V1 and `userProfile` are supported.

- [ ] **Step 3: Implement V2**

```ts
export interface BackupDocumentV2 {
  schemaVersion: 2;
  exportedAt: string;
  source: { extensionVersion: string };
  data: {
    resumeProfileLibrary: ResumeProfileLibrary;
    llmConfig: LLMConfig | null;
    settings: SettingsData | null;
    applicationRecords?: ApplicationRecord[] | null;
  };
  webdavConfig?: WebDAVConfig | null;
}
```

Set `BACKUP_SCHEMA_VERSION = 2`. Migrate valid V1 `userProfile` to one default profile. Update `getBusinessData` and `replaceBusinessData` to use the library. Preserve the rule that WebDAV uploads exclude credentials while local exports may include them.

- [ ] **Step 4: Verify GREEN**

Run: `node --experimental-strip-types --test src/shared/backup-sync.test.ts`

Expected: PASS for V1/V2 parsing, validation, round-trip, hashing, remote download and credential behavior.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/backup.ts src/shared/storage.ts src/shared/sync.ts src/shared/backup-sync.test.ts src/options/DataSyncSettings.tsx
git commit -m "feat: back up and sync multiple resumes"
```

### Task 8: Cross-page refresh and full verification

**Files:**
- Modify: `src/sidepanel/App.tsx`
- Modify: `src/options/App.tsx`
- Modify: `package.json`
- Test: `src/sidepanel/ProfileSections.test.tsx`
- Test: all new and existing tests

**Interfaces:**
- Consumes: storage key `resumeProfileLibrary` and current-profile compatibility API
- Produces: cross-page refresh and complete test scripts

- [ ] **Step 1: Write failing refresh test**

```ts
test('资料库变化会触发信息窗口重新加载', () => {
  assert.equal(
    shouldReloadProfile({ resumeProfileLibrary: { oldValue, newValue } }, 'local'),
    true,
  );
});
```

Add an options-page test proving external changes do not silently overwrite dirty local form state.

- [ ] **Step 2: Verify RED**

Run: `npm run test:sidepanel`

Expected: FAIL because the sidepanel only loads once and does not recognize the new key.

- [ ] **Step 3: Add listeners and test scripts**

```ts
export function shouldReloadProfile(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
): boolean {
  return areaName === 'local' && 'resumeProfileLibrary' in changes;
}
```

Use the guard in sidepanel and options. If options is dirty, show reload/keep-local notice instead of replacing state. Add all new tests to `test`, `test:sidepanel`, and a focused `test:resume-profiles` script.

- [ ] **Step 4: Run focused verification**

Run: `npm run test:resume-profiles && npm run test:sidepanel`

Expected: PASS with all new profile tests and existing sidepanel tests.

- [ ] **Step 5: Run complete verification**

Run: `npm test && npm run lint && npm run build`

Expected: all tests pass, oxlint reports zero errors, and the build exits 0.

- [ ] **Step 6: Manual extension smoke test**

Build and load `dist/` as an unpacked extension, then verify:

1. An existing user upgrades to one “默认简历” without losing data.
2. New, duplicate, rename, delete and unsaved-switch protection all work.
3. Popup switching changes its summary and has no management entry.
4. Ordinary fill, AI scan, AI region fill, information sidepanel and resume attachment all use the newly selected profile.
5. V1/V2 backup import/export and WebDAV behavior match the design.

- [ ] **Step 7: Commit**

```bash
git add src/sidepanel/App.tsx src/options/App.tsx package.json
git commit -m "test: verify multi-resume switching"
```

## Self-Review

- **Spec coverage:** Tasks 1–4 cover the library, migration, compatibility façade and attachment isolation; Tasks 5–6 cover settings CRUD, duplicate, unsaved guard and popup switching; Task 7 covers V1/V2 backup and WebDAV; Task 8 covers cross-page refresh and full regression.
- **Placeholder scan:** No TBD, TODO, “implement later”, generic error-handling step, or unspecified test step remains.
- **Type consistency:** `ResumeProfileLibrary`, `ResumeProfileSummary`, message names and `resumeProfileLibrary` storage key are consistent across tasks.
- **Scope:** The plan does not alter application-record data, add a popup management entry, share fields across profiles, or add per-profile WebDAV merging.
