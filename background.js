/**
 * Gemini Polish | Typography & Pro Diagramming · background service worker
 * - On install: seed default Reading Mode preset into storage
 * - On update: migrate a sync-only config from older builds into local
 * - On install/update: retrofit already-open Gemini tabs with the new CSS+JS
 *
 * Storage model: `chrome.storage.local` is the authoritative copy — it has no
 * write-rate quota, so slider drags can't throttle it into silent failure.
 * `chrome.storage.sync` is a best-effort cross-device mirror. Both carry
 * `updatedAt`; readers take whichever is newer.
 */

importScripts('/shared/config.js');

const { DEFAULT_CONFIG, mergeConfig } = self.GeminiPolishConfig;

const CSS_FILES = ['styles/mermaid.css', 'styles/actions.css'];
const JS_FILES = ['shared/config.js', 'shared/css-engine.js', 'shared/markdown.js',
                  'shared/mermaid-clean.js', 'lib/mermaid.min.js', 'content.js'];

chrome.runtime.onInstalled.addListener(async (details) => {
  // Runs on both install and update: an empty `local` means either a fresh
  // install (seed defaults) or an upgrade from a sync-only build (adopt sync).
  // Either way the user's existing config in `sync` takes precedence over the
  // defaults, so no setting is ever clobbered.
  const [localCfg, syncCfg] = await Promise.all([
    chrome.storage.local.get(null),
    chrome.storage.sync.get(null),
  ]);

  if (Object.keys(localCfg).length === 0) {
    /* mergeConfig fills defaults, runs the schema migrations and normalises the
       shape, so an upgrade from a sync-only build lands here already converted
       rather than needing the seeding code to know about old formats. */
    const seed = { ...mergeConfig(syncCfg), updatedAt: Date.now() };
    await chrome.storage.local.set(seed);
    if (details.reason === 'install') {
      // Give the mirror a starting point too, so a second device sees defaults.
      try { await chrome.storage.sync.set(seed); } catch (err) {
        console.warn('[Polish] sync seed failed:', err.message);
      }
    }
  }

  // Retrofit any already-open Gemini tabs (otherwise they need a manual reload).
  const tabs = await chrome.tabs.query({ url: '*://gemini.google.com/*' });
  for (const tab of tabs) {
    if (!tab.url || !tab.url.startsWith('http')) continue;
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: CSS_FILES });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: JS_FILES });
    } catch (err) {
      console.warn(`[Polish] skipping tab ${tab.id}: ${err.message}`);
    }
  }
});
