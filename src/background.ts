import type { Profile } from './types';

interface StorageState {
  profiles?: Profile[];
  activeProfileId?: string | null;
}

const DEFAULT_PROMPT = `あなたはプロの翻訳者です。以下のJSON配列に含まれる各テキストを日本語に翻訳してください。
翻訳結果はJSONオブジェクト {"translations": ["...", "..."]} 形式で返してください。配列の要素数・順序は入力と完全に一致させてください。
テキスト中のHTMLタグや改行はそのまま保持し、翻訳以外の説明は一切付けないでください。

テキスト:
{TEXT}`;

async function getStorage(): Promise<StorageState> {
  return (await chrome.storage.sync.get(['profiles', 'activeProfileId'])) as StorageState;
}

async function getActiveProfile(): Promise<Profile | null> {
  const { profiles = [], activeProfileId = null } = await getStorage();
  return profiles.find(p => p.id === activeProfileId) ?? profiles[0] ?? null;
}

async function translateOne(text: string, profile: Profile, signal?: AbortSignal): Promise<string> {
  const res = await fetch(buildUrl(profile), {
    method: 'POST',
    signal,
    headers: buildHeaders(profile),
    body: JSON.stringify({
      model: profile.model,
      messages: [
        { role: 'system', content: '[plamo-translate]\ntarget_lang=ja' },
        { role: 'user', content: text }
      ],
      temperature: 0,
      stop: ['<|plamo:tag|>', '<|plamo:bos|>']
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let hint = '';
    if (res.status === 403) {
      hint = '（403: サーバーが拡張機能からのリクエストを拒否しています。Ollamaの場合は環境変数 OLLAMA_ORIGINS="*" を設定して再起動してください）';
    }
    throw new Error(`API error ${res.status}: ${body.slice(0, 300)}${hint}`);
  }
  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('APIから応答が返りませんでした');
  return content.trim();
}

async function translateBatchPlamo(texts: string[], profile: Profile): Promise<string[]> {
  return Promise.all(texts.map(text => translateOne(text, profile)));
}

function buildUrl(profile: Profile): string {
  const base = profile.endpoint.replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : base + '/chat/completions';
}

function buildHeaders(profile: Profile): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (profile.apiKey) headers['Authorization'] = `Bearer ${profile.apiKey}`;
  return headers;
}

async function translateBatch(texts: string[], profile: Profile): Promise<string[]> {
  if (profile.mode === 'plamo') return translateBatchPlamo(texts, profile);
  const prompt = (profile.prompt || DEFAULT_PROMPT).replace('{TEXT}', JSON.stringify(texts));
  const res = await fetch(buildUrl(profile), {
    method: 'POST',
    headers: buildHeaders(profile),
    body: JSON.stringify({
      model: profile.model,
      messages: [
        { role: 'system', content: 'You are a translation engine. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let hint = '';
    if (res.status === 403) {
      hint = '（403: サーバーが拡張機能からのリクエストを拒否しています。Ollamaの場合は環境変数 OLLAMA_ORIGINS="*" を設定して再起動してください）';
    }
    throw new Error(`API error ${res.status}: ${body.slice(0, 300)}${hint}`);
  }

  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('APIから応答が返りませんでした');

  const translations = extractTranslations(content, texts.length);
  if (!translations) throw new Error('翻訳結果をJSONとして解析できませんでした: ' + content.slice(0, 200));
  return translations;
}

function extractTranslations(content: string, expected: number): string[] | null {
  const candidates = [content];
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1]);
  const braces = content.match(/\{[\s\S]*\}/);
  if (braces) candidates.push(braces[0]);

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      const arr = Array.isArray(parsed) ? parsed : parsed?.translations;
      if (Array.isArray(arr) && arr.every(t => typeof t === 'string')) {
        if (arr.length === expected) return arr;
        if (arr.length > 0) return arr.slice(0, expected);
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function runTranslateCommand(tabId: number): Promise<void> {
  const profile = await getActiveProfile();
  if (!profile) {
    chrome.tabs.sendMessage(tabId, { type: 'error', message: 'プロファイルが未設定です。オプション画面で設定してください。' }).catch(() => {});
    chrome.runtime.openOptionsPage().catch(() => {});
    return;
  }
  chrome.tabs.sendMessage(tabId, { type: 'toggle-translation', profile }).catch(() => {});
}

async function switchProfile(tabId: number): Promise<void> {
  const { profiles = [], activeProfileId = null } = await getStorage();
  if (profiles.length < 2) return;
  const idx = profiles.findIndex(p => p.id === activeProfileId);
  const next = profiles[(idx + 1 + profiles.length) % profiles.length];
  await chrome.storage.sync.set({ activeProfileId: next.id });
  chrome.tabs.sendMessage(tabId, { type: 'status', message: `プロファイル: ${next.name}` }).catch(() => {});
}

chrome.commands.onCommand.addListener(async (command: string) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === 'translate-page') {
    await runTranslateCommand(tab.id);
  } else if (command === 'switch-profile') {
    await switchProfile(tab.id);
  }
});

const MENU_ID_TRANSLATE = 'llmtr-translate';
const MENU_ID_PROFILE_PREFIX = 'llmtr-profile:';

async function refreshContextMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  const { profiles = [], activeProfileId = null } = await getStorage();

  chrome.contextMenus.create({
    id: MENU_ID_TRANSLATE,
    title: '🌐 このページをバイリンガル翻訳',
    contexts: ['page', 'selection', 'frame']
  });

  if (profiles.length > 0) {
    chrome.contextMenus.create({
      id: 'llmtr-profiles',
      title: '翻訳プロファイル',
      contexts: ['page', 'selection', 'frame']
    });
    for (const p of profiles) {
      chrome.contextMenus.create({
        id: MENU_ID_PROFILE_PREFIX + p.id,
        parentId: 'llmtr-profiles',
        title: (p.id === activeProfileId ? '● ' : '○ ') + p.name,
        contexts: ['page', 'selection', 'frame']
      });
    }
  }
}

chrome.runtime.onInstalled.addListener(() => { refreshContextMenus(); });
chrome.runtime.onStartup.addListener(() => { refreshContextMenus(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.profiles || changes.activeProfileId)) refreshContextMenus();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === MENU_ID_TRANSLATE) {
    await runTranslateCommand(tab.id);
  } else if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith(MENU_ID_PROFILE_PREFIX)) {
    const id = info.menuItemId.slice(MENU_ID_PROFILE_PREFIX.length);
    await chrome.storage.sync.set({ activeProfileId: id });
    const { profiles = [] } = await getStorage();
    const p = profiles.find(x => x.id === id);
    if (p) chrome.tabs.sendMessage(tab.id, { type: 'status', message: `プロファイル: ${p.name}` }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg: unknown, _sender: unknown, sendResponse: (res: unknown) => void) => {
  if (msg && typeof msg === 'object' && 'type' in msg) {
    if (msg.type === 'translate' && 'texts' in msg && 'profile' in msg) {
      const { texts, profile } = msg as { texts: string[]; profile: Profile };
      translateBatch(texts, profile)
        .then(translations => sendResponse({ ok: true, translations }))
        .catch((err: Error) => sendResponse({ ok: false, error: String(err?.message || err) }));
      return true;
    }
    if (msg.type === 'get-active-profile') {
      getActiveProfile().then(p => sendResponse({ ok: true, profile: p }));
      return true;
    }
  }
  return false;
});
