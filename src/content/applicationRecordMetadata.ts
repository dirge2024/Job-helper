import type { ApplicationPageMetadata } from '../shared/types.ts';

function normalizeCompanyName(value: string): string {
  return value.replace(/招聘官网|校园招聘|社会招聘|招聘|校招|职位|官网/g, '').trim();
}

function pickCompanyName(doc: Document): string {
  const metaValue = doc
    .querySelector('meta[property="og:site_name"]')
    ?.getAttribute('content')
    ?.trim();
  if (metaValue) {
    return normalizeCompanyName(metaValue);
  }

  const title = doc.title.trim();
  const matched = title.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·\-.&\s]+?)(?:校园招聘|社会招聘|招聘|校招|职位)/);
  return normalizeCompanyName(matched?.[1] ?? '');
}

function pickJobTitle(doc: Document, companyName: string, pageTitle: string): string {
  const elements = typeof doc.querySelectorAll === 'function'
    ? doc.querySelectorAll('h1, [class*="job"], [class*="position"], [data-testid*="job"]')
    : [];
  const candidates = Array.from(elements)
    .map(element => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(text => text.length >= 2 && text.length <= 80 && text !== companyName);
  if (candidates[0]) return candidates[0];
  return pageTitle
    .replace(companyName, '')
    .replace(/校园招聘|社会招聘|招聘官网|招聘|校招|职位/g, '')
    .split(/[|｜·•-]/)
    .map(text => text.trim())
    .find(text => text.length >= 2) ?? '';
}

export function extractApplicationPageMetadata(doc: Document, url: string): ApplicationPageMetadata {
  const parsedUrl = new URL(url);
  const pageTitle = doc.title.trim();
  const companyName = pickCompanyName(doc);
  return {
    companyName,
    jobTitle: pickJobTitle(doc, companyName, pageTitle),
    sourceSite: parsedUrl.host,
    sourceUrl: parsedUrl.toString(),
    pageTitle,
  };
}
