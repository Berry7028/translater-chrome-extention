import type { Profile, ContentMessage, TranslateResponse } from './types';

const TRANSLATED_ATTR = 'data-llmtr-id';
const BATCH_SIZE = 15;
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, td, th, dd, dt, pre';

let translating = false;
let nextId = 0;

interface BlockItem {
  id: string;
  el: Element;
  text: string;
}

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = (el as HTMLElement).getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isEditable(el: Element): boolean {
  return !!el.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

function isInsideTranslatedBlock(el: Element): boolean {
  return !!el.closest(`[${TRANSLATED_ATTR}]`) || !!el.closest('.llmtr-translation');
}

function collectBlocks(): Element[] {
  const blocks: Element[] = [];
  const candidates = document.querySelectorAll(BLOCK_SELECTOR);
  for (const el of candidates) {
    if (!isVisible(el) || isEditable(el) || isInsideTranslatedBlock(el)) continue;
    if (el.querySelector(BLOCK_SELECTOR)) continue;
    const text = (el as HTMLElement).innerText.trim();
    if (text.length < 2 || text.length > 5000) continue;
    if (!/[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF]/.test(text)) continue;
    blocks.push(el);
  }
  if (blocks.length === 0) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const looseBlocks = new Set<Element>();
    let node = walker.nextNode();
    while (node) {
      const text = (node.textContent || '').trim();
      if (text.length >= 2 && node.parentElement) {
        const parent = node.parentElement;
        if (!isEditable(parent) && !isInsideTranslatedBlock(parent)) looseBlocks.add(parent);
      }
      node = walker.nextNode();
    }
    for (const el of looseBlocks) {
      if (isVisible(el) && (el as HTMLElement).innerText.trim().length >= 2) blocks.push(el);
    }
  }
  return blocks;
}

function insertTranslation(block: Element, translatedText: string): void {
  const wrapper = document.createElement('div');
  wrapper.className = 'llmtr-translation';
  wrapper.textContent = translatedText;
  const display = window.getComputedStyle(block).display;
  if (display.startsWith('inline')) {
    block.after(wrapper);
  } else {
    block.parentNode?.insertBefore(wrapper, block.nextSibling);
  }
}

async function translateBatch(items: BlockItem[], profile: Profile): Promise<string[]> {
  const texts = items.map(i => i.text);
  const response = (await chrome.runtime.sendMessage({ type: 'translate', texts, profile })) as TranslateResponse | undefined;
  if (!response?.ok) throw new Error(response?.error || '翻訳に失敗しました');
  return response.translations ?? [];
}

function showBanner(message: string, isError: boolean): void {
  const banner = document.createElement('div');
  banner.className = 'llmtr-banner' + (isError ? ' llmtr-banner-error' : '');
  banner.textContent = message;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 3000);
}

function removeAllTranslations(): void {
  document.querySelectorAll('.llmtr-translation').forEach(el => el.remove());
  document.querySelectorAll(`[${TRANSLATED_ATTR}]`).forEach(el => el.removeAttribute(TRANSLATED_ATTR));
}

async function runTranslation(profile: Profile): Promise<void> {
  const blocks = collectBlocks();
  if (blocks.length === 0) {
    showBanner('翻訳できるテキストが見つかりませんでした', true);
    return;
  }

  const items: BlockItem[] = blocks
    .filter(el => !el.hasAttribute(TRANSLATED_ATTR))
    .map(el => {
      const id = String(nextId++);
      el.setAttribute(TRANSLATED_ATTR, id);
      return { id, el, text: (el as HTMLElement).innerText.trim() };
    })
    .filter(i => i.text.length > 0);

  showBanner(`翻訳中... (${items.length}ブロック / プロファイル: ${profile.name})`, false);

  let done = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    try {
      const translations = await translateBatch(batch, profile);
      batch.forEach((item, j) => {
        if (translations[j]) insertTranslation(item.el, translations[j]);
        done++;
      });
    } catch (err) {
      failed += batch.length;
      batch.forEach(item => item.el.removeAttribute(TRANSLATED_ATTR));
      showBanner('翻訳エラー: ' + String(err instanceof Error ? err.message : err), true);
    }
  }

  if (done > 0) {
    showBanner(`翻訳完了: ${done}ブロック${failed ? ` / 失敗: ${failed}` : ''}`, false);
  }
}

chrome.runtime.onMessage.addListener((msg: unknown, _sender: unknown, sendResponse: (res: unknown) => void) => {
  if (msg && typeof msg === 'object' && 'type' in msg) {
    const message = msg as ContentMessage;
    if (message.type === 'toggle-translation') {
      if (translating) {
        sendResponse({ ok: false });
        return false;
      }
      if (document.querySelectorAll('.llmtr-translation').length > 0) {
        removeAllTranslations();
        sendResponse({ ok: true, removed: true });
        return false;
      }
      translating = true;
      runTranslation(message.profile)
        .catch(err => showBanner('翻訳エラー: ' + String(err instanceof Error ? err.message : err), true))
        .finally(() => { translating = false; });
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === 'error' || message.type === 'status') {
      showBanner(message.message, message.type === 'error');
    }
  }
  return false;
});
