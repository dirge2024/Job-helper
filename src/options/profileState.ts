import type { UserProfile } from '../shared/types';

export function profileSnapshot(profile: UserProfile): string {
  return JSON.stringify(profile);
}

export function isProfileDirty(profile: UserProfile, savedSnapshot: string): boolean {
  return savedSnapshot !== '' && profileSnapshot(profile) !== savedSnapshot;
}

export function applyLoadedProfile(
  profile: UserProfile,
  setProfile: (profile: UserProfile) => void,
  setSavedSnapshot: (snapshot: string) => void,
): void {
  setProfile(profile);
  setSavedSnapshot(profileSnapshot(profile));
}

export async function reloadAfterActiveProfileChange(
  loadProfile: () => Promise<void>,
  bumpRevision: () => void,
): Promise<void> {
  await loadProfile();
  bumpRevision();
}
