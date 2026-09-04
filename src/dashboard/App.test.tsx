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

test('面经复盘保持左侧编辑和右侧列表，AI 总结位于保存按钮旁', () => {
  for (const label of ['面试复盘', '+ 添加面经', '搜索面经...', '待复盘', '保存复盘', '✦ AI 总结']) {
    assert.ok(appSource.includes(label), `缺少面经功能：${label}`);
  }
  assert.match(appSource, /interviewReviews/);
  assert.match(css, /\.reviews-layout\s*\{[^}]*grid-template-columns:/);
  assert.match(css, /\.review-editor-actions\s*\{[^}]*justify-content:\s*flex-end;/);
});
