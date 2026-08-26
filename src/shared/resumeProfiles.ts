import type { ResumeProfile, ResumeProfileLibrary, UserProfile } from './types.ts';

export type { ResumeProfile, ResumeProfileLibrary } from './types.ts';

export function createEmptyUserProfile(): UserProfile {
  return {
    personal: { name: '', gender: '', birthDate: '', phone: '', email: '' },
    education: [],
    experience: [],
    projects: [],
    customInformation: [],
    skills: [],
    certifications: [],
  };
}

export function uniqueProfileName(base: string, names: string[]): string {
  const value = base.trim() || '未命名简历';
  if (!names.includes(value)) return value;
  let index = 2;
  while (names.includes(`${value} ${index}`)) index += 1;
  return `${value} ${index}`;
}

function newProfile(name: string, profile: UserProfile, now: string): ResumeProfile {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    profile: structuredClone(profile),
  };
}

function requireProfile(library: ResumeProfileLibrary, id: string): ResumeProfile {
  const profile = library.profiles.find(item => item.id === id);
  if (!profile) throw new Error('简历不存在');
  return profile;
}

function validateLibrary(value: unknown): ResumeProfileLibrary {
  if (!value || typeof value !== 'object') throw new Error('资料库格式无效');
  const library = value as ResumeProfileLibrary;
  if (library.schemaVersion !== 1 || !Array.isArray(library.profiles) || library.profiles.length === 0) {
    throw new Error('资料库格式无效');
  }
  const ids = library.profiles.map(profile => profile.id);
  const names = library.profiles.map(profile => profile.name);
  if (new Set(ids).size !== ids.length) throw new Error('简历 ID 重复');
  if (new Set(names).size !== names.length) throw new Error('简历名称重复');
  return library;
}

export function normalizeResumeProfileLibrary(value: unknown, legacyProfile?: UserProfile): ResumeProfileLibrary {
  if (value == null) {
    const now = new Date().toISOString();
    const profile = newProfile('默认简历', legacyProfile ?? createEmptyUserProfile(), now);
    return { schemaVersion: 1, activeProfileId: profile.id, profiles: [profile] };
  }
  const library = validateLibrary(value);
  const activeProfileId = library.profiles.some(profile => profile.id === library.activeProfileId)
    ? library.activeProfileId
    : library.profiles[0].id;
  return { ...library, activeProfileId, profiles: [...library.profiles] };
}

export function createResumeProfile(library: ResumeProfileLibrary, now: string): ResumeProfileLibrary {
  const profile = newProfile(
    uniqueProfileName('未命名简历', library.profiles.map(item => item.name)),
    createEmptyUserProfile(),
    now,
  );
  return { ...library, activeProfileId: profile.id, profiles: [...library.profiles, profile] };
}

export function duplicateResumeProfile(library: ResumeProfileLibrary, id: string, now: string): ResumeProfileLibrary {
  const source = requireProfile(library, id);
  const profile = newProfile(
    uniqueProfileName(`${source.name} 副本`, library.profiles.map(item => item.name)),
    source.profile,
    now,
  );
  return { ...library, activeProfileId: profile.id, profiles: [...library.profiles, profile] };
}

export function renameResumeProfile(library: ResumeProfileLibrary, id: string, name: string, now: string): ResumeProfileLibrary {
  requireProfile(library, id);
  const trimmed = name.trim();
  if (!trimmed) throw new Error('简历名称不能为空');
  if (library.profiles.some(profile => profile.id !== id && profile.name === trimmed)) {
    throw new Error('简历名称已存在');
  }
  return {
    ...library,
    profiles: library.profiles.map(profile => profile.id === id ? { ...profile, name: trimmed, updatedAt: now } : profile),
  };
}

export function deleteResumeProfile(library: ResumeProfileLibrary, id: string): ResumeProfileLibrary {
  requireProfile(library, id);
  if (library.profiles.length === 1) throw new Error('至少保留一套简历');
  const profiles = library.profiles.filter(profile => profile.id !== id);
  return {
    ...library,
    profiles,
    activeProfileId: library.activeProfileId === id ? profiles[0].id : library.activeProfileId,
  };
}

export function switchResumeProfile(library: ResumeProfileLibrary, id: string): ResumeProfileLibrary {
  requireProfile(library, id);
  return { ...library, activeProfileId: id };
}

export function updateActiveUserProfile(library: ResumeProfileLibrary, profile: UserProfile, now: string): ResumeProfileLibrary {
  requireProfile(library, library.activeProfileId);
  return {
    ...library,
    profiles: library.profiles.map(item => item.id === library.activeProfileId
      ? { ...item, profile: structuredClone(profile), updatedAt: now }
      : item),
  };
}
