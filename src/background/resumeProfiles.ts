import { StorageService } from '../shared/storage.ts';
import { createResumeProfile, deleteResumeProfile, duplicateResumeProfile, renameResumeProfile, switchResumeProfile } from '../shared/resumeProfiles.ts';
import type { MessageResponse, ResumeProfileLibrary, ResumeProfileMutationResult, ResumeProfileSummary, SyncResultStatus } from '../shared/types.ts';

export interface ResumeProfileHandlerDependencies {
  now: () => string;
  queueAutoSync: (reason: string) => Promise<'disabled' | 'queued' | unknown>;
}
const defaultDependencies: ResumeProfileHandlerDependencies = {
  now: () => new Date().toISOString(),
  queueAutoSync: async () => 'disabled',
};

let mutationQueue: Promise<void> = Promise.resolve();

export function serializeResumeProfileMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function toResumeProfileSummary(library: ResumeProfileLibrary): ResumeProfileSummary {
  return { activeProfileId: library.activeProfileId, profiles: library.profiles.map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt })) };
}

export async function mutateResumeProfiles(
  transform: (library: ResumeProfileLibrary) => ResumeProfileLibrary,
  reason: string,
  dependencies: ResumeProfileHandlerDependencies = defaultDependencies,
): Promise<MessageResponse<ResumeProfileMutationResult>> {
  let summary: ResumeProfileSummary;
  try {
    summary = await serializeResumeProfileMutation(async () => {
      const current = await StorageService.getResumeProfileLibrary();
      const next = transform(current);
      await StorageService.saveResumeProfileLibrary(next);
      return toResumeProfileSummary(next);
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '资料库操作失败' };
  }

  try {
    const syncResult = await dependencies.queueAutoSync(reason);
    const sync: SyncResultStatus = syncResult === 'disabled' ? 'disabled' : 'queued';
    return { success: true, data: { ...summary, sync } };
  } catch (error) {
    return {
      success: true,
      data: {
        ...summary,
        sync: 'error',
        syncError: error instanceof Error ? error.message : '自动同步排队失败',
      },
    };
  }
}

export async function getResumeProfilesHandler(): Promise<MessageResponse<ResumeProfileSummary>> {
  try {
    return { success: true, data: toResumeProfileSummary(await StorageService.getResumeProfileLibrary()) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '读取资料库失败' };
  }
}

export function switchResumeProfileHandler(payload: { id: string }, dependencies?: ResumeProfileHandlerDependencies) {
  return mutateResumeProfiles(library => switchResumeProfile(library, payload.id), 'resume-profile-switch', dependencies);
}
export function createResumeProfileHandler(payload: { name: string }, dependencies?: ResumeProfileHandlerDependencies) {
  const deps = dependencies ?? defaultDependencies;
  return mutateResumeProfiles(library => createResumeProfile(library, payload.name, deps.now()), 'resume-profile-create', deps);
}
export function duplicateResumeProfileHandler(payload: { id: string }, dependencies?: ResumeProfileHandlerDependencies) {
  const deps = dependencies ?? defaultDependencies;
  return mutateResumeProfiles(library => duplicateResumeProfile(library, payload.id, deps.now()), 'resume-profile-duplicate', deps);
}
export function renameResumeProfileHandler(payload: { id: string; name: string }, dependencies?: ResumeProfileHandlerDependencies) {
  const deps = dependencies ?? defaultDependencies;
  return mutateResumeProfiles(library => renameResumeProfile(library, payload.id, payload.name, deps.now()), 'resume-profile-rename', deps);
}
export function deleteResumeProfileHandler(payload: { id: string }, dependencies?: ResumeProfileHandlerDependencies) {
  return mutateResumeProfiles(library => deleteResumeProfile(library, payload.id), 'resume-profile-delete', dependencies);
}
