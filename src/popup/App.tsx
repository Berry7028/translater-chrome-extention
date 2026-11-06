import { useEffect, useState } from 'react';
import type { Profile } from '../types';
import { getProfiles, setActiveProfile } from '../storage.js';

function ProfileButton({ profile, active, onSelect }: {
  profile: Profile;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button className={`profile ${active ? 'active' : ''}`} onClick={() => onSelect(profile.id)}>
      <span className="info">
        <span className="name">{profile.name}</span>
        <small>
          {profile.mode === 'plamo' ? 'PLaMo' : '汎用'} · {profile.model}
        </small>
      </span>
      <span className="check">✓</span>
    </button>
  );
}

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveId] = useState<string | null>(null);

  const load = async () => {
    const { profiles, activeProfileId } = await getProfiles();
    setProfiles(profiles);
    setActiveId(activeProfileId);
  };

  useEffect(() => { load(); }, []);

  const handleSelect = async (id: string) => {
    await setActiveProfile(id);
    load();
  };

  return (
    <>
      <header className="header">
        <div className="logo">🌐</div>
        <h2>LLM 翻訳</h2>
      </header>
      <div className="content">
        {profiles.length === 0 && (
          <div className="hint" style={{ padding: '16px 4px', textAlign: 'center' }}>
            プロファイルが未設定です。<br />設定画面で作成してください。
          </div>
        )}
        {profiles.map(p => (
          <ProfileButton key={p.id} profile={p} active={p.id === activeProfileId} onSelect={handleSelect} />
        ))}
      </div>
      <div className="shortcuts">
        <span className="shortcut"><kbd>⌥A</kbd> 翻訳</span>
        <span className="shortcut"><kbd>⌥S</kbd> プロファイル切替</span>
      </div>
      <div className="footer">
        <a role="button" tabIndex={0} onClick={() => chrome.runtime.openOptionsPage()}>⚙ 設定画面を開く</a>
      </div>
    </>
  );
}
