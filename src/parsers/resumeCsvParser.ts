import type { ParsedResumeData, UserProfile } from '../shared/types.ts';

const HEADERS = ['section', 'index', 'field', 'value'] as const;

function parseRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];
    if (char === '"') {
      if (quoted && next === '"') { cell += '"'; i += 1; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); if (row.some(value => value.trim())) rows.push(row); }
  return rows;
}

export function parseResumeCSV(csv: string): ParsedResumeData {
  const rows = parseRows(csv.replace(/^\uFEFF/, ''));
  if (!rows.length || rows[0]?.map(value => value.trim()).join(',') !== HEADERS.join(',')) {
    throw new Error('简历 CSV 表头不合法，必须为 section,index,field,value');
  }
  const personal: Record<string, string> = {};
  const collections: Record<string, Array<Record<string, string>>> = {
    education: [], experience: [], projects: [], awards: [],
  };
  const skills: string[] = [];
  for (const row of rows.slice(1)) {
    const section = row[0]?.trim() ?? '';
    const index = Number.parseInt(row[1] ?? '', 10);
    const field = row[2]?.trim() ?? '';
    const value = row[3] ?? '';
    if (section === 'personal' && field) personal[field] = value;
    else if (section === 'skills' && value.trim()) skills.push(value.trim());
    else if (collections[section] && Number.isInteger(index) && index >= 0 && field) {
      collections[section][index] ??= {};
      collections[section][index]![field] = value;
    }
  }
  return {
    personal,
    education: collections.education,
    experience: collections.experience,
    projects: collections.projects,
    awards: collections.awards,
    skills,
    rawText: csv,
  };
}

function escape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function serializeResumeCSV(data: ParsedResumeData): string {
  const rows: string[][] = [[...HEADERS]];
  for (const [field, value] of Object.entries(data.personal ?? {})) {
    if (typeof value === 'string' && value.trim()) rows.push(['personal', '0', field, value]);
  }
  const add = (section: string, items: Array<Record<string, unknown>> | undefined) => {
    items?.forEach((item, index) => Object.entries(item).forEach(([field, value]) => {
      if (field !== 'id' && typeof value === 'string' && value.trim()) rows.push([section, String(index), field, value]);
    }));
  };
  add('education', data.education);
  add('experience', data.experience);
  add('projects', data.projects);
  add('awards', data.awards);
  data.skills?.forEach((skill, index) => rows.push(['skills', String(index), 'name', skill]));
  return rows.map(row => row.map(escape).join(',')).join('\n');
}

export function serializeUserProfileCSV(profile: UserProfile): string {
  return serializeResumeCSV({
    personal: profile.personal,
    education: profile.education,
    experience: profile.experience,
    projects: profile.projects,
    awards: profile.awards,
    skills: profile.skills,
    rawText: '',
  });
}
