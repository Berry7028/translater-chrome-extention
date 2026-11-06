import { useEffect, useState, type FormEvent } from 'react';
import type { Profile, TranslationMode } from '../types';
import { getProfiles, setActiveProfile, saveProfile, deleteProfile } from '../storage.js';

interface ProfileForm {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  prompt: string;
  mode: TranslationMode;
}

const EMPTY_FORM: ProfileForm = { id: '', name: '', endpoint: '', apiKey: '', model: '', prompt: '', mode: 'json' };

function ProfileItem({ profile, active, onUse, onEdit, onDelete }: {
  profile: Profile;
  active: boolean;
  onUse: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`profile-item ${active ? 'active' : ''}`}>
      <span className="info">
        <span className="name">
          {profile.name}
          {active && <span className="badge">使用中</span>}
        </span>
        <span className="meta">
          {profile.mode === 'plamo' ? 'PLaMo Translate' : '汎用LLM'} · {profile.model}
        </span>
      </span>
      <span className="btns">
        <button className="primary" disabled={active} onClick={onUse}>使用</button>
        <button onClick={onEdit}>編集</button>
        <button className="danger" onClick={onDelete}>削除</button>
      </span>
    </div>
  );
}

function ModeSelector({ mode, onChange }: { mode: TranslationMode; onChange: (m: TranslationMode) => void }) {
  return (
    <div className="mode-grid">
      <div
        className={`mode-option ${mode === 'json' ? 'selected' : ''}`}
        onClick={() => onChange('json')}
        role="button"
        tabIndex={0}
      >
        <span className="mode-title">🤖 汎用LLM</span>
        <span className="mode-desc">OpenAI APIなど。JSON配列でバッチ翻訳します（プロンプト欄を使用）</span>
      </div>
      <div
        className={`mode-option ${mode === 'plamo' ? 'selected' : ''}`}
        onClick={() => onChange('plamo')}
        role="button"
        tabIndex={0}
      >
        <span className="mode-title">🇯🇵 PLaMo Translate</span>
        <span className="mode-desc">PLaMo 3 Translate 専用。1テキストずつ公式プロンプト形式で翻訳します</span>
      </div>
    </div>
  );
}

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    const { profiles, activeProfileId } = await getProfiles();
    setProfiles(profiles);
    setActiveId(activeProfileId);
  };

  useEffect(() => { load(); }, []);

  const setField = (key: keyof ProfileForm) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const startEdit = (p: Profile) => {
    setEditing(true);
    setForm({ id: p.id, name: p.name, endpoint: p.endpoint, apiKey: p.apiKey || '', model: p.model, prompt: p.prompt || '', mode: p.mode || 'json' });
    document.getElementById('profile-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditing(false);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.endpoint || !form.model) return;
    const profile: Profile = { ...form, id: form.id || crypto.randomUUID() };
    await saveProfile(profile);
    resetForm();
    load();
  };

  const handleDelete = async (p: Profile) => {
    if (!confirm(`「${p.name}」を削除しますか？`)) return;
    await deleteProfile(p.id);
    load();
  };

  const handleUse = async (id: string) => {
    await setActiveProfile(id);
    load();
  };

  return (
    <>
      <div className="hero">
        <div className="logo">🌐</div>
        <h1>LLM Bilingual Translator</h1>
        <p>ショートカットでページ全体をバイリンガル翻訳</p>
      </div>
      <main>
        <section className="section">
          <h2>プロファイル</h2>
          <div className="profile-list">
            {profiles.length === 0 && (
              <div className="empty">
                プロファイルがありません。<br />下のフォームから最初のプロファイルを作成してください。
              </div>
            )}
            {profiles.map(p => (
              <ProfileItem
                key={p.id}
                profile={p}
                active={p.id === activeProfileId}
                onUse={() => handleUse(p.id)}
                onEdit={() => startEdit(p)}
                onDelete={() => handleDelete(p)}
              />
            ))}
          </div>
        </section>

        <section className="section" id="profile-form">
          <h2>{editing ? 'プロファイルを編集' : '新しいプロファイル'}</h2>
          <form onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name">プロファイル名</label>
              <input id="name" required value={form.name} onChange={setField('name')} placeholder="例: PLaMo 0.8B（ローカル）" />
            </div>
            <div>
              <label htmlFor="mode">翻訳モード</label>
              <ModeSelector mode={form.mode} onChange={(m) => setForm(f => ({ ...f, mode: m }))} />
            </div>
            <div>
              <label htmlFor="endpoint">エンドポイント（OpenAI互換）</label>
              <input id="endpoint" required value={form.endpoint} onChange={setField('endpoint')} placeholder="例: http://localhost:11434/v1" />
              <p className="hint">/chat/completions は自動補完されます。Ollama: http://localhost:11434/v1 ／ LM Studio: http://localhost:1234/v1</p>
            </div>
            <div>
              <label htmlFor="apiKey">APIキー</label>
              <input id="apiKey" type="password" value={form.apiKey} onChange={setField('apiKey')} placeholder="sk-...（ローカルLLMは空欄でOK）" />
              <p className="hint">chrome.storage.sync に保存されます。認証不要なローカルLLMは空欄で構いません。</p>
            </div>
            <div>
              <label htmlFor="model">モデル名</label>
              <input id="model" required value={form.model} onChange={setField('model')} placeholder="例: hf.co/pfnet/plamo-3-translate-0.8b-GGUF:Q4_K_M" />
            </div>
            {form.mode === 'json' && (
              <div>
                <label htmlFor="prompt">翻訳プロンプト</label>
                <textarea id="prompt" value={form.prompt} onChange={setField('prompt')} placeholder="空欄の場合はデフォルトの日本語翻訳プロンプトが使われます" />
                <p className="hint"><code>{'{TEXT}'}</code> が翻訳対象テキスト（JSON配列）に置換されます。</p>
              </div>
            )}
            <div className="actions">
              <button type="submit" className="primary">{editing ? '更新' : '保存'}</button>
              {editing && <button type="button" onClick={resetForm}>キャンセル</button>}
            </div>
          </form>
        </section>

        <p className="hint" style={{ textAlign: 'center' }}>
          ショートカット: <kbd>⌥A</kbd> 翻訳切替 ／ <kbd>⌥S</kbd> プロファイル切替（chrome://extensions/shortcuts で変更可能）
        </p>
      </main>
    </>
  );
}
