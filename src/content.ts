import type { Profile, ContentMessage, TranslateResponse } from './types';

const TRANSLATED_ATTR = 'data-llmtr-id';
const BATCH_SIZE = 15;
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, td, th, dd, dt, pre, div[dir="auto"]';
const MUTATION_DEBOUNCE_MS = 600;

let translating = false;
let nextId = 0;
let activeProfile: Profile | null = null;
let observer: MutationObserver | null = null;
let mutationTimer: number | undefined;
const originalTexts = new WeakMap<Element, string>();

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

function hasLayoutRisk(el: Element): boolean {
  const display = window.getComputedStyle(el).display;
  return display.includes('flex') || display.includes('grid') || display === 'table' || display === 'table-row';
}

function collectBlocks(): Element[] {
  const blocks: Element[] = [];
  const seen = new Set<Element>();
  const candidates = document.querySelectorAll(BLOCK_SELECTOR);
  for (const el of candidates) {
    if (seen.has(el)) continue;
    if (!isVisible(el) || isEditable(el) || isInsideTranslatedBlock(el)) continue;
    if (el.querySelector(BLOCK_SELECTOR)) continue;
    if (hasLayoutRisk(el)) continue;
    const text = (el as HTMLElement).innerText.trim();
    if (text.length < 2 || text.length > 5000) continue;
    if (!/[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF]/.test(text)) continue;
    seen.add(el);
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
      if (seen.has(el)) continue;
      if (!isVisible(el) || hasLayoutRisk(el)) continue;
      const text = (el as HTMLElement).innerText.trim();
      if (text.length >= 2 && text.length <= 5000) {
        seen.add(el);
        blocks.push(el);
      }
    }
  }
  return blocks;
}

function insertTranslation(block: Element, translatedText: string): void {
  const wrapper = document.createElement('span');
  wrapper.className = 'llmtr-translation';
  wrapper.textContent = translatedText;

  const originalColor = window.getComputedStyle(block).color;
  try {
    wrapper.style.color = `color-mix(in srgb, ${originalColor} 78%, #8a8a8a)`;
  } catch {
    wrapper.style.color = originalColor;
  }
  wrapper.style.whiteSpace = 'normal';
  wrapper.style.overflowWrap = 'anywhere';
  wrapper.addEventListener('animationend', () => {
    wrapper.style.animation = 'none';
  }, { once: true });

  block.appendChild(wrapper);
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

function invalidateChangedBlocks(): void {
  document.querySelectorAll(`[${TRANSLATED_ATTR}]`).forEach(el => {
    const stored = originalTexts.get(el);
    const current = (el as HTMLElement).innerText.replace(/\s*$/, '');
    if (stored !== undefined && stored !== current) {
      el.querySelectorAll('.llmtr-translation').forEach(t => t.remove());
      el.removeAttribute(TRANSLATED_ATTR);
      originalTexts.delete(el);
    }
  });
}

function isInViewport(el: Element): boolean {
  const rect = (el as HTMLElement).getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight;
}

function prioritizeByViewport(items: BlockItem[]): BlockItem[] {
  const inView: BlockItem[] = [];
  const rest: BlockItem[] = [];
  for (const item of items) {
    (isInViewport(item.el) ? inView : rest).push(item);
  }
  return [...inView, ...rest];
}

function pendingItems(): BlockItem[] {
  invalidateChangedBlocks();
  return collectBlocks()
    .filter(el => !el.hasAttribute(TRANSLATED_ATTR))
    .map(el => {
      const id = String(nextId++);
      el.setAttribute(TRANSLATED_ATTR, id);
      const text = (el as HTMLElement).innerText.trim();
      originalTexts.set(el, text);
      return { id, el, text };
    })
    .filter(i => i.text.length > 0);
}

async function processItems(items: BlockItem[], profile: Profile): Promise<{ done: number; failed: number }> {
  const ordered = prioritizeByViewport(items);
  let done = 0;
  let failed = 0;
  for (let i = 0; i < ordered.length; i += BATCH_SIZE) {
    const batch = ordered.slice(i, i + BATCH_SIZE);
    try {
      const translations = await translateBatch(batch, profile);
      batch.forEach((item, j) => {
        if (translations[j]) {
          insertTranslation(item.el, translations[j]);
          done++;
        } else {
          item.el.removeAttribute(TRANSLATED_ATTR);
        }
      });
    } catch (err) {
      failed += batch.length;
      batch.forEach(item => item.el.removeAttribute(TRANSLATED_ATTR));
      showBanner('翻訳エラー: ' + String(err instanceof Error ? err.message : err), true);
    }
  }
  return { done, failed };
}

function startObserver(): void {
  if (observer) return;
  observer = new MutationObserver(() => {
    if (!activeProfile) return;
    clearTimeout(mutationTimer);
    mutationTimer = window.setTimeout(async () => {
      if (translating || !activeProfile) return;
      const pending = pendingItems();
      if (pending.length === 0) return;
      translating = true;
      try {
        await processItems(pending, activeProfile);
      } finally {
        translating = false;
      }
    }, MUTATION_DEBOUNCE_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver(): void {
  observer?.disconnect();
  observer = null;
  clearTimeout(mutationTimer);
}

async function runTranslation(profile: Profile): Promise<void> {
  activeProfile = profile;
  const items = pendingItems();
  if (items.length === 0) {
    showBanner('翻訳できる新しいテキストがありません', false);
    startObserver();
    return;
  }

  showBanner(`翻訳中... (${items.length}ブロック / プロファイル: ${profile.name})`, false);
  const { done, failed } = await processItems(items, profile);
  if (done > 0) {
    showBanner(`翻訳完了: ${done}ブロック${failed ? ` / 失敗: ${failed}` : ''}`, false);
    startObserver();
  }
}

async function autoInit(): Promise<void> {
  if (document.querySelector('.llmtr-translation')) return;
  const { autoTranslateSites = [] } = (await chrome.storage.sync.get('autoTranslateSites')) as { autoTranslateSites?: string[] };
  if (!Array.isArray(autoTranslateSites) || !autoTranslateSites.includes(location.hostname)) return;

  const res = (await chrome.runtime.sendMessage({ type: 'get-active-profile' })) as { ok: boolean; profile: Profile | null } | undefined;
  if (!res?.ok || !res.profile) return;

  await new Promise(r => setTimeout(r, 800));
  if (translating || document.querySelectorAll('.llmtr-translation').length > 0) return;
  translating = true;
  runTranslation(res.profile)
    .catch(err => showBanner('翻訳エラー: ' + String(err instanceof Error ? err.message : err), true))
    .finally(() => { translating = false; });
}

autoInit();

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
        stopObserver();
        activeProfile = null;
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
