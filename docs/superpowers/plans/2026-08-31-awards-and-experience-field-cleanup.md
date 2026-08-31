# Awards and Experience Field Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每套简历新增奖项 / 荣誉，并从数据、界面、解析和填充链路彻底删除实习成果、项目成果和项目技术栈。

**Architecture:** 在共享类型中新增 `AwardInfo` 与 `UserProfile.awards`，由资料规范化入口统一补默认值并丢弃旧字段。设置页、信息窗口、解析器和填充器只消费规范化后的新结构；备份与 WebDAV 继续传输完整资料库，旧备份在导入时兼容清理。

**Tech Stack:** React 19、TypeScript 6、Chrome Extension MV3、Node test runner、Vite 8

## Global Constraints

- 奖项字段为名称、担任角色、获取时间、详细描述。
- 只有名称必填，其他字段允许为空。
- 奖项属于单套完整简历，不在简历之间共享。
- 彻底删除实习 `achievements`、项目 `achievements`、项目 `technologies`。
- 旧资料和旧备份必须可导入，废弃字段静默丢弃，其他内容不能丢失。
- 不新增依赖，不改变现有备份凭据策略和 WebDAV 冲突策略。

---

### Task 1: 数据模型与兼容规范化

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/storage.ts`
- Modify: `src/shared/resumeProfiles.ts`
- Test: `src/shared/resumeProfiles.test.ts`
- Test: `src/options/profileState.test.ts`

**Interfaces:**
- Produces: `AwardInfo` 与 `UserProfile.awards: AwardInfo[]`；所有新建和规范化资料均包含 awards。
- Removes: `ExperienceInfo.achievements`、`ProjectInfo.achievements`、`ProjectInfo.technologies`。

- [ ] **Step 1: 写失败测试**

新增测试：空资料的 `awards` 为 `[]`；旧资料中的三个废弃字段经规范化后不存在；其他实习和项目字段保持不变；含完整奖项和仅名称奖项均可深拷贝保存。

```ts
const legacy = {
  ...createEmptyUserProfile(),
  experience: [{ id: 'e1', company: 'A', position: '实习生', achievements: '旧成果' }],
  projects: [{ id: 'p1', name: '项目', role: '', achievements: '旧成果', technologies: 'TS' }],
};
const normalized = normalizeResumeProfileLibrary({ schemaVersion: 1, activeProfileId: 'r1', profiles: [{ id: 'r1', name: '默认简历', createdAt: NOW, updatedAt: NOW, profile: legacy }] });
assert.deepEqual(normalized.profiles[0].profile.awards, []);
assert.equal('achievements' in normalized.profiles[0].profile.experience[0], false);
assert.equal('achievements' in normalized.profiles[0].profile.projects[0], false);
assert.equal('technologies' in normalized.profiles[0].profile.projects[0], false);
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `npx tsx --test src/shared/resumeProfiles.test.ts src/options/profileState.test.ts`
Expected: FAIL，因为 `awards` 和废弃字段清理尚未实现。

- [ ] **Step 3: 修改类型和默认值**

新增：

```ts
export interface AwardInfo {
  id: string;
  name: string;
  role: string;
  date: string;
  description: string;
}
```

将 `awards: AwardInfo[]` 加入 `UserProfile`，删除三个废弃类型字段，并在 `createEmptyUserProfile()` 中加入 `awards: []`。

- [ ] **Step 4: 增加资料清理函数**

在 `resumeProfiles.ts` 的规范化路径中按允许字段重建 experience、projects、awards，不使用对象展开保留未知旧字段。奖项缺失时补空数组，字符串字段缺失时补空字符串。

- [ ] **Step 5: 运行测试确认 GREEN**

Run: `npx tsx --test src/shared/resumeProfiles.test.ts src/options/profileState.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/shared/types.ts src/shared/storage.ts src/shared/resumeProfiles.ts src/shared/resumeProfiles.test.ts src/options/profileState.test.ts
git commit -m "feat: add awards profile data"
```

### Task 2: 设置页奖项编辑与旧字段删除

