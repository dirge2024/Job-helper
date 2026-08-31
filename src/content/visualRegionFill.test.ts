import assert from 'node:assert/strict';
import test from 'node:test';
import type { VisualRegionFillMapping } from '../shared/types.ts';
import {
  applyVisualRegionMappings,
  serializeVisualControls,
} from './visualRegionFill.ts';
import { FormFiller } from './formFiller.ts';
import { FieldType } from '../shared/types.ts';
import { createEmptyUserProfile } from '../shared/resumeProfiles.ts';

test('只序列化选区内的空白可写控件，并保留 controlId 与 options', () => {
  const controls = serializeVisualControls([
    {
      controlId: 'ctrl-phone',
      value: '',
      rect: { left: 10, top: 10, width: 120, height: 36 },
      label: '手机号',
      name: 'phone',
      tagName: 'input',
      options: [],
    },
    {
      controlId: 'ctrl-degree',
      value: '',
      rect: { left: 10, top: 80, width: 120, height: 36 },
      label: '学历',
      name: 'degree',
      tagName: 'select',
      options: ['本科', '硕士'],
    },
    {
      controlId: 'ctrl-filled',
      value: '已有值',
      rect: { left: 10, top: 160, width: 120, height: 36 },
      label: '邮箱',
      name: 'email',
      tagName: 'input',
      options: [],
    },
  ], { left: 0, top: 0, right: 200, bottom: 140 });

  assert.deepEqual(controls.map(item => item.controlId), ['ctrl-phone', 'ctrl-degree']);
  assert.deepEqual(controls[1]?.options, ['本科', '硕士']);
});

test('只把存在于 controlsById 的映射交给写回层', async () => {
  const mappings: VisualRegionFillMapping[] = [
    {
      controlId: 'ctrl-phone',
      fieldMeaning: '手机号',
      matchedProfilePath: 'personal.phone',
      value: '13800000000',
    },
    {
      controlId: 'missing',
      fieldMeaning: '邮箱',
      matchedProfilePath: 'personal.email',
      value: 'test@example.com',
    },
  ];

  const fillCalls: Array<{
    values: Array<{ element: { id: string }; value: string }>;
    keepGoing: boolean;
  }> = [];
  const controlsById = new Map([
    ['ctrl-phone', { controlId: 'ctrl-phone', element: { id: 'phone-input' } }],
  ]);

  const written = await applyVisualRegionMappings(
    mappings,
    controlsById,
    () => true,
    async (values, shouldContinue) => {
      fillCalls.push({
        values: values as Array<{ element: { id: string }; value: string }>,
        keepGoing: shouldContinue(),
      });
      return values.length;
    },
  );

  assert.equal(written, 1);
  assert.equal(fillCalls.length, 1);
  assert.deepEqual(fillCalls[0], {
    values: [{ element: { id: 'phone-input' }, value: '13800000000' }],
    keepGoing: true,
  });
});

test('resolves each award field by its repeated-field index', () => {
  const profile = createEmptyUserProfile();
  profile.awards = [
    { id: 'award-1', name: '一等奖', role: '负责人', date: '2025-06', description: '第一项描述' },
    { id: 'award-2', name: '二等奖', role: '核心成员', date: '2026-07', description: '第二项描述' },
  ];
  const filler = new FormFiller();

  assert.equal(filler.resolveFieldValue(FieldType.AWARD_NAME, profile, 0), '一等奖');
  assert.equal(filler.resolveFieldValue(FieldType.AWARD_ROLE, profile, 1), '核心成员');
  assert.equal(filler.resolveFieldValue(FieldType.AWARD_DATE, profile, 1), '2026-07');
  assert.equal(filler.resolveFieldValue(FieldType.AWARD_DESCRIPTION, profile, 0), '第一项描述');
});

test('keeps generic experience description independent from award descriptions', () => {
  const profile = createEmptyUserProfile();
  profile.experience = [{ id: 'experience-1', company: '示例公司', position: '实习生', startDate: '', endDate: '', description: '通用实习描述' }];
  profile.awards = [{ id: 'award-1', name: '一等奖', role: '', date: '', description: '奖项描述' }];
  const filler = new FormFiller();

  assert.equal(filler.resolveFieldValue(FieldType.DESCRIPTION, profile, 0), '通用实习描述');
  assert.equal(filler.resolveFieldValue(FieldType.AWARD_DESCRIPTION, profile, 0), '奖项描述');
});

type AwardTreeNode = {
  parentElement: AwardTreeNode | null;
  children: AwardTreeNode[];
  id?: string;
  attrs: Record<string, string>;
  getAttribute(name: string): string | null;
  querySelector(selector: string): AwardTreeNode | null;
  contains(node: AwardTreeNode): boolean;
};

