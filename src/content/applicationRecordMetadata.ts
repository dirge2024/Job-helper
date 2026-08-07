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

export function extractApplicationPageMetadata(doc: Document, url: string): ApplicationPageMetadata {
  const parsedUrl = new URL(url);
  return {
    companyName: pickCompanyName(doc),
    sourceSite: parsedUrl.host,
    sourceUrl: parsedUrl.toString(),
    pageTitle: doc.title.trim(),
  };
}
