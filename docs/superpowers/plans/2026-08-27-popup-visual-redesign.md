# Popup Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将浏览器插件弹窗重构为蓝色、简约、工具型界面，同时完整保留现有功能、按钮名称、业务行为与现有 Logo。

**Architecture:** 保持 `src/popup/App.tsx` 中现有状态和事件处理器不变，只重组可见标记的分组与类名；`src/popup/ResumeProfileSelector.tsx` 继续负责简历选择；全部视觉系统集中在 `src/popup/index.css`。通过服务端静态渲染测试锁定功能按键和结构，通过现有业务测试保证交互行为不回退。

**Tech Stack:** React 19、TypeScript 6、原生 CSS、Node test runner、Vite 8

## Global Constraints

- 不新增、不删除、不改名任何现有功能按键。
- 保留 `icons/icon128.png`，不重新绘制、不换色、不修改图标内容。
- “快速填充”是唯一高强调深蓝主按钮。
- “设置个人信息”必须有白色背景和浅灰蓝外框。
- 不修改消息调用、状态管理、业务逻辑、禁用条件和窗口行为。
- 使用现有字体与依赖，不引入新的设计系统、图标库或动画库。
- 颜色锁定为冷灰中性色和单一蓝色强调色。
- 所有按钮保留 hover、focus-visible、active 和 disabled 状态，并遵循 `prefers-reduced-motion`。

---

### Task 1: 锁定弹窗功能与结构契约

**Files:**
- Modify: `src/popup/applicationRecordsEntry.test.tsx`
- Test: `src/popup/applicationRecordsEntry.test.tsx`

**Interfaces:**
- Consumes: `App` 默认导出及现有服务端静态渲染能力。
- Produces: 覆盖所有现有按钮名称、现有 Logo 路径和新布局类名的回归测试。

- [ ] **Step 1: 写入失败测试**

扩展首个静态渲染测试，使用明确的字符串列表检查以下内容各自存在：`新建投递记录`、`打开投递记录`、`打开信息窗口`、`快速填充`、`AI 扫描填充`、`AI 框选补填`、`设置个人信息`、`当前简历`。同时断言存在 `icons/icon128.png`，不存在 `复制全部信息` 和 `清空表单`，并检查新结构类名 `popup-record-actions`、`popup-metrics-strip`、`popup-primary-action`、`popup-ai-actions`、`popup-support-actions`。

```tsx
test('popup 视觉重构保留全部现有入口且不引入额外功能', async () => {
  const popupModule = await import('./App.tsx');
  const html = renderToStaticMarkup(React.createElement(popupModule.default));
  for (const label of [
    '新建投递记录',
    '打开投递记录',
    '打开信息窗口',
    '快速填充',
    'AI 扫描填充',
    'AI 框选补填',
    '设置个人信息',
  ]) assert.match(html, new RegExp(label));
  assert.match(html, /icons\/icon128\.png/);
  assert.doesNotMatch(html, /复制全部信息|清空表单/);
  assert.match(html, /popup-record-actions/);
  assert.match(html, /popup-metrics-strip/);
  assert.match(html, /popup-primary-action/);
  assert.match(html, /popup-ai-actions/);
  assert.match(html, /popup-support-actions/);
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `npx tsx --test src/popup/applicationRecordsEntry.test.tsx`
Expected: FAIL，原因是新布局类名尚不存在，而不是导入或运行错误。

- [ ] **Step 3: 提交测试契约**

```bash
git add src/popup/applicationRecordsEntry.test.tsx
git commit -m "test: lock popup redesign feature contract"
```

### Task 2: 重组弹窗视觉层级

**Files:**
- Modify: `src/popup/App.tsx:338-467`
- Modify: `src/popup/ResumeProfileSelector.tsx:119-123`
- Test: `src/popup/applicationRecordsEntry.test.tsx`
- Test: `src/popup/ResumeProfileSelector.test.tsx`

**Interfaces:**
- Consumes: 现有 `handleOpenApplicationRecordCreate`、`handleOpenApplicationRecords`、`handleOpenSidePanel`、`handleFillForm`、`handleAIScanFill`、`handleStartAIRegionFill`、`openOptions` 处理器及其现有禁用状态。
- Produces: 品牌区、投递入口、简历选择、统一统计栏、主操作、AI 操作和辅助操作的语义分组。

- [ ] **Step 1: 保留品牌行并移动投递记录按钮**

在 `popup-header` 内保留现有图片和品牌文案，将两个投递记录按钮包装为 `popup-record-actions`，放在品牌行下方。图片继续使用：

```tsx
<img
  className="popup-brand-mark"
  src={getRuntimeUrl('icons/icon128.png')}
  alt=""
  aria-hidden="true"
