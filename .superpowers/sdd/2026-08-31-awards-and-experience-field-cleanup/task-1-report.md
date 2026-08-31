# Task 1 报告：数据模型与兼容规范化

## 状态

已完成。

## RED

命令：

```bash
npx tsx --test src/shared/resumeProfiles.test.ts src/options/profileState.test.ts
```

结果：31 项中 29 项通过、2 项失败。失败符合预期：空资料缺少 `awards`，仅名称奖项未补齐默认字符串字段。

## GREEN

命令：

```bash
npx tsx --test src/shared/resumeProfiles.test.ts src/options/profileState.test.ts
```

结果：31/31 通过，0 失败。

## 改动

- 新增 `AwardInfo`，并为 `UserProfile` 新增必需的 `awards: AwardInfo[]`。
- 删除 `ExperienceInfo.achievements`、`ProjectInfo.achievements`、`ProjectInfo.technologies`。
- 所有空资料包含 `awards: []`。
- 新增统一的资料规范化函数；experience、projects、awards 均按允许字段重建，旧字段与未知字段静默丢弃。
- 旧资料缺少 awards 时补空数组；相关字符串缺失时补空字符串。
- 资料库迁移、活动资料保存和旧存储规范化入口统一使用同一规范化逻辑。
- 增加旧字段清理、其他字段保留、完整/仅名称奖项补全与深拷贝测试。

## 自审

- `git diff --check` 通过。
- brief 指定测试全部通过。
- 检查了 canonical 快速路径，确保含旧字段或缺少 awards 的已存资料不会绕过规范化。
- `npm run build` 仍有后续 UI 消费方尚未适配新模型的类型错误（`background/index.ts`、`options/App.tsx`、`options/ExperienceSection.tsx`、`sidepanel/ProfileSections.tsx`）；这些文件不在 Task 1 brief 的允许修改范围内。

## SHA

实现提交：dd08450b605a4f61a64af744664d75c7f0bb9c3d。


---

# 修复轮次 1

## RED

命令：

```bash
npx tsx --test src/shared/backup-sync.test.ts src/shared/resumeProfiles.test.ts src/options/profileState.test.ts
```

结果：91 项中 82 项通过、9 项失败；新增 V2 旧字段兼容测试与 Storage 缺失字段补全测试按预期失败，同时暴露既有 V2 备份均被过严 canonical 判定拒绝。

## GREEN

命令：

```bash
npx tsx --test src/shared/backup-sync.test.ts src/shared/resumeProfiles.test.ts src/options/profileState.test.ts
```

结果：91/91 通过，0 失败。

## 修复内容

- V2 导入先保持严格资料库结构校验，再调用统一规范化；兼容三个废弃字段并在导入结果中清理，同时保留其他资料字段。
- V2 仍拒绝空列表、重复 ID、trim 后重名、非法 active ID 和字段类型非法的数据。
- canonical 快速路径现在要求 experience、projects、awards 的允许键和值全部完整，缺失字符串或奖项 id 时强制进入规范化并写回。
- 将不健全的 `isValidUserProfile(): value is UserProfile` 改为仅返回 boolean 的 `isValidUserProfileInput`，避免把兼容输入错误收窄成完整 `UserProfile`。
- 同步业务 hash 对合法资料库先规范化，避免旧/新等价数据因 awards 默认值差异产生伪冲突；无效输入仍由导入边界拒绝。

## 自审

- `git diff --check` 通过。
- 相关测试 91/91 通过。
- `npm run build` 仅保留已知 Task 1 范围外 UI 下游适配错误；本轮未处理这些文件。

## 修复提交 SHA

a49f9b71d1cc8b3b318aa31f37af46e8640953aa




---

# 修复轮次 2

## 验证

命令：

```bash
npx tsx --test src/shared/backup-sync.test.ts src/shared/resumeProfiles.test.ts src/options/profileState.test.ts
```

结果：93/93 通过，0 失败。

## 修复内容

- 将 V1 备份兼容校验改为 `validateUserProfileInput(value): boolean`，不再错误声明兼容输入已经是完整 `UserProfile`。
- `normalizeUserProfile` 与底层统一规范化入口接收 `unknown`，只有规范化重建并补齐必需字段后才返回 `UserProfile`。
- V1 调用点移除 `as UserProfile`，严格执行“先校验兼容输入，再规范化得到完整类型”。
- 增加 V1 experience/projects/awards 缺失字符串字段的补全回归测试，以及这些字段出现非法类型时的拒绝测试。

## 自审

- `git diff --check` 通过。
- 相关测试 93/93 通过。
- `npm run build` 仅剩已知 UI 下游适配错误，本轮未处理。

## 修复提交 SHA

03fc94d66187d9b8651abcd1efc107a739aaa1a5
