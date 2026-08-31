import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import App from "./App.tsx";
import { MessageService } from "../shared/message.ts";
import type { UserProfile } from "../shared/types.ts";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const makeProfile = (name: string): UserProfile => ({ personal: { name }, education: [], experience: [], projects: [], awards: [], customInformation: [], skills: [], certifications: [] });

function text(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root.findAll(node => typeof node.type === "string").flatMap(node => node.children).filter(child => typeof child === "string").join(" ");
}

async function setup() {
  const originalChrome = globalThis.chrome;
  const originalWindow = globalThis.window;
  const originalSend = MessageService.sendMessage;
  let listener: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | undefined;
  let activeId = "profile-a";
  let profileFailure = false;
  let getProfileCount = 0;
  let saveCount = 0;
  const profiles: Record<string, UserProfile> = { "profile-a": makeProfile("资料 A"), "profile-b": makeProfile("资料 B") };
  globalThis.window = { location: { search: "" }, setTimeout, clearTimeout } as unknown as Window & typeof globalThis;
  globalThis.chrome = { storage: { onChanged: { addListener(fn) { listener = fn; }, removeListener() {} } }, runtime: {} } as unknown as typeof chrome;
  MessageService.sendMessage = (async message => {
    if (message.type === "GET_RESUME_PROFILES") return { success: true, data: { activeProfileId: activeId, profiles: [{ id: "profile-a", name: "A", updatedAt: "1" }, { id: "profile-b", name: "B", updatedAt: "2" }] } };
    if (message.type === "GET_ACTIVE_RESUME_CONTEXT") { getProfileCount++; return profileFailure ? { success: false, error: "读取失败" } : { success: true, data: { activeProfileId: activeId, profiles: [{ id: "profile-a", name: "A", updatedAt: "1" }, { id: "profile-b", name: "B", updatedAt: "2" }], profile: profiles[activeId], revision: activeId } }; }
    if (message.type === "GET_USER_PROFILE") { getProfileCount++; return profileFailure ? { success: false, error: "读取失败" } : { success: true, data: profiles[activeId] }; }
    if (message.type === "SAVE_USER_PROFILE") { saveCount++; return { success: true }; }
    return { success: true };
  }) as typeof MessageService.sendMessage;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<App />); });
  return {
    renderer,
    fire(changes: Record<string, chrome.storage.StorageChange>, area = "local") { return act(async () => { listener?.(changes, area); await Promise.resolve(); await Promise.resolve(); }); },
    setActive(id: string) { activeId = id; },
    failProfile(value: boolean) { profileFailure = value; },
    getProfileCount: () => getProfileCount,
    saveCount: () => saveCount,
    async cleanup() { await act(async () => { renderer.unmount(); }); MessageService.sendMessage = originalSend; globalThis.chrome = originalChrome; globalThis.window = originalWindow; },
  };
}

function nameInput(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({ placeholder: "请输入姓名" });
}

function button(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root.findAllByType("button").find(item => item.children.join("") === label);
}

test("options 仅响应 local resumeProfileLibrary；dirty 时保留输入并等待用户选择", async () => {
  const env = await setup();
  try {
    assert.ok(env.getProfileCount() === 1);
    await env.fire({ userProfile: { oldValue: {}, newValue: {} } });
    await env.fire({ resumeProfileLibrary: { oldValue: {}, newValue: {} } }, "sync");
    assert.equal(env.getProfileCount(), 1);
    await act(async () => { nameInput(env.renderer).props.onChange({ target: { value: "本地草稿" } }); });
    env.setActive("profile-b");
    await env.fire({ resumeProfileLibrary: { oldValue: {}, newValue: {} } });
    assert.equal(nameInput(env.renderer).props.value, "本地草稿");
    assert.match(text(env.renderer), /重新加载/);
    assert.match(text(env.renderer), /保留本地修改/);
    assert.equal(env.getProfileCount(), 2);
  } finally { await env.cleanup(); }
});

test("reload 应用外部资料；keep-local 保留草稿并禁止覆盖新活动资料", async () => {
  const reloadEnv = await setup();
  try {
    await act(async () => { nameInput(reloadEnv.renderer).props.onChange({ target: { value: "本地草稿" } }); });
    reloadEnv.setActive("profile-b");
    await reloadEnv.fire({ resumeProfileLibrary: { oldValue: {}, newValue: {} } });
    await act(async () => { await button(reloadEnv.renderer, "重新加载")?.props.onClick(); });
    assert.equal(nameInput(reloadEnv.renderer).props.value, "资料 B");
    assert.doesNotMatch(text(reloadEnv.renderer), /其他页面更新了当前简历/);
  } finally { await reloadEnv.cleanup(); }

  const keepEnv = await setup();
  try {
    await act(async () => { nameInput(keepEnv.renderer).props.onChange({ target: { value: "本地草稿" } }); });
    keepEnv.setActive("profile-b");
    await keepEnv.fire({ resumeProfileLibrary: { oldValue: {}, newValue: {} } });
    await act(async () => { button(keepEnv.renderer, "保留本地修改")?.props.onClick(); });
    assert.equal(nameInput(keepEnv.renderer).props.value, "本地草稿");
    assert.equal(button(keepEnv.renderer, "保存设置")?.props.disabled, true);
    await act(async () => { await button(keepEnv.renderer, "保存设置")?.props.onClick(); });
    assert.equal(keepEnv.saveCount(), 0);
    assert.match(text(keepEnv.renderer), /重新加载/);
  } finally { await keepEnv.cleanup(); }
});

test("外部资料 reload 失败时保留冲突提示并显示错误", async () => {
  const env = await setup();
  try {
    await act(async () => { nameInput(env.renderer).props.onChange({ target: { value: "本地草稿" } }); });
    env.setActive("profile-b");
    await env.fire({ resumeProfileLibrary: { oldValue: {}, newValue: {} } });
    env.failProfile(true);
    await act(async () => { await button(env.renderer, "重新加载")?.props.onClick(); });
    assert.equal(nameInput(env.renderer).props.value, "本地草稿");
    assert.match(text(env.renderer), /重新加载/);
    assert.match(text(env.renderer), /读取失败/);
  } finally { await env.cleanup(); }
});

test("奖项名称为空时阻止保存，只有名称时允许保存", async () => {
  const env = await setup();
  try {
    await act(async () => { button(env.renderer, "实习与项目")?.props.onClick(); });
    await act(async () => { button(env.renderer, "添加奖项 / 荣誉")?.props.onClick(); });
    assert.match(text(env.renderer), /请填写奖项名称/);
    await act(async () => { await button(env.renderer, "保存设置")?.props.onClick(); });
    assert.equal(env.saveCount(), 0);
    const input = env.renderer.root.findByProps({ placeholder: "请填写奖项名称" });
    await act(async () => { input.props.onChange({ target: { value: "优秀毕业生" } }); });
    await act(async () => { await button(env.renderer, "保存设置")?.props.onClick(); });
    assert.equal(env.saveCount(), 1);
  } finally { await env.cleanup(); }
});

test("实习与项目页不再显示成果和技术栈输入", async () => {
  const env = await setup();
  try {
    await act(async () => { button(env.renderer, "实习与项目")?.props.onClick(); });
    const rendered = text(env.renderer);
    assert.doesNotMatch(rendered, /实习成果|项目成果|项目技术栈/);
  } finally { await env.cleanup(); }
});
