import React from 'react';
import type { MessageResponse, ResumeProfileSummary, UserProfile } from '../shared/types';

interface ResumeProfileSelectorProps {
  profiles: ResumeProfileSummary['profiles'];
  activeProfileId: string;
  disabled: boolean;
  onSwitch: (id: string) => void;
}

export function ResumeProfileSelector({ profiles, activeProfileId, disabled, onSwitch }: ResumeProfileSelectorProps) {
  const active = profiles.find(profile => profile.id === activeProfileId) ?? profiles[0];

  return (
    <section className="resume-profile-selector" aria-labelledby="resume-profile-selector-label">
      <div className="resume-profile-selector-copy">
        <span id="resume-profile-selector-label">当前简历</span>
        <strong>{active?.name || '默认简历'}</strong>
      </div>
      <label>
        <span className="popup-sr-only">切换当前简历</span>
        <select
          aria-label="切换当前简历"
          value={active?.id || ''}
          disabled={disabled || profiles.length === 0}
          onChange={event => onSwitch(event.target.value)}
        >
          {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select>
      </label>
    </section>
  );
}

interface SwitchDependencies {
  switchProfile: () => Promise<MessageResponse<ResumeProfileSummary>>;
  loadSummary: () => Promise<ResumeProfileSummary>;
  loadProfile: () => Promise<UserProfile>;
  commit: (summary: ResumeProfileSummary, profile: UserProfile) => void;
  rollback: (id: string) => void;
  showError: (error: string) => void;
  isCurrent: () => boolean;
}

export async function executePopupProfileSwitch(
  _nextId: string,
  previousId: string,
  dependencies: SwitchDependencies,
): Promise<void> {
  try {
    const response = await dependencies.switchProfile();
    if (!dependencies.isCurrent()) return;
    if (!response.success) {
      dependencies.rollback(previousId);
      dependencies.showError(response.error || '切换简历失败，请稍后重试');
      return;
    }

    const [summary, profile] = await Promise.all([
      dependencies.loadSummary(),
      dependencies.loadProfile(),
    ]);
    if (dependencies.isCurrent()) dependencies.commit(summary, profile);
  } catch (error) {
    if (!dependencies.isCurrent()) return;
    dependencies.rollback(previousId);
    dependencies.showError(error instanceof Error ? error.message : '切换简历失败，请稍后重试');
  }
}
