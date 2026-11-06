import { useEffect, useState } from 'react';
import type { Profile } from '../types';
import { getProfiles, setActiveProfile, getAutoTranslateSites, setAutoTranslateSite } from '../storage.js';

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
  const [host, setHost] = useState('');
  const [autoOn, setAutoOn] = useState(false);
  const [tabId, setTabId] = useState<number | null>(null);

  const load = async () => {
    const { profiles, activeProfileId } = await getProfiles();
    setProfiles(profiles);
    setActiveId(activeProfileId);
  };

  useEffect(() => {
    (async () => {
      await load();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) setTabId(tab.id);
      if (tab?.url) {
        try { setHost(new URL(tab.url).hostname); } catch { /* not a valid URL */ }
      }
      const sites = await getAutoTranslateSites();
      if (tab?.url) {
        try { setAutoOn(sites.includes(new URL(tab.url).hostname)); } catch { /* ignore */ }
      }
    })();
  }, []);

  const handleSelect = async (id: string) => {
    await setActiveProfile(id);
    load();
  };

  const handleToggleAuto = async () => {
    if (!host) return;
    const next = !autoOn;
    await setAutoTranslateSite(host, next);
    setAutoOn(next);
  };

  const translateNow = async () => {
    const profile = profiles.find(p => p.id === activeProfileId) ?? profiles[0];
    if (!profile || tabId === null) return;
    chrome.tabs.sendMessage(tabId, { type: 'toggle-translation', profile }).catch(() => {});
    window.close();
  };

  return (
    <>
      <header className="header">
        <div className="logo">🌐</div>
        <h2>LLM 翻訳</h2>
      </header>
      <div className="content">
        <button className="translate-now" onClick={translateNow} disabled={profiles.length === 0}>
          ⚡ このページを翻訳
        </button>

        {profiles.length === 0 && (
          <div className="hint" style={{ padding: '12px 4px', textAlign: 'center' }}>
            プロファイルが未設定です。<br />設定画面で作成してください。
          </div>
        )}
        {profiles.map(p => (
          <ProfileButton key={p.id} profile={p} active={p.id === activeProfileId} onSelect={handleSelect} />
        ))}

        {host && (
          <div className="auto-row">
            <span className="auto-label">
              <span className="auto-title">このサイトで常に自動翻訳</span>
              <small>{host}</small>
            </span>
            <button
              className={`switch ${autoOn ? 'on' : ''}`}
              onClick={handleToggleAuto}
              role="switch"
              aria-checked={autoOn}
              tabIndex={0}
            >
              <span className="knob" />
            </button>
          </div>
        )}
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
