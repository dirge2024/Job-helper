import assert from 'node:assert/strict';
import test from 'node:test';
import { groupPageScanFields, type PageScanField } from './pageScan.ts';
import { FieldMatcher } from '../utils/fieldMatcher.ts';
import { FieldType } from '../shared/types.ts';

test('groups page scan fields by section while preserving field order and metadata', () => {
  const fields: PageScanField[] = [
    {
      index: 0,
      rowIndex: 0,
      section: 'personal',
      name: 'phone',
      label: '手机号码',
      type: 'input',
      options: [],
      context: '基本信息 手机号码',
    },
    {
      index: 1,
      rowIndex: 0,
      section: 'education',
      name: 'school',
      label: '学校名称',
      type: 'input',
      options: [],
      context: '教育经历 学校名称',
    },
    {
      index: 2,
      rowIndex: 0,
      section: 'personal',
      name: 'email',
      label: '邮箱',
      type: 'input',
      options: [],
      context: '基本信息 邮箱',
    },
  ];

  const grouped = groupPageScanFields(fields);

  assert.deepEqual(grouped.map(group => group.section), ['personal', 'education']);
  assert.deepEqual(grouped[0].fields.map(field => field.index), [0, 2]);
  assert.equal(grouped[0].fields[1].label, '邮箱');
  assert.deepEqual(grouped[1].fields.map(field => field.index), [1]);
});


test('matches award field semantics without reviving removed legacy fields', () => {
  const match = (labelText: string) => FieldMatcher.matchFieldType('', '', '', labelText, 'text', '');

  assert.equal(match('奖项名称').fieldType, FieldType.AWARD_NAME);
  assert.equal(match('获奖角色').fieldType, FieldType.AWARD_ROLE);
  assert.equal(match('获奖时间').fieldType, FieldType.AWARD_DATE);
  assert.equal(match('奖项描述').fieldType, FieldType.AWARD_DESCRIPTION);
  assert.equal(match('项目技术栈').fieldType, FieldType.UNKNOWN);
  assert.equal(match('实习成果').fieldType, FieldType.UNKNOWN);
  assert.equal(match('项目描述').fieldType, FieldType.DESCRIPTION);
});
