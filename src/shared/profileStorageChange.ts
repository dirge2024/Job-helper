export function shouldReloadProfile(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
): boolean {
  return areaName === 'local' && 'resumeProfileLibrary' in changes;
}
