import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('侧边栏收录岗位使用紧凑内嵌表单和固定底部导航', () => {
  const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

  for (const label of ['收录当前岗位', '一键填充', '公司名称', '岗位名称', '目标城市', '投递阶段', '投递日期', '确认存入看板', '收起', '投递看板', '简历配置']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /className="capture-panel"/);
  assert.match(source, /className="panel-scroll"/);
  assert.match(source, /className="panel-footer"/);
  assert.doesNotMatch(source, /职位链接/);
  assert.doesNotMatch(source, /备注/);
  assert.match(css, /\.panel\s*\{[^}]*height:\s*100vh/s);
  assert.match(css, /\.panel-scroll\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.panel-footer\s*\{[^}]*border-top/s);
});

test('侧边栏显示 Ctrl+Shift+A 快捷键提示', () => {
  const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../../manifest.json', import.meta.url), 'utf8');
  assert.match(source, /Ctrl\+Shift\+A/);
  assert.match(manifest, /"default":\s*"Ctrl\+Shift\+A"/);
  assert.doesNotMatch(manifest, /"default_popup"/);
});