/>
```

事件处理器、按钮文案和 disabled 表达式保持原样。

- [ ] **Step 2: 将统计卡片改为统一横栏**

将 `stats-grid` 改名为 `popup-metrics-strip`，每个统计项改为 `popup-metric`，内部值和标签仍读取 `detectedFields`、`profile.education.length`、`profile.experience.length`。

```tsx
<div className="popup-metrics-strip">
  <div className="popup-metric">
    <div className="popup-metric-value">{detectedFields}</div>
    <div className="popup-metric-label">可填字段</div>
  </div>
  {/* 教育经历和工作经历保持同样结构 */}
</div>
```

- [ ] **Step 3: 按视觉优先级重组操作区**

保留 `popup-actions` 外层。快速填充单独使用 `button button-primary popup-primary-action`。AI 扫描填充和 AI 框选补填放入 `popup-ai-actions`。打开信息窗口与设置个人信息放入 `popup-support-actions`，两者都使用有边框的按钮样式，其中设置个人信息使用 `button button-quiet popup-settings-action`。

不得修改任何 `onClick`、`disabled` 或加载中文字表达式。

- [ ] **Step 4: 保持简历选择器接口不变**

`ResumeProfileSelector` 的 props、标签、select、禁用条件和 `onChange` 保持原样。只允许增加用于新布局的类名，不能修改切换逻辑。

- [ ] **Step 5: 运行定向测试**

Run: `npx tsx --test src/popup/applicationRecordsEntry.test.tsx src/popup/ResumeProfileSelector.test.tsx`
Expected: 全部 PASS，0 failures。

- [ ] **Step 6: 提交结构改动**

```bash
git add src/popup/App.tsx src/popup/ResumeProfileSelector.tsx src/popup/applicationRecordsEntry.test.tsx
git commit -m "refactor: reorganize popup action hierarchy"
```

### Task 3: 实现蓝色简约工具型视觉系统

**Files:**
- Modify: `src/popup/index.css`
- Test: `src/popup/applicationRecordsEntry.test.tsx`
- Test: `src/popup/ResumeProfileSelector.test.tsx`

**Interfaces:**
- Consumes: Task 2 输出的结构类名。
- Produces: 冷灰背景、白色表面、单一深蓝强调色、统一圆角与完整交互状态。

- [ ] **Step 1: 统一语义色彩变量**

在现有 `:root` 中将弹窗颜色收敛为以下语义角色，并删除未使用的紫色或多色强调：

```css
:root {
  --color-bg: #f7f9fc;
  --color-panel: #ffffff;
  --color-text: #172033;
  --color-muted: #6b7688;
  --color-border: #dfe5ee;
  --color-primary: #2458d7;
  --color-primary-hover: #194bc2;
  --color-primary-soft: #edf3ff;
  --color-primary-border: #cfddff;
  --radius-control: 10px;
  --radius-panel: 12px;
  --shadow-panel: 0 8px 24px rgb(33 53 86 / 8%);
}
```

- [ ] **Step 2: 实现品牌区与投递入口**

品牌行使用白色背景和紧凑留白。`popup-brand-mark` 只调整到 38px 左右并保持原图。`popup-record-actions` 使用两列网格；“新建投递记录”使用浅蓝背景，“打开投递记录”使用白色背景和边框，二者保持同等尺寸。

- [ ] **Step 3: 实现简历选择器与统计横栏**

简历选择器为 43px 高的白色有边框控件，标签和下拉框同一行。`popup-metrics-strip` 使用三列网格和单个外边框，仅在列之间使用分隔线，不为每项添加独立卡片阴影。

- [ ] **Step 4: 实现操作按钮层级**

`popup-primary-action` 为 47px 高整行深蓝按钮。`popup-ai-actions` 为两列网格，其中 AI 扫描使用浅蓝，AI 框选使用白色边框。`popup-support-actions` 为纵向两项；打开信息窗口与设置个人信息都使用白色背景和浅灰蓝外框。

- [ ] **Step 5: 完善交互与状态**

所有按钮增加可见 `:focus-visible`；hover 只调整背景、边框或 `transform: translateY(-1px)`；active 使用 `transform: scale(.985)`；disabled 保持文字可读并禁止 transform。所有过渡仅作用于 transform、background-color、border-color、color 和 box-shadow。

```css
.button:focus-visible,
.header-action-button:focus-visible,
.resume-profile-selector select:focus-visible {
  outline: 3px solid rgb(36 88 215 / 24%);
  outline-offset: 2px;
}