function createAwardTreeNode(attrs: Record<string, string> = {}, id?: string): AwardTreeNode {
  return {
    parentElement: null, children: [], attrs, id,
    getAttribute(name) { return this.attrs[name] ?? null; },
    querySelector() { return null; },
    contains(target) {
      let current: AwardTreeNode | null = target;
      while (current) {
        if (current === this) return true;
        current = current.parentElement;
      }
      return false;
    },
  };
}

function appendAwardNode(parent: AwardTreeNode, child: AwardTreeNode): AwardTreeNode {
  parent.children.push(child);
  child.parentElement = parent;
  return child;
}

function createAwardControl(
  module: AwardTreeNode,
  row: AwardTreeNode,
  id: string,
  dataIndex: string,
): HTMLInputElement {
  const wrapper = appendAwardNode(row, createAwardTreeNode({ 'data-index': dataIndex }));
  const control = appendAwardNode(wrapper, createAwardTreeNode({}, id));
  return Object.assign(control, {
    closest(selector: string) {
      let current: AwardTreeNode | null = control;
      while (current) {
        if (selector.includes('data-form-module') && current.attrs['data-form-module']) return current;
        if (selector.includes('data-repeat-item') && 'data-repeat-item' in current.attrs) return current;
        current = current.parentElement;
      }
      return null;
    },
  }) as unknown as HTMLInputElement;
}

async function captureAwardFill(
  fields: Array<{ element: HTMLInputElement; fieldType: FieldType; confidence: number }>,
  awards: ReturnType<typeof createEmptyUserProfile>['awards'],
): Promise<Array<[string, string]>> {
  const profile = createEmptyUserProfile();
  profile.awards = awards;
  const calls: Array<[string, string]> = [];
  const filler = new FormFiller();
  (filler as unknown as { fillField: (element: HTMLInputElement, value: string) => Promise<void> }).fillField = async (element, value) => {
    calls.push([element.id, value]);
  };
  await filler.fillForm(fields, profile);
  return calls;
}

test('single award row shares one index across four field wrappers', async () => {
  const module = createAwardTreeNode({ 'data-form-module': 'awards' });
  const list = appendAwardNode(module, createAwardTreeNode());
  const row = appendAwardNode(list, createAwardTreeNode());
  const fields = [
    { element: createAwardControl(module, row, 'single-name', '0'), fieldType: FieldType.AWARD_NAME, confidence: 1 },
    { element: createAwardControl(module, row, 'single-role', '1'), fieldType: FieldType.AWARD_ROLE, confidence: 1 },
    { element: createAwardControl(module, row, 'single-date', '2'), fieldType: FieldType.AWARD_DATE, confidence: 1 },
    { element: createAwardControl(module, row, 'single-description', '3'), fieldType: FieldType.AWARD_DESCRIPTION, confidence: 1 },
  ];

  const calls = await captureAwardFill(fields, [
    { id: 'a1', name: '一等奖', role: '负责人', date: '2026-06', description: '详细描述' },
  ]);

  assert.deepEqual(calls, [
    ['single-name', '一等奖'],
    ['single-role', '负责人'],
    ['single-date', '2026-06'],
    ['single-description', '详细描述'],
  ]);
});

test('award rows directly under module keep separate shared indexes', async () => {
  const module = createAwardTreeNode({ 'data-form-module': 'awards' });
  const row1 = appendAwardNode(module, createAwardTreeNode());
  const row2 = appendAwardNode(module, createAwardTreeNode());
  const fields = [
    { element: createAwardControl(module, row1, 'row1-name', '0'), fieldType: FieldType.AWARD_NAME, confidence: 1 },
    { element: createAwardControl(module, row1, 'row1-role', '1'), fieldType: FieldType.AWARD_ROLE, confidence: 1 },
    { element: createAwardControl(module, row2, 'row2-name', '0'), fieldType: FieldType.AWARD_NAME, confidence: 1 },
    { element: createAwardControl(module, row2, 'row2-role', '1'), fieldType: FieldType.AWARD_ROLE, confidence: 1 },
  ];

  const calls = await captureAwardFill(fields, [
    { id: 'a1', name: '一等奖', role: '负责人', date: '', description: '' },
    { id: 'a2', name: '二等奖', role: '核心成员', date: '', description: '' },
  ]);

  assert.deepEqual(calls, [
    ['row1-name', '一等奖'],
    ['row1-role', '负责人'],
    ['row2-name', '二等奖'],
    ['row2-role', '核心成员'],
  ]);
});