**Files:**
- Create: `src/options/AwardsSection.tsx`
- Modify: `src/options/ExperienceSection.tsx`
- Modify: `src/options/App.tsx`
- Modify: `src/options/index.css`
- Test: `src/options/App.test.tsx`
- Create: `src/options/AwardsSection.test.tsx`

**Interfaces:**
- Consumes: `AwardInfo[]`。
- Produces: `AwardsSection({ awards, onChange })`；名称必填，其他字段可空。

- [ ] **Step 1: 写失败测试**

测试新增奖项会生成 id 和空可选字段；名称为空显示就近错误并阻止提交；只有名称时允许保存；删除和上下移动返回正确数组。测试 `ExperienceSection` 静态输出不含“成果”和“技术栈”。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npx tsx --test src/options/AwardsSection.test.tsx src/options/App.test.tsx`
Expected: FAIL，因为组件尚不存在且旧字段仍渲染。

- [ ] **Step 3: 实现 AwardsSection**

沿用现有经历卡片样式，渲染名称、担任角色、获取时间、详细描述，以及新增、删除、上移、下移。输入更新必须不可变地替换对应数组项。

- [ ] **Step 4: 接入 App**

在“实习与项目”内容最后渲染 `AwardsSection`，更新 `profile.awards`。保存前校验 `award.name.trim()`；失败时不调用保存消息。

- [ ] **Step 5: 删除旧输入项**

从 `ExperienceSection.tsx` 删除实习成果、项目成果和项目技术栈输入控件及更新逻辑，不删除描述字段。

- [ ] **Step 6: 运行测试确认 GREEN**

Run: `npx tsx --test src/options/AwardsSection.test.tsx src/options/App.test.tsx`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/options/AwardsSection.tsx src/options/AwardsSection.test.tsx src/options/ExperienceSection.tsx src/options/App.tsx src/options/App.test.tsx src/options/index.css
git commit -m "feat: add awards editor"
```

### Task 3: 信息窗口奖项展示与字段清理

**Files:**
- Modify: `src/sidepanel/ProfileSections.tsx`
- Modify: `src/sidepanel/ProfileSections.test.ts`
- Modify: `src/sidepanel/App.tsx`

**Interfaces:**
- Consumes: `UserProfile.awards`。
- Produces: 非空时显示“奖项 / 荣誉”，各非空字段可按现有机制复制。

- [ ] **Step 1: 写失败测试**

新增测试：有奖项时显示名称、担任角色、获取时间、详细描述；可选字段为空时不生成空行；awards 为空时不显示分区；实习和项目不再含成果或技术栈。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npx tsx --test src/sidepanel/ProfileSections.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现新分区并删除旧字段映射**

新增 award 字段配置：`name -> 名称`、`role -> 担任角色`、`date -> 获取时间`、`description -> 详细描述`。删除 experience/project 配置中的废弃项。

- [ ] **Step 4: 运行测试确认 GREEN 并提交**

Run: `npx tsx --test src/sidepanel/ProfileSections.test.ts`
Expected: PASS。

```bash
git add src/sidepanel/ProfileSections.tsx src/sidepanel/ProfileSections.test.ts src/sidepanel/App.tsx
git commit -m "feat: show awards in information window"
```

### Task 4: 简历解析与 AI Schema

**Files:**
- Modify: `src/utils/nlpHelper.ts`
- Modify: `src/parsers/jsonParser.ts`
- Modify: `src/services/llm/prompts.ts`
- Modify: `src/services/llm/visualRegionFill.ts`
- Modify: `src/background/visualRegionFill.ts`
- Test: `src/utils/resume-parse.test.ts`
- Test: `src/services/llm/visualRegionFill.test.ts`
- Test: `src/background/visualRegionFill.test.ts`

**Interfaces:**
- Produces: 解析结果中的 `awards`；不再生成三个废弃字段。

- [ ] **Step 1: 写失败测试**

使用包含“奖项 / 荣誉”“优秀毕业生”“负责人”“2026-06”“详细描述”的简历文本，断言输出一个 AwardInfo。断言 JSON/AI 旧结果中的废弃字段被忽略。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npm run test:resume-parse && npx tsx --test src/services/llm/visualRegionFill.test.ts src/background/visualRegionFill.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现标题识别与输出 Schema**