.button:active:not(:disabled),
.header-action-button:active:not(:disabled) {
  transform: scale(.985);
}
```

- [ ] **Step 6: 保留完整状态样式**

重新校准 `popup-loading`、`popup-empty-state`、错误提示、`popup-hint` 和 disabled 样式，使其使用同一套色彩变量。不得删除对应 DOM 或状态分支。

- [ ] **Step 7: 添加减少动态效果规则**

```css
@media (prefers-reduced-motion: reduce) {
  .button,
  .header-action-button,
  .resume-profile-selector select {
    transition: none;
  }
}
```

- [ ] **Step 8: 运行测试和构建**

Run: `npm run test:application-records:ui && npm run test:resume-profiles`
Expected: 全部 PASS，0 failures。

Run: `npx oxlint src/popup/App.tsx src/popup/ResumeProfileSelector.tsx src/popup/applicationRecordsEntry.test.tsx src/popup/ResumeProfileSelector.test.tsx`
Expected: 0 errors；允许项目既有的 React Fast Refresh warning。

Run: `npm run build`
Expected: TypeScript 与 Vite 构建成功，退出码 0。

Run: `git diff --check`
Expected: 无输出，退出码 0。

- [ ] **Step 9: 视觉冒烟检查**

在扩展弹窗中检查以下状态：

1. 已加载资料的默认状态。
2. 未配置资料的空状态。
3. 切换简历或填充时的 disabled 状态。
4. 简历加载和切换错误提示。
5. 当前页面无可填字段提示。
6. 键盘 Tab 焦点顺序和 focus-visible。
7. 所有按钮文字单行显示。
8. 左上角 Logo 与改造前为同一个图片资源。

- [ ] **Step 10: 提交视觉实现**

```bash
git add src/popup/index.css
git commit -m "style: redesign popup as a focused blue tool"
```

### Task 4: 最终回归与设计预检

**Files:**
- Verify: `src/popup/App.tsx`
- Verify: `src/popup/ResumeProfileSelector.tsx`
- Verify: `src/popup/index.css`
- Verify: `src/popup/applicationRecordsEntry.test.tsx`
- Verify: `src/popup/ResumeProfileSelector.test.tsx`

**Interfaces:**
- Consumes: Tasks 1-3 的全部结果。
- Produces: 可交付的弹窗视觉重构。

- [ ] **Step 1: 运行完整测试**

Run: `npm test`
Expected: 完整测试套件通过，0 failures。

- [ ] **Step 2: 运行最终构建和差异检查**

Run: `npm run build && git diff --check`
Expected: 两项均退出码 0。

- [ ] **Step 3: 执行设计预检**

逐项确认：只有一个蓝色强调色；Logo 资源未变化；所有现有按键都存在；不存在新增功能；按钮文本不换行；颜色对比清晰；圆角系统一致；没有紫色渐变、霓虹外发光、手绘 SVG 或新增依赖；hover、focus、active、disabled 和 reduced-motion 状态完整。

- [ ] **Step 4: 提交遗漏修正**

只有在最终检查产生修正时执行：

```bash
git add src/popup/App.tsx src/popup/ResumeProfileSelector.tsx src/popup/index.css src/popup/applicationRecordsEntry.test.tsx src/popup/ResumeProfileSelector.test.tsx
git commit -m "fix: complete popup redesign verification"
```
