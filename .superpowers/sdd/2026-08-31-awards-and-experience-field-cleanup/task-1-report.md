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

提交后填写。
