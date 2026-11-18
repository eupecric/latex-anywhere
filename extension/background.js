/* LaTeX Anywhere v1.7.0 — one-click/keyboard restoration after hide. */
'use strict';

async function showState(tabId, enabled) {
  if (!Number.isInteger(tabId)) return;
  try {
    await chrome.action.setBadgeText({ tabId, text: enabled ? '' : 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#5B6473' });
    await chrome.action.setTitle({ tabId, title: enabled
      ? 'LaTeX Anywhere ativo — clique para ocultar neste site (Alt+Shift+L)'
      : 'LaTeX Anywhere oculto — clique para reativar neste site (Alt+Shift+L)' });
  } catch { /* Tab closed or restricted. */ }
}

async function toggleForTab(tabId) {
  if (!Number.isInteger(tabId)) return;
  try {
    // The top-frame content script owns the origin-scoped preference, so no
    // tab URL permissions are required and the toggle works even when hidden.
    const response = await chrome.tabs.sendMessage(tabId,
      { type: 'latex-anywhere:toggle' }, { frameId: 0 });
    if (response && typeof response.enabled === 'boolean') {
      await showState(tabId, response.enabled);
    }
  } catch {
    // Chrome-internal pages and sites with no content script can't be toggled.
    try { await chrome.action.setTitle({ tabId,
      title: 'Esta página não permite carregar a extensão. Abra um site comum.' }); }
    catch { /* ignored */ }
  }
}

chrome.action.onClicked.addListener(tab => { void toggleForTab(tab.id); });
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-latex-anywhere') return;
  if (tab?.id != null) { void toggleForTab(tab.id); return; }
  chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
    void toggleForTab(tabs[0]?.id);
  }).catch(() => {});
});

// Refresh badge when a content script starts or its site's state changes.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'latex-anywhere:state' && sender.frameId === 0) {
    void showState(sender.tab?.id, message.enabled);
  }
});
