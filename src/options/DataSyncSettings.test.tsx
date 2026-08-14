import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('WebDAV 同步文案明确说明投递记录会额外保留 CSV 副本', () => {
  const source = readFileSync(new URL('./DataSyncSettings.tsx', import.meta.url), 'utf8');
  assert.match(source, /投递记录会额外保留一份 CSV 副本/);
});
