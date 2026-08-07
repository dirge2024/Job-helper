import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('popup 右上角渲染新建投递记录和查看投递记录按钮', async () => {
  const popupModule = await import('./App.tsx');
  const html = renderToStaticMarkup(React.createElement(popupModule.default));
  assert.match(html, /新建投递记录/);
  assert.match(html, /查看投递记录/);
});