将“奖项、荣誉、获奖经历、荣誉奖励”映射到 awards；生成稳定 id。更新 AI prompt/schema，增加 awards 四字段并删除废弃字段。

- [ ] **Step 4: 运行测试确认 GREEN 并提交**

Run: `npm run test:resume-parse && npx tsx --test src/services/llm/visualRegionFill.test.ts src/background/visualRegionFill.test.ts`
Expected: PASS。

```bash
git add src/utils/nlpHelper.ts src/parsers/jsonParser.ts src/services/llm/prompts.ts src/services/llm/visualRegionFill.ts src/background/visualRegionFill.ts src/utils/resume-parse.test.ts src/services/llm/visualRegionFill.test.ts src/background/visualRegionFill.test.ts
git commit -m "feat: parse awards from resumes"
```

### Task 5: 表单匹配与填充

**Files:**
- Modify: `src/content/formFiller.ts`
- Modify: `src/content/index.ts`
- Modify: `src/utils/nlpHelper.ts`
- Test: `src/content/pageScan.test.ts`
- Test: `src/content/visualRegionFill.test.ts`

**Interfaces:**
- Consumes: 当前简历 awards。
- Produces: 奖项名称、角色、时间、描述的匹配值；移除旧专用字段匹配。

- [ ] **Step 1: 写失败测试**

用“奖项名称、获奖角色、获奖时间、奖项描述”字段断言匹配第一条奖项；用旧“项目技术栈、实习成果”标签断言不走已删除专用路径。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npx tsx --test src/content/pageScan.test.ts src/content/visualRegionFill.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现映射并删除旧分支**

增加 awards 的标签同义词与索引选择，删除 achievements/technologies 专用字段访问。通用实习描述和项目描述逻辑保持不变。

- [ ] **Step 4: 运行测试确认 GREEN 并提交**

Run: `npx tsx --test src/content/pageScan.test.ts src/content/visualRegionFill.test.ts`
Expected: PASS。

```bash
git add src/content/formFiller.ts src/content/index.ts src/utils/nlpHelper.ts src/content/pageScan.test.ts src/content/visualRegionFill.test.ts
git commit -m "feat: fill award fields"
```

### Task 6: 备份兼容、全局清理与最终验证

**Files:**
- Modify: `src/shared/backup.ts`
- Modify: `src/shared/backup-sync.test.ts`
- Modify: any remaining production/test fixtures returned by the search below

**Interfaces:**
- Produces: 旧备份兼容导入，当前备份包含 awards 且不含废弃字段。

- [ ] **Step 1: 写失败备份测试**

导入带废弃字段且无 awards 的旧备份，断言成功、awards 为空、废弃字段不存在；导出含奖项资料，断言四字段完整。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npx tsx --test src/shared/backup-sync.test.ts`
Expected: FAIL。

- [ ] **Step 3: 让导入统一经过资料规范化**

确保手动导入与 WebDAV replace 都调用同一清理逻辑，不在多个入口复制迁移代码。

- [ ] **Step 4: 清理所有生产引用**

Run: `rg -n "achievements|technologies" src --glob '!**/*.test.*'`
Expected: 无针对 ExperienceInfo/ProjectInfo 废弃字段的生产引用；若命中与其他业务同名字段，逐项确认并保留。

- [ ] **Step 5: 更新受影响测试 fixtures**

所有 UserProfile fixture 增加 `awards: []` 或使用 `createEmptyUserProfile()`，删除三个废弃字段。

- [ ] **Step 6: 运行完整验证**

Run: `npm test`
Expected: 0 failures。

Run: `npx oxlint src/shared/types.ts src/shared/resumeProfiles.ts src/options/AwardsSection.tsx src/options/ExperienceSection.tsx src/options/App.tsx src/sidepanel/ProfileSections.tsx src/utils/nlpHelper.ts src/parsers/jsonParser.ts src/services/llm/prompts.ts src/content/formFiller.ts src/shared/backup.ts`
Expected: 0 errors；允许既有 Fast Refresh warning。

Run: `npm run build && git diff --check`
Expected: 退出码 0。

- [ ] **Step 7: 提交**

```bash
git add src
git commit -m "fix: complete awards migration and cleanup"
```
