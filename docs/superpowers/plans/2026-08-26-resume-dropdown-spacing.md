# Resume Dropdown Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 收紧信息设置页的简历菜单布局，并将插件弹窗简化为同一行的当前简历标签与下拉框。

**Architecture:** 仅调整现有 React 标记和 CSS，不改变消息协议、状态管理或简历操作逻辑。通过现有简历测试集、局部 lint 和构建验证回归。

**Tech Stack:** React、TypeScript、CSS、Node test runner、Vite

## Global Constraints

- 不改变简历切换、创建、复制、重命名、删除及未保存保护逻辑。
- 设置页菜单在窄屏下保持不溢出。
- 插件弹窗中的标签和选择框字号一致并处于同一行。

---

### Task 1: 收紧信息设置页简历菜单

**Files:**
- Modify: src/options/index.css

**Interfaces:**
- Consumes: ResumeProfileManager 现有菜单类名。
- Produces: 紧凑宽度、较短的名称/操作间距以及新的上下间距。

- [ ] Step 1: 确认当前 680px 菜单宽度与 14px 下边距基线。
- [ ] Step 2: 将菜单改为约 440px 且最大宽度为 100%，弹层宽度跟随触发器。
- [ ] Step 3: 操作区使用固定宽度并与名称相隔约 12px；长名称使用省略号。
- [ ] Step 4: 标题到菜单增加约 10px 间距，菜单到灰色区域缩减到约 7px。
- [ ] Step 5: 运行 npx oxlint src/options/ResumeProfileManager.tsx，预期 0 errors。
- [ ] Step 6: 提交 src/options/index.css，提交信息为 style: tighten resume dropdown layout。

### Task 2: 简化插件弹窗简历选择器

**Files:**
- Modify: src/popup/ResumeProfileSelector.tsx
- Modify: src/popup/index.css
- Test: src/popup/ResumeProfileSelector.test.tsx

**Interfaces:**
- Consumes: profiles、activeProfileId、disabled、onSwitch 属性。
- Produces: 左侧标签与右侧 select 的单行布局，切换事件签名保持不变。

- [ ] Step 1: 更新测试，断言活动简历名称仅由 option 输出，不再存在独立 strong 文本；运行 npm run test:resume-profiles 并确认旧结构下失败。
- [ ] Step 2: 删除 resume-profile-selector-copy 包装和独立活动简历名称，仅保留当前简历标签及原 select。
- [ ] Step 3: 将容器设为 flex、垂直居中、间距 12px；标签和 select 使用 14px 字号，select 占剩余宽度。
- [ ] Step 4: 删除不再使用的 resume-profile-selector-copy CSS。
- [ ] Step 5: 运行 npm run test:resume-profiles，预期 0 failures。
- [ ] Step 6: 运行 npx oxlint src/options/ResumeProfileManager.tsx src/popup/ResumeProfileSelector.tsx src/popup/ResumeProfileSelector.test.tsx，预期 0 errors。
- [ ] Step 7: 运行 npm run build，预期退出码 0；运行 git diff --check，预期无输出。
- [ ] Step 8: 提交三个弹窗文件，提交信息为 style: simplify popup resume selector。
