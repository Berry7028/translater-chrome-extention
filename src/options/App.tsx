import { useEffect, useState, type FormEvent } from 'react';
import type { Profile, TranslationMode } from '../types';
import { getProfiles, setActiveProfile, saveProfile, deleteProfile } from '../storage';

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

interface ProfileItemProps {
  profile: Profile;
  active: boolean;
  onUse: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ProfileItem({ profile, active, onUse, onEdit, onDelete }: ProfileItemProps) {
  return (
    <div className={`profile-item ${active ? 'active' : ''}`}>
      <span className="name">{profile.name}{active ? ' （使用中）' : ''}</span>
      <span className="meta">{profile.model} @ {profile.endpoint}</span>
      <button className="primary" disabled={active} onClick={onUse}>使用</button>
      <button onClick={onEdit}>編集</button>
      <button className="danger" onClick={onDelete}>削除</button>
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
      <h1>LLM Bilingual Translator 設定</h1>

      <h2>プロファイル</h2>
      <div className="profile-list">
        {profiles.length === 0 && (
          <div className="hint">プロファイルがありません。下のフォームから作成してください。</div>
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

      <h2>{editing ? 'プロファイル編集' : '新規プロファイル'}</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name">プロファイル名</label>
          <input id="name" required value={form.name} onChange={setField('name')} placeholder="例: 高品質モデル" />
        </div>
        <div>
          <label htmlFor="endpoint">エンドポイント（OpenAI互換）</label>
          <input id="endpoint" required value={form.endpoint} onChange={setField('endpoint')} placeholder="例: https://api.openai.com/v1" />
          <div className="hint">/chat/completions は自動補完されます。ローカル例: http://localhost:11434/v1（Ollama）</div>
        </div>
        <div>
          <label htmlFor="apiKey">APIキー</label>
          <input id="apiKey" type="password" value={form.apiKey} onChange={setField('apiKey')} placeholder="sk-..." />
          <div className="hint">認証不要なローカルLLMは空欄でOK。chrome.storage.sync に保存されます。</div>
        </div>
        <div>
          <label htmlFor="model">モデル名</label>
          <input id="model" required value={form.model} onChange={setField('model')} placeholder="例: gpt-4o-mini" />
        </div>
        <div>
          <label htmlFor="mode">翻訳モード</label>
          <select id="mode" value={form.mode} onChange={setField('mode')}>
            <option value="json">汎用LLM（JSON配列でバッチ翻訳）</option>
            <option value="plamo">PLaMo Translate（1テキストずつ翻訳）</option>
          </select>
          <div className="hint">PLaMo 3 Translate を使う場合は「PLaMo Translate」を選択してください（プロンプト欄は無視されます）。</div>
        </div>
        <div>
          <label htmlFor="prompt">翻訳プロンプト</label>
          <textarea id="prompt" value={form.prompt} onChange={setField('prompt')} placeholder="空欄の場合はデフォルトの日本語翻訳プロンプトが使われます" />
          <div className="hint"><code>{'{TEXT}'}</code> が翻訳対象テキスト（JSON配列）に置換されます。</div>
        </div>
        <div className="actions">
          <button type="submit" className="primary">保存</button>
          <button type="button" onClick={resetForm}>キャンセル</button>
        </div>
      </form>
    </>
  );
}
