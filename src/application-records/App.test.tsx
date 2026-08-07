import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App from './App.tsx';

test('新建记录页默认显示已投递状态并保留空岗位名输入框', () => {
  const html = renderToStaticMarkup(<App />);
  assert.match(html, /已投递/);
  assert.match(html, /岗位名/);
});
