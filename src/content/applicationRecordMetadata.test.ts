import assert from 'node:assert/strict';
import test from 'node:test';
import { extractApplicationPageMetadata } from './applicationRecordMetadata.ts';

test('页面元数据提取返回 sourceSite/sourceUrl，并尽量提取公司名', () => {
  const doc = {
    title: '字节跳动校园招聘',
    querySelector: (selector: string) => {
      if (selector === 'meta[property="og:site_name"]') {
        return {
          getAttribute: (attribute: string) => (attribute === 'content' ? '字节跳动招聘' : null),
        };
      }
      return null;
    },
  } as unknown as Document;

  const result = extractApplicationPageMetadata(doc, 'https://jobs.bytedance.com/campus');

  assert.equal(result.sourceSite, 'jobs.bytedance.com');
  assert.equal(result.sourceUrl, 'https://jobs.bytedance.com/campus');
  assert.match(result.companyName, /字节/);
  assert.equal(result.pageTitle, '字节跳动校园招聘');
});

test('页面有职位标题时同时提取岗位名', () => {
  const doc = {
    title: '字节跳动 · Java 后端开发工程师',
    querySelector: () => null,
    querySelectorAll: (selector: string) => selector.includes('h1') ? [{ textContent: 'Java 后端开发工程师' }] : [],
  } as unknown as Document;
  const result = extractApplicationPageMetadata(doc, 'https://jobs.bytedance.com/campus');
  assert.equal(result.jobTitle, 'Java 后端开发工程师');
});
