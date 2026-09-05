import assert from 'node:assert/strict';
import test from 'node:test';
import { parseResumeJSON } from './jsonParser.ts';

test('原有中文字段简历 JSON 会解析为可写入的结构化资料', () => {
  const result = parseResumeJSON(JSON.stringify({
    '基本信息': { 姓名: '张三', 性别: '男', 政治面貌: '群众' },
    '优先信息': { 手机: '13800000000', 邮箱: 'zhangsan@example.com' },
    '教育经历': [{ 学校: '东南大学', 专业: '计算机科学与技术', 学历: '本科' }],
    '实习经历': [{ 单位: '示例公司', 岗位: '后端开发', 岗位职责: '开发服务' }],
    '项目经历': [{ 项目名称: '求职助手', 角色: '开发者', 主要工作: '完成开发' }],
    '竞赛与技能': { 技能一: 'Java', 技能二: 'TypeScript' },
  }));
  assert.equal(result.personal?.name, '张三');
  assert.equal(result.personal?.phone, '13800000000');
  assert.equal(result.education?.[0]?.school, '东南大学');
  assert.equal(result.experience?.[0]?.position, '后端开发');
  assert.deepEqual(result.skills, ['Java', 'TypeScript']);
});
