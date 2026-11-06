import { useEffect, useState } from 'react';
import type { Profile } from '../types';
import { getProfiles, setActiveProfile } from '../storage';

interface ProfileButtonProps {
  profile: Profile;
  active: boolean;
  onSelect: (id: string) => void;
}

function ProfileButton({ profile, active, onSelect }: ProfileButtonProps) {
  return (
    <button className={`profile ${active ? 'active' : ''}`} onClick={() => onSelect(profile.id)}>
      {profile.name}
      <small>{profile.model} @ {profile.endpoint}</small>
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
      <h2>翻訳プロファイル</h2>
      <div id="profiles">
        {profiles.length === 0 && (
          <div className="hint">プロファイルが未設定です。設定画面で作成してください。</div>
        )}
        {profiles.map(p => (
          <ProfileButton key={p.id} profile={p} active={p.id === activeProfileId} onSelect={handleSelect} />
        ))}
      </div>
      <div className="hint">
        ショートカット: 翻訳 Ctrl+Shift+Y ／ プロファイル切替 Ctrl+Shift+U
        （chrome://extensions/shortcuts で変更可能）
      </div>
      <div className="links">
        <a role="button" tabIndex={0} onClick={() => chrome.runtime.openOptionsPage()}>設定画面を開く</a>
      </div>
    </>
  );
}
