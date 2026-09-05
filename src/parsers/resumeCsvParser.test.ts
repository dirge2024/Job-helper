import assert from 'node:assert/strict';
import test from 'node:test';
import { parseResumeCSV, serializeResumeCSV } from './resumeCsvParser.ts';

test('简历 CSV 往返解析并支持 BOM', () => {
  const csv = serializeResumeCSV({
    personal: { name: '测试用户', email: 'test@example.com' },
    education: [{ id: 'e1', school: '示例大学', major: '计算机', degree: '本科', startDate: '', endDate: '' }],
    experience: [], projects: [], awards: [], skills: ['TypeScript'], rawText: '',
  });
  const parsed = parseResumeCSV(`\uFEFF${csv}`);
  assert.equal(parsed.personal?.name, '测试用户');
  assert.equal(parsed.education?.[0]?.school, '示例大学');
  assert.deepEqual(parsed.skills, ['TypeScript']);
});

test('简历 CSV 保留逗号和换行内容', () => {
  const parsed = parseResumeCSV([
    'section,index,field,value',
    'personal,0,name,用户',
    'experience,0,company,示例公司',
    'experience,0,description,"负责接口开发,\n完成上线"',
  ].join('\n'));
  assert.equal(parsed.experience?.[0]?.description, '负责接口开发,\n完成上线');
});
