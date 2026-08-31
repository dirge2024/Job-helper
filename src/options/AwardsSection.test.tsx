import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { AwardsSection } from "./AwardsSection.tsx";
import type { AwardInfo } from "../shared/types.ts";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function button(root: TestRenderer.ReactTestInstance, label: string) {
  return root.findAllByType("button").find(item => item.children.join("") === label)!;
}

async function renderAwards(initial: AwardInfo[]) {
  let current = initial;
  let renderer!: TestRenderer.ReactTestRenderer;
  const render = () => <AwardsSection awards={current} onChange={next => { current = next; }} />;
  await act(async () => { renderer = TestRenderer.create(render()); });
  return { renderer, current: () => current, refresh: async () => act(async () => { renderer.update(render()); }) };
}

test("新增奖项生成 id 和空可选字段", async () => {
  const env = await renderAwards([]);
  await act(async () => { button(env.renderer.root, "添加奖项 / 荣誉").props.onClick(); });
  assert.equal(env.current().length, 1);
  assert.match(env.current()[0].id, /.+/);
  assert.deepEqual({ ...env.current()[0], id: "<id>" }, { id: "<id>", name: "", role: "", date: "", description: "" });
});

test("名称为空显示就近错误，只有名称时可保存到数组", async () => {
  const env = await renderAwards([{ id: "a1", name: "", role: "", date: "", description: "" }]);
  const nameInput = env.renderer.root.findByProps({ placeholder: "请填写奖项名称" });
  const groupText = nameInput.parent!.children.flatMap(child => typeof child === "string" ? [child] : child.children).join(" " );
  assert.match(groupText, /请填写奖项名称/);
  await act(async () => { nameInput.props.onChange({ target: { value: "优秀毕业生" } }); });
  assert.deepEqual(env.current(), [{ id: "a1", name: "优秀毕业生", role: "", date: "", description: "" }]);
});

test("删除和上下移动返回正确数组", async () => {
  const items: AwardInfo[] = ["A", "B", "C"].map((name, index) => ({ id: `a${index + 1}`, name, role: "", date: "", description: "" }));
  const env = await renderAwards(items);
  let cards = env.renderer.root.findAll(node => typeof node.props["data-award-id"] === "string");
  await act(async () => { button(cards[1], "上移").props.onClick(); });
  assert.deepEqual(env.current().map(item => item.id), ["a2", "a1", "a3"]);
  await env.refresh();
  cards = env.renderer.root.findAll(node => typeof node.props["data-award-id"] === "string");
  await act(async () => { button(cards[0], "下移").props.onClick(); });
  assert.deepEqual(env.current().map(item => item.id), ["a1", "a2", "a3"]);
  await env.refresh();
  cards = env.renderer.root.findAll(node => typeof node.props["data-award-id"] === "string");
  await act(async () => { button(cards[1], "删除").props.onClick(); });
  assert.deepEqual(env.current().map(item => item.id), ["a1", "a3"]);
});
