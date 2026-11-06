import type { Profile } from './types';

interface StorageState {
  profiles?: Profile[];
  activeProfileId?: string | null;
}

export async function getProfiles(): Promise<{ profiles: Profile[]; activeProfileId: string | null }> {
  const { profiles = [], activeProfileId = null } = (await chrome.storage.sync.get(['profiles', 'activeProfileId'])) as StorageState;
  return { profiles, activeProfileId };
}

export async function setActiveProfile(id: string): Promise<void> {
  await chrome.storage.sync.set({ activeProfileId: id });
}

export async function saveProfile(profile: Profile): Promise<void> {
  const { profiles = [], activeProfileId = null } = (await chrome.storage.sync.get(['profiles', 'activeProfileId'])) as StorageState;
  const idx = profiles.findIndex(p => p.id === profile.id);
  if (idx >= 0) profiles[idx] = profile;
  else profiles.push(profile);
  const patch: StorageState = { profiles };
  if (!activeProfileId) patch.activeProfileId = profile.id;
  await chrome.storage.sync.set(patch);
}

export async function deleteProfile(id: string): Promise<void> {
  const { profiles = [], activeProfileId } = (await chrome.storage.sync.get(['profiles', 'activeProfileId'])) as StorageState;
  const next = profiles.filter(p => p.id !== id);
  const patch: StorageState = { profiles: next };
  if (activeProfileId === id) patch.activeProfileId = next[0]?.id ?? null;
  await chrome.storage.sync.set(patch);
}

export async function getAutoTranslateSites(): Promise<string[]> {
  const { autoTranslateSites = [] } = (await chrome.storage.sync.get('autoTranslateSites')) as { autoTranslateSites?: string[] };
  return Array.isArray(autoTranslateSites) ? autoTranslateSites : [];
}

export async function setAutoTranslateSite(host: string, enabled: boolean): Promise<void> {
  const sites = await getAutoTranslateSites();
  const next = enabled ? [...new Set([...sites, host])] : sites.filter(s => s !== host);
  await chrome.storage.sync.set({ autoTranslateSites: next });
}
