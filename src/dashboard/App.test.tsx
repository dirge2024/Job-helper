import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

test('投递工作台保留完整表格字段和原有数据操作入口', () => {
  for (const label of ['公司与岗位', '城市', '投递日期', '进度', '最近安排 / 下一步行动', '编辑', '删除', '导入', '导出备份', '+ 新增投递']) {
    assert.ok(appSource.includes(label), `缺少界面文字：${label}`);
  }
  for (const messageType of ['GET_APPLICATION_RECORDS', 'CREATE_APPLICATION_RECORD', 'UPDATE_APPLICATION_RECORD', 'DELETE_APPLICATION_RECORD', 'IMPORT_APPLICATION_RECORDS_CSV', 'EXPORT_APPLICATION_RECORDS_CSV']) {
    assert.match(appSource, new RegExp(messageType));
  }
});

test('有投递链接时公司名称作为新标签页链接打开', () => {
  assert.match(appSource, /className="application-company-link"/);
  assert.match(appSource, /target="_blank"/);
  assert.match(css, /\.application-company-link\s*\{/);
});

test('添加面经弹窗支持按公司或岗位关键词搜索投递', () => {
  assert.match(appSource, /搜索投递/);
  assert.match(appSource, /输入公司或岗位关键词/);
  assert.match(appSource, /record\.companyName, record\.jobTitle/);
  assert.match(appSource, /\.includes\(normalizedKeyword\)/);
});

test('九种进度都有统一的彩色选择器，中止使用红色', () => {
  for (const status of ['已投递', '测评', '笔试', '一面', '二面', '三面', 'HR面', 'Offer', '中止']) {
    assert.ok(appSource.includes(status), `缺少进度：${status}`);
  }
  assert.match(css, /\.progress-stopped\s*\{[^}]*color:\s*#b43f3d;/);
  assert.match(css, /\.progress-select::after/);
});

test('面试阶段只在进度更新后安排，日程默认线上且月历按实际天数生成', () => {
  for (const label of ['一面', '二面', '三面', 'HR面', '暂不安排', '保存并加入日程', '线上面试（默认）', 'datetime-local', 'type="month"']) {
    assert.ok(appSource.includes(label), `缺少日程交互：${label}`);
  }
  assert.match(appSource, /Math\.ceil\(\(startOffset \+ daysInMonth\) \/ 7\) \* 7/);
  assert.match(appSource, /取消当前日程/);
});

test('取消日程直接执行，不再调用浏览器确认弹窗', () => {
  assert.doesNotMatch(appSource, /确定取消\$\{item\.record\.companyName/);
});

test('面经复盘保持左侧编辑和右侧列表，AI 总结位于保存按钮旁', () => {
  for (const label of ['面试复盘', '+ 添加面经', '搜索面经...', '待复盘', '保存复盘', '✦ AI 总结']) {
    assert.ok(appSource.includes(label), `缺少面经功能：${label}`);
  }
  assert.match(appSource, /interviewReviews/);
  assert.match(css, /\.reviews-layout\s*\{[^}]*grid-template-columns:/);
  assert.match(css, /\.review-editor-actions\s*\{[^}]*justify-content:\s*flex-end;/);
});

test('每条面经记录都提供删除按钮并通过更新投递记录保存', () => {
  assert.match(appSource, /review-list-delete/);
  assert.match(appSource, /删除面经失败/);
  assert.match(appSource, /interviewReviews: \(item\.record\.interviewReviews \?\? \[\]\)\.filter/);
});

test('资料、洞察和备份页面均保留原有能力的可达入口', () => {
  for (const label of ['管理简历资料', '配置 AI（可选）', '投递进度分布', '总投递', '面试阶段', '打开备份与同步']) {
    assert.ok(appSource.includes(label), `缺少工作台页面入口：${label}`);
  }
  for (const messageType of ['GET_ACTIVE_RESUME_CONTEXT', 'GET_APPLICATION_RECORDS', 'GET_SYNC_STATUS', 'GET_WEBDAV_CONFIG']) {
    assert.match(appSource, new RegExp(messageType));
  }
  assert.match(css, /\.dashboard-overview-grid\s*\{[^}]*grid-template-columns:/);
  assert.match(css, /\.insight-status-grid\s*\{[^}]*grid-template-columns:/);
});
