/*
 * LaTeX Anywhere v1.10.1 — persistent global and domain visibility controls.
 * Runs locally in Chrome's ISOLATED world; sends no data to any service.
 * By default, original field is only modified after Apply; live apply is opt-in.
 */
(() => {
  "use strict";

  if (globalThis.__latexAnywhereLoaded) return;
  globalThis.__latexAnywhereLoaded = true;

  const katex = globalThis.LatexAnywhereKaTeX;
  const formatter = globalThis.LatexAnywhereFormatting;
  const symbolCatalog = globalThis.LatexAnywhereCatalog;
  const markdown = globalThis.LatexAnywhereMarkdown;
  if (!katex || !formatter || !symbolCatalog || !markdown || !document.documentElement) return;

  let currentTarget = null;
  let modalTarget = null;
  let modalOpen = false;
  let previewVisibility = 'auto'; // auto | open | hidden
  let updateTimer = null;
  let storedLayout = { toolbar: null, preview: null, previewSize: null, formula: null, formulaSize: null, fullText: null, fullTextSize: null, shortcutsWindow: null, shortcutsSize: null, shortcuts: null, keyboardBindings: [], previewZoom: 100, modalZoom: 100, previewMode: 'auto', autoApply: false, applyMode: 'replace', toolbarMinimized: false, minimizedCorner: 'bottom-right' };
  let toolbarMinimized = false;
  let minimizedCorner = 'bottom-right';
  let showFullToolbarWithoutTarget = false;
  const toolbarCorners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const layoutKey = `latex-anywhere-layout-v1:${location.origin}`;
  let saveTimer = null;
  let previewZoom = 100;  // Percentage, affects only rendered preview.
  let modalZoom = 100;    // Independent percentage for the modal result pane.
  let lastPreviewText = null;
  let previewSourceTarget = null;
  let previewBaseText = '';
  let previewDraftText = '';
  let previewDirty = false;
  let previewEditingFormula = false;
  let activeFormulaEdit = null; // {mode:'inline'|'detached', field, token, originalRaw}
  let fullTextOpen = false; // Edits the entire raw source, keeps preview rendered/read-only.

  let previewConflict = false;
  let autoApply = false;
  let autoApplyTimer = null;
  let previewEnterInProgress = false;
  const extensionKeysDown = new Set(); // Never transfer focus while a key is held.
  let applyingToHost = false;
  let previewSoftBreakAtEnd = false;
  let previewIsComposing = false;
  let autoApplyPaused = false;
  let applyMode = 'replace'; // replace | insert
  let capturedCursor = null;
  let previewInsertSeed = '';
  let modalInitialValue = '';
  let modalChanged = false;
  const CURSOR_MARKER = '{{cursor}}';
  const SELECTION_MARKER = '{{selection}}';
  const DEFAULT_SHORTCUTS = [
    {id:'builtin-inline', label:'Inline', template:String.raw`\({{selection}}{{cursor}}\)`},
    {id:'builtin-block', label:'Multiline', template:String.raw`\[
{{selection}}{{cursor}}
\]`},
    {id:'builtin-align', label:'Align', template:String.raw`\begin{align}
{{selection}}{{cursor}}
\end{align}`}
  ];
  const cloneShortcuts = list => list.map(item => ({id:item.id, label:item.label, template:item.template}));
  let shortcuts = cloneShortcuts(DEFAULT_SHORTCUTS);
  let editingShortcuts = null; // local, cancelable draft
  let chosenShortcutId = null;
  let shortcutWindowOpen = false;
  // Fixed shortcuts never enter persistent settings, so users cannot rebind them.
  const FIXED_KEY_ACTIONS = Object.freeze({
    'Ctrl+B':'format:bold', 'Ctrl+I':'format:italic', 'Ctrl+U':'format:underline'
  });
  const KEYBOARD_FORMAT_ACTIONS = Object.freeze([
    ['format:bold','Negrito'], ['format:italic','Itálico'],
    ['format:underline','Sublinhado'], ['format:strike','Riscado'],
    ['format:blackboard','Dupla haste'], ['format:calligraphic','Caligráfico']
  ]);
  const RESERVED_KEY_COMBOS = new Set([
    'Ctrl+Enter','Ctrl+W','Ctrl+T','Ctrl+L','Ctrl+R','Ctrl+P',
    'Ctrl+S','Ctrl+N','Ctrl+O','Ctrl+J','Ctrl+H','Ctrl+F',
    'Ctrl+Shift+I','Ctrl+Shift+J','Ctrl+Shift+C',
    'Ctrl+Shift+N','Ctrl+Shift+E','Ctrl+Shift+W',
    'Alt+Shift+L','Alt+Shift+M','Ctrl+Shift+E'
  ]);
  // Stable identifiers for catalog actions. A binding continues to point to the
  // same LaTeX even if an item is moved to another category in future releases.
  const catalogActions = new Map();
  function catalogActionId(item) {
    const source = `${item.command}\0${item.template === true}\0${item.display === true}`;
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) {
      hash = Math.imul(hash ^ source.charCodeAt(i), 16777619) >>> 0;
    }
    return `catalog:${hash.toString(16).padStart(8, '0')}`;
  }
  for (const group of symbolCatalog.groups) {
    for (const section of group.sections) {
      for (const item of section.items) {
        const id = catalogActionId(item);
        if (!catalogActions.has(id)) catalogActions.set(id, {item, category:group.title});
      }
    }
  }
  let keyboardBindings = [];
  let pendingKeyBindings = null;
  let keyboardWindowOpen = false;

  // Persistent global and hostname-scoped visibility preferences. The older
  // per-origin key remains readable as a migration fallback until the user
  // explicitly chooses a value for the new domain key.
  const globalVisibilityKey = 'latex-anywhere-visibility-v2:global-hidden';
  // A frame uses the embedding page's site when Chrome exposes its origin,
  // preventing cross-origin iframes from bypassing a domain-level hide.
  const topSiteOrigin = location.ancestorOrigins?.length
    ? location.ancestorOrigins[location.ancestorOrigins.length - 1] : location.origin;
  let pageHostname = location.hostname;
  try { pageHostname = new URL(topSiteOrigin).hostname || pageHostname; }
  catch { /* file:// and opaque origins keep the local fallback. */ }
  const normalizedHost = location.protocol === 'file:' ? 'local-files'
    : (pageHostname.toLowerCase().replace(/^www\./, '') || location.origin);
  const domainVisibilityKey = `latex-anywhere-visibility-v2:domain-hidden:${normalizedHost}`;
  const legacyEnabledKey = `latex-anywhere-enabled-v1:${location.origin}`;
  let globalHidden = false;
  let domainHidden = false;
  let extensionEnabled = true;
  let visibilityReady = false;
  let visibilityRevision = 0;
  let visibilityLoadId = 0;
  const inViewport = (v, max) => Math.max(8, Math.min(Math.max(8, max - 8), v));
  const normalizedZoom = value => value === null || value === undefined || value === ''
    ? 100 : (Number.isFinite(Number(value))
      ? Math.max(50,Math.min(250,Math.round(Number(value)/10)*10)) : 100);

  // Only the site origin and UI geometry are stored (never text, LaTeX or clipboard contents).
  async function loadLayout() {
    try {
      if (!chrome?.storage?.local) return;
      const values = await chrome.storage.local.get(layoutKey);
      const val = values[layoutKey];
      if (!val || typeof val !== 'object') return;
      function validXY(obj) { return obj && Number.isFinite(obj.x) && Number.isFinite(obj.y) ? { x:obj.x, y:obj.y } : null; }
      storedLayout.toolbar = validXY(val.toolbar);
      toolbarMinimized = val.toolbarMinimized === true;
      storedLayout.toolbarMinimized = toolbarMinimized;
      minimizedCorner = toolbarCorners.includes(val.minimizedCorner) ? val.minimizedCorner : 'bottom-right';
      storedLayout.minimizedCorner = minimizedCorner;
      renderToolbarMode();
      storedLayout.preview = validXY(val.preview);
      storedLayout.formula = validXY(val.formula);
      storedLayout.fullText = validXY(val.fullText);
      storedLayout.shortcutsWindow = validXY(val.shortcutsWindow);
      if (val.shortcutsSize && Number.isFinite(val.shortcutsSize.width) && Number.isFinite(val.shortcutsSize.height)) {
        storedLayout.shortcutsSize = {width:val.shortcutsSize.width, height:val.shortcutsSize.height};
      }
      if (Array.isArray(val.shortcuts)) {
        // Persistent configuration is treated as untrusted input, never executable markup.
        const ids = new Set();
        const safe = [];
        for (const value of val.shortcuts.slice(0,25)) {
          if (!value || typeof value !== 'object') continue;
          const id = typeof value.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value.id) ? value.id : '';
          const label = typeof value.label === 'string' ? value.label.trim() : '';
          const template = typeof value.template === 'string' ? value.template : '';
          if (!id || ids.has(id) || !label || label.length > 40 || !template.trim() || template.length > 8000) continue;
          ids.add(id); safe.push({id,label,template});
        }
        if (safe.length || val.shortcuts.length === 0) shortcuts = safe;
        storedLayout.shortcuts = cloneShortcuts(shortcuts);
        renderShortcutButtons();
      }

      if (Array.isArray(val.keyboardBindings)) {
        const seen = new Set();
        keyboardBindings = [];
        for (const item of val.keyboardBindings.slice(0,25)) {
          const key = typeof item?.key === 'string' ? item.key : '';
          const action = typeof item?.action === 'string' ? item.action : '';
          if (!isCustomKeyAllowed(key) || !isValidKeyboardAction(action) || seen.has(key)) continue;
          seen.add(key);
          keyboardBindings.push({key, action});
        }
        storedLayout.keyboardBindings = keyboardBindings.map(item=>({...item}));
      }

      if (val.fullTextSize && Number.isFinite(val.fullTextSize.width) && Number.isFinite(val.fullTextSize.height)) {
        storedLayout.fullTextSize = { width:val.fullTextSize.width, height:val.fullTextSize.height };
      }
      if (val.formulaSize && Number.isFinite(val.formulaSize.width) && Number.isFinite(val.formulaSize.height)) {
        storedLayout.formulaSize = { width:val.formulaSize.width, height:val.formulaSize.height };
      }
      autoApply = val.autoApply === true;
      autoApplyCheckbox.checked = autoApply;
      storedLayout.autoApply = autoApply;
      applyMode = val.applyMode === 'insert' ? 'insert' : 'replace';
      storedLayout.applyMode = applyMode;
      peekModeSelect.value = applyMode;
      modalModeSelect.value = applyMode;
      updateAutoApplyAvailability();
      // A manually opened preview is sticky even after switching editors or reloading this site.
      // A manual close is session-scoped; automatic detection returns on next field/reload.
      if (val.previewMode === 'open' && previewVisibility === 'auto') previewVisibility = 'open';
      storedLayout.previewMode = previewVisibility === 'open' ? 'open' : 'auto';
      if (val.previewSize && Number.isFinite(val.previewSize.width) && Number.isFinite(val.previewSize.height)) {
        storedLayout.previewSize = { width:val.previewSize.width, height:val.previewSize.height };
      }
      previewZoom = normalizedZoom(val.previewZoom);
      modalZoom = normalizedZoom(val.modalZoom);
      storedLayout.previewZoom = previewZoom;
      storedLayout.modalZoom = modalZoom;
      applyVisualZoom();
      applyPreviewSize();
      applyFormulaSize();
      applyFullTextSize();
      applyShortcutWindowSize();
      placeUI();
    } catch { /* Storage may be unavailable on restricted pages. */ }
  }
  function setPreviewVisibility(mode) {
    previewVisibility = mode;
    storedLayout.previewMode = mode === 'open' ? 'open' : 'auto';
    saveLayout();
  }
  function saveLayout() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { chrome?.storage?.local?.set({ [layoutKey]: storedLayout }).catch(() => {}); } catch { /* ignored */ }
    }, 150);
  }

  const host = document.createElement("div");
  host.id = "latex-anywhere-root";
  host.setAttribute("data-latex-anywhere", "1");
  host.style.cssText = "position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;display:none";
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; color-scheme: light dark; --la-bg:#fff; --la-fg:#172033;
      --la-muted:#667084; --la-line:#dfe4ea; --la-accent:#3759df; --la-soft:#f2f5fb;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }
    button, textarea, input, select { font: inherit; }
    button { cursor:pointer; }
    button:focus-visible, textarea:focus-visible, input:focus-visible, [contenteditable]:focus-visible { outline:3px solid #9ab3ff; outline-offset:2px; }
    .la-hidden { display:none !important; }
    .la-toolbar { position:fixed; pointer-events:auto; z-index:5; display:flex; align-items:center;
      border:1px solid #cbd5f4; background:#fff; color:#253b9b; border-radius:12px;
      box-shadow:0 5px 22px #19244b1c; padding:3px; gap:3px; white-space:nowrap; }
    .la-toolbarbutton { border:0; border-radius:8px; padding:0 9px; min-height:30px; display:inline-flex;
      align-items:center; justify-content:center; gap:5px; font:750 12px/1 system-ui,-apple-system,sans-serif;
      vertical-align:middle; background:transparent; color:inherit; white-space:nowrap; }
    .la-toolbarbutton .la-icon { display:block; width:15px; height:15px; flex:0 0 15px; overflow:visible; }
    .la-toolbarbutton .la-button-label { display:block; line-height:1; }
    .la-toolbarbutton:hover, .la-toolbarbutton[aria-pressed="true"] { background:#eaf0ff; }
    .la-visibility-menu {position:fixed;z-index:15;pointer-events:auto;display:flex;
      flex-direction:column;gap:3px;min-width:260px;max-width:calc(100vw - 16px);
      padding:6px;border:1px solid #cbd5e6;border-radius:12px;background:#fff;
      box-shadow:0 14px 38px #1c2b4d35;color:#24334b;font:12px/1.4 system-ui,sans-serif;}
    .la-visibility-option {display:block;width:100%;text-align:left;border:0;border-radius:8px;
      background:transparent;color:#24334b;padding:10px 12px;font-weight:700;}
    .la-visibility-option:hover,.la-visibility-option:focus-visible {background:#ebf1ff;}
    .la-visibility-hint {padding:5px 10px 7px;color:#69748c;font-size:11px;}
    .la-toolbar.la-mini-mode { padding:6px 8px; border-radius:12px; }
    .la-toolbar.la-mini-mode > .la-grip,
    .la-toolbar.la-mini-mode > .la-toolbarbutton { display:none; }
    .la-mini-controls { display:flex; align-items:center; gap:9px; }
    .la-mini-controls .la-toolbarbutton { padding:0 7px; }
    .la-corner-grid { display:grid; grid-template-columns:repeat(2,14px);
      grid-template-rows:repeat(2,14px); gap:5px; align-items:center; justify-content:center; }
    .la-corner-choice { display:block; width:14px; height:14px; padding:0;
      border:2px solid #6075ab; background:transparent; border-radius:2px;
      cursor:pointer; }
    .la-corner-choice[aria-pressed="true"] { background:#3759df; border-color:#3759df; }
    .la-corner-choice:hover { border-color:#2549d8; box-shadow:0 0 0 2px #c3d0ff; }
    .la-corner-choice:focus-visible { outline:2px solid #7499ff; outline-offset:2px; }

    .la-toolbarbutton:focus-visible, .la-grip:focus-visible, .la-resize:focus-visible {
      outline:2px solid #7499ff; outline-offset:1px; }
    .la-grip { display:grid; place-items:center; border:0; background:transparent; color:#7a8bb3;
      width:23px; min-height:30px; padding:0 4px; border-radius:7px; cursor:grab;
      touch-action:none; user-select:none; font-size:17px; line-height:1; }
    .la-grip:hover { background:#eff2fc; color:#2d4290; }
    .la-grip:active { cursor:grabbing; }
    .la-peek { position:fixed; z-index:4; pointer-events:auto;
      width:682px; height:260px; min-width:min(682px, calc(100vw - 16px)); min-height:135px;
      display:flex; flex-direction:column; overflow:hidden; border:1px solid #dbe2ee;
      background:#fff; color:#172033; border-radius:16px; box-shadow:0 16px 44px #0c1c3a2a; }
    .la-peek-dragarea { display:flex; align-items:center; gap:8px; min-width:0;
      cursor:grab; user-select:none; touch-action:none; flex:1; }
    .la-peek-dragarea:active { cursor:grabbing; }
    .la-resize { position:absolute; right:1px; bottom:1px; border:0;
      width:24px; height:24px; color:#677890; cursor:nwse-resize;
      background:transparent; display:grid; place-items:center; font-size:19px;
      touch-action:none; user-select:none; border-bottom-right-radius:13px; }
    .la-resize:hover { background:#eef1f9; }
    .la-peekhead { display:flex; align-items:center; justify-content:space-between; gap:12px;
      padding:7px 9px; border-bottom:1px solid #e8ecf3; background:#fff; flex-shrink:0; }
    .la-peektitle { font-size:12px; font-weight:800; letter-spacing:.01em; }
    .la-headbuttons { display:flex; align-items:center; gap:6px; }
    .la-mini { border:0; background:#eef1f9; color:#344368; border-radius:7px; padding:5px 9px; font-size:11px; font-weight:650; }
    .la-mini:hover { background:#dce4f8; }
    .la-shortcuts { display:flex; align-items:center; gap:7px; flex-wrap:wrap;
      padding:6px 10px; background:#f8faff; border-bottom:1px solid #e6ebf6;
      flex:0 0 auto; font-size:11px; line-height:1.3; color:#566582; }
    .la-shortcuts-title { font-weight:760; white-space:nowrap; margin-right:2px; }
    .la-shortcut { border:1px solid #cbd7ef; background:#fff; color:#243f93;
      border-radius:7px; padding:5px 9px; cursor:pointer; font:680 11px/1.25 system-ui,sans-serif;
      display:inline-flex; align-items:center; gap:6px; }
    .la-shortcut:hover { border-color:#7591dc; background:#edf3ff; }
    .la-shortcut-items { display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width:0; }
    .la-shortcut-actions { display:flex; align-items:center; gap:6px; margin-left:auto;
      flex-shrink:0; white-space:nowrap; }
    .la-shortcut code { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:125px; }
    .la-shortcut-edit { border:1px solid #bdcbed; background:#eef3ff;
      color:#2745ac; padding:5px 9px; border-radius:7px; font:700 11px system-ui,sans-serif;
      white-space:nowrap; }
    .la-shortcut-edit:hover { background:#dce7ff; }

    .la-shortcutwindow { position:fixed; z-index:9; pointer-events:auto; display:flex; flex-direction:column;
      width:690px; height:440px; min-width:300px; min-height:240px; max-width:calc(100vw - 16px);
      max-height:calc(100vh - 16px); border:1px solid #b8c9f3; border-radius:14px;
      background:#fff; color:#172033; overflow:hidden; box-shadow:0 18px 48px #0c1c3a43; }
    .la-schead { display:flex; align-items:center; gap:8px; padding:8px 10px;
      border-bottom:1px solid #e6ebf5; flex-shrink:0; }
    .la-scdrag { display:flex; flex:1; align-items:center; gap:7px; cursor:grab;
      user-select:none; touch-action:none; min-width:0; }
    .la-sctitle { font-size:12px; font-weight:800; }
    .la-scmain { display:grid; grid-template-columns:minmax(170px, .84fr) minmax(220px, 1.4fr);
      min-height:0; flex:1; overflow:hidden; }
    .la-sclistpane { min-width:0; overflow:auto; padding:10px; border-right:1px solid #e6ebf5;
      display:flex; flex-direction:column; gap:8px; }
    .la-sclist { display:flex; flex-direction:column; gap:5px; overflow:auto; }
    .la-scrow { display:flex; align-items:center; gap:4px; min-width:0; }
    .la-scpick { background:#f2f5fb; border:1px solid transparent; border-radius:7px;
      flex:1; min-width:0; padding:7px 8px; text-align:left; color:#283855;
      font:650 12px/1.25 system-ui,sans-serif; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .la-scpick[aria-current='true'] { border-color:#8aa3ed; background:#e9f0ff; color:#243f93; }
    .la-scsmall { background:#f2f5fb; border:0; border-radius:7px; padding:6px 7px;
      color:#37466b; font:700 12px system-ui,sans-serif; flex-shrink:0; }
    .la-scsmall:disabled { opacity:.4; cursor:default; }
    .la-scform { display:flex; flex-direction:column; min-width:0; min-height:0; overflow:auto; padding:11px 13px; gap:8px; }
    .la-sclabel { font:700 11px system-ui,sans-serif; color:#344368; }
    .la-scinput, .la-sctemplate { border:1px solid #cbd7ef; border-radius:8px;
      padding:8px 9px; background:#fff; color:#172033; font:13px/1.45 ui-monospace,Consolas,monospace;
      outline:none; min-width:0; }
    .la-scinput:focus, .la-sctemplate:focus { border-color:#6687db; box-shadow:0 0 0 2px #c4d4ff; }
    .la-sctemplate { flex:1; min-height:105px; white-space:pre-wrap; overflow-wrap:anywhere;
      resize:none; overflow:auto; }
    .la-schelp { font-size:11px; line-height:1.4; color:#5f6e86; }
    .la-schelp code { color:#243f93; background:#eef3ff; padding:1px 3px; border-radius:3px; }
    .la-scmarkerrow { display:flex; flex-wrap:wrap; gap:6px; }
    .la-scfoot { display:flex; flex-wrap:wrap; gap:6px; align-items:center; justify-content:space-between;
      border-top:1px solid #e6ebf5; padding:8px 30px 8px 10px; flex-shrink:0; }
    .la-scstatus { font-size:11px; color:#657186; flex:1; min-width:160px; }
    .la-scstatus.la-warning { color:#a04523; }
    .la-scactions { display:flex; flex-wrap:wrap; gap:6px; }
    .la-scprimary { background:#3158e5; color:#fff; border:0; border-radius:7px;
      padding:7px 10px; font-size:11px; font-weight:700; }
    @media(max-width:630px) { .la-scmain { grid-template-columns:1fr; grid-template-rows:minmax(90px, 38%) minmax(130px, 62%); }
      .la-sclistpane { border-right:0; border-bottom:1px solid #e6ebf5; } }

    .la-shortcut code { font:600 11px ui-monospace,SFMono-Regular,Consolas,monospace; }

    /* Accessible, keyboard-operable WYSIWYG-style math formatting controls. */
    .la-formatbar { flex:0 0 auto; display:flex; align-items:center; flex-wrap:wrap;
      gap:5px; padding:5px 10px; background:#fff; border-bottom:1px solid #e7ebf2;
      color:#334466; min-height:36px; }
    /* The preview formatting toolbar never wraps. Compact windows scroll the toolbar
       horizontally instead of losing editable area to multiple rows. */
    .la-peek > .la-formatbar { flex-wrap:nowrap; overflow-x:auto; overflow-y:hidden;
      scrollbar-width:thin; }
    .la-peek > .la-formatbar > * { flex:0 0 auto; }
    /* Chromium MathML Core ignores some MathML font variants/menclose styles.
       These presentation-only rules do not alter source LaTeX. */
    .katex math mtext[mathvariant="bold"], .katex math mi[mathvariant="bold"] {
      font-weight:800 !important; font-style:normal !important; }
    .katex math mtext[mathvariant="italic"], .katex math mi[mathvariant="italic"] {
      font-style:italic !important; }
    .katex math munder[accentunder="true"], .katex math munder[accentunder="true"] > :first-child {
      text-decoration:underline !important; text-decoration-thickness:1.5px !important; }
    .katex math menclose[notation~="updiagonalstrike"] {
      text-decoration:line-through !important; text-decoration-thickness:1.5px !important; }
    .katex math mi[mathvariant="normal"] { font-style:normal !important; }
    /* Give longer math names their own space; never overflow palette tiles. */
    .la-symbols-popup { position:fixed; z-index:18; pointer-events:auto; width:min(520px, calc(100vw - 20px));
      max-height:min(465px,calc(100vh - 20px)); overflow-y:auto; border:1px solid #bccbf0;
      background:#fff; color:#233147; border-radius:12px; box-shadow:0 12px 40px #12234b44;
      font:12px/1.4 system-ui,sans-serif; padding:0 12px 12px; }
    .la-symbols-head { position:sticky;top:0; background:inherit; display:flex; align-items:center;
      justify-content:space-between; gap:8px; padding:11px 0 8px; z-index:1; border-bottom:1px solid #e5eaf2; }
    .la-symbols-heading {font-weight:750;font-size:13px;}
    .la-symbols-close { border:0; background:#eff2fb; border-radius:7px; padding:4px 8px; color:#41537b; }
    .la-symbols-label {font-weight:650; color:#5a6e92; margin:12px 0 6px;}
    .la-symbols-grid { display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:5px; }
    .la-symbols-item {padding:4px 2px; border:1px solid #d5def0; border-radius:7px;
      background:#f8faff; color:#213b82; height:35px;font:21px/1 serif; }
    .la-symbols-item:hover,.la-symbols-item:focus-visible {background:#e5eeff;border-color:#7699e8;}
    .la-symbols-hint {font-size:11px;color:#68748a;margin-top:9px;}
    .la-symbols-search { display:block;width:100%;box-sizing:border-box;margin:9px 0 8px;
      padding:8px;border:1px solid #c8d6f0;border-radius:8px;background:#fff;color:#172c56;
      font:12px system-ui,sans-serif;outline-offset:1px; }
    .la-symbols-categories {display:flex;gap:5px;overflow-x:auto;white-space:nowrap;padding:3px 0 9px;}
    .la-symbols-category {flex-shrink:0;padding:5px 8px;border:1px solid #d1ddf1;border-radius:7px;
      background:#f8faff;color:#344b7f;font:650 11px system-ui,sans-serif;cursor:pointer;}
    .la-symbols-category[aria-pressed="true"] {background:#2855da;color:white;border-color:#2855da;}
    .la-symbols-section {margin-top:8px;}
    .la-symbols-item { box-sizing:border-box; display:flex; align-items:center; justify-content:center;
      width:100%; min-width:0; min-height:66px; height:auto; flex-direction:column; gap:5px;
      overflow:hidden; padding:7px 4px; }
    .la-symbol-icon {display:block; box-sizing:border-box; width:100%; max-width:100%;
      font:600 21px/1.2 system-ui,'Segoe UI',sans-serif;
      text-align:center; white-space:nowrap; overflow:visible; }
    .la-symbol-icon.la-symbol-medium {font-size:17px;}
    .la-symbol-icon.la-symbol-long {font-size:13px; font-family:system-ui,sans-serif; letter-spacing:-.04em;}
    .la-symbol-command {display:block; box-sizing:border-box; width:100%; min-width:0;
      font:9px/1.15 ui-monospace,Consolas,monospace; text-align:center;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .la-symbols-grid {grid-template-columns:repeat(auto-fit,minmax(min(86px,100%),1fr)); gap:7px;}
    .la-symbol-context { position:fixed; z-index:35; pointer-events:auto; display:flex;
      flex-direction:column; gap:3px; min-width:190px; max-width:min(280px,calc(100vw - 16px));
      padding:5px; box-sizing:border-box; border-radius:10px; border:1px solid #d0d9ed;
      box-shadow:0 10px 35px #16294a3d; background:#fff; color:#233960;
      font:12px/1.35 system-ui,sans-serif; }
    .la-symbol-context-title { color:#63738c; font:700 10px/1.3 system-ui,sans-serif;
      padding:4px 8px 5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .la-symbol-context-action { cursor:pointer; background:transparent; color:inherit;
      border:0; border-radius:6px; padding:9px 10px; text-align:left;
      font:650 12px/1.2 system-ui,sans-serif; }
    .la-symbol-context-action:hover, .la-symbol-context-action:focus-visible {
      background:#edf3ff; outline:1px solid #bfceef; }
    /* MathML's baseline for indexed radicals is slightly low with some Chromium fonts.
       Keep the whole formula on the text baseline with a small optical correction. */
    .la-preview .la-equation .katex math, .la-math-token .katex math,
    .la-modalpreview .la-equation .katex math { font-family:'STIX Math','Cambria Math',
      'Noto Sans Math','DejaVu Math TeX Gyre',serif; vertical-align:.06em; }
    .la-preview .la-equation:has(msqrt, mroot), .la-math-token:has(msqrt, mroot) {
      vertical-align:baseline; }

    .la-zoom-controls { display:inline-flex; align-items:center; gap:2px; border:1px solid #d6def0;
      border-radius:8px; padding:2px; flex:0 0 auto; background:#f8faff; color:#294681; }
    .la-zoom-button { background:transparent; color:inherit; border:0; border-radius:5px;
      min-width:22px; height:22px; font:750 15px/1 system-ui,sans-serif; cursor:pointer; }
    .la-zoom-button:hover, .la-zoom-button:focus-visible { background:#e2eafd; }
    .la-zoom-value { background:transparent; color:inherit; border:0; border-radius:5px;
      cursor:pointer; font:700 10px system-ui,sans-serif; min-width:42px; height:22px; padding:0 2px; }
    .la-zoom-title-controls { display:inline-flex; gap:6px; align-items:center; margin-left:auto; }
    .la-fontsize-label { display:inline-flex; align-items:center; gap:4px; white-space:nowrap;
      color:#294681; font:650 11px system-ui,sans-serif; }
    .la-fontsize-select { border:1px solid #d5deef; border-radius:6px; height:27px;
      padding:2px 5px; max-width:140px; min-width:92px; background:#f8faff;
      color:#233d85; font:650 11px system-ui,sans-serif; cursor:pointer; }
    .la-fontsize-select:focus-visible { outline:2px solid #7399ee; outline-offset:1px; }
    .la-format-divider {height:20px;border-left:1px solid #d8dfef;margin:0 2px;}
    .la-format-quick {min-width:34px; font:700 12px system-ui,sans-serif;}
    @media(max-width:400px){.la-symbols-grid{grid-template-columns:repeat(auto-fit,minmax(min(72px,100%),1fr));}}
    .la-format-button { display:inline-flex; align-items:center; justify-content:center; min-width:29px;
      height:27px; padding:3px 7px; border-radius:6px; border:1px solid #d5deef;
      font:700 12px/1.1 system-ui,sans-serif; background:#f8faff; color:#233d85; }
    .la-format-button:hover { background:#e8f0ff; border-color:#7895df; }
    .la-format-button:focus-visible { outline:2px solid #7399ee; outline-offset:1px; }
    .la-format-italic { font-style:italic; }
    .la-format-under { text-decoration:underline; }
    .la-format-strike { text-decoration:line-through; }
    .la-format-color { display:inline-flex; gap:4px; align-items:center; font:650 11px system-ui,sans-serif;
      border:1px solid #d5deef; padding:2px 6px; border-radius:7px; background:#f8faff; color:#233d85; }
    .la-format-swatch { width:24px; height:23px; border:0; padding:0; background:transparent; cursor:pointer; }
    .la-math-decision { position:fixed; inset:0; z-index:20; pointer-events:auto;
      display:grid; place-items:center; background:#10234288; padding:12px; }
    .la-decision-card { width:min(440px,calc(100vw - 24px)); background:#fff; color:#162339;
      border:1px solid #bac9ee; border-radius:14px; box-shadow:0 22px 55px #0b1e3655;
      padding:17px; display:flex; flex-direction:column; gap:12px; font:13px/1.5 system-ui,sans-serif; }
    .la-decision-card h3 { margin:0; font:800 15px system-ui,sans-serif; }
    .la-decision-card p { margin:0; color:#43516b; }
    .la-decision-card code { color:#2549b2; overflow-wrap:anywhere; }
    .la-decision-actions { display:flex; flex-wrap:wrap; gap:7px; justify-content:flex-end; }
    .la-decision-actions button { border:1px solid #bdcbed; border-radius:7px;
      padding:8px 10px; font:700 11px system-ui,sans-serif; background:#f2f5fc; color:#263d81; }
    .la-decision-actions .la-decision-primary { background:#3158e5; color:#fff; border-color:#3158e5; }

    .la-preview { white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.4; font-size:14px;
      padding:9px 12px 16px; color:#172033; flex:1; min-height:0; overflow:auto; }
    .la-preview .la-equation { display:inline; vertical-align:baseline; }
    .la-editable-preview { outline:none; cursor:text; white-space:pre-wrap; }
    /* Markdown is rendered from safe DOM nodes. The original Markdown source
       always remains in data-markdown-raw, never converted to HTML on apply. */
    .la-markdown-node { white-space:normal; overflow-wrap:anywhere; }
    .la-markdown-node h1, .la-markdown-node h2, .la-markdown-node h3,
    .la-markdown-node h4, .la-markdown-node h5, .la-markdown-node h6 {
      font-weight:800; line-height:1.25; margin:5px 0; }
    .la-markdown-node h1 { font-size:1.65em; }
    .la-markdown-node h2 { font-size:1.4em; }
    .la-markdown-node h3 { font-size:1.18em; }
    .la-markdown-node p { margin:0; }
    .la-markdown-node blockquote { border-left:3px solid #97a9d6; padding:4px 10px;
      color:#55627d; margin:4px 0; }
    .la-markdown-node ul, .la-markdown-node ol { margin:4px 0; padding-left:1.6em; }
    .la-markdown-node li { margin:2px 0; }
    .la-markdown-node pre { margin:5px 0; padding:9px; overflow-x:auto;
      background:#eff2f8; border-radius:6px; white-space:pre; }
    .la-markdown-node code { padding:1px 3px; background:#eef2f8; border-radius:3px;
      font-family:ui-monospace,Consolas,monospace; font-size:.92em; }
    .la-markdown-node pre code { padding:0; background:transparent; }
    .la-markdown-node table { border-collapse:collapse; margin:5px 0; }
    .la-markdown-node th, .la-markdown-node td { border:1px solid #bdc9df;
      padding:4px 7px; text-align:left; }
    .la-markdown-node a { color:#2455bc; text-decoration:underline; }
    .la-markdown-token { display:inline-block; max-width:100%; vertical-align:baseline;
      background:#f1f5ff; border-radius:4px; cursor:text;
      outline:1px solid transparent; user-select:all; }
    .la-markdown-token:hover, .la-markdown-token:focus-visible {
      outline-color:#94adea; background:#e7efff; }
    .la-markdown-token.la-markdown-block { display:block; width:max-content;
      max-width:100%; margin:3px 0; }
    .la-markdown-source { display:inline-block; width:auto; max-width:100%;
      background:#f7f9ff; color:#1d3064; border:1px solid #95afe9; border-radius:5px;
      padding:4px 6px; font:13px/1.45 ui-monospace,Consolas,monospace; }
    textarea.la-markdown-source { display:block; width:min(100%,70ch); min-width:200px;
      min-height:75px; resize:both; white-space:pre-wrap; overflow-wrap:anywhere; }
    .la-editable-preview:focus { outline: 2px solid #b4c8f8; outline-offset: -2px; }
    .la-editable-preview:empty::before { content:attr(data-placeholder); color:#8590a3; pointer-events:none; }
    .la-math-token { display:inline-block; vertical-align:baseline; border-radius:5px;
      padding:1px 3px; margin:0 1px; background:#f1f4ff; cursor:text;
      outline:1px solid transparent; user-select:all; }
    .la-math-token:hover, .la-math-token:focus-visible { outline-color:#94adea; background:#e8eeff; }
    .la-math-token.la-display { display:block; text-align:center; margin:5px 0; padding:3px 4px; }
    .la-math-source { display:inline-block; vertical-align:baseline; border:1px solid #86a2ff; outline:0;
      background:#f5f7ff; color:#1c2f68; border-radius:5px; padding:3px 5px;
      font: 13px/1.3 ui-monospace, Consolas, monospace; max-width:100%; min-width:85px; }

    /* Block math and any formula containing line breaks must be edited using a
       real textarea: input[type=text] silently strips newline characters. */
    .la-math-source-multiline { display:block; box-sizing:border-box; resize:both;
      width:min(100%, 66ch); min-width:min(220px, 100%); min-height:66px;
      max-width:100%; max-height:45vh; white-space:pre; overflow:auto;
      padding:7px 9px; margin:5px 0; line-height:1.5; tab-size:2; }

    /* Separate formula source editor. It never writes HTML into the host page. */
    .la-formulawindow { position:fixed; z-index:8; pointer-events:auto; width:410px; height:205px;
      min-width:220px; min-height:135px; display:flex; flex-direction:column; overflow:hidden;
      border:1px solid #b8c9f3; border-radius:14px; background:#fff; color:#172033;
      box-shadow:0 18px 48px #0c1c3a43; }
    .la-formulahead { padding:7px 8px; border-bottom:1px solid #e8ecf3; display:flex;
      align-items:center; gap:7px; flex-shrink:0; }
    .la-formuladrag { display:flex; flex:1; align-items:center; gap:7px; cursor:grab;
      user-select:none; touch-action:none; min-width:0; }
    .la-formuladrag:active { cursor:grabbing; }
    .la-formulatitle { font-size:12px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .la-formulacode { flex:1; min-height:0; width:100%; resize:none; border:0; outline:0;
      padding:11px 13px; color:#172033; background:#fff;
      font:13px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; tab-size:2; }
    .la-formulacode:focus { outline:2px solid #9db8ff; outline-offset:-3px; }
    .la-formulainfo { flex-shrink:0; display:flex; align-items:center; gap:7px; min-height:30px;
      padding:5px 30px 5px 11px; border-top:1px solid #e8ecf3;
      font-size:10px; line-height:1.3; color:#667084; }
    .la-formulainfo.la-warning { color:#aa581c; }
    .la-formulacode::selection { background:#c6d7ff; }
    /* Second floating editor: whole message as raw text + LaTeX. */
    .la-fulltextwindow { position:fixed; z-index:9; pointer-events:auto; display:flex;
      flex-direction:column; overflow:hidden; width:550px; height:360px; min-width:245px; min-height:175px;
      border:1px solid #b8c9f3; border-radius:14px; background:#fff; color:#172033;
      box-shadow:0 18px 48px #0c1c3a43; }
    .la-fulltexthead { display:flex; align-items:center; gap:7px; flex-shrink:0;
      padding:7px 9px; border-bottom:1px solid #e8ecf3; }
    .la-fulltextdrag { display:flex; flex:1; align-items:center; gap:7px;
      cursor:grab; user-select:none; touch-action:none; min-width:0; }
    .la-fulltextdrag:active { cursor:grabbing; }
    .la-fulltexttitle { font-size:12px; font-weight:800; white-space:nowrap;
      overflow:hidden; text-overflow:ellipsis; }
    .la-fulltextcode { flex:1; min-height:0; min-width:0; width:100%; resize:none;
      border:0; outline:0; padding:12px 14px; white-space:pre-wrap;
      overflow-wrap:anywhere; overflow-x:hidden; overflow-y:auto;
      background:#fff; color:#172033;
      font:14px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace; tab-size:2; }
    .la-fulltextcode:focus { outline:2px solid #9db8ff; outline-offset:-3px; }
    .la-fulltextinfo { border-top:1px solid #e8ecf3; flex-shrink:0;
      padding:7px 30px 7px 11px; color:#667084; font-size:10px; line-height:1.35; }
    .la-preview-readonly { cursor:default; }
    .la-preview-readonly:focus { outline:0; }
    .la-separated-active { box-shadow:0 0 0 1.5px #6688dc inset; }
    .la-separated-invalid { box-shadow:0 0 0 1.5px #df9439 inset; }
    .la-editmode { font-size:11px; padding:5px 8px; border:1px solid #b6c7f0; background:#eef3ff;
      color:#2745ac; font-weight:760; border-radius:7px; white-space:nowrap; }
    .la-editmode:hover { background:#dce7ff; }
    .la-preview-tools { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between;
      gap:5px; border-top:1px solid #e8ecf3; padding:6px 9px; flex-shrink:0; }
    .la-previewtools-left { display:flex; align-items:center; gap:5px; min-width:0; flex-wrap:wrap; }
    .la-apply { border:0; border-radius:7px; padding:6px 9px; background:#3158e5; color:white;
      font-size:11px; font-weight:700; }
    .la-apply:disabled { background:#e6eaf2; color:#657186; cursor:default; }
    .la-clear { border:0; border-radius:7px; padding:6px 9px; background:#eef1f9;
      color:#344368; font-size:11px; font-weight:650; }
    .la-peekstatus { font-size:10px; color:#657289; line-height:1.25; }
    .la-peekstatus.la-warning { color:#a45c18; }
    .la-auto-option { display:inline-flex; align-items:center; gap:6px; cursor:pointer;
      color:#344368; font-size:11px; font-weight:650; white-space:nowrap; user-select:none; }
    .la-auto-checkbox { accent-color:#3158e5; width:15px; height:15px; margin:0; cursor:pointer; }
    .la-auto-option:has(input:checked) { color:#3158e5; }
    .la-auto-option:has(input:disabled) { opacity:.55; cursor:not-allowed; }
    .la-insert-mode { display:flex; align-items:center; gap:5px; font-size:11px; font-weight:700; color:#344368; }
    .la-mode-select { font-size:11px; font-weight:680; color:#23365d; background:#f6f8ff;
      border:1px solid #cdd7ec; padding:5px 7px; border-radius:7px; min-width:0; max-width:220px; }
    .la-mode-select:focus-visible { outline:2px solid #8daaff; outline-offset:1px; }
    .la-preview .la-display { display:block; text-align:center; padding:6px 2px; overflow-x:auto; }
    .la-preview math { font-size:1.1em; }
    .la-preview .la-error { background:#fff1ee; color:#b73624; border-bottom:1px dashed #c24f42; padding:2px 4px; border-radius:4px; }
    .la-empty { color:#758197; font-size:13px; }
    .la-muted { color:#6c778c; font-size:11px; }
    .la-backdrop { position:fixed; inset:0; width:100vw; height:100vh; z-index:10; pointer-events:auto;
      background:#081a32b3; display:grid; place-items:center; padding:15px; }
    .la-dialog { background:#fff; color:#172033; width:min(1040px, 100%); max-height:min(92vh, 900px);
      border-radius:20px; box-shadow:0 30px 90px #0006; display:flex; flex-direction:column; overflow:hidden; }
    .la-modalhead { display:flex; justify-content:space-between; align-items:center; gap:15px;
      padding:18px 21px; border-bottom:1px solid #e4e8ee; }
    .la-heading { font-size:17px; font-weight:820; letter-spacing:-.025em; }
    .la-subheading { font-size:12px; color:#768197; margin-top:3px; line-height:1.45; }
    .la-editorgrid { min-height:0; display:grid; grid-template-columns:1fr 1fr; flex:1; }
    .la-pane { min-width:0; min-height:250px; display:flex; flex-direction:column; }
    .la-pane + .la-pane { border-left:1px solid #e7ebf2; }
    .la-panetitle { padding:10px 15px; font-size:12px; font-weight:800; display:flex;
      gap:8px; align-items:center; justify-content:space-between; background:#f7f9fd; border-bottom:1px solid #e8ecf4; }
    .la-editarea { flex:1; width:100%; padding:18px; min-height:280px; resize:none; border:0;
      outline:0; background:#fff; color:#172033; font: 14px/1.75 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .la-editarea:focus { outline:0; }
    .la-fullpreview { overflow:auto; flex:1; min-height:280px; max-height:48vh; }
    .la-modalfoot { border-top:1px solid #e4e8ee; padding:12px 18px; display:flex;
      gap:8px; align-items:center; flex-wrap:wrap; justify-content:space-between; }
    .la-footleft { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .la-footright { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .la-btn { border:1px solid #dce2ef; border-radius:10px; padding:10px 15px; font-size:12px;
      font-weight:800; background:#fff; color:#23314d; }
    .la-btn:hover { background:#f6f8fc; }
    .la-btnprimary { background:#3158e5; border-color:#3158e5; color:#fff; }
    .la-btnprimary:hover { background:#2647c6; }
    .la-status { font-size:11px; color:#6d7890; min-height:1em; }
    .la-chip { padding:3px 7px; border:1px solid #e1e8f1; color:#627088; border-radius:6px;
      font: 11px/1.3 ui-monospace, Consolas, monospace; background:#f9fbfe; }
    @media (max-width:600px) {
      /* Controls must not overlay the preview title on narrow viewports. */
      .la-peekhead { flex-wrap:wrap; gap:4px; }
      .la-peek-dragarea { flex:1 1 100%; min-height:25px; }
      .la-headbuttons { flex:1 1 100%; flex-wrap:wrap; justify-content:flex-start; gap:4px; }
      .la-headbuttons .la-mini, .la-headbuttons .la-editmode { padding:4px 6px; }
    }
    @media (max-width:720px) {
      .la-backdrop { padding:6px; }
      .la-dialog { max-height:97vh; border-radius:13px; }
      .la-modalhead { padding:12px 14px; }
      .la-editorgrid { display:flex; flex-direction:column; overflow:auto; }
      .la-pane { min-height:165px; }
      .la-pane + .la-pane { border-left:0; border-top:1px solid #e4e8ee; }
      .la-editarea, .la-fullpreview { min-height:160px; max-height:27vh; }
      .la-modalfoot { padding:9px 11px; }
      .la-footleft .la-muted { display:none; }
      .la-heading { font-size:15px; }
    }
    @media (prefers-color-scheme: dark) {
      :host { --la-bg:#17202d; }
      .la-toolbar, .la-peek, .la-dialog, .la-peekhead, .la-formulawindow { background:#17202d; color:#f4f7ff; border-color:#364257; }
      .la-toolbarbutton:hover, .la-toolbarbutton[aria-pressed="true"], .la-grip:hover, .la-resize:hover { background:#293b56; }
      .la-corner-choice { border-color:#aabce8; }
      .la-corner-choice[aria-pressed="true"] { background:#8eaaff; border-color:#8eaaff; }
      .la-corner-choice:hover { border-color:#c4d4ff; box-shadow:0 0 0 2px #3d4c6c; }
      .la-grip { color:#a8b7d0; }
      .la-peekhead, .la-modalhead, .la-modalfoot, .la-pane + .la-pane, .la-panetitle { border-color:#364257; }
      .la-preview, .la-editarea, .la-formulacode { color:#f1f4fb; background:#17202d; }
      .la-panetitle { background:#202c3d; }
      .la-btn, .la-mini { background:#27374e; color:#eaf0fc; border-color:#45536a; }
      .la-btnprimary { background:#3158e5; color:#fff; }
      .la-subheading, .la-muted, .la-status { color:#b2bfce; }
      .la-math-token { background:#293b56; }
      .la-math-token:hover, .la-math-token:focus-visible { background:#334d73; }
      .la-math-source { background:#25334a; color:#f4f7ff; }
      .la-shortcuts { background:#1d293c; border-color:#364257; color:#c3cde0; }
      .la-shortcut { background:#263550; border-color:#465a81; color:#e1e9ff; }
      .la-symbol-context {background:#1c293d;color:#e8efff;border-color:#485b79;}
      .la-symbol-context-title {color:#bac9df;}
      .la-symbol-context-action:hover, .la-symbol-context-action:focus-visible {background:#334a70;outline-color:#5b76aa;}
      .la-shortcut:hover { background:#33496e; }
      .la-shortcut-edit { background:#273e61; color:#d4e1ff; border-color:#5474ae; }
      .la-shortcutwindow { background:#17202d; color:#f4f7ff; border-color:#364257; }
      .la-schead, .la-sclistpane, .la-scfoot { border-color:#364257; }
      .la-scpick, .la-scsmall { background:#27374e; color:#eaf0fc; }
      .la-scpick[aria-current='true'] { background:#273e61; color:#eaf0fc; }
      .la-scinput, .la-sctemplate { background:#17202d; color:#f4f7ff; border-color:#465a81; }
      .la-sclabel, .la-schelp, .la-scstatus { color:#c3cde0; }

      .la-apply:disabled { background:#334257; color:#b2bccc; }
      .la-clear { background:#27374e; color:#eaf0fc; }
      .la-preview-tools { border-color:#364257; }
      .la-auto-option { color:#eaf0fc; }
      .la-auto-option:has(input:checked) { color:#b8caff; }
      .la-insert-mode { color:#e6eeff; }
      .la-mode-select { background:#27374e; color:#f0f4ff; border-color:#45536a; }
      .la-zoom-controls, .la-fontsize-select { background:#27374e; color:#eaf0fc; border-color:#45536a; }
      .la-fontsize-label {color:#eaf0fc;}
      .la-zoom-button:hover, .la-zoom-button:focus-visible {background:#354969;}
      .la-peekstatus { color:#b2bfce; }
      .la-formulahead, .la-formulainfo, .la-fulltexthead, .la-fulltextinfo { border-color:#364257; }
      .la-formulainfo, .la-fulltextinfo { color:#b2bfce; }
      .la-fulltextwindow { background:#17202d; color:#f4f7ff; border-color:#364257; }
      .la-fulltextcode { background:#17202d; color:#f1f4fb; }
      .la-editmode { color:#d4e1ff; background:#273e61; border-color:#5474ae; }
      .la-chip { background:#25334a; color:#bac6d8; border-color:#45536a; }
      .la-dialog { box-shadow:0 30px 90px #0008; }
    }
  `;
  style.textContent += `
    .la-kbwindow { position:fixed; z-index:24; pointer-events:auto; display:flex;
      flex-direction:column; width:min(600px, calc(100vw - 20px));
      max-height:min(80vh, 640px); min-width:min(320px, calc(100vw - 20px));
      background:#fff; color:#172033; border:1px solid #b8c9f3;
      border-radius:13px; box-shadow:0 18px 50px #10254466;
      overflow:hidden; font:12px/1.4 system-ui,sans-serif; }
    .la-kbhead { display:flex; justify-content:space-between; align-items:center;
      gap:8px; padding:10px 12px; border-bottom:1px solid #e5ebf6; }
    .la-kbhead strong {font-size:13px;}
    .la-kbbody {overflow:auto; padding:12px; display:flex; flex-direction:column; gap:10px;}
    .la-kbsection {font-weight:750;color:#374d83;}
    .la-kbrow {display:grid;grid-template-columns:minmax(112px, 165px) minmax(120px,1fr) auto;
      gap:7px;align-items:center;}
    .la-kbcombo {border:1px solid #ced9ec;border-radius:7px;background:#f6f9ff;
      padding:7px 8px;min-height:34px;font:700 11px system-ui,sans-serif;
      text-align:left;color:#233d84;white-space:nowrap;}
    .la-kbcombo[disabled] {color:#3f4b64;background:#eff2f7;opacity:1;cursor:default;}
    .la-kbcombo.la-recording {background:#e8efff;border-color:#3158e5;}
    .la-kbaction {min-width:0;width:100%;border:1px solid #ced9ec;border-radius:7px;
      padding:7px 6px;background:#fff;color:#253b70;font:12px system-ui,sans-serif;}
    .la-kbdelete {border:0;border-radius:7px;background:#f1f3f9;color:#3b4f7b;
      padding:8px 9px;font:700 12px system-ui,sans-serif;}
    .la-kbhelp {color:#60708d;font-size:11px;}
    .la-kbfooter {border-top:1px solid #e5ebf6;padding:10px 12px;display:flex;
      justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;}
    .la-kbstatus {font-size:11px;color:#68758b;}
    .la-kbstatus.la-warning {color:#a04523;}
    .la-kbactions {display:flex;gap:6px;align-items:center;}
    .la-kbprimary {background:#3158e5;color:#fff;border:0;border-radius:7px;
      font:700 11px system-ui,sans-serif;padding:8px 11px;}
    .la-kbsecondary {background:#f1f3f9;color:#324e7e;border:0;border-radius:7px;
      font:700 11px system-ui,sans-serif;padding:8px 11px;}
    @media (max-width:430px) {
      .la-kbrow {grid-template-columns:1fr 1fr auto; gap:4px;}
      .la-kbcombo,.la-kbaction {font-size:10px;}
    }
    @media (prefers-color-scheme:dark) {
      .la-kbwindow {background:#17202d;color:#f4f7ff;border-color:#364257;}
      .la-kbhead,.la-kbfooter {border-color:#364257;}
      .la-kbsection,.la-kbhelp,.la-kbstatus {color:#aebede;}
      .la-kbcombo,.la-kbaction {background:#25334b;color:#eef4ff;border-color:#455879;}
      .la-kbcombo[disabled],.la-kbdelete,.la-kbsecondary {background:#26334a;color:#d4e0fa;}
    }
  `;
  shadow.appendChild(style);

  function element(tag, cssClass, label, parent) {
    const n = document.createElement(tag);
    if (cssClass) n.className = cssClass;
    if (label !== undefined) n.textContent = label;
    if (parent) parent.append(n);
    return n;
  }


  function createZoomControls(parent, kind) {
    const wrap=element('div','la-zoom-controls',undefined,parent);
    wrap.setAttribute('role','group');
    wrap.setAttribute('aria-label',kind==='preview'?'Zoom da pré-visualização':'Zoom da visualização do editor');
    const minus=element('button','la-zoom-button','−',wrap);
    minus.type='button'; minus.setAttribute('aria-label','Diminuir zoom em 10%'); minus.title='Diminuir zoom';
    const value=element('button','la-zoom-value','100%',wrap);
    value.type='button'; value.title='Restaurar zoom para 100%';
    value.setAttribute('aria-label','Restaurar zoom para 100%');
    const plus=element('button','la-zoom-button','+',wrap);
    plus.type='button'; plus.setAttribute('aria-label','Aumentar zoom em 10%'); plus.title='Aumentar zoom';
    return {wrap,minus,value,plus,kind};
  }

  function createFormattingBar(parent, description) {
    const bar = element('div', 'la-formatbar', undefined, parent);
    bar.setAttribute('role','toolbar');
    bar.setAttribute('aria-label',description);
    const configs = [
      ['bold','B','Negrito matemático (\\mathbf)'],
      ['italic','I','Itálico matemático (\\mathit)'],
      ['underline','U','Sublinhado (\\underline)'],
      ['strike','S','Riscado (\\cancel)'],
      ['blackboard','𝔹','Dupla haste (\\mathbb)'],
      ['calligraphic','𝒞','Caligráfico (\\mathcal)']
    ];
    for (const [cmd,label,title] of configs) {
      const button=element('button','la-format-button',label,bar);
      button.type='button'; button.dataset.laFormat=cmd;
      button.title=title; button.setAttribute('aria-label',title);
      if (cmd==='italic') button.classList.add('la-format-italic');
      if (cmd==='underline') button.classList.add('la-format-under');
      if (cmd==='strike') button.classList.add('la-format-strike');
    }
    const sizeLabel=element('label','la-fontsize-label',undefined,bar);
    const sizeSelect=element('select','la-fontsize-select',undefined,sizeLabel);
    sizeSelect.setAttribute('aria-label','Tamanho da fonte em LaTeX para o texto selecionado');
    sizeSelect.title='Formata a seleção com um comando de tamanho LaTeX (não é zoom)';
    const fontSizes=[
      ['', 'Tamanho…'],
      ['size:tiny','Muito pequena · 50%'],
      ['size:scriptsize','Pequena · 70%'],
      ['size:footnotesize','Menor · 80%'],
      ['size:small','90%'],
      ['size:normalsize','Normal · 100%'],
      ['size:large','Grande · 120%'],
      ['size:Large','Maior · 144%'],
      ['size:LARGE','Muito grande · 172%'],
      ['size:huge','Enorme · 207%'],
      ['size:Huge','Máxima · 249%']
    ];
    for (const [value,label] of fontSizes) {
      const option=element('option','',label,sizeSelect);
      option.value=value; option.disabled=!value;
    }
    const colorLabel=element('label','la-format-color',undefined,bar);
    colorLabel.title='Cor do texto ou da fórmula (\\textcolor)';
    element('span','','Cor',colorLabel);
    const colorPicker=element('input','la-format-swatch',undefined,colorLabel);
    colorPicker.type='color'; colorPicker.value='#3158e5';
    colorPicker.setAttribute('aria-label','Escolher a cor LaTeX');
    const divider=element('span','la-format-divider',undefined,bar);
    divider.setAttribute('aria-hidden','true');
    for (let i=0; i<symbolCatalog.quick.length; i++) {
      const item=symbolCatalog.quick[i];
      const button=element('button','la-format-button la-format-quick',item.symbol,bar);
      button.type='button';button.dataset.laQuick=String(i);
      button.title=`${item.label}: ${item.command.replaceAll('{{selection}}','…').replaceAll('{{cursor}}','▏')}`;
      button.setAttribute('aria-label',`Inserir ${item.label}`);
    }
    const symbolsTrigger = element('button','la-format-button', 'Ω Símbolos', bar);
    symbolsTrigger.type='button'; symbolsTrigger.dataset.laSymbols='true';
    symbolsTrigger.title='Abrir catálogo de símbolos, operadores, funções e estruturas';
    symbolsTrigger.setAttribute('aria-label','Abrir catálogo de símbolos matemáticos');
    symbolsTrigger.setAttribute('aria-haspopup','dialog');
    symbolsTrigger.setAttribute('aria-expanded','false');
    // The preview exposes this action once, beside "Editar atalhos".
    // The modal and separate full-text editor still have their own access.
    const keysTrigger = parent === peek ? null : element('button','la-format-button','⌨ Teclas',bar);
    if (keysTrigger) {
      keysTrigger.type='button';
      keysTrigger.title='Configurar atalhos de teclado';
      keysTrigger.setAttribute('aria-label','Configurar atalhos de teclado');
    }
    return {bar,colorPicker,sizeSelect,symbolsTrigger,keysTrigger};
  }

  const toolbar = element("div", "la-toolbar la-hidden", undefined, shadow);
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Ferramentas LaTeX Anywhere');
  const toolbarGrip = element('button', 'la-grip', '⠿', toolbar);
  toolbarGrip.type = 'button';
  toolbarGrip.title = 'Arraste para mover os botões · Setas para ajustar';
  toolbarGrip.setAttribute('aria-label', 'Mover botões LaTeX Anywhere');
  // SVG icons have consistent boxes and don't depend on whether a system font
  // includes the power glyph (which previously rendered as an empty square).
  function setToolbarButton(button, label, iconName) {
    button.replaceChildren();
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','la-icon');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('fill','none');
    svg.setAttribute('stroke','currentColor');
    svg.setAttribute('stroke-width','2');
    svg.setAttribute('stroke-linecap','round');
    svg.setAttribute('stroke-linejoin','round');
    svg.setAttribute('aria-hidden','true');
    const add = (tag, attrs) => {
      const child = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attrs).forEach(([key, value]) => child.setAttribute(key,String(value)));
      svg.appendChild(child);
      return child;
    };
    if (iconName === 'sigma') {
      add('path',{d:'M18 5H6l7 7-7 7h12'});
    } else if (iconName === 'eye') {
      add('path',{d:'M2 12s3.6-6.5 10-6.5 10 6.5 10 6.5-3.6 6.5-10 6.5S2 12 2 12Z'});
      add('circle',{cx:12,cy:12,r:3});
    } else if (iconName === 'minimize') {
      // Two diagonal arrows point INWARD (toward the centre).
      add('path',{d:'M3 21l7-7M4 14h6v6M21 3l-7 7M20 10h-6V4'});
    } else if (iconName === 'maximize') {
      // Two diagonal arrows point OUTWARD (toward the corners).
      add('path',{d:'M10 14l-7 7M9 21H3v-6M14 10l7-7M15 3h6v6'});
    } else if (iconName === 'power') {
      add('path',{d:'M12 2v10'});
      add('path',{d:'M7.2 5.5a9 9 0 1 0 9.6 0'});
    }
    const span = element('span','la-button-label',label);
    button.append(svg, span);
  }
  const editorTrigger = element('button', 'la-toolbarbutton', undefined, toolbar);
  setToolbarButton(editorTrigger, 'Editor', 'sigma');
  editorTrigger.type = 'button';
  editorTrigger.title = 'Abrir editor LaTeX (Alt+Shift+M)';
  const previewTrigger = element('button', 'la-toolbarbutton', undefined, toolbar);
  setToolbarButton(previewTrigger, 'Prévia', 'eye');
  previewTrigger.type = 'button';
  previewTrigger.title = 'Mostrar ou ocultar somente a pré-visualização';
  previewTrigger.setAttribute('aria-pressed', 'false');
  const minimizeTrigger = element('button', 'la-toolbarbutton', undefined, toolbar);
  setToolbarButton(minimizeTrigger, 'Minimizar', 'minimize');
  minimizeTrigger.type = 'button';
  minimizeTrigger.title = 'Minimizar a barra para escolher um canto da página';
  const hideAllTrigger = element('button', 'la-toolbarbutton', undefined, toolbar);
  setToolbarButton(hideAllTrigger, 'Ocultar', 'power');
  hideAllTrigger.type = 'button';
  hideAllTrigger.title = 'Escolher entre ocultar neste domínio ou em todos os sites';
  hideAllTrigger.setAttribute('aria-label', 'Escolher o alcance da ocultação');
  hideAllTrigger.setAttribute('aria-haspopup', 'menu');
  hideAllTrigger.setAttribute('aria-expanded', 'false');
  // The chooser lives outside the toolbar, so it is not clipped or moved with
  // the bar. Once the user hides the extension, the whole Shadow DOM vanishes.
  const visibilityMenu = element('div','la-visibility-menu la-hidden',undefined,shadow);
  visibilityMenu.setAttribute('role','menu');
  visibilityMenu.setAttribute('aria-label','Ocultar LaTeX Anywhere');
  const hideDomainOption = element('button','la-visibility-option','Ocultar neste domínio',visibilityMenu);
  const hideGlobalOption = element('button','la-visibility-option','Ocultar em todos os sites',visibilityMenu);
  hideDomainOption.type = hideGlobalOption.type = 'button';
  hideDomainOption.setAttribute('role','menuitem');
  hideGlobalOption.setAttribute('role','menuitem');
  element('div','la-visibility-hint','Para reativar, use o ícone do Chrome ou Alt+Shift+L.',visibilityMenu);
  function closeVisibilityMenu() {
    visibilityMenu.classList.add('la-hidden');
    hideAllTrigger.setAttribute('aria-expanded','false');
  }
  function openVisibilityMenu() {
    const opening = visibilityMenu.classList.contains('la-hidden');
    if (!opening) { closeVisibilityMenu(); return; }
    visibilityMenu.classList.remove('la-hidden');
    hideAllTrigger.setAttribute('aria-expanded','true');
    const r=hideAllTrigger.getBoundingClientRect();
    const m=visibilityMenu.getBoundingClientRect();
    visibilityMenu.style.left=`${Math.max(8,Math.min(r.right-m.width,innerWidth-m.width-8))}px`;
    const top=r.bottom+m.height+8<innerHeight ? r.bottom+5 : r.top-m.height-5;
    visibilityMenu.style.top=`${Math.max(8,Math.min(top,innerHeight-m.height-8))}px`;
    hideDomainOption.focus({preventScroll:true});
  }

  // In compact mode the main bar transforms into a maximize button and a 2×2
  // corner picker. These remain accessible even after focus leaves a text field.
  const miniControls = element('div', 'la-mini-controls la-hidden', undefined, toolbar);
  const maximizeTrigger = element('button', 'la-toolbarbutton', undefined, miniControls);
  setToolbarButton(maximizeTrigger, 'Maximizar', 'maximize');
  maximizeTrigger.type = 'button';
  maximizeTrigger.title = 'Restaurar a barra completa';
  const cornerGrid = element('div', 'la-corner-grid', undefined, miniControls);
  cornerGrid.setAttribute('role','group');
  cornerGrid.setAttribute('aria-label','Posição da barra minimizada');
  const cornerLabels = {
    'top-left':'canto superior esquerdo',
    'top-right':'canto superior direito',
    'bottom-left':'canto inferior esquerdo',
    'bottom-right':'canto inferior direito'
  };
  const cornerButtons = new Map();
  for (const corner of toolbarCorners) {
    const button = element('button','la-corner-choice',undefined,cornerGrid);
    button.type = 'button';
    button.setAttribute('aria-label',`Mover barra para o ${cornerLabels[corner]}`);
    button.title = `Mover para o ${cornerLabels[corner]}`;
    button.setAttribute('aria-pressed','false');
    button.dataset.corner = corner;
    cornerButtons.set(corner,button);
  }

  const peek = element('section', 'la-peek la-hidden', undefined, shadow);
  peek.setAttribute('aria-label', 'Pré-visualização matemática');
  const peekHead = element('div', 'la-peekhead', undefined, peek);
  const peekDrag = element('div', 'la-peek-dragarea', undefined, peekHead);
  peekDrag.setAttribute('title', 'Arraste pelo cabeçalho para mover a pré-visualização');
  const peekGrip = element('button', 'la-grip', '⠿', peekDrag);
  peekGrip.type = 'button';
  peekGrip.title = 'Arraste para mover a prévia · Setas para ajustar';
  peekGrip.setAttribute('aria-label', 'Mover janela de pré-visualização');
  element('span', 'la-peektitle', 'Pré-visualização matemática', peekDrag);
  const peekButtons = element('div', 'la-headbuttons', undefined, peekHead);
  const peekZoomControls = createZoomControls(peekButtons,'preview');
  const inlineFormulaSwitch = element('button', 'la-editmode la-hidden', 'Editar separado', peekButtons);
  inlineFormulaSwitch.type = 'button';
  inlineFormulaSwitch.title = 'Alternar entre edição inline e em janela separada';
  const fullTextSwitch = element('button', 'la-editmode', 'Editar texto separado', peekButtons);
  fullTextSwitch.type = 'button';
  fullTextSwitch.title = 'Editar toda a mensagem numa janela móvel e redimensionável';
  const editButton = element('button', 'la-mini', 'Abrir editor', peekButtons);
  editButton.type = 'button';
  const hidePeek = element('button', 'la-mini', '✕', peekButtons);
  hidePeek.type = 'button';
  hidePeek.title = 'Fechar pré-visualização';
  hidePeek.setAttribute('aria-label', 'Fechar pré-visualização');
  const shortcutBar = element('div', 'la-shortcuts', undefined, peek);
  shortcutBar.setAttribute('role', 'group');
  shortcutBar.setAttribute('aria-label', 'Atalhos de comandos LaTeX');
  element('span', 'la-shortcuts-title', 'Atalhos:', shortcutBar);
  const shortcutItems = element('div', 'la-shortcut-items', undefined, shortcutBar);
  const shortcutActions = element('div', 'la-shortcut-actions', undefined, shortcutBar);
  const editShortcutButton = element('button', 'la-shortcut-edit', '✎ Editar atalhos', shortcutActions);
  editShortcutButton.type = 'button';
  editShortcutButton.title = 'Adicionar, modificar, excluir e reorganizar atalhos personalizados';
  editShortcutButton.setAttribute('aria-label', 'Editar atalhos de LaTeX');
  const keyboardSettingsTrigger = element('button','la-shortcut-edit','⌨ Teclas',shortcutActions);
  keyboardSettingsTrigger.type='button';
  keyboardSettingsTrigger.title='Configurar atalhos de teclado (Ctrl+B, Ctrl+I e Ctrl+U são fixos)';
  keyboardSettingsTrigger.setAttribute('aria-label','Configurar atalhos de teclado');

  const previewFormatTools = createFormattingBar(peek, 'Formatação LaTeX na pré-visualização');
  const peekBody = element('div', 'la-preview la-editable-preview', undefined, peek);
  peekBody.contentEditable = 'true';
  peekBody.setAttribute('role', 'textbox');
  peekBody.setAttribute('aria-multiline', 'true');
  peekBody.setAttribute('aria-label', 'Pré-visualização editável. Dê dois cliques nas fórmulas para editar o LaTeX.');
  peekBody.setAttribute('spellcheck', 'true');
  const peekTools = element('div', 'la-preview-tools', undefined, peek);
  const autoOption = element('label', 'la-auto-option', undefined, peekTools);
  const autoApplyCheckbox = element('input', 'la-auto-checkbox', undefined, autoOption);
  autoApplyCheckbox.type = 'checkbox';
  autoApplyCheckbox.checked = false;
  autoApplyCheckbox.title = 'Sincronizar a prévia com o campo original enquanto você digita (não envia a mensagem)';
  element('span', '', 'Aplicar enquanto escrevo', autoOption);
  const peekModeBox = element('label', 'la-insert-mode', undefined, peekTools);
  element('span', '', 'Ao aplicar:', peekModeBox);
  const peekModeSelect = element('select', 'la-mode-select', undefined, peekModeBox);
  peekModeSelect.setAttribute('aria-label', 'Modo de aplicação da prévia');
  peekModeSelect.innerHTML = '<option value="replace">Substituir conteúdo</option><option value="insert">Inserir no cursor/seleção</option>';
  const peekToolLeft = element('div', 'la-previewtools-left', undefined, peekTools);
  const applyPeek = element('button', 'la-apply', 'Aplicar no campo', peekToolLeft);
  applyPeek.type = 'button';
  applyPeek.disabled = true;
  applyPeek.title = 'Aplicar conforme o modo selecionado (Ctrl+Enter)';
  const forceApplyPeek = element('button', 'la-clear la-hidden', 'Substituir campo…', peekToolLeft);
  forceApplyPeek.type = 'button';
  forceApplyPeek.title = 'Substituir o texto atual do campo pelo rascunho da prévia, após confirmação';
  const resetPeek = element('button', 'la-clear', 'Descartar', peekToolLeft);
  resetPeek.type = 'button';
  resetPeek.title = 'Descartar alterações na prévia e voltar ao texto do campo original';
  const copyPeek = element('button', 'la-clear', 'Copiar', peekToolLeft);
  copyPeek.type = 'button';
  copyPeek.title = 'Copiar o LaTeX original do rascunho';
  const peekStatus = element('span', 'la-peekstatus', 'Duplo clique em uma fórmula para editar', peekTools);
  const peekResize = element('button', 'la-resize', '◢', peek);
  peekResize.type = 'button';
  peekResize.title = 'Arraste para alterar a largura e a altura da prévia';
  peekResize.setAttribute('aria-label', 'Redimensionar pré-visualização');


  // This panel edits exactly one math-mode region while the main preview keeps
  // rendering it as mathematics, never displaying its raw source in that mode.
  const formulaWindow = element('section', 'la-formulawindow la-hidden', undefined, shadow);
  formulaWindow.setAttribute('aria-label', 'Editor separado da expressão matemática');
  const formulaHead = element('div', 'la-formulahead', undefined, formulaWindow);
  const formulaDrag = element('div', 'la-formuladrag', undefined, formulaHead);
  const formulaGrip = element('button', 'la-grip', '⠿', formulaDrag);
  formulaGrip.type = 'button';
  formulaGrip.title = 'Arraste para mover o editor da fórmula · Setas para ajustar';
  formulaGrip.setAttribute('aria-label', 'Mover editor da fórmula');
  element('span', 'la-formulatitle', '∑ Editando esta fórmula', formulaDrag);
  const formulaInlineButton = element('button', 'la-mini', 'Editar inline', formulaHead);
  formulaInlineButton.type = 'button';
  const formulaFinishButton = element('button', 'la-mini', 'Concluir', formulaHead);
  formulaFinishButton.type = 'button';
  formulaFinishButton.title = 'Concluir esta edição sem aplicar no site';
  const formulaCloseButton = element('button', 'la-mini', '✕', formulaHead);
  formulaCloseButton.type = 'button';
  formulaCloseButton.setAttribute('aria-label', 'Fechar editor separado da fórmula');
  const formulaInput = element('textarea', 'la-formulacode', undefined, formulaWindow);
  formulaInput.spellcheck = false;
  formulaInput.setAttribute('aria-label', 'Código LaTeX apenas da fórmula em edição');
  const formulaInfo = element('div', 'la-formulainfo', 'Edite só esta fórmula. A prévia principal renderiza as mudanças.', formulaWindow);
  const formulaResize = element('button', 'la-resize', '◢', formulaWindow);
  formulaResize.type = 'button';
  formulaResize.title = 'Arraste ou use as setas para redimensionar';
  formulaResize.setAttribute('aria-label', 'Redimensionar editor separado');

  // Dedicated raw-text editor for the whole preview; no writes to the host
  // until Apply (or the existing opt-in automatic application policy).
  const fullTextWindow = element('section', 'la-fulltextwindow la-hidden', undefined, shadow);
  fullTextWindow.setAttribute('aria-label', 'Edição separada do texto completo');
  const fullTextHead = element('div', 'la-fulltexthead', undefined, fullTextWindow);
  const fullTextDrag = element('div', 'la-fulltextdrag', undefined, fullTextHead);
  const fullTextGrip = element('button', 'la-grip', '⠿', fullTextDrag);
  fullTextGrip.type = 'button';
  fullTextGrip.title = 'Arraste para mover · Setas para ajustar';
  fullTextGrip.setAttribute('aria-label', 'Mover editor de texto completo');
  element('span', 'la-fulltexttitle', 'Editar texto completo', fullTextDrag);
  const fullTextInlineButton = element('button', 'la-mini', 'Editar inline', fullTextHead);
  fullTextInlineButton.type = 'button';
  const fullTextClose = element('button', 'la-mini', '✕', fullTextHead);
  fullTextClose.type = 'button';
  fullTextClose.title = 'Voltar ao modo inline sem descartar alterações';
  const fullTextFormatTools = createFormattingBar(fullTextWindow, 'Formatação LaTeX do texto completo');
  const fullTextInput = element('textarea', 'la-fulltextcode', undefined, fullTextWindow);
  fullTextInput.spellcheck = false;
  fullTextInput.wrap = 'soft'; // Visual wrap only: no extra newline in the actual LaTeX.
  fullTextInput.setAttribute('aria-label', 'Texto completo com código LaTeX');
  const fullTextInfo = element('div', 'la-fulltextinfo',
    'A prévia mostra as fórmulas renderizadas. Aplicar no campo é uma ação separada.', fullTextWindow);
  const fullTextResize = element('button', 'la-resize', '◢', fullTextWindow);
  fullTextResize.type = 'button';
  fullTextResize.title = 'Arraste ou use as setas para redimensionar';
  fullTextResize.setAttribute('aria-label', 'Redimensionar editor completo');

  // Floating shortcut manager: draft configuration, no host text is touched.
  const shortcutWindow = element('section','la-shortcutwindow la-hidden',undefined,shadow);
  shortcutWindow.setAttribute('role','dialog');
  shortcutWindow.setAttribute('aria-label','Editar atalhos de LaTeX');
  const scHead = element('div','la-schead',undefined,shortcutWindow);
  const scDrag = element('div','la-scdrag',undefined,scHead);
  const scGrip = element('button','la-grip','⠿',scDrag);
  scGrip.type='button'; scGrip.title='Arrastar janela · setas para mover';
  scGrip.setAttribute('aria-label','Mover gerenciador de atalhos');
  element('span','la-sctitle','Editar atalhos',scDrag);
  const scClose = element('button','la-mini','✕',scHead); scClose.type='button';
  scClose.setAttribute('aria-label','Fechar sem salvar atalhos');
  const scMain = element('div','la-scmain',undefined,shortcutWindow);
  const scListPane = element('div','la-sclistpane',undefined,scMain);
  const scNew = element('button','la-scprimary','+ Novo atalho',scListPane); scNew.type='button';
  const scList = element('div','la-sclist',undefined,scListPane);
  const scForm = element('div','la-scform',undefined,scMain);
  element('label','la-sclabel','Nome do atalho',scForm);
  const scName = element('input','la-scinput',undefined,scForm);
  scName.type='text'; scName.maxLength=40; scName.placeholder='Ex.: Fração';
  scName.setAttribute('aria-label','Nome do atalho');
  element('label','la-sclabel','Código inserido',scForm);
  const scTemplate = element('textarea','la-sctemplate',undefined,scForm);
  scTemplate.spellcheck=false; scTemplate.maxLength=8000;
  scTemplate.setAttribute('aria-label','Modelo de inserção LaTeX');
  const scMarkerRow = element('div','la-scmarkerrow',undefined,scForm);
  const scCaretMarker = element('button','la-scsmall','+ Posição do cursor',scMarkerRow);
  const scSelectionMarker = element('button','la-scsmall','+ Texto selecionado',scMarkerRow);
  scCaretMarker.type='button'; scSelectionMarker.type='button';
  const scHelp = element('div','la-schelp',undefined,scForm);
  scHelp.append('Use ');
  element('code','',CURSOR_MARKER,scHelp);
  scHelp.append(' para a posição final do cursor e ');
  element('code','',SELECTION_MARKER,scHelp);
  scHelp.append(' para inserir o texto selecionado. Sem marcador de cursor, ele fica no fim. Quebras de linha são mantidas.');
  const scFoot = element('div','la-scfoot',undefined,shortcutWindow);
  const scStatus = element('span','la-scstatus','As alterações só serão usadas após salvar.',scFoot);
  const scActions = element('div','la-scactions',undefined,scFoot);
  const scReset = element('button','la-scsmall','Restaurar padrões',scActions); scReset.type='button';
  const scCancel = element('button','la-scsmall','Cancelar',scActions); scCancel.type='button';
  const scSave = element('button','la-scprimary','Salvar atalhos',scActions); scSave.type='button';
  const scResize = element('button','la-resize','◢',shortcutWindow); scResize.type='button';
  scResize.title='Arraste para redimensionar a janela';
  scResize.setAttribute('aria-label','Redimensionar gerenciador de atalhos');

  // Shortcut-key manager is intentionally independent of the LaTeX snippet manager.
  const keyboardWindow = element('section','la-kbwindow la-hidden',undefined,shadow);
  keyboardWindow.setAttribute('role','dialog');
  keyboardWindow.setAttribute('aria-label','Configurar atalhos de teclado');
  const keyboardHead=element('div','la-kbhead',undefined,keyboardWindow);
  element('strong','','⌨ Atalhos de teclado',keyboardHead);
  const keyboardClose=element('button','la-kbsecondary','✕ Fechar',keyboardHead);
  keyboardClose.type='button';
  const keyboardBody=element('div','la-kbbody',undefined,keyboardWindow);
  element('div','la-kbsection','Atalhos fixos (não podem ser alterados)',keyboardBody);
  const keyboardFixedRows=element('div','',undefined,keyboardBody);
  element('div','la-kbsection','Atalhos personalizados',keyboardBody);
  const keyboardCustomRows=element('div','',undefined,keyboardBody);
  const keyboardNew=element('button','la-kbsecondary','+ Novo atalho',keyboardBody);
  keyboardNew.type='button';
  element('div','la-kbhelp',
    'Clique em “Gravar” e pressione uma combinação com Ctrl ou Alt. Use dentro do editor, da prévia ou da edição separada. Atalhos do navegador e da extensão são reservados.',keyboardBody);
  const keyboardFooter=element('div','la-kbfooter',undefined,keyboardWindow);
  const keyboardStatus=element('span','la-kbstatus','As alterações serão aplicadas ao salvar.',keyboardFooter);
  const keyboardActions=element('div','la-kbactions',undefined,keyboardFooter);
  const keyboardReset=element('button','la-kbsecondary','Limpar personalizados',keyboardActions);
  const keyboardCancel=element('button','la-kbsecondary','Cancelar',keyboardActions);
  const keyboardSave=element('button','la-kbprimary','Salvar',keyboardActions);
  for (const button of [keyboardReset,keyboardCancel,keyboardSave]) button.type='button';


  const backdrop = element("div", "la-backdrop la-hidden", undefined, shadow);
  const dialog = element("div", "la-dialog", undefined, backdrop);
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Editor LaTeX Anywhere");

  const modalHead = element("div", "la-modalhead", undefined, dialog);
  const titleWrap = element("div", "", undefined, modalHead);
  element("div", "la-heading", "∑ LaTeX Anywhere", titleWrap);
  element("div", "la-subheading", "Escreva normalmente. A pré-visualização renderiza as fórmulas, preservando o código original.", titleWrap);
  const closeTop = element("button", "la-mini", "✕ Fechar", modalHead);
  closeTop.type = "button";
  closeTop.setAttribute("aria-label", "Fechar editor");

  const grid = element("div", "la-editorgrid", undefined, dialog);
  const left = element("div", "la-pane", undefined, grid);
  const leftTitle = element("div", "la-panetitle", undefined, left);
  element("span", "", "CÓDIGO & TEXTO", leftTitle);
  element("span", "la-chip", String.raw`\( ... \)`, leftTitle);
  const modalFormatTools = createFormattingBar(left, 'Formatação LaTeX no editor');
  const modalInput = element("textarea", "la-editarea", undefined, left);
  modalInput.spellcheck = false;
  modalInput.placeholder = String.raw`Exemplo: A equação \(x^2+1=0\) não tem raízes reais.\n\nUse \[\frac{-b\pm\sqrt{b^2-4ac}}{2a}\] para fórmulas destacadas.`.replaceAll(String.raw`\n`, "\n");
  modalInput.setAttribute("aria-label", "Código e texto LaTeX");
  const right = element("div", "la-pane", undefined, grid);
  const rightTitle = element("div", "la-panetitle", undefined, right);
  element("span", "", "VISUALIZAÇÃO", rightTitle);
  const rightTitleTools=element('div','la-zoom-title-controls',undefined,rightTitle);
  const modalZoomControls=createZoomControls(rightTitleTools,'modal');
  element("span", "la-chip", "ao vivo", rightTitleTools);
  const fullPreview = element("div", "la-preview la-fullpreview", undefined, right);

  // Preview zoom affects only CSS presentation. It never modifies source LaTeX,
  // caret offsets, host fields or the dimensions stored for either window.
  function applyVisualZoom() {
    peekBody.style.fontSize = `${14*previewZoom/100}px`;
    fullPreview.style.fontSize = `${14*modalZoom/100}px`;
    peekZoomControls.value.textContent=`${previewZoom}%`;
    modalZoomControls.value.textContent=`${modalZoom}%`;
    peekZoomControls.minus.disabled=previewZoom<=50;
    peekZoomControls.plus.disabled=previewZoom>=250;
    modalZoomControls.minus.disabled=modalZoom<=50;
    modalZoomControls.plus.disabled=modalZoom>=250;
  }
  function setVisualZoom(kind,value) {
    if(kind==='preview') previewZoom=normalizedZoom(value);
    else modalZoom=normalizedZoom(value);
    storedLayout.previewZoom=previewZoom;
    storedLayout.modalZoom=modalZoom;
    applyVisualZoom();
    saveLayout();
  }
  for (const ctrl of [peekZoomControls,modalZoomControls]) {
    // Prevent control focus from moving an existing editor cursor or selection.
    ctrl.wrap.addEventListener('pointerdown',e=>{
      if(e.button===0 && e.target.closest('button')) e.preventDefault();
    });
    ctrl.minus.addEventListener('click',()=>setVisualZoom(ctrl.kind,(ctrl.kind==='preview'?previewZoom:modalZoom)-10));
    ctrl.plus.addEventListener('click',()=>setVisualZoom(ctrl.kind,(ctrl.kind==='preview'?previewZoom:modalZoom)+10));
    ctrl.value.addEventListener('click',()=>setVisualZoom(ctrl.kind,100));
  }
  function wireZoomWheel(target,kind) {
    target.addEventListener('wheel',e=>{
      if(!e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      const current=kind==='preview'?previewZoom:modalZoom;
      setVisualZoom(kind,current+(e.deltaY<0?10:-10));
    },{passive:false});
  }
  wireZoomWheel(peekBody,'preview');
  wireZoomWheel(fullPreview,'modal');
  applyVisualZoom();

  const foot = element("div", "la-modalfoot", undefined, dialog);
  const footLeft = element("div", "la-footleft", undefined, foot);
  const status = element("span", "la-status", "Nenhuma informação é enviada pela extensão.", footLeft);
  element("span", "la-muted", "Ctrl+Enter: aplicar · Esc: fechar", footLeft);
  const footRight = element("div", "la-footright", undefined, foot);
  const modalModeBox = element('label', 'la-insert-mode', undefined, footRight);
  element('span', '', 'Ao aplicar:', modalModeBox);
  const modalModeSelect = element('select', 'la-mode-select', undefined, modalModeBox);
  modalModeSelect.setAttribute('aria-label', 'Modo de aplicação do editor');
  modalModeSelect.innerHTML = '<option value="replace">Substituir conteúdo</option><option value="insert">Inserir no cursor/seleção</option>';
  const copyButton = element("button", "la-btn", "Copiar LaTeX", footRight);
  copyButton.type = "button";
  const cancelButton = element("button", "la-btn", "Cancelar", footRight);
  cancelButton.type = "button";
  const insertButton = element("button", "la-btn la-btnprimary", "Inserir no campo", footRight);
  insertButton.type = "button";

  const decisionOverlay=element('div','la-math-decision la-hidden',undefined,shadow);
  decisionOverlay.setAttribute('role','dialog');
  decisionOverlay.setAttribute('aria-modal','true');
  decisionOverlay.setAttribute('aria-label','Como aplicar a formatação a math modes diferentes');
  const decisionCard=element('div','la-decision-card',undefined,decisionOverlay);
  element('h3','','A seleção atravessa math modes',decisionCard);
  const decisionDescription=element('p','',undefined,decisionCard);
  const decisionHint=element('p','',undefined,decisionCard);
  const decisionActions=element('div','la-decision-actions',undefined,decisionCard);
  const decisionCancel=element('button','','Cancelar',decisionActions);
  const decisionSeparate=element('button','','Separar por trechos',decisionActions);
  const decisionExpand=element('button','la-decision-primary','Ampliar primeiro math mode',decisionActions);
  for(const button of [decisionCancel,decisionSeparate,decisionExpand]) button.type='button';

  // Categorized, searchable command palette. Commands are data-only; no HTML is
  // interpreted, and user text is always inserted as literal LaTeX source.
  const symbolsPopup=element('section','la-symbols-popup la-hidden',undefined,shadow);
  symbolsPopup.setAttribute('role','dialog');
  symbolsPopup.setAttribute('aria-label','Catálogo de símbolos matemáticos');
  const symbolsHead=element('div','la-symbols-head',undefined,symbolsPopup);
  element('span','la-symbols-heading','Símbolos e comandos LaTeX',symbolsHead);
  const symbolsClose=element('button','la-symbols-close','✕ Fechar',symbolsHead);
  symbolsClose.type='button';symbolsClose.setAttribute('aria-label','Fechar catálogo de símbolos');
  // Right-click context menu: kept outside the scrollable catalog panel so
  // it is never clipped. Copy doesn't change editor content or selection.
  const symbolContextMenu = element('div','la-symbol-context la-hidden',undefined,shadow);
  symbolContextMenu.setAttribute('role','menu');
  symbolContextMenu.setAttribute('aria-label','Ações para símbolo LaTeX');
  const symbolContextTitle = element('div','la-symbol-context-title','',symbolContextMenu);
  const symbolContextCopy = element('button','la-symbol-context-action','Copiar LaTeX',symbolContextMenu);
  symbolContextCopy.type='button'; symbolContextCopy.setAttribute('role','menuitem');
  const symbolContextBind = element('button','la-symbol-context-action','Definir tecla de atalho…',symbolContextMenu);
  symbolContextBind.type='button'; symbolContextBind.setAttribute('role','menuitem');
  let contextSymbol = null;
  function closeSymbolContext() {
    symbolContextMenu.classList.add('la-hidden');
    contextSymbol = null;
  }
  function openSymbolContext(item,x,y) {
    contextSymbol=item;
    symbolContextTitle.textContent=item.label;
    symbolContextMenu.classList.remove('la-hidden');
    const rect=symbolContextMenu.getBoundingClientRect();
    symbolContextMenu.style.left=`${Math.max(8,Math.min(x,innerWidth-rect.width-8))}px`;
    symbolContextMenu.style.top=`${Math.max(8,Math.min(y,innerHeight-rect.height-8))}px`;
    symbolContextCopy.focus({preventScroll:true});
  }
  const symbolsSearch=element('input','la-symbols-search',undefined,symbolsPopup);
  symbolsSearch.type='search';symbolsSearch.placeholder='Buscar: fração, subseteq, seno, neg...';
  symbolsSearch.setAttribute('aria-label','Pesquisar símbolos por nome ou comando');
  const symbolsCategories=element('div','la-symbols-categories',undefined,symbolsPopup);
  symbolsCategories.setAttribute('role','group');
  symbolsCategories.setAttribute('aria-label','Categorias do catálogo');
  const symbolsContents=element('div','la-symbols-content',undefined,symbolsPopup);
  const categoryButtons=[];
  let currentSymbolCategory='all';
  for (const category of [{id:'all',title:'Todos'},...symbolCatalog.groups]) {
    const button=element('button','la-symbols-category',category.title,symbolsCategories);
    button.type='button';button.dataset.laCategory=category.id;
    button.setAttribute('aria-pressed',category.id==='all'?'true':'false');
    categoryButtons.push(button);
  }
  function renderSymbolCatalog() {
    symbolsContents.replaceChildren();
    const search=symbolsSearch.value.trim().toLocaleLowerCase('pt-BR');
    let found=0;
    for (const category of symbolCatalog.groups) {
      if (currentSymbolCategory!=='all' && category.id!==currentSymbolCategory) continue;
      for (const section of category.sections) {
        const filtered=section.items.filter(item =>
          !search || `${item.command} ${item.label} ${item.symbol} ${category.title} ${section.title}`.toLocaleLowerCase('pt-BR').includes(search));
        if (!filtered.length) continue;
        found+=filtered.length;
        const wrap=element('section','la-symbols-section',undefined,symbolsContents);
        element('div','la-symbols-label',`${category.title} · ${section.title}`,wrap);
        const grid=element('div','la-symbols-grid',undefined,wrap);
        for (const item of filtered) {
          const button=element('button','la-symbols-item',undefined,grid);
          button.type='button';button.dataset.laCatalog='1';
          button.dataset.laCommand=item.command;
          button.dataset.laTemplate=item.template?'true':'false';
          button.dataset.laDisplay=item.display?'true':'false';
          button.dataset.laCatalogAction=catalogActionId(item);
          button.title=item.command;
          button.setAttribute('aria-label',`Inserir ${item.label}: ${item.command}`);
          const icon=element('span','la-symbol-icon',item.symbol,button);
          if (item.symbol.length>=7) icon.classList.add('la-symbol-long');
          else if (item.symbol.length>=5) icon.classList.add('la-symbol-medium');
          icon.title=item.label;
          element('span','la-symbol-command',(item.hint || item.command).replaceAll('{{selection}}','…').replaceAll('{{cursor}}','▏'),button);
        }
      }
    }
    if (!found) element('div','la-symbols-hint','Nenhum comando encontrado.',symbolsContents);
  }
  symbolsSearch.addEventListener('input',()=>{closeSymbolContext();renderSymbolCatalog();});
  symbolsCategories.addEventListener('click',event=>{
    const button=event.target.closest('[data-la-category]');
    if (!button) return;
    closeSymbolContext();
    currentSymbolCategory=button.dataset.laCategory;
    for (const cat of categoryButtons) cat.setAttribute('aria-pressed',cat===button?'true':'false');
    renderSymbolCatalog();
  });
  element('div','la-symbols-hint',
    'Clique para inserir; clique direito para copiar LaTeX ou definir uma tecla de atalho.',symbolsPopup);
  renderSymbolCatalog();

  // Reads only the editor that the user actively focused; never visits hidden fields.
  function isEligible(el) {
    if (!(el instanceof Element) || !el.isConnected) return false;
    if (el.closest('[data-latex-anywhere]')) return false;
    if (el.closest('[aria-hidden="true"], [inert]')) return false;
    if (el.matches('[disabled], [readonly], [contenteditable="false"]')) return false;
    if (el.matches('input')) {
      if (!['text', 'search', 'url'].includes(el.type)) return false;
      if (/^(cc-|one-time-code$)/i.test(el.autocomplete || '')) return false;
      return true;
    }
    if (el.matches('textarea')) return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function findEditor(start) {
    if (!(start instanceof Element)) return null;
    const candidate = start.closest('textarea, input, [contenteditable]');
    if (!candidate) return null;
    if (candidate.isContentEditable && !candidate.matches('input, textarea')) {
      let root = candidate;
      while (root.parentElement && root.parentElement.isContentEditable) root = root.parentElement;
      return isEligible(root) ? root : null;
    }
    return isEligible(candidate) ? candidate : null;
  }

  function getText(el) {
    if (!el) return '';
    if (el.matches('input, textarea')) return el.value || '';
    // Chrome's innerText inserts TWO newlines between <p> blocks, even when the
    // editor displays them as consecutive lines. Join direct paragraphs with one
    // newline, retaining intentional empty paragraphs as blank lines.
    const children = Array.from(el.childNodes).filter(node =>
      node.nodeType !== Node.TEXT_NODE || (node.textContent || '').trim() !== '');
    if (children.length && children.every(node =>
      node.nodeType === Node.ELEMENT_NODE && node.tagName === 'P')) {
      return children.map(p => {
        let text = p.innerText ?? p.textContent ?? '';
        // Chromium adds a final sentinel <br> to keep a trailing soft break
        // editable. It is not an additional newline authored by the user.
        if (p.lastElementChild?.tagName === 'BR' &&
            p.lastElementChild.previousSibling?.nodeName === 'BR' &&
            text.endsWith('\n\n')) text = text.slice(0, -1);
        return text === '\n' ? '' : text;
      }).join('\n');
    }
    // Fallback for nested rich-text markup and other contenteditable editors.
    return el.innerText || el.textContent || '';
  }

  // Capture the host editor selection BEFORE focusing any extension control.
  // This is crucial for React/ProseMirror, whose DOM selection disappears on blur.
  function captureHostSelection(target = currentTarget) {
    if (!target || !isEligible(target)) return false;
    const text = getText(target);
    if (target.matches('textarea, input')) {
      try {
        const start = target.selectionStart, end = target.selectionEnd;
        if (Number.isInteger(start) && Number.isInteger(end)) {
          capturedCursor = { target, kind:'plain', start, end, baseText:text,
            selectedText:text.slice(start,end) };
          return true;
        }
      } catch { /* Some input types do not expose selection ranges. */ }
      return false;
    }
    if (!target.isContentEditable) return false;
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    if (!(target === range.startContainer || target.contains(range.startContainer)) ||
        !(target === range.endContainer || target.contains(range.endContainer))) return false;
    capturedCursor = { target, kind:'rich', range:range.cloneRange(), baseText:text,
      selectedText:selection.toString() };
    return true;
  }

  function savedHostSelection(target) {
    const saved = capturedCursor;
    if (!saved || saved.target !== target || saved.baseText !== getText(target)) return null;
    if (saved.kind === 'plain') {
      if (saved.start < 0 || saved.end < saved.start || saved.end > getText(target).length) return null;
      return saved;
    }
    const r = saved.range;
    if (r && r.startContainer.isConnected && r.endContainer.isConnected &&
        target.contains(r.startContainer) && target.contains(r.endContainer)) return saved;
    return null;
  }

  function initialDraftForMode(target) {
    if (!target) return '';
    if (applyMode === 'replace') return getText(target);
    return savedHostSelection(target)?.selectedText || '';
  }

  function updateAutoApplyAvailability() {
    // Live insert would append a second copy at every keystroke; require explicit Apply.
    autoApplyCheckbox.disabled = applyMode === 'insert';
    autoOption.title = applyMode === 'insert'
      ? 'Inserção no cursor/seleção funciona apenas com Aplicar, para evitar duplicações.'
      : 'Sincronizar automaticamente o conteúdo completo';
    if (applyMode === 'insert') clearTimeout(autoApplyTimer);
  }

  function changeApplyMode(next) {
    if (!['replace','insert'].includes(next) || next === applyMode) return;
    if (!modalOpen && previewDirty) {
      peekModeSelect.value = applyMode;
      updatePeekStatus('Aplique ou descarte o rascunho antes de mudar o modo.');
      return;
    }
    const previous = applyMode;
    applyMode = next;
    storedLayout.applyMode = next;
    peekModeSelect.value = next;
    modalModeSelect.value = next;
    updateAutoApplyAvailability();
    saveLayout();
    if (modalOpen) {
      if (!modalChanged) {
        modalInput.value = next === 'replace' ? getText(modalTarget) : initialDraftForMode(modalTarget);
        modalInitialValue = modalInput.value;
        renderPreview(fullPreview, modalInput.value);
      } else {
        status.textContent = 'Seu texto foi preservado. Confira se é apenas o trecho que deseja inserir.';
      }
    } else {
      const target = previewSourceTarget && previewSourceTarget.isConnected ? previewSourceTarget : currentTarget;
      connectDraft(target, target ? getText(target) : '');
      lastPreviewText = null;
      updatePeekStatus(next === 'insert'
        ? 'Escreva um trecho para inserir na posição/seleção do campo original.'
        : 'Modo de substituição do conteúdo completo.');
      scheduleRefresh();
    }
  }

  peekModeSelect.addEventListener('change', () => changeApplyMode(peekModeSelect.value));
  modalModeSelect.addEventListener('change', () => changeApplyMode(modalModeSelect.value));

  function applyToOriginal(target, text, mode) {
    if (mode === 'replace') return setTextField(target, text);
    const saved = savedHostSelection(target);
    const before = getText(target);
    if (target.matches('textarea,input')) {
      if (target.matches('input') && /[\r\n]/.test(text)) return false;
      const start = saved?.kind === 'plain' ? saved.start : before.length;
      const end = saved?.kind === 'plain' ? saved.end : before.length;
      const newText = before.slice(0,start) + text + before.slice(end);
      const ok = setTextField(target,newText);
      if (!ok) return false;
      try { target.setSelectionRange(start+text.length,start+text.length); } catch { /* ignored */ }
      captureHostSelection(target);
      return true;
    }
    if (!target.isContentEditable) return false;
    target.focus();
    const selection = document.getSelection();
    if (!selection) return false;
    const range = saved?.kind === 'rich' ? saved.range.cloneRange() : document.createRange();
    if (!saved) { range.selectNodeContents(target); range.collapse(false); }
    selection.removeAllRanges();
    selection.addRange(range);
    const ok = document.execCommand('insertText',false,text);
    const after = getText(target);
    if (!ok || (after === before && saved?.selectedText !== text && text !== '')) return false;
    captureHostSelection(target);
    return true;
  }

  // KaTeX already includes many amsmath/amssymb/amsfonts commands. The
  // following *standalone* AMS environments can start display math without
  // surrounding \\[...\\] or $$...$$ (as in KaTeX auto-render). Internal
  // environments like aligned, cases, split and matrix still require an
  // enclosing math expression. Never auto-promote unsupported LaTeX packages.
  const standaloneMathEnvironments = new Set([
    'equation', 'equation*', 'align', 'align*', 'alignat', 'alignat*',
    'gather', 'gather*', 'CD'
  ]);

  function mathSegments(source) {
    const pieces = [];
    // Never parse LaTeX delimiters inside Markdown code fences or inline code.
    const protectedRanges = markdown.codeRanges(source);
    const protectedAt = index => protectedRanges.some(([start,end])=>index>=start && index<end);
    const delimiters = [
      { open: String.raw`\(`, close: String.raw`\)`, display: false },
      { open: String.raw`\[`, close: String.raw`\]`, display: true },
      { open: '$$', close: '$$', display: true }
    ];
    const escaped = (position) => {
      let slashes = 0;
      for (let i = position - 1; i >= 0 && source[i] === '\\'; i--) slashes++;
      return slashes % 2 === 1;
    };
    const nextStandaloneEnv = (from) => {
      const regex = /\\begin\{([a-zA-Z]+\*?)\}/g;
      regex.lastIndex = from;
      for (let match; (match = regex.exec(source)); ) {
        if (standaloneMathEnvironments.has(match[1]) && !escaped(match.index) && !protectedAt(match.index)) {
          return { index: match.index, open: match[0], close: `\\end{${match[1]}}`,
            display: true, environment: match[1] };
        }
      }
      return null;
    };
    let pos = 0;
    let count = 0;
    while (pos < source.length && count < 1000) {
      let earliest = nextStandaloneEnv(pos);
      for (const delim of delimiters) {
        let index = source.indexOf(delim.open, pos);
        while (index !== -1 && (escaped(index) || protectedAt(index))) index = source.indexOf(delim.open, index + delim.open.length);
        if (index !== -1 && (!earliest || index < earliest.index)) earliest = { ...delim, index };
      }
      if (!earliest) break;
      const from = earliest.index + earliest.open.length;
      let end = -1;
      if (earliest.environment) {
        // Ignore ends belonging to an equally named nested environment. Also
        // reject an escaped end token: the source must contain a complete pair.
        const boundaries = /\\(begin|end)\{([a-zA-Z]+\*?)\}/g;
        boundaries.lastIndex = from;
        let nesting = 1;
        for (let match; (match = boundaries.exec(source)); ) {
          if (escaped(match.index) || match[2] !== earliest.environment) continue;
          if (match[1] === 'begin') nesting++;
          else if (--nesting === 0) { end = match.index; break; }
        }
      } else {
        end = source.indexOf(earliest.close, from);
        while (end !== -1 && escaped(end)) end = source.indexOf(earliest.close, end + earliest.close.length);
      }
      if (end < 0) {
        // Preserve an unfinished environment or delimiter verbatim. This
        // prevents its body being prematurely rendered as another math mode.
        pieces.push({ kind:'text', value:source.slice(pos) });
        pos = source.length;
        break;
      }
      if (earliest.index > pos) pieces.push({ kind:'text', value:source.slice(pos,earliest.index) });
      const raw = source.slice(earliest.index, end + earliest.close.length);
      pieces.push({
        kind:'math',
        value:earliest.environment ? raw : source.slice(from,end),
        raw, display:earliest.display,
        openLength:earliest.open.length,
        closeLength:earliest.close.length,
        environment:earliest.environment || null
      });
      count++;
      pos = end + earliest.close.length;
    }
    if (pos < source.length) pieces.push({ kind:'text', value:source.slice(pos) });
    return pieces;
  }

  // centernot requires an external LaTeX package. Approximate its appearance
  // with \not solely for KaTeX previews; never rewrite the user's LaTeX.
  const displayMathSource = value => value.replace(/\\centernot(?=\\[A-Za-z]+)/g, '\\not');
  const katexOptions = (display) => ({
    displayMode: display,
    output: 'mathml',
    // KaTeX does not implement xfrac's \sfrac. This local-only macro approximates
    // its diagonal form; the source LaTeX stays exactly as authored.
    macros: {
      '\\sfrac': String.raw`{}^{#1}\! / \! {}_{#2}`,
      // commath and gensym aliases rendered locally; retain original source.
      '\\abs': String.raw`\left|#1\right|`,
      '\\norm': String.raw`\left\lVert#1\right\rVert`,
      '\\degree': String.raw`{}^\circ`
    },
    throwOnError: true,
    trust: false,
    strict: 'ignore',
    maxSize: 12,
    maxExpand: 500
  });

  // MathML Core in Chromium does not reliably honor double-struck/script
  // mathvariant. Display the corresponding Unicode math alphabet glyphs,
  // keeping KaTeX's original LaTeX annotation unchanged for round-tripping.
  function improveMathDisplay(container) {
    const specialDouble={C:'ℂ',H:'ℍ',N:'ℕ',P:'ℙ',Q:'ℚ',R:'ℝ',Z:'ℤ'};
    const specialScript={B:'ℬ',E:'ℰ',F:'ℱ',H:'ℋ',I:'ℐ',L:'ℒ',M:'ℳ',R:'ℛ',e:'ℯ',g:'ℊ',o:'ℴ'};
    for (const el of container.querySelectorAll('mi[mathvariant="double-struck"],mi[mathvariant="script"]')) {
      const kind=el.getAttribute('mathvariant');
      const original=el.textContent;
      const code=original.length===1 ? original.charCodeAt(0) : 0;
      let next=null;
      if (kind==='double-struck') {
        next=specialDouble[original] || (code>=65 && code<=90 ? String.fromCodePoint(0x1D538+code-65)
          : code>=97 && code<=122 ? String.fromCodePoint(0x1D552+code-97)
          : code>=48 && code<=57 ? String.fromCodePoint(0x1D7D8+code-48) : null);
      } else {
        next=specialScript[original] || (code>=65 && code<=90 ? String.fromCodePoint(0x1D49C+code-65)
          : code>=97 && code<=122 ? String.fromCodePoint(0x1D4B6+code-97) : null);
      }
      if (next) { el.textContent=next; el.setAttribute('mathvariant','normal'); }
    }
  }

  function mathToken(part) {
    const span = element('span', part.display ? 'la-equation la-math-token la-display' : 'la-equation la-math-token');
    span.contentEditable = 'false';
    span.tabIndex = 0;
    span.dataset.latexRaw = part.raw;
    span.title = `${part.raw} — dois cliques para editar`;
    try {
      katex.render(displayMathSource(part.value), span, katexOptions(part.display));
      improveMathDisplay(span);
    } catch (error) {
      span.classList.add('la-error');
      span.textContent = part.raw;
      span.title = String(error?.message || error);
    }
    return span;
  }

  function markdownToken(part) {
    const span=element('span','la-markdown-node la-markdown-token' + (part.block?' la-markdown-block':''));
    span.contentEditable='false';
    span.tabIndex=0;
    span.dataset.markdownRaw=part.raw;
    span.title=`${part.raw} — dois cliques para editar Markdown`;
    markdown.paint(span,part);
    return span;
  }

  function addMarkdownPreview(target,source) {
    for (const part of markdown.parts(source)) {
      if (part.kind==='text') target.appendChild(document.createTextNode(part.raw));
      else {
        const container=element('span','la-markdown-node' + (part.block?' la-markdown-block':''),undefined,target);
        markdown.paint(container,part);
      }
    }
  }

  function renderPreview(target, source) {
    target.replaceChildren();
    if (!source) {
      element('span', 'la-empty', 'Escreva uma expressão LaTeX para visualizar o resultado.', target);
      return false;
    }
    const parts = mathSegments(source);
    let hasMath = false;
    for (const part of parts) {
      if (part.kind === 'text') {
        addMarkdownPreview(target,part.value);
      } else {
        hasMath = true;
        const span = element('span', part.display ? 'la-equation la-display' : 'la-equation', undefined, target);
        try {
          katex.render(displayMathSource(part.value), span, katexOptions(part.display));
      improveMathDisplay(span);
          span.setAttribute('title', part.raw);
        } catch (error) {
          span.className = 'la-error';
          span.textContent = part.raw;
          span.title = String(error && error.message || error);
        }
      }
    }
    return hasMath;
  }

  // Editing is kept in an isolated draft. This avoids changing a host editor's
  // ProseMirror/React state until the user explicitly clicks Apply.
  // Rebuild the rendered preview from the raw draft. When the cursor is inside
  // the BODY of an explicitly delimited expression, leave just that expression
  // in source form so the user can continue typing into the shortcut template.
  function renderEditableDraft(keepMathSourceAt = null) {
    previewSoftBreakAtEnd = false;
    resetFormulaEditor();
    previewEditingFormula = false;
    peekBody.replaceChildren();
    if (!previewDraftText) {
      peekBody.dataset.placeholder = 'Escreva aqui. Dê dois cliques numa fórmula para editar o LaTeX.';
      return;
    }
    delete peekBody.dataset.placeholder;
    let offset = 0;
    for (const part of mathSegments(previewDraftText)) {
      if (part.kind === 'text') {
        for (const mdpart of markdown.parts(part.value)) {
          const from=offset;
          const to=from+mdpart.raw.length;
          // While typing inside Markdown syntax, keep the source directly
          // editable. Once its closing marker is completed, render it.
          const editing=keepMathSourceAt!==null &&
            keepMathSourceAt>from && keepMathSourceAt<to;
          if (mdpart.kind==='text' || editing)
            peekBody.appendChild(document.createTextNode(mdpart.raw));
          else peekBody.appendChild(markdownToken(mdpart));
          offset=to;
        }
      } else {
        // AMS environment markers vary in length; preserve source offsets.
        const innerStart = offset + part.openLength;
        const innerEnd = offset + part.raw.length - part.closeLength;
        const active = keepMathSourceAt !== null &&
          keepMathSourceAt >= innerStart && keepMathSourceAt <= innerEnd;
        if (active) peekBody.appendChild(document.createTextNode(part.raw));
        else peekBody.appendChild(mathToken(part));
        offset += part.raw.length;
      }
    }
    ensureTypingPositionAfterFormula();
  }

  // Chromium cannot place a usable caret after a non-editable block when that
  // block is the last child of a contenteditable. A zero-width text anchor
  // makes the position after the formula editable. It is never part of the
  // user's LaTeX source, copied text, or the text applied to the host.
  const caretAnchor = '\u200b';
  function ensureTypingPositionAfterFormula() {
    // An atomic MathML node cannot accept a caret. Without an editable text
    // node immediately AFTER *each* formula, Chromium may place a click just
    // to its right at the start of the entire preview (especially when the
    // following item is a block formula). The anchor is not part of LaTeX.
    for (const token of peekBody.querySelectorAll('.la-math-token, .la-markdown-token')) {
      const next = token.nextSibling;
      if (!next || next.nodeType !== Node.TEXT_NODE ||
          !(next.nodeValue || '').startsWith(caretAnchor)) {
        token.after(document.createTextNode(caretAnchor));
      }
    }
  }

  function serializeChildren(root) {
    // Convert noneditable MathML tokens and editable inline formulas back to
    // their exact LaTeX source. Support browser-generated DIV/P/BR on Enter.
    let s = '';
    let previous = null;
    for (const child of root.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        s += (child.nodeValue || '').replaceAll(caretAnchor, '');
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.classList.contains('la-math-token')) {
          s += child.dataset.latexRaw || '';
        } else if (child.classList.contains('la-markdown-token')) {
          s += child.dataset.markdownRaw || '';
        } else if (child.classList.contains('la-markdown-source')) {
          s += child.value || '';
        } else if (child.classList.contains('la-math-source')) {
          s += child.value || '';
        } else if (child.tagName === 'BR') {
          s += '\n';
        } else if (child.matches('div, p')) {
          if (previous !== null && !s.endsWith('\n')) s += '\n';
          s += serializeChildren(child);
        } else {
          s += serializeChildren(child);
        }
      }
      previous = child;
    }
    return s;
  }

  function currentPreviewText() {
    return fullTextOpen ? fullTextInput.value : serializeEditable();
  }

  function serializeEditable() {
    let raw = serializeChildren(peekBody).replaceAll('\u00a0', ' ');
    if (previewSoftBreakAtEnd && raw.endsWith('\n\n')) raw = raw.slice(0, -1);
    return raw;
  }

  function previewSelection() {
    // Chromium exposes selections in an open shadow root. Fall back for other
    // implementations, but never alter a selection outside our preview.
    return shadow.getSelection?.() || document.getSelection();
  }

  function editableSelectionRange() {
    const selection = previewSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!peekBody.contains(range.startContainer) ||
        !peekBody.contains(range.endContainer)) return null;
    return range;
  }

  function serializedOffsetForPoint(node, offset) {
    try {
      const range = document.createRange();
      range.selectNodeContents(peekBody);
      range.setEnd(node, offset);
      return serializeChildren(range.cloneContents()).replaceAll('\u00a0', ' ').length;
    } catch { return null; }
  }

  function capturePreviewCaret() {
    const range = editableSelectionRange();
    if (!range) return null;
    return serializedOffsetForPoint(range.endContainer, range.endOffset);
  }

  function caretRangeForSourceOffset(offset) {
    // Draft rendering is a flat list of text nodes and atomic math tokens.
    // Math tokens occupy their raw LaTeX length in the logical source string.
    const range = document.createRange();
    let remaining = Math.max(0, offset);
    for (let index = 0; index < peekBody.childNodes.length; index++) {
      const child = peekBody.childNodes[index];
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.nodeValue || '';
        const length = text.replaceAll(caretAnchor, '').length;
        if (remaining <= length) {
          // Map a source offset into the DOM text node while skipping the
          // invisible caret anchor, so typing resumes AFTER the token.
          let consumed = 0, domOffset = 0;
          while (domOffset < text.length && (consumed < remaining || text[domOffset] === caretAnchor)) {
            if (text[domOffset] !== caretAnchor) consumed++;
            domOffset++;
          }
          range.setStart(child, domOffset); range.collapse(true); return range;
        }
        remaining -= length;
      } else if (child.nodeType === Node.ELEMENT_NODE && (child.classList.contains('la-math-token') || child.classList.contains('la-markdown-token'))) {
        const length = (child.dataset.latexRaw || child.dataset.markdownRaw || '').length;
        if (remaining < length) {
          range.setStart(peekBody, index + (remaining > length / 2 ? 1 : 0));
          range.collapse(true); return range;
        }
        if (remaining === length) {
          range.setStart(peekBody, index + 1); range.collapse(true); return range;
        }
        remaining -= length;
      }
    }
    range.selectNodeContents(peekBody);
    range.collapse(false);
    return range;
  }

  function restorePreviewCaret(offset) {
    if (offset === null) return;
    const selection = previewSelection();
    if (!selection) return;
    try {
      const range = caretRangeForSourceOffset(offset);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch { /* A host selection change may have intervened. */ }
  }

  // Unlike blur-only tokenization in v1.7, check the editor during input.
  // A just-completed expression becomes MathML immediately when the cursor
  // exits its math body; unfinished shortcuts remain writable as plain source.
  function renderCompletedMathNow(preferEmptyMathCaret = false) {
    if (previewIsComposing || previewEditingFormula || !peekBody.isConnected) return;
    const text = serializeEditable();
    const parts = mathSegments(text);
    const mathParts = parts.filter(p => p.kind === 'math');
    const existingTokens = Array.from(peekBody.querySelectorAll('.la-math-token'));
    if (mathParts.length <= existingTokens.length) return;
    // Match each token to its original source span, rather than simply
    // counting tokens. Otherwise a new shortcut after an existing formula
    // would trigger a needless rebuild on every keystroke inside the template.
    const renderedPositions = new Set(existingTokens.map(token => {
      const index = Array.prototype.indexOf.call(token.parentNode.childNodes, token);
      const start = serializedOffsetForPoint(token.parentNode, index);
      return `${start}:${token.dataset.latexRaw || ''}`;
    }));
    const caret = capturePreviewCaret();
    let sourceOffset = 0, shouldRender = false;
    for (const part of parts) {
      if (part.kind === 'math') {
        const bodyStart = sourceOffset + part.openLength;
        const bodyEnd = sourceOffset + part.raw.length - part.closeLength;
        const alreadyRendered = renderedPositions.has(`${sourceOffset}:${part.raw}`);
        const body = part.raw.slice(part.openLength, part.raw.length - part.closeLength);
        // When the user JUST completes an empty math-mode pair, place the
        // caret back INSIDE its body rather than atomizing it immediately.
        // This also handles whitespace-only multiline bodies such as
        // "\\[\n\n\\]". Nothing is added to the serialized source.
        if (preferEmptyMathCaret && !alreadyRendered &&
            caret === sourceOffset + part.raw.length && body.trim() === '') {
          // For a block template with line breaks, enter on the first inner
          // line. For inline pairs, enter immediately after the opening tag.
          const firstNewline = /^\r?\n/.exec(body);
          const destination = bodyStart + (firstNewline ? firstNewline[0].length : 0);
          // Browser-generated DIV/BR nodes from Enter are not a flat text
          // tree. Normalize this one just-completed empty pair before
          // restoring its source offset (and do not render it as a token).
          if (text !== previewDraftText) setDraft(text);
          renderEditableDraft(destination);
          restorePreviewCaret(destination);
          return;
        }
        if (!alreadyRendered && (caret === null || caret < bodyStart || caret > bodyEnd)) {
          shouldRender = true;
          break;
        }
      }
      sourceOffset += part.kind === 'math' ? part.raw.length : part.value.length;
    }
    if (!shouldRender) return;
    const previousOffset = caret;
    if (text !== previewDraftText) setDraft(text);
    renderEditableDraft(caret);
    restorePreviewCaret(previousOffset);
  }

  function renderCompletedMarkdownNow() {
    if (previewIsComposing || previewEditingFormula || fullTextOpen ||
        !peekBody.isConnected || peekBody.querySelector('.la-markdown-source')) return;
    const raw=serializeEditable();
    const caret=capturePreviewCaret();
    if (caret===null) return;
    const rendered=new Set(Array.from(peekBody.querySelectorAll('.la-markdown-token')).map(token=>{
      const index=Array.prototype.indexOf.call(token.parentNode.childNodes,token);
      return `${serializedOffsetForPoint(token.parentNode,index)}:${token.dataset.markdownRaw}`;
    }));
    let position=0, change=false;
    for (const mathpart of mathSegments(raw)) {
      if (mathpart.kind==='math') {position+=mathpart.raw.length;continue;}
      for (const part of markdown.parts(mathpart.value)) {
        const end=position+part.raw.length;
        // Never turn an unfinished heading/list/fence into an atomic block
        // while the user is still typing its current line.
        if (part.kind==='markdown' && caret>=end &&
            (!part.block || /\n$/.test(part.raw)) &&
            !rendered.has(`${position}:${part.raw}`)) change=true;
        position=end;
      }
    }
    if (change) {
      if (raw!==previewDraftText) setDraft(raw);
      renderEditableDraft(caret);
      restorePreviewCaret(caret);
    }
  }

  function beginMarkdownEdit(token) {
    if (!token?.isConnected || fullTextOpen) return;
    if (activeFormulaEdit) finishCurrentFormulaEdit();
    const raw=token.dataset.markdownRaw || '';
    const start=serializedOffsetForPoint(token.parentNode,
      Array.prototype.indexOf.call(token.parentNode.childNodes,token));
    const multiline=/[\r\n]/.test(raw);
    const field=element(multiline?'textarea':'input','la-markdown-source');
    if (!multiline) field.type='text';
    field.value=raw;
    token.replaceWith(field);
    let finishing=false;
    const finish=(value)=>{
      if (finishing || !field.isConnected) return;
      finishing=true; // Replacing a focused field fires blur synchronously.
      const parent=field.parentNode;
      if (!parent || !Array.from(parent.childNodes).includes(field)) return;
      parent.replaceChild(document.createTextNode(value),field);
      setDraft(serializeEditable());
      renderEditableDraft();
      restorePreviewCaret(start+value.length);
      if (autoApply && applyMode==='replace' && previewDirty) scheduleAutoApply();
    };
    field.addEventListener('input',()=>setDraft(serializeEditable()));
    field.addEventListener('keydown',e=>{
      if (e.key==='Escape') {e.preventDefault();e.stopPropagation();finish(raw);}
      else if (e.key==='Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
        e.preventDefault();e.stopPropagation();finish(field.value);
      }
    });
    field.addEventListener('blur',()=>finish(field.value));
    field.focus({preventScroll:true});field.select();
  }

  function shortcutTemplateContent(template, selected) {
    // A literal template is never executed as JS or interpreted as HTML.
    const pieces = template.split(/(\{\{cursor\}\}|\{\{selection\}\})/g);
    let text = '', caret = null;
    for (const part of pieces) {
      if (part === CURSOR_MARKER) caret = text.length;
      else if (part === SELECTION_MARKER) text += selected;
      else text += part;
    }
    return {text, caretOffset:caret === null ? text.length : caret};
  }

  function insertMathShortcut(definition) {
    const template = definition?.template;
    if (typeof template !== 'string') return;
    if (fullTextOpen) {
      const start = fullTextInput.selectionStart;
      const end = fullTextInput.selectionEnd;
      const selected = fullTextInput.value.slice(start,end);
      const built = shortcutTemplateContent(template,selected);
      fullTextInput.setRangeText(built.text,start,end,'end');
      const caret = start + built.caretOffset;
      fullTextInput.setSelectionRange(caret,caret);
      syncFullTextDraft();
      fullTextInput.focus({preventScroll:true});
      return;
    }
    if (activeFormulaEdit) finishCurrentFormulaEdit();
    let range = editableSelectionRange()?.cloneRange();
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(peekBody);
      range.collapse(false);
    }
    const selectedText = serializeChildren(range.cloneContents());
    peekBody.focus({preventScroll:true});
    const selection = previewSelection();
    if (!selection) return;
    const built = shortcutTemplateContent(template,selectedText);
    range.deleteContents();
    const node = document.createTextNode(built.text);
    range.insertNode(node);
    const newRange = document.createRange();
    newRange.setStart(node,built.caretOffset);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);
    previewSoftBreakAtEnd = false;
    setDraft(serializeEditable());
    // Never prematurely render a new math body while the cursor is inside it.
  }

  function renderShortcutButtons() {
    shortcutItems.replaceChildren();
    for (const definition of shortcuts) {
      const button = element('button','la-shortcut',undefined,shortcutItems);
      button.type='button';
      button.dataset.shortcutId=definition.id;
      button.title=`Inserir atalho: ${definition.label}`;
      element('span','',definition.label,button);
      const compact=definition.template
        .replaceAll(CURSOR_MARKER,'').replaceAll(SELECTION_MARKER,'')
        .split('\n').find(piece=>piece.trim()) || '';
      if (compact && compact.trim() !== definition.label) {
        const code=element('code','',compact.trim().slice(0,28),button);
        code.title=definition.template;
      }
      button.addEventListener('pointerdown',event=>{
        if (event.button===0) event.preventDefault();
      });
      button.addEventListener('click',()=>insertMathShortcut(definition));
    }
  }
  renderShortcutButtons();

  function eventKeyCombo(event) {
    if (event.metaKey || event.isComposing || event.key === 'Process') return '';
    const key=event.code?.match(/^Key([A-Z])$/)?.[1]
      || event.code?.match(/^Digit([0-9])$/)?.[1]
      || (/^F(?:[2-9]|1[0-2])$/.test(event.code || '') ? event.code : '');
    if (!key) return '';
    return [event.ctrlKey?'Ctrl':null,event.altKey?'Alt':null,event.shiftKey?'Shift':null,key].filter(Boolean).join('+');
  }
  function isCustomKeyAllowed(key) {
    if (typeof key !== 'string' || !/^(?:(?:Ctrl|Alt)\+)(?:(?:Ctrl|Alt|Shift)\+)*(?:[A-Z0-9]|F(?:[2-9]|1[0-2]))$/.test(key)) return false;
    const parts=key.split('+');
    if (new Set(parts).size !== parts.length) return false;
    if (parts.filter(part=>part==='Ctrl' || part==='Alt').length<1) return false;
    if (parts.filter(part=>part==='Ctrl' || part==='Alt').length>2) return false;
    if (parts.includes('Shift') && parts.indexOf('Shift')<Math.max(parts.indexOf('Ctrl'),parts.indexOf('Alt'))) return false;
    return !FIXED_KEY_ACTIONS[key] && !RESERVED_KEY_COMBOS.has(key);
  }
  function isValidKeyboardAction(action) {
    return KEYBOARD_FORMAT_ACTIONS.some(item=>item[0]===action)
      || (action.startsWith('snippet:') && /^snippet:[A-Za-z0-9_-]{1,80}$/.test(action))
      || catalogActions.has(action);
  }
  function keyboardActionOptions() {
    return [
      ...KEYBOARD_FORMAT_ACTIONS,
      ...shortcuts.map(item=>[`snippet:${item.id}`,`Inserir: ${item.label}`]),
      ...Array.from(catalogActions,([id,record])=>[id,`Símbolo: ${record.item.label} (${record.item.command.slice(0,40)})`])
    ];
  }
  function keyboardMessage(message,warning=false) {
    keyboardStatus.textContent=message;
    keyboardStatus.classList.toggle('la-warning',warning);
  }
  function drawKeyboardRows() {
    keyboardFixedRows.replaceChildren();
    for (const [key,action] of Object.entries(FIXED_KEY_ACTIONS)) {
      const row=element('div','la-kbrow',undefined,keyboardFixedRows);
      const keyCell=element('button','la-kbcombo',`${key} 🔒`,row);
      keyCell.type='button'; keyCell.disabled=true;
      element('span','',KEYBOARD_FORMAT_ACTIONS.find(x=>x[0]===action)?.[1] || action,row);
      element('span','','Fixo',row);
    }
    keyboardCustomRows.replaceChildren();
    for (const [i,binding] of (pendingKeyBindings || []).entries()) {
      const row=element('div','la-kbrow',undefined,keyboardCustomRows);
      const keyButton=element('button','la-kbcombo',binding.key || 'Gravar teclas…',row);
      keyButton.type='button';
      keyButton.title='Clique e pressione uma combinação';
      keyButton.addEventListener('click',()=>{
        keyButton.textContent='Pressione…';
        keyButton.classList.add('la-recording');
        keyButton.dataset.recording='1';
        keyButton.focus({preventScroll:true});
        keyboardMessage('Pressione Ctrl ou Alt com uma letra, número ou F2–F12. Escape cancela.');
      });
      keyButton.addEventListener('keydown',event=>{
        if (keyButton.dataset.recording!=='1') return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key==='Escape') {drawKeyboardRows();keyboardMessage('Gravação cancelada.');return;}
        const key=eventKeyCombo(event);
        if (!key) return;
        if (!isCustomKeyAllowed(key)) {
          keyboardMessage('Combinação reservada ou inválida. Escolha outra.',true); return;
        }
        if (pendingKeyBindings.some((x,index)=>index!==i && x.key===key)) {
          keyboardMessage('Esta combinação já está em uso.',true); return;
        }
        binding.key=key;
        drawKeyboardRows(); keyboardMessage(`${key} atribuído. Salve para confirmar.`);
      },true);
      const action=element('select','la-kbaction',undefined,row);
      action.setAttribute('aria-label',`Ação do atalho ${i+1}`);
      for (const [value,label] of keyboardActionOptions()) {
        const option=element('option','',label,action); option.value=value;
      }
      if (!keyboardActionOptions().some(x=>x[0]===binding.action)) {
        const missing=element('option','','Modelo não encontrado',action);
        missing.value=binding.action; missing.disabled=true;
      }
      action.value=binding.action;
      action.addEventListener('change',()=>{ binding.action=action.value; });
      const remove=element('button','la-kbdelete','✕',row);
      remove.type='button';remove.title='Remover atalho';
      remove.setAttribute('aria-label',`Remover atalho ${binding.key || i+1}`);
      remove.addEventListener('click',()=>{pendingKeyBindings.splice(i,1);drawKeyboardRows();});
    }
  }
  function openKeyboardWindow(preselectAction=null) {
    if (!keyboardWindowOpen) {
      pendingKeyBindings=keyboardBindings.map(x=>({...x}));
      keyboardWindowOpen=true;
    }
    let symbolBindingIndex=-1;
    let isNewSymbolBinding=false;
    const selectingSymbol=typeof preselectAction==='string' && catalogActions.has(preselectAction);
    if (selectingSymbol) {
      symbolBindingIndex=pendingKeyBindings.findIndex(item=>item.action===preselectAction);
      if (symbolBindingIndex<0) {
        if (pendingKeyBindings.length>=25) {
          keyboardWindow.classList.remove('la-hidden');
          drawKeyboardRows();
          keyboardMessage('Limite de 25 atalhos. Remova um atalho antes de adicionar outro.',true);
          return;
        }
        pendingKeyBindings.push({key:'',action:preselectAction});
        symbolBindingIndex=pendingKeyBindings.length-1;
        isNewSymbolBinding=true;
      }
    }
    keyboardWindow.classList.remove('la-hidden');
    drawKeyboardRows();
    keyboardMessage(selectingSymbol
      ? 'Símbolo selecionado. Grave uma combinação e clique em Salvar.'
      : 'Selecione uma combinação e uma ação; salve para aplicar.');
    if (symbolBindingIndex>=0) {
      const recordButton=keyboardCustomRows.querySelectorAll('.la-kbcombo')[symbolBindingIndex];
      if (recordButton) {
        recordButton.focus({preventScroll:true});
        if (isNewSymbolBinding) recordButton.click();
      }
    }
    keyboardWindow.style.left=`${Math.max(8,Math.round((innerWidth-keyboardWindow.getBoundingClientRect().width)/2))}px`;
    keyboardWindow.style.top=`${Math.max(8,Math.round((innerHeight-keyboardWindow.getBoundingClientRect().height)/2))}px`;
  }
  function closeKeyboardWindow() {
    keyboardWindowOpen=false; pendingKeyBindings=null;
    keyboardWindow.classList.add('la-hidden');
  }
  keyboardSettingsTrigger.addEventListener('click',openKeyboardWindow);
  for (const info of [previewFormatTools,modalFormatTools,fullTextFormatTools]) {
    if (info.keysTrigger) info.keysTrigger.addEventListener('click',openKeyboardWindow);
  }
  keyboardClose.addEventListener('click',closeKeyboardWindow);
  keyboardCancel.addEventListener('click',closeKeyboardWindow);
  keyboardReset.addEventListener('click',()=>{ pendingKeyBindings=[];drawKeyboardRows();keyboardMessage('Atalhos personalizados limpos no rascunho.'); });
  keyboardNew.addEventListener('click',()=>{
    if (pendingKeyBindings.length >= 25) return keyboardMessage('Máximo de 25 atalhos.',true);
    pendingKeyBindings.push({key:'',action:'format:bold'});
    drawKeyboardRows();
    keyboardMessage('Clique em “Gravar teclas…” no novo atalho.');
  });
  keyboardSave.addEventListener('click',()=>{
    const used=new Set();
    for (const item of pendingKeyBindings) {
      if (!isCustomKeyAllowed(item.key) || !isValidKeyboardAction(item.action) || used.has(item.key))
        return keyboardMessage('Revise as combinações vazias, duplicadas ou reservadas.',true);
      used.add(item.key);
    }
    keyboardBindings=pendingKeyBindings.map(x=>({...x}));
    storedLayout.keyboardBindings=keyboardBindings.map(x=>({...x}));
    saveLayout(); closeKeyboardWindow();
  });
  keyboardWindow.addEventListener('keydown',event=>{
    if(event.key==='Escape' && !event.target.closest('[data-recording="1"]')) {
      event.preventDefault();event.stopPropagation();closeKeyboardWindow();
    }
  });

  function shortcutEditorMessage(message, warning=false) {
    scStatus.textContent=message;
    scStatus.classList.toggle('la-warning',warning);
  }
  function selectedShortcut() { return editingShortcuts?.find(s=>s.id===chosenShortcutId) || null; }
  function refreshShortcutForm() {
    const selected=selectedShortcut();
    scName.disabled=scTemplate.disabled=scCaretMarker.disabled=scSelectionMarker.disabled=!selected;
    scName.value=selected?.label || '';
    scTemplate.value=selected?.template || '';
  }
  function refreshShortcutList() {
    scList.replaceChildren();
    if (!editingShortcuts?.length) {
      element('div','la-schelp','Nenhum atalho configurado.',scList);
    }
    editingShortcuts?.forEach((entry,index)=>{
      const row=element('div','la-scrow',undefined,scList);
      const pick=element('button','la-scpick',entry.label || '(sem nome)',row);
      pick.type='button'; pick.title=entry.label || 'Atalho sem nome';
      pick.setAttribute('aria-current',String(entry.id===chosenShortcutId));
      pick.addEventListener('click',()=>{
        chosenShortcutId=entry.id; refreshShortcutList(); refreshShortcutForm();
      });
      for (const [caption,distance,tip] of [['↑',-1,'Subir'],['↓',1,'Descer']]) {
        const move=element('button','la-scsmall',caption,row); move.type='button';
        move.title=tip; move.setAttribute('aria-label',`${tip} ${entry.label}`);
        move.disabled=index+distance<0 || index+distance>=editingShortcuts.length;
        move.addEventListener('click',()=>{
          const other=index+distance;
          [editingShortcuts[index],editingShortcuts[other]]=[editingShortcuts[other],editingShortcuts[index]];
          chosenShortcutId=entry.id; refreshShortcutList();
        });
      }
      const remove=element('button','la-scsmall','×',row); remove.type='button';
      remove.title=`Excluir ${entry.label}`; remove.setAttribute('aria-label',`Excluir ${entry.label}`);
      remove.addEventListener('click',()=>{
        editingShortcuts.splice(index,1);
        chosenShortcutId=editingShortcuts[Math.min(index,editingShortcuts.length-1)]?.id || null;
        refreshShortcutList(); refreshShortcutForm();
        shortcutEditorMessage('Atalho excluído do rascunho. Salve para confirmar.');
      });
    });
  }
  function openShortcutEditor() {
    editingShortcuts=cloneShortcuts(shortcuts);
    chosenShortcutId=editingShortcuts[0]?.id || null;
    shortcutWindowOpen=true;
    shortcutWindow.classList.remove('la-hidden');
    refreshShortcutList(); refreshShortcutForm();
    shortcutEditorMessage('As alterações só serão usadas após salvar.');
    placeShortcutWindow();
    if (chosenShortcutId) scName.focus({preventScroll:true}); else scNew.focus({preventScroll:true});
  }
  function closeShortcutEditor() {
    shortcutWindowOpen=false; editingShortcuts=null; chosenShortcutId=null;
    shortcutWindow.classList.add('la-hidden');
  }
  function validateShortcutDraft(list) {
    if (!Array.isArray(list) || list.length>25) return 'Máximo de 25 atalhos.';
    const seen=new Set();
    for (const item of list) {
      if (!item.label.trim()) return 'Todo atalho precisa de um nome.';
      if (item.label.length>40) return 'O nome deve ter até 40 caracteres.';
      if (!item.template.trim()) return 'O código do atalho não pode ficar vazio.';
      if (item.template.length>8000) return 'O código deve ter até 8.000 caracteres.';
      if (item.template.split(CURSOR_MARKER).length>2) return 'Use no máximo um marcador de cursor por atalho.';
      if (item.template.split(SELECTION_MARKER).length>2) return 'Use no máximo um marcador de seleção por atalho.';
      if (seen.has(item.id)) return 'Identificadores de atalhos repetidos.';
      seen.add(item.id);
    }
    return '';
  }
  function updateChosenShortcut() {
    const selected=selectedShortcut();
    if (!selected) return;
    selected.label=scName.value;
    selected.template=scTemplate.value;
    // Update list labels without rebuilding the input focused in the form.
    const listButton=Array.from(scList.querySelectorAll('.la-scpick')).find(el=>el.getAttribute('aria-current')==='true');
    if (listButton) listButton.textContent=selected.label || '(sem nome)';
  }
  function insertShortcutMarker(marker) {
    const selected=selectedShortcut(); if (!selected) return;
    const start=scTemplate.selectionStart, end=scTemplate.selectionEnd;
    scTemplate.setRangeText(marker,start,end,'end');
    scTemplate.setSelectionRange(start+marker.length,start+marker.length);
    updateChosenShortcut(); scTemplate.focus({preventScroll:true});
  }
  scName.addEventListener('input',updateChosenShortcut);
  scTemplate.addEventListener('input',updateChosenShortcut);
  scCaretMarker.addEventListener('click',()=>insertShortcutMarker(CURSOR_MARKER));
  scSelectionMarker.addEventListener('click',()=>insertShortcutMarker(SELECTION_MARKER));
  scNew.addEventListener('click',()=>{
    if (editingShortcuts.length>=25) return shortcutEditorMessage('Máximo de 25 atalhos.',true);
    const id=`custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    editingShortcuts.push({id,label:'Novo atalho',template:CURSOR_MARKER});
    chosenShortcutId=id; refreshShortcutList(); refreshShortcutForm();
    scName.focus({preventScroll:true}); scName.select();
  });
  scReset.addEventListener('click',()=>{
    editingShortcuts=cloneShortcuts(DEFAULT_SHORTCUTS);
    chosenShortcutId=editingShortcuts[0].id;
    refreshShortcutList(); refreshShortcutForm();
    shortcutEditorMessage('Padrões restaurados no rascunho. Clique em Salvar para confirmar.');
  });
  scSave.addEventListener('click',()=>{
    updateChosenShortcut();
    const error=validateShortcutDraft(editingShortcuts);
    if (error) {shortcutEditorMessage(error,true); return;}
    shortcuts=cloneShortcuts(editingShortcuts);
    storedLayout.shortcuts=cloneShortcuts(shortcuts);
    saveLayout();
    renderShortcutButtons();
    closeShortcutEditor();
  });
  scCancel.addEventListener('click',closeShortcutEditor);
  scClose.addEventListener('click',closeShortcutEditor);
  shortcutWindow.addEventListener('keydown',event=>{
    if (event.key==='Escape') {event.preventDefault();event.stopPropagation();closeShortcutEditor();}
  });
  editShortcutButton.addEventListener('click',()=>shortcutWindowOpen?closeShortcutEditor():openShortcutEditor());

  function applyShortcutWindowSize() {
    const s=storedLayout.shortcutsSize || {width:690,height:440};
    shortcutWindow.style.width=`${Math.max(Math.min(300,innerWidth-16),Math.min(innerWidth-16,s.width))}px`;
    shortcutWindow.style.height=`${Math.max(Math.min(240,innerHeight-16),Math.min(innerHeight-16,s.height))}px`;
  }
  function placeShortcutWindow() {
    applyShortcutWindowSize();
    if (storedLayout.shortcutsWindow) return applyPosition(shortcutWindow,storedLayout.shortcutsWindow);
    const pr=peek.getBoundingClientRect(), wr=shortcutWindow.getBoundingClientRect();
    const x=innerWidth-pr.right>=wr.width+12?pr.right+8:
      pr.left>=wr.width+12?pr.left-wr.width-8:(innerWidth-wr.width)/2;
    const y=Math.min(pr.top,Math.max(8,innerHeight-wr.height-8));
    applyPosition(shortcutWindow,{x,y});
  }

  function updatePeekStatus(message = '') {
    applyPeek.disabled = !previewDirty || !previewSourceTarget?.isConnected;
    forceApplyPeek.classList.toggle('la-hidden', !previewConflict || !previewDirty);
    peekStatus.classList.toggle('la-warning', previewDirty || previewConflict);
    peekStatus.textContent = message || (previewConflict
      ? 'O texto do campo mudou; a prévia foi preservada. Descarte, copie ou confirme a substituição.'
      : applyMode === 'insert' ? (previewDirty ? 'Trecho pronto para inserir no cursor/seleção' : 'Escreva o trecho a inserir')
      : autoApplyPaused ? 'Automático pausado: use Aplicar ou Copiar'
      : autoApply && previewDirty ? 'Sincronizando alterações…'
      : autoApply ? 'Aplicação automática ativa · sem enviar'
      : previewDirty ? 'Rascunho pendente de aplicação'
      : 'Duplo clique em fórmulas para editar');
  }

  function setDraft(text, {dirty = true} = {}) {
    previewDraftText = text;
    previewDirty = dirty && text !== (applyMode === 'insert' ? previewInsertSeed : previewBaseText);
    previewConflict = Boolean(previewDirty && previewSourceTarget?.isConnected &&
      getText(previewSourceTarget) !== previewBaseText);
    if (previewConflict) autoApplyPaused = true;
    if (applyMode === 'replace' && autoApply && previewDirty && !previewEditingFormula && !autoApplyPaused) scheduleAutoApply();
    else if (!previewDirty) clearTimeout(autoApplyTimer);
    updatePeekStatus();
  }

  function connectDraft(target, text) {
    clearTimeout(autoApplyTimer);
    previewSourceTarget = target;
    previewBaseText = text;
    previewInsertSeed = applyMode === 'insert' ? (savedHostSelection(target)?.selectedText || '') : '';
    previewDraftText = applyMode === 'insert' ? previewInsertSeed : text;
    if (fullTextOpen) fullTextInput.value = previewDraftText;
    previewDirty = false;
    previewConflict = false;
    autoApplyPaused = false;
    clearTimeout(autoApplyTimer);
    renderEditableDraft();
    updatePeekStatus();
  }

  function syncDraftWithSource(target, text) {
    if (previewDirty) {
      if (target !== previewSourceTarget || (previewSourceTarget?.isConnected && getText(previewSourceTarget) !== previewBaseText)) {
        previewConflict = true;
        autoApplyPaused = true;
        updatePeekStatus(target !== previewSourceTarget
          ? 'Rascunho de outro campo preservado. Descarte ou copie antes de trocar.'
          : 'O campo foi editado fora da prévia. Descarte ou confirme a substituição.');
      }
      return;
    }
    if (target !== previewSourceTarget || text !== previewBaseText) connectDraft(target, text);
    else if (previewConflict) { previewConflict = false; autoApplyPaused = false; updatePeekStatus(); }
  }

  // Whole-message editing mode. The textarea is authoritative while open;
  // the preview shows rendered mathematics and is deliberately read-only.
  function syncFullTextDraft() {
    if (!fullTextOpen) return;
    const top = peekBody.scrollTop;
    setDraft(fullTextInput.value);
    renderEditableDraft();
    peekBody.scrollTop = top;
  }

  function placeFullTextWindow() {
    applyFullTextSize();
    const pr = peek.getBoundingClientRect();
    const wr = fullTextWindow.getBoundingClientRect();
    const candidate = storedLayout.fullText || (() => {
      if (innerWidth - pr.right >= wr.width + 16) return {x:pr.right + 12,y:pr.top};
      if (pr.left >= wr.width + 16) return {x:pr.left - wr.width - 12,y:pr.top};
      if (innerHeight - pr.bottom >= wr.height + 16) return {x:pr.left,y:pr.bottom + 12};
      return {x:Math.max(8,innerWidth - wr.width - 18),y:Math.max(8,pr.top + 35)};
    })();
    applyPosition(fullTextWindow,candidate);
  }

  function setFullTextEditor(open) {
    if (open === fullTextOpen) return;
    if (open) {
      if (activeFormulaEdit) finishCurrentFormulaEdit();
      fullTextInput.value = serializeEditable();
      fullTextOpen = true;
      peekBody.contentEditable = 'false';
      peekBody.classList.add('la-preview-readonly');
      fullTextWindow.classList.remove('la-hidden');
      fullTextSwitch.textContent = 'Editar inline';
      fullTextSwitch.title = 'Voltar a editar diretamente na prévia';
      placeFullTextWindow();
      fullTextInput.focus({preventScroll:true});
      fullTextInput.setSelectionRange(fullTextInput.value.length,fullTextInput.value.length);
    } else {
      const text = fullTextInput.value;
      fullTextOpen = false;
      fullTextWindow.classList.add('la-hidden');
      peekBody.contentEditable = 'true';
      peekBody.classList.remove('la-preview-readonly');
      fullTextSwitch.textContent = 'Editar texto separado';
      fullTextSwitch.title = 'Editar toda a mensagem numa janela móvel e redimensionável';
      setDraft(text);
      renderEditableDraft();
      peekBody.focus({preventScroll:true});
      const caret = caretRangeForSourceOffset(text.length);
      const selection = previewSelection();
      if (selection) { selection.removeAllRanges(); selection.addRange(caret); }
    }
    updatePeekStatus(open ? 'Edição completa separada · prévia renderizada' : 'Edição inline ativa');
  }
  fullTextSwitch.addEventListener('click', () => setFullTextEditor(!fullTextOpen));
  fullTextInlineButton.addEventListener('click', () => setFullTextEditor(false));
  fullTextClose.addEventListener('click', () => setFullTextEditor(false));
  fullTextInput.addEventListener('input', syncFullTextDraft);
  fullTextInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setFullTextEditor(false); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // Ctrl+Enter explicitly applies only in MANUAL mode. In auto mode the
      // pending 280ms sync will handle it without disturbing the caret.
      e.preventDefault(); e.stopPropagation();
      if (!autoApply || applyMode === 'insert') applyPeekDraft();
    }
  });
  fullTextInput.addEventListener('focusout', () => {
    if (autoApply && applyMode === 'replace' && previewDirty) scheduleAutoApply();
  });

  // A single active formula is shared between inline and detached editing.
  // The formula stays a non-editable MathML token in the main preview while
  // editing its source in the detached textarea.
  function updateFormulaModeButton() {
    inlineFormulaSwitch.classList.toggle('la-hidden', !activeFormulaEdit);
    inlineFormulaSwitch.textContent = activeFormulaEdit?.mode === 'detached' ? 'Editar inline' : 'Editar separado';
    inlineFormulaSwitch.setAttribute('aria-label', inlineFormulaSwitch.textContent);
  }

  function resetFormulaEditor() {
    activeFormulaEdit = null;
    previewEditingFormula = false;
    formulaWindow.classList.add('la-hidden');
    updateFormulaModeButton();
  }

  function aSingleMathPart(raw) {
    const parts = mathSegments(raw);
    return parts.length === 1 && parts[0].kind === 'math' && parts[0].raw === raw ? parts[0] : null;
  }

  function renderDetachedToken(state) {
    if (!state?.token?.isConnected) return false;
    const raw = state.token.dataset.latexRaw || '';
    const part = aSingleMathPart(raw);
    let errorText = '';
    if (part) {
      // Render into a temporary element first, so incomplete input never
      // replaces the last successfully rendered formula with its source code.
      const scratch = element('span');
      try {
        katex.render(displayMathSource(part.value), scratch, katexOptions(part.display));
      improveMathDisplay(scratch);
        state.token.replaceChildren(...Array.from(scratch.childNodes));
        state.lastGoodRaw = raw;
        state.token.classList.toggle('la-display', part.display);
      } catch (error) { errorText = error?.message || 'Expressão incompleta'; }
    } else {
      errorText = 'Verifique os delimitadores do math mode.';
    }
    const valid = !errorText;
    state.token.classList.toggle('la-separated-invalid', !valid);
    state.token.classList.add('la-separated-active');
    state.token.title = raw + (valid ? '' : ' — expressão ainda não renderizável');
    formulaInfo.classList.toggle('la-warning', !valid);
    formulaInfo.textContent = valid
      ? 'Prévia atualizada. Concluir mantém o rascunho; Aplicar atualiza o campo.'
      : `Ainda não renderizável: ${errorText}`;
    return valid;
  }

  function commitInlineMath(state, raw) {
    if (!state || state.mode !== 'inline' || activeFormulaEdit !== state) return;
    const field = state.field;
    if (!field?.isConnected) { resetFormulaEditor(); return; }
    field.replaceWith(document.createTextNode(raw));
    // setDraft must read the raw code before rebuilding the token tree.
    previewEditingFormula = false;
    setDraft(serializeEditable());
    renderEditableDraft();
    if (autoApply && applyMode === 'replace' && previewDirty) scheduleAutoApply();
  }

  function sizeInlineMathField(field) {
    if (field.tagName === 'TEXTAREA') {
      const lines = field.value.split('\n');
      const longest = Math.max(0, ...lines.map(line => line.length));
      // Keep a comfortably sized, scrollable editable source area without
      // normalizing or removing any line break from the formula.
      field.rows = Math.min(18, Math.max(3, lines.length));
      field.style.width = `${Math.min(72, Math.max(26, longest + 4))}ch`;
    } else {
      field.style.width = `${Math.min(65, Math.max(13, field.value.length + 3))}ch`;
    }
  }

  function beginMathEdit(token) {
    if (!token?.isConnected) return;
    if (activeFormulaEdit) finishCurrentFormulaEdit();
    if (!token.isConnected) return;
    const raw = token.dataset.latexRaw || '';
    // A single-line input loses ALL newline characters on assignment.
    // A textarea is mandatory for display math as well as any math source
    // containing a newline, even when its delimiters are inline delimiters.
    const multiline = Boolean(aSingleMathPart(raw)?.display) || /[\r\n]/.test(raw);
    const field = element(multiline ? 'textarea' : 'input',
      multiline ? 'la-math-source la-math-source-multiline' : 'la-math-source');
    if (!multiline) field.type = 'text';
    field.value = raw;
    sizeInlineMathField(field);
    field.title = multiline
      ? 'Enter: nova linha · Ctrl+Enter: renderizar · Esc: cancelar · Editar separado: janela de edição'
      : 'Enter: renderizar · Esc: cancelar · Editar separado: editar numa janela';
    field.setAttribute('aria-label', multiline
      ? 'Editar LaTeX multilinha da fórmula inline'
      : 'Editar LaTeX da fórmula inline');
    const state = { mode:'inline', field, token:null, originalRaw:raw, lastGoodRaw:raw };
    activeFormulaEdit = state;
    previewEditingFormula = true;
    token.replaceWith(field);
    updateFormulaModeButton();
    field.focus(); field.select();
    field.addEventListener('keydown', e => {
      if (activeFormulaEdit !== state || state.mode !== 'inline') return;
      if (e.key === 'Enter') {
        // In multiline math, Enter and Shift+Enter create actual newline
        // characters. Ctrl+Enter (or Cmd+Enter) finishes the inline edit.
        // Single-line math keeps the existing Enter-to-finish behavior.
        e.stopPropagation();
        if ((multiline && (e.ctrlKey || e.metaKey)) ||
            (!multiline && !e.shiftKey)) {
          e.preventDefault();
          commitInlineMath(state, field.value);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); commitInlineMath(state, state.originalRaw);
      } else if (e.key.toLowerCase() === 'e' && e.ctrlKey && e.shiftKey) {
        e.preventDefault(); e.stopPropagation(); switchToDetached();
      }
    });
    field.addEventListener('input', () => {
      if (state.mode !== 'inline') return;
      sizeInlineMathField(field);
      setDraft(serializeEditable());
    });
    field.addEventListener('blur', () => {
      // Moving to the mode button should not terminate the inline edit.
      setTimeout(() => {
        if (activeFormulaEdit === state && state.mode === 'inline' &&
            shadow.activeElement !== inlineFormulaSwitch) commitInlineMath(state, field.value);
      }, 0);
    });
  }

  function placeFormulaWindow() {
    applyFormulaSize();
    const pr = peek.getBoundingClientRect();
    const wr = formulaWindow.getBoundingClientRect();
    const pos = storedLayout.formula || (() => {
      // Prefer an adjacent, non-overlapping window so the inline/separate
      // toggle in the preview header stays clickable.
      if (innerWidth - pr.right >= wr.width + 16) return {x:pr.right+12,y:pr.top};
      if (pr.left >= wr.width + 16) return {x:pr.left-wr.width-12,y:pr.top};
      if (innerHeight - pr.bottom >= wr.height + 16) return {x:pr.left,y:pr.bottom+12};
      if (pr.top >= wr.height + 16) return {x:pr.left,y:pr.top-wr.height-12};
      return {x:Math.max(8,Math.min(innerWidth-wr.width-8,pr.left+45)),
        y:Math.max(8,Math.min(innerHeight-wr.height-8,pr.top+60))};
    })();
    applyPosition(formulaWindow, pos);
  }

  function switchToDetached() {
    const state = activeFormulaEdit;
    if (!state || state.mode !== 'inline' || !state.field?.isConnected) return;
    const field = state.field;
    const raw = field.value;
    const previous = aSingleMathPart(state.lastGoodRaw) || aSingleMathPart(state.originalRaw);
    const token = previous ? mathToken(previous) : element('span', 'la-equation la-math-token');
    if (!previous) token.textContent = '∑'; // Never display incomplete raw code in the main preview.
    token.dataset.latexRaw = raw;
    token.tabIndex = 0;
    state.mode = 'detached'; // Set before field replacement fires blur events.
    state.field = null;
    state.token = token;
    field.replaceWith(token);
    previewEditingFormula = true;
    formulaInput.value = raw;
    formulaWindow.classList.remove('la-hidden');
    renderDetachedToken(state);
    setDraft(serializeEditable());
    placeFormulaWindow();
    updateFormulaModeButton();
    formulaInput.focus();
    formulaInput.setSelectionRange(Math.min(field.selectionStart || raw.length,raw.length),
      Math.min(field.selectionEnd || raw.length,raw.length));
    updatePeekStatus('Edição separada ativa · prévia renderizada');
  }

  function switchToInline() {
    const state = activeFormulaEdit;
    if (!state || state.mode !== 'detached' || !state.token?.isConnected) return;
    const raw = formulaInput.value;
    // Reuse the same complete inline edit lifecycle, including textarea
    // handling for multiline math, rather than recreating an input manually.
    const oldToken = state.token;
    oldToken.dataset.latexRaw = raw;
    resetFormulaEditor();
    beginMathEdit(oldToken);
    // beginMathEdit recreated an input from the token, with the latest raw.
    if (activeFormulaEdit?.mode === 'inline') {
      activeFormulaEdit.originalRaw = state.originalRaw;
      activeFormulaEdit.lastGoodRaw = state.lastGoodRaw;
      const activeInput = activeFormulaEdit.field;
      activeInput.setSelectionRange(Math.min(formulaInput.selectionStart,raw.length),
        Math.min(formulaInput.selectionEnd,raw.length));
    }
    updatePeekStatus('Edição inline ativa');
  }

  function finishDetachedMath() {
    const state = activeFormulaEdit;
    if (!state || state.mode !== 'detached') return;
    state.token.dataset.latexRaw = formulaInput.value;
    renderDetachedToken(state);
    resetFormulaEditor();
    setDraft(serializeEditable());
    if (autoApply && applyMode === 'replace' && previewDirty) scheduleAutoApply();
    updatePeekStatus('Fórmula concluída. Use Aplicar no campo se necessário.');
  }

  function finishCurrentFormulaEdit() {
    const state = activeFormulaEdit;
    if (!state) return;
    if (state.mode === 'detached') finishDetachedMath();
    else commitInlineMath(state, state.field?.value || state.originalRaw);
  }

  inlineFormulaSwitch.addEventListener('pointerdown', e => {
    // Do not blur the inline input before its mode-switch click arrives.
    if (activeFormulaEdit?.mode === 'inline') e.preventDefault();
  });
  inlineFormulaSwitch.addEventListener('click', () => {
    if (activeFormulaEdit?.mode === 'inline') switchToDetached();
    else if (activeFormulaEdit?.mode === 'detached') switchToInline();
  });
  formulaInlineButton.addEventListener('click', switchToInline);
  formulaFinishButton.addEventListener('click', finishDetachedMath);
  formulaCloseButton.addEventListener('click', finishDetachedMath);
  formulaInput.addEventListener('input', () => {
    const state = activeFormulaEdit;
    if (!state || state.mode !== 'detached' || !state.token?.isConnected) return;
    state.token.dataset.latexRaw = formulaInput.value;
    renderDetachedToken(state);
    setDraft(serializeEditable());
    updatePeekStatus('Edição separada: rascunho ainda não aplicado no campo');
  });
  formulaInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); switchToInline(); }
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); e.stopPropagation(); finishDetachedMath(); }
  });

  peekBody.addEventListener('dblclick', (event) => {
    const node = event.target instanceof Element && event.target.closest('.la-math-token');
    if (node && peekBody.contains(node) && !fullTextOpen) {
      event.preventDefault(); event.stopPropagation();
      beginMathEdit(node);
      return;
    }
    const md = event.target instanceof Element && event.target.closest('.la-markdown-token');
    if (md && peekBody.contains(md) && !fullTextOpen) {
      event.preventDefault(); event.stopPropagation();
      beginMarkdownEdit(md);
    }
  });
  peekBody.addEventListener('keydown', (event) => {
    // Shift+Enter is a soft line break in this contenteditable. The host page
    // must never see it as a plain Enter (which could submit a chat message).
    // Do not preventDefault: Chrome inserts the correct line break itself.
    if (event.key === 'Enter' && event.shiftKey && !event.ctrlKey &&
        !event.altKey && !event.metaKey && !event.isComposing) {
      previewEnterInProgress = true;
      previewSoftBreakAtEnd = true;
      event.stopPropagation();
      return;
    }
    if (!fullTextOpen && event.target?.classList?.contains('la-math-token') && (event.key === 'Enter' || event.key === 'F2')) {
      event.preventDefault(); beginMathEdit(event.target); return;
    }
    if (!fullTextOpen && event.target?.classList?.contains('la-markdown-token') && (event.key === 'Enter' || event.key === 'F2')) {
      event.preventDefault(); beginMarkdownEdit(event.target); return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      if (!autoApply || applyMode === 'insert') applyPeekDraft();
    }
  });
  peekBody.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') {
      previewEnterInProgress = false;
      event.stopPropagation();
      // Wait until the key has been released before a live apply may focus
      // the host editor. This prevents key-up/submit handlers from racing.
      if (autoApply && applyMode === 'replace' && previewDirty) scheduleAutoApply();
    }
  });
  peekBody.addEventListener('focusout', () => { previewEnterInProgress = false; });
  peekBody.addEventListener('keyup', event => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Tab'].includes(event.key))
      { renderCompletedMathNow(); renderCompletedMarkdownNow(); }
  });
  peekBody.addEventListener('mouseup', () => { renderCompletedMathNow(); renderCompletedMarkdownNow(); });
  peekBody.addEventListener('compositionstart', () => { previewIsComposing = true; });
  peekBody.addEventListener('compositionend', () => {
    previewIsComposing = false;
    setDraft(serializeEditable());
    renderCompletedMathNow(true);
    renderCompletedMarkdownNow();
  });
  peekBody.addEventListener('input', event => {
    if (event.target?.classList?.contains('la-math-source') || event.target?.classList?.contains('la-markdown-source')) return;
    if (event.inputType !== 'insertLineBreak') previewSoftBreakAtEnd = false;
    setDraft(serializeEditable());
    if (!event.isComposing) { renderCompletedMathNow(true); renderCompletedMarkdownNow(); }
  });
  peekBody.addEventListener('paste', event => {
    if (event.target?.classList?.contains('la-math-source')) return;
    const plain = event.clipboardData?.getData('text/plain');
    if (plain == null) return;
    event.preventDefault();
    document.execCommand('insertText', false, plain);
    setDraft(serializeEditable());
    renderCompletedMathNow(true);
    renderCompletedMarkdownNow();
  });
  peekBody.addEventListener('focusout', () => {
    setTimeout(() => {
      if (fullTextOpen || previewEditingFormula || peekBody.contains(shadow.activeElement)) return;
      // Tokenize newly completed math even if auto-apply has already synced.
      const latest = serializeEditable();
      if (latest !== previewDraftText) setDraft(latest);
      renderEditableDraft();
      if (autoApply && applyMode === 'replace' && previewDirty)
        scheduleAutoApply();
    }, 0);
  });

  // Apply live only when the source still matches the last committed version.
  // This is deliberately not a bidirectional race: external changes stop the live writer.
  function scheduleAutoApply() {
    clearTimeout(autoApplyTimer);
    if (applyMode !== 'replace' || !autoApply || autoApplyPaused || previewEditingFormula || !previewDirty) return;
    autoApplyTimer = setTimeout(() => flushAutoApply(), 280);
  }

  function flushAutoApply() {
    clearTimeout(autoApplyTimer);
    if (applyMode !== 'replace' || !autoApply || autoApplyPaused || previewEditingFormula || !previewDirty) return;
    // Never call focus() on a ProseMirror editor while an Enter key from
    // the preview is still held down. A host could interpret it as Submit.
    if (previewEnterInProgress) return;
    const target = previewSourceTarget;
    if (!target || !isEligible(target) || target !== currentTarget) {
      autoApplyPaused = true;
      previewConflict = true;
      updatePeekStatus('Automático pausado: o campo original mudou ou foi fechado');
      return;
    }
    if (getText(target) !== previewBaseText) {
      autoApplyPaused = true;
      previewConflict = true;
      updatePeekStatus('Automático pausado: o campo foi editado fora da prévia');
      return;
    }
    // Rich editors need a browser editing transaction. Perform it ONLY after
    // keyup and a short idle period, then immediately restore preview focus.
    // Unlike v1.8.4 this does not wait for the user to click outside.
    if (extensionKeysDown.size || previewIsComposing || previewEnterInProgress) {
      scheduleAutoApply();
      return;
    }
    const text = currentPreviewText();
    previewDraftText = text;
    previewDirty = text !== previewBaseText;
    if (!previewDirty) { updatePeekStatus(); return; }

    // Never rebuild the preview during sync. Capture the selection in SOURCE
    // coordinates, so a rich-text focus swap cannot reset the cursor to 0.
    const previouslyFocused = shadow.activeElement;
    const previewHasFocus = previouslyFocused === peekBody;
    const fullTextHasFocus = previouslyFocused === fullTextInput;
    const caretPosition = previewHasFocus ? capturePreviewCaret() : null;
    const fullSelection = fullTextHasFocus
      ? { start:fullTextInput.selectionStart, end:fullTextInput.selectionEnd,
          direction:fullTextInput.selectionDirection } : null;
    applyingToHost = true;
    let ok = false;
    try {
      ok = setTextField(target, text, { skipFocus: target.matches('input, textarea') });
    } finally {
      applyingToHost = false;
      if (previouslyFocused?.isConnected) {
        try { previouslyFocused.focus({preventScroll:true}); } catch { /* ignored */ }
      }
      if (previewHasFocus) restorePreviewCaret(caretPosition);
      if (fullTextHasFocus && fullSelection) {
        try { fullTextInput.setSelectionRange(fullSelection.start, fullSelection.end, fullSelection.direction); }
        catch { /* ignored */ }
      }
    }
    if (!ok) {
      autoApplyPaused = true;
      updatePeekStatus('Automático pausado: o editor não confirmou a atualização. Use Copiar.');
      return;
    }
    // Do not rebuild the preview while typing: that would reset the caret.
    previewBaseText = getText(target);
    previewDraftText = text;
    previewDirty = previewBaseText !== text;
    previewConflict = false;
    lastPreviewText = previewBaseText;
    updatePeekStatus(previewDirty ? 'O editor ajustou a formatação; confira o campo original' : 'Sincronizado com o campo original');
    scheduleRefresh();
  }

  autoApplyCheckbox.addEventListener('change', () => {
    autoApply = autoApplyCheckbox.checked;
    storedLayout.autoApply = autoApply;
    autoApplyPaused = false;
    saveLayout();
    if (applyMode === 'replace' && autoApply && previewDirty) scheduleAutoApply();
    else clearTimeout(autoApplyTimer);
    updatePeekStatus(applyMode === 'insert'
      ? 'Inserção no cursor/seleção exige Aplicar manualmente'
      : autoApply
      ? 'Automático ligado · não envia a mensagem'
      : 'Modo manual · use Aplicar no campo');
  });

  function applyPeekDraft() {
    clearTimeout(autoApplyTimer);
    const target = previewSourceTarget;
    if (!target?.isConnected || !isEligible(target)) {
      updatePeekStatus('Campo original indisponível. Copie o LaTeX.');
      return;
    }
    if (getText(target) !== previewBaseText) {
      previewConflict = true;
      autoApplyPaused = true;
      updatePeekStatus('Campo alterado externamente. Descarte ou copie o rascunho.');
      return;
    }
    const text = currentPreviewText();
    setDraft(text);
    if (!previewDirty) return;
    const active = shadow.activeElement;
    const previewHasFocus = active === peekBody;
    const fullTextHasFocus = active === fullTextInput;
    const caret = previewHasFocus ? capturePreviewCaret() : null;
    const fullSelection = fullTextHasFocus
      ? {start:fullTextInput.selectionStart, end:fullTextInput.selectionEnd,
         direction:fullTextInput.selectionDirection} : null;
    applyingToHost = true;
    let ok = false;
    try { ok = applyToOriginal(target, text, applyMode); }
    finally {
      applyingToHost = false;
      if (active?.isConnected) {
        try { active.focus({preventScroll:true}); } catch { /* ignored */ }
      }
      if (previewHasFocus) restorePreviewCaret(caret);
      if (fullTextHasFocus && fullSelection)
        fullTextInput.setSelectionRange(fullSelection.start,fullSelection.end,fullSelection.direction);
    }
    if (!ok) {
      updatePeekStatus('Editor não confirmou inserção. Use Copiar LaTeX.');
      return;
    }
    const committed = getText(target);
    previewBaseText = committed;
    previewDraftText = applyMode === 'replace' ? text : committed;
    previewDirty = applyMode === 'replace' && committed !== text;
    previewConflict = false;
    lastPreviewText = committed;
    if (applyMode === 'insert') {
      // Revert to a fresh editable document only for insert-mode, which is a
      // one-shot operation rather than a live full-document draft.
      connectDraft(target, committed);
    }
    updatePeekStatus(applyMode === 'insert' ? 'Trecho inserido no cursor/seleção'
      : 'Conteúdo aplicado sem mover o cursor');
    scheduleRefresh();
  }
  applyPeek.addEventListener('click', applyPeekDraft);
  forceApplyPeek.addEventListener('click', () => {
    const target = previewSourceTarget;
    if (!previewConflict || !previewDirty || !target?.isConnected || !isEligible(target)) return;
    if (applyMode !== 'replace') return updatePeekStatus('Escolha Substituir conteúdo para resolver o conflito.');
    const confirmOverwrite = window.confirm('O campo original mudou desde que a prévia foi aberta.\n\n' +
      'Deseja substituir TODO o conteúdo atual pelo rascunho da prévia?\n' +
      'Essa ação não envia a mensagem.');
    if (!confirmOverwrite) return;
    // Only the explicit user gesture may update the optimistic-lock baseline.
    previewBaseText = getText(target);
    previewConflict = false;
    autoApplyPaused = false;
    applyPeekDraft();
  });
  copyPeek.addEventListener('click', async () => {
    const text = currentPreviewText();
    const ok = await copyToClipboard(text);
    updatePeekStatus(ok ? 'Rascunho copiado como LaTeX' : 'Não foi possível copiar');
  });
  resetPeek.addEventListener('click', () => {
    const target = currentTarget && isEligible(currentTarget) ? currentTarget
      : previewSourceTarget && isEligible(previewSourceTarget) ? previewSourceTarget : null;
    connectDraft(target, target ? getText(target) : '');
    lastPreviewText = null;
    updatePeekStatus('Rascunho descartado');
    scheduleRefresh();
  });

  function targetRect() {
    try { return currentTarget?.getBoundingClientRect(); } catch { return null; }
  }

  // Minimums refer to the EDITABLE WRITING AREA, not the full preview window.
  // Include the window border horizontally and all non-editable controls vertically.
  // On screens smaller than the minimum, use the available viewport instead.
  const MIN_PREVIEW_WRITING_WIDTH = 680;
  const MIN_PREVIEW_WRITING_HEIGHT = 120;
  function intrinsicPreviewFormattingWidth() {
    // Measure a clone outside the hidden preview to avoid zero-width geometry.
    // The width includes all current buttons, the font dropdown, and spacing.
    const probe = previewFormatTools.bar.cloneNode(true);
    probe.style.cssText = 'position:fixed;left:-10000px;top:0;display:flex;flex-wrap:nowrap;' +
      'width:max-content;min-width:max-content;max-width:none;visibility:hidden;overflow:visible;';
    shadow.appendChild(probe);
    const measured = Math.ceil(probe.getBoundingClientRect().width);
    probe.remove();
    return Math.max(MIN_PREVIEW_WRITING_WIDTH, measured + 4);
  }
  // During content-script startup the shadow host can still be display:none,
  // so a measured width of zero must never collapse the first preview to 680px.
  const MIN_PREVIEW_AUTOMATIC_WIDTH = Math.max(900, intrinsicPreviewFormattingWidth());
  let measuredPreviewControlsHeight = 148;
  function sizeLimits() {
    const maxW = Math.max(110, innerWidth - 16);
    const maxH = Math.max(90, innerHeight - 16);
    const borderX = peek.offsetWidth - peek.clientWidth || 2;
    const borderY = peek.offsetHeight - peek.clientHeight || 2;
    const controls = peekHead.getBoundingClientRect().height +
      shortcutBar.getBoundingClientRect().height + previewFormatTools.bar.getBoundingClientRect().height + peekTools.getBoundingClientRect().height;
    if (controls > 0) measuredPreviewControlsHeight = controls;
    return {
      minW: Math.min(maxW, MIN_PREVIEW_WRITING_WIDTH + borderX),
      minH: Math.min(maxH, MIN_PREVIEW_WRITING_HEIGHT + measuredPreviewControlsHeight + borderY),
      maxW, maxH
    };
  }
  function applyPreviewSize() {
    const limits = sizeLimits();
    const s = storedLayout.previewSize || { width:MIN_PREVIEW_AUTOMATIC_WIDTH, height:260 };
    peek.style.width = `${Math.max(limits.minW, Math.min(limits.maxW,s.width))}px`;
    peek.style.height = `${Math.max(limits.minH, Math.min(limits.maxH,s.height))}px`;
  }

  // When the user has never resized the preview, match the *writing area* to
  // the active editor. The header, shortcut bar and actions are extra height;
  // they do not steal space from the requested input-sized writing area.
  // A saved previewSize takes precedence, independently of a saved position.
  function matchPreviewWritingAreaToTarget(rect) {
    if (storedLayout.previewSize || peek.classList.contains('la-hidden') ||
        !rect || rect.width <= 1 || rect.height <= 1) return;
    const limits = sizeLimits();
    const borderX = peek.offsetWidth - peek.clientWidth || 2;
    const borderY = peek.offsetHeight - peek.clientHeight || 2;
    // Width is measured against the editable region, not the outer border.
    const width = Math.max(limits.minW, Math.min(limits.maxW,
      Math.max(MIN_PREVIEW_AUTOMATIC_WIDTH, rect.width) + borderX));
    peek.style.width = `${width}px`;
    // Width is assigned first because shortcut controls can wrap into an
    // additional row when the editor is narrower than the previous field.
    const controlsHeight = peekHead.getBoundingClientRect().height +
      shortcutBar.getBoundingClientRect().height + previewFormatTools.bar.getBoundingClientRect().height + peekTools.getBoundingClientRect().height;
    const height = Math.max(limits.minH,
      Math.min(limits.maxH,
        Math.max(MIN_PREVIEW_WRITING_HEIGHT, rect.height) + controlsHeight + borderY));
    peek.style.height = `${height}px`;
  }

  function formulaSizeLimits() {
    return { minW:Math.min(220,Math.max(120,innerWidth-16)),
      minH:Math.min(135,Math.max(100,innerHeight-16)),
      maxW:Math.max(120,innerWidth-16), maxH:Math.max(100,innerHeight-16) };
  }
  function applyFormulaSize() {
    const limits = formulaSizeLimits();
    const size = storedLayout.formulaSize || {width:410,height:205};
    formulaWindow.style.width = `${Math.max(limits.minW,Math.min(limits.maxW,size.width))}px`;
    formulaWindow.style.height = `${Math.max(limits.minH,Math.min(limits.maxH,size.height))}px`;
  }

  function applyFullTextSize() {
    const lim = {minW:Math.min(245,Math.max(120,innerWidth-16)),
      minH:Math.min(175,Math.max(100,innerHeight-16)),
      maxW:Math.max(120,innerWidth-16),maxH:Math.max(100,innerHeight-16)};
    const s = storedLayout.fullTextSize || {width:550,height:360};
    fullTextWindow.style.width = `${Math.max(lim.minW,Math.min(lim.maxW,s.width))}px`;
    fullTextWindow.style.height = `${Math.max(lim.minH,Math.min(lim.maxH,s.height))}px`;
  }

  function applyPosition(node, position) {
    const rect = node.getBoundingClientRect();
    const x = inViewport(position.x, innerWidth - rect.width);
    const y = inViewport(position.y, innerHeight - rect.height);
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
  }
  function placeMinimizedToolbar() {
    // Anchor to the viewport rather than to the original input field. This
    // retains the chosen corner when the page is scrolled or resized.
    const top = minimizedCorner.startsWith('top');
    const left = minimizedCorner.endsWith('left');
    toolbar.style.top = top ? '12px' : 'auto';
    toolbar.style.bottom = top ? 'auto' : '12px';
    toolbar.style.left = left ? '12px' : 'auto';
    toolbar.style.right = left ? 'auto' : '12px';
  }
  function renderToolbarMode() {
    toolbar.classList.toggle('la-mini-mode',toolbarMinimized);
    miniControls.classList.toggle('la-hidden',!toolbarMinimized);
    for (const [corner,button] of cornerButtons) {
      button.setAttribute('aria-pressed',String(corner === minimizedCorner));
    }
    if (toolbarMinimized) {
      placeMinimizedToolbar();
    } else {
      // The full toolbar uses its original movable position.
      toolbar.style.right = 'auto';
      toolbar.style.bottom = 'auto';
      toolbar.style.left = '';
      toolbar.style.top = '';
    }
  }
  function setToolbarMinimized(minimized) {
    toolbarMinimized = Boolean(minimized);
    // An explicit Maximize must reveal the full bar even before any field has focus.
    showFullToolbarWithoutTarget = !toolbarMinimized && (!currentTarget || !isEligible(currentTarget));
    storedLayout.toolbarMinimized = toolbarMinimized;
    renderToolbarMode();
    saveLayout();
    if (extensionEnabled && !modalOpen) {
      toolbar.classList.remove('la-hidden');
      placeUI();
      // Explicitly focus the destination control to preserve keyboard access.
      (toolbarMinimized ? maximizeTrigger : minimizeTrigger).focus({preventScroll:true});
    }
  }
  function placeUI() {
    if (modalOpen) return;
    if (toolbarMinimized) placeMinimizedToolbar();
    if (!currentTarget || !currentTarget.isConnected) {
      if (!toolbarMinimized && showFullToolbarWithoutTarget) {
        const r = toolbar.getBoundingClientRect();
        const fallback = {
          x: minimizedCorner.endsWith('left') ? 12 : innerWidth - r.width - 12,
          y: minimizedCorner.startsWith('top') ? 12 : innerHeight - r.height - 12
        };
        applyPosition(toolbar, storedLayout.toolbar || fallback);
      }
      return;
    }
    const rect = targetRect();
    if (!rect || rect.width <= 1 || rect.height <= 1 || rect.bottom < 0 || rect.top > innerHeight) {
      if (!toolbarMinimized) toolbar.classList.add('la-hidden');
      if (previewVisibility !== 'open' && !storedLayout.preview) peek.classList.add('la-hidden');
      return;
    }
    applyPreviewSize();
    matchPreviewWritingAreaToTarget(rect);
    const tw = toolbarMinimized ? 0 : (toolbar.getBoundingClientRect().width || 180);
    const th = toolbarMinimized ? 38 : (toolbar.getBoundingClientRect().height || 38);
    if (!toolbarMinimized) {
      const toolbarAuto = { x:rect.right-tw, y:rect.bottom+8 < innerHeight-th-8 ? rect.bottom+8 : rect.top-th-8 };
      applyPosition(toolbar, storedLayout.toolbar || toolbarAuto);
    }

    // A preview that has not been moved by the user follows the toolbar, not
    // the source field: the old formula could place its bottom BEHIND the bar.
    // Keep custom preview coordinates entirely under the user's control.
    if (storedLayout.preview) {
      applyPosition(peek, storedLayout.preview);
    } else {
      const gap = 12;
      const edge = 8;
      const bar = toolbar.getBoundingClientRect();
      const pw = peek.getBoundingClientRect().width || 430;
      const requestedHeight = peek.getBoundingClientRect().height || 260;
      const aboveRoom = Math.max(0, bar.top - gap - edge);
      const belowRoom = Math.max(0, innerHeight - bar.bottom - gap - edge);
      // Prefer above the full toolbar. For a minimized bar in a top corner,
      // prefer below it. Use the other side if the preferred side cannot fit.
      const preferAbove = !toolbarMinimized || minimizedCorner.startsWith('bottom');
      let above = preferAbove;
      if (preferAbove && aboveRoom < requestedHeight && belowRoom >= requestedHeight) above = false;
      if (!preferAbove && belowRoom < requestedHeight && aboveRoom >= requestedHeight) above = true;
      if (Math.max(aboveRoom, belowRoom) < requestedHeight) {
        above = aboveRoom >= belowRoom;
      }
      const available = above ? aboveRoom : belowRoom;
      // A first-time preview may be slightly shorter on compact viewports.
      // This is a transient layout adjustment: no size/position gets saved.
      if (!storedLayout.previewSize && available >= sizeLimits().minH && available < requestedHeight) {
        peek.style.height = `${Math.floor(available)}px`;
      }
      const ph = peek.getBoundingClientRect().height || requestedHeight;
      const previewAuto = {
        x: rect.right - pw,
        y: above ? bar.top - ph - gap : bar.bottom + gap
      };
      applyPosition(peek, previewAuto);
    }
  }

  function updatePeekButton() {
    const visible = !peek.classList.contains('la-hidden');
    previewTrigger.setAttribute('aria-pressed', String(visible));
    previewTrigger.title = visible ? 'Ocultar pré-visualização' : 'Abrir pré-visualização';
  }
  function refreshFloating() {
    if (!extensionEnabled || modalOpen) return;
    if (!currentTarget || !isEligible(currentTarget)) {
      toolbar.classList.toggle('la-hidden', !toolbarMinimized && !showFullToolbarWithoutTarget);
      if (toolbarMinimized) placeMinimizedToolbar();
      else if (showFullToolbarWithoutTarget) placeUI();
      // Manual opening does not depend on the input having focus or containing math.
      peek.classList.toggle('la-hidden', previewVisibility !== 'open');
      fullTextWindow.classList.toggle('la-hidden', previewVisibility !== 'open' || !fullTextOpen);
      updatePeekButton();
      return;
    }
    toolbar.classList.remove('la-hidden');
    const value = getText(currentTarget);
    if (value !== lastPreviewText || currentTarget !== previewSourceTarget) {
      syncDraftWithSource(currentTarget, value);
      lastPreviewText = value;
    }
    const canContainMath = value.includes(String.raw`\(`) || value.includes(String.raw`\[`) ||
      value.includes('$$') || value.includes(String.raw`\begin{`);
    const hasRenderableSyntax = (canContainMath && mathSegments(value).some(p => p.kind === 'math')) ||
      (/[#*_`~>\[\]|-]/.test(value) && mathSegments(value).some(p =>
        p.kind === 'text' && markdown.parts(p.value).some(md => md.kind === 'markdown')));
    const show = previewVisibility === 'open' ||
      (previewVisibility === 'auto' && hasRenderableSyntax);
    peek.classList.toggle('la-hidden', !show);
    fullTextWindow.classList.toggle('la-hidden', !show || !fullTextOpen);
    placeUI();
    updatePeekButton();
  }

  function scheduleRefresh() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(refreshFloating, 95);
  }

  // The UI is always hidden while the persisted settings are loaded, so
  // a hidden extension cannot briefly flash after a page refresh.
  function reportVisibility() {
    if (window !== window.top) return;
    try { chrome.runtime.sendMessage({type:'latex-anywhere:state',
      enabled:extensionEnabled,globalHidden,domainHidden,domain:normalizedHost
    }).catch(()=>{}); } catch { /* Service worker restarting. */ }
  }
  function setExtensionEnabled(enabled) {
    const changed = !visibilityReady || extensionEnabled !== Boolean(enabled);
    extensionEnabled = Boolean(enabled);
    visibilityReady = true;
    visibilityRevision++;
    host.style.display = extensionEnabled ? '' : 'none';
    if (!extensionEnabled) {
      closeVisibilityMenu();
      clearTimeout(updateTimer);
      clearTimeout(autoApplyTimer);
    } else if (changed && !modalOpen) {
      const focused = findEditor(document.activeElement);
      if (focused && focused !== currentTarget) {
        currentTarget = focused;
        observeEditorSize(focused);
        capturedCursor = null;
        lastPreviewText = null;
      }
      scheduleRefresh();
    }
    reportVisibility();
  }
  function visibilityState() {
    return {enabled:extensionEnabled,globalHidden,domainHidden,domain:normalizedHost};
  }
  async function loadEnabled() {
    const token=++visibilityLoadId;
    try {
      const values=await chrome.storage.local.get([globalVisibilityKey,domainVisibilityKey,legacyEnabledKey]);
      if (token!==visibilityLoadId) return;
      globalHidden=values[globalVisibilityKey]===true;
      // Once a new preference is explicitly set, the legacy origin value no
      // longer has any effect (even if it was 'disabled' in older releases).
      domainHidden=typeof values[domainVisibilityKey]==='boolean'
        ? values[domainVisibilityKey] : values[legacyEnabledKey]===false;
      setExtensionEnabled(!globalHidden && !domainHidden);
    } catch {
      if (token===visibilityLoadId) setExtensionEnabled(!globalHidden && !domainHidden);
    }
  }
  function setVisibility(scope,hidden) {
    ++visibilityLoadId; // Supersede any read started before the user's action.
    const key=scope==='global'?globalVisibilityKey:domainVisibilityKey;
    if (scope==='global') globalHidden=hidden;
    else domainHidden=hidden;
    setExtensionEnabled(!globalHidden && !domainHidden);
    try { chrome.storage.local.set({[key]:hidden}).catch(()=>loadEnabled()); }
    catch { /* Remains in effect for this tab until a reload if storage fails. */ }
  }
  let lastShortcutToggleAt = 0;
  function toggleWithShortcut() {
    // Alt+Shift+L restores global visibility when globally hidden; otherwise
    // it toggles the current domain. Debounce the Chrome command/key listener.
    const now=Date.now();
    if (now-lastShortcutToggleAt<650) return visibilityState();
    lastShortcutToggleAt=now;
    if (globalHidden) setVisibility('global',false);
    else setVisibility('domain',!domainHidden);
    return visibilityState();
  }

  document.addEventListener('keydown', event => {
    // This listener stays active even with the extension visually hidden.
    // Use e.code for keyboard layout independence; e.key is a fallback.
    if ((event.code === 'KeyL' || String(event.key).toLowerCase() === 'l') &&
        event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleWithShortcut();
    }
  }, true);

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area==='local' && (globalVisibilityKey in changes || domainVisibilityKey in changes)) {
        void loadEnabled();
      }
    });
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type==='latex-anywhere:get-state') {
        sendResponse(visibilityState());
        return false;
      }
      if (message?.type==='latex-anywhere:toggle') {
        sendResponse(toggleWithShortcut());
        return false;
      }
      return false;
    });
  } catch { /* Runtime can be unavailable during extension updates. */ }

  minimizeTrigger.addEventListener('click', () => setToolbarMinimized(true));
  maximizeTrigger.addEventListener('click', () => setToolbarMinimized(false));
  for (const [corner, button] of cornerButtons) {
    button.addEventListener('click', () => {
      if (!toolbarMinimized) return;
      minimizedCorner = corner;
      storedLayout.minimizedCorner = corner;
      renderToolbarMode();
      saveLayout();
    });
  }

  function togglePreview() {
    if (activeFormulaEdit && !peek.classList.contains('la-hidden')) finishCurrentFormulaEdit();
    if (!currentTarget || !isEligible(currentTarget)) return;
    const showing = !peek.classList.contains('la-hidden');
    setPreviewVisibility(showing ? 'hidden' : 'open');
    refreshFloating();
  }

  // Pointer Capture keeps dragging smooth even when the pointer leaves the handle.
  function wireMove(handle, moveTarget, layoutField, dragSurface = handle) {
    dragSurface.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button') && e.target !== handle) return;
      if (e.target === peekResize) return;
      e.preventDefault(); e.stopPropagation();
      const r = moveTarget.getBoundingClientRect();
      const start = { x:e.clientX, y:e.clientY, left:r.left, top:r.top };
      try { dragSurface.setPointerCapture(e.pointerId); } catch { return; }
      const onMove = event => {
        if (event.pointerId !== e.pointerId) return;
        const pos = { x:start.left+event.clientX-start.x, y:start.top+event.clientY-start.y };
        applyPosition(moveTarget,pos);
      };
      const onDone = event => {
        if (event.pointerId !== e.pointerId) return;
        dragSurface.removeEventListener('pointermove',onMove);
        dragSurface.removeEventListener('pointerup',onDone);
        dragSurface.removeEventListener('pointercancel',onDone);
        if (event.type === 'pointerup') {
          const now = moveTarget.getBoundingClientRect();
          storedLayout[layoutField] = { x:now.left, y:now.top };
          saveLayout();
        }
      };
      dragSurface.addEventListener('pointermove',onMove);
      dragSurface.addEventListener('pointerup',onDone);
      dragSurface.addEventListener('pointercancel',onDone);
    });
    handle.addEventListener('keydown', e => {
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const step = e.shiftKey ? 25 : 10;
      const now = moveTarget.getBoundingClientRect();
      const newPos = { x:now.left, y:now.top };
      if (e.key === 'ArrowUp') newPos.y -= step;
      if (e.key === 'ArrowDown') newPos.y += step;
      if (e.key === 'ArrowLeft') newPos.x -= step;
      if (e.key === 'ArrowRight') newPos.x += step;
      applyPosition(moveTarget,newPos);
      const newRect = moveTarget.getBoundingClientRect();
      storedLayout[layoutField] = { x:newRect.left, y:newRect.top };
      saveLayout();
    });
  }
  wireMove(toolbarGrip,toolbar,'toolbar');
  wireMove(peekGrip,peek,'preview',peekDrag);
  wireMove(formulaGrip,formulaWindow,'formula',formulaDrag);
  wireMove(fullTextGrip,fullTextWindow,'fullText',fullTextDrag);
  wireMove(scGrip,shortcutWindow,'shortcutsWindow',scDrag);

  scResize.addEventListener('pointerdown',event=>{
    if (event.button!==0) return;
    event.preventDefault();event.stopPropagation();
    const origin=shortcutWindow.getBoundingClientRect();
    const x=event.clientX,y=event.clientY;
    try {scResize.setPointerCapture(event.pointerId);} catch {return;}
    const move=ev=>{
      if (ev.pointerId!==event.pointerId) return;
      shortcutWindow.style.width=`${Math.max(Math.min(300,innerWidth-16),Math.min(innerWidth-16,origin.width+ev.clientX-x))}px`;
      shortcutWindow.style.height=`${Math.max(Math.min(240,innerHeight-16),Math.min(innerHeight-16,origin.height+ev.clientY-y))}px`;
      applyPosition(shortcutWindow,{x:origin.left,y:origin.top});
    };
    const end=ev=>{
      if (ev.pointerId!==event.pointerId) return;
      scResize.removeEventListener('pointermove',move);
      scResize.removeEventListener('pointerup',end);
      scResize.removeEventListener('pointercancel',end);
      if (ev.type==='pointerup') {
        const r=shortcutWindow.getBoundingClientRect();
        storedLayout.shortcutsSize={width:r.width,height:r.height};
        storedLayout.shortcutsWindow={x:r.left,y:r.top};
        saveLayout();
      }
    };
    scResize.addEventListener('pointermove',move);
    scResize.addEventListener('pointerup',end);
    scResize.addEventListener('pointercancel',end);
  });


  peekResize.addEventListener('pointerdown',e => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const startRect = peek.getBoundingClientRect();
    const start = { x:e.clientX, y:e.clientY, width:startRect.width, height:startRect.height };
    try { peekResize.setPointerCapture(e.pointerId); } catch { return; }
    const onMove = event => {
      if (event.pointerId !== e.pointerId) return;
      const limits = sizeLimits();
      const width = Math.max(limits.minW, Math.min(limits.maxW, start.width+event.clientX-start.x));
      const height = Math.max(limits.minH, Math.min(limits.maxH, start.height+event.clientY-start.y));
      peek.style.width = `${width}px`;
      peek.style.height = `${height}px`;
      applyPosition(peek, { x:startRect.left, y:startRect.top });
    };
    const onDone = event => {
      if (event.pointerId !== e.pointerId) return;
      peekResize.removeEventListener('pointermove',onMove);
      peekResize.removeEventListener('pointerup',onDone);
      peekResize.removeEventListener('pointercancel',onDone);
      if (event.type === 'pointerup') {
        const r = peek.getBoundingClientRect();
        storedLayout.previewSize = { width:r.width, height:r.height };
        storedLayout.preview = { x:r.left, y:r.top };
        saveLayout();
      }
    };
    peekResize.addEventListener('pointermove',onMove);
    peekResize.addEventListener('pointerup',onDone);
    peekResize.addEventListener('pointercancel',onDone);
  });
  peekResize.addEventListener('keydown', e => {
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const limits = sizeLimits();
    const r = peek.getBoundingClientRect();
    const step = e.shiftKey ? 40 : 15;
    const width = Math.max(limits.minW, Math.min(limits.maxW,r.width+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)));
    const height = Math.max(limits.minH, Math.min(limits.maxH,r.height+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)));
    peek.style.width = `${width}px`; peek.style.height = `${height}px`;
    applyPosition(peek, {x:r.left,y:r.top});
    const newRect = peek.getBoundingClientRect();
    storedLayout.previewSize = {width:newRect.width,height:newRect.height};
    storedLayout.preview = {x:newRect.left,y:newRect.top};
    saveLayout();
  });


  formulaResize.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const r = formulaWindow.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    try { formulaResize.setPointerCapture(e.pointerId); } catch { return; }
    const onMove = ev => {
      if (ev.pointerId !== e.pointerId) return;
      const lim = formulaSizeLimits();
      formulaWindow.style.width = `${Math.max(lim.minW,Math.min(lim.maxW,r.width+ev.clientX-startX))}px`;
      formulaWindow.style.height = `${Math.max(lim.minH,Math.min(lim.maxH,r.height+ev.clientY-startY))}px`;
      applyPosition(formulaWindow,{x:r.left,y:r.top});
    };
    const onEnd = ev => {
      if (ev.pointerId !== e.pointerId) return;
      formulaResize.removeEventListener('pointermove',onMove);
      formulaResize.removeEventListener('pointerup',onEnd);
      formulaResize.removeEventListener('pointercancel',onEnd);
      if (ev.type === 'pointerup') {
        const now = formulaWindow.getBoundingClientRect();
        storedLayout.formulaSize = {width:now.width,height:now.height};
        storedLayout.formula = {x:now.left,y:now.top};
        saveLayout();
      }
    };
    formulaResize.addEventListener('pointermove',onMove);
    formulaResize.addEventListener('pointerup',onEnd);
    formulaResize.addEventListener('pointercancel',onEnd);
  });
  formulaResize.addEventListener('keydown', e => {
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const r = formulaWindow.getBoundingClientRect();
    const lim = formulaSizeLimits(), step = e.shiftKey ? 40 : 15;
    formulaWindow.style.width = `${Math.max(lim.minW,Math.min(lim.maxW,r.width+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)))}px`;
    formulaWindow.style.height = `${Math.max(lim.minH,Math.min(lim.maxH,r.height+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)))}px`;
    const now = formulaWindow.getBoundingClientRect();
    storedLayout.formulaSize = {width:now.width,height:now.height};
    storedLayout.formula = {x:now.left,y:now.top};
    saveLayout();
  });

  fullTextResize.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const r = fullTextWindow.getBoundingClientRect();
    const x = e.clientX, y = e.clientY;
    try { fullTextResize.setPointerCapture(e.pointerId); } catch { return; }
    const move = ev => {
      if (ev.pointerId !== e.pointerId) return;
      fullTextWindow.style.width = `${Math.max(245,Math.min(innerWidth-16,r.width+ev.clientX-x))}px`;
      fullTextWindow.style.height = `${Math.max(175,Math.min(innerHeight-16,r.height+ev.clientY-y))}px`;
      applyPosition(fullTextWindow,{x:r.left,y:r.top});
    };
    const end = ev => {
      if (ev.pointerId !== e.pointerId) return;
      fullTextResize.removeEventListener('pointermove',move);
      fullTextResize.removeEventListener('pointerup',end);
      fullTextResize.removeEventListener('pointercancel',end);
      if (ev.type === 'pointerup') {
        const now = fullTextWindow.getBoundingClientRect();
        storedLayout.fullTextSize = {width:now.width,height:now.height};
        storedLayout.fullText = {x:now.left,y:now.top};
        saveLayout();
      }
    };
    fullTextResize.addEventListener('pointermove',move);
    fullTextResize.addEventListener('pointerup',end);
    fullTextResize.addEventListener('pointercancel',end);
  });
  fullTextResize.addEventListener('keydown', e => {
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const r = fullTextWindow.getBoundingClientRect();
    const step = e.shiftKey ? 40 : 15;
    fullTextWindow.style.width = `${Math.max(245,Math.min(innerWidth-16,r.width+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)))}px`;
    fullTextWindow.style.height = `${Math.max(175,Math.min(innerHeight-16,r.height+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)))}px`;
    const now = fullTextWindow.getBoundingClientRect();
    storedLayout.fullTextSize = {width:now.width,height:now.height};
    storedLayout.fullText = {x:now.left,y:now.top}; saveLayout();
  });


  // All three editors share the same pure formatting engine. Selection
  // snapshots are taken BEFORE toolbar buttons steal focus.
  let rememberedFormattingSelection=null;
  let pendingFormatting=null;
  function formattingSnapshot(origin) {
    if (origin==='modal') return {origin, field:modalInput, source:modalInput.value,
      start:modalInput.selectionStart, end:modalInput.selectionEnd};
    if (origin==='full' || fullTextOpen) return {origin:'full',field:fullTextInput,
      source:fullTextInput.value,start:fullTextInput.selectionStart,end:fullTextInput.selectionEnd};
    const activeField=activeFormulaEdit?.mode==='detached' ? formulaInput
      : activeFormulaEdit?.mode==='inline' ? activeFormulaEdit.field : null;
    if (activeField?.isConnected && shadow.activeElement===activeField) {
      return {origin:'formula',field:activeField,source:activeField.value,
        start:activeField.selectionStart,end:activeField.selectionEnd};
    }
    const range=editableSelectionRange();
    const start=range ? serializedOffsetForPoint(range.startContainer,range.startOffset) : null;
    const end=range ? serializedOffsetForPoint(range.endContainer,range.endOffset) : null;
    const source=serializeEditable();
    return {origin:'preview',source,start:start===null?source.length:start,
      end:end===null?source.length:end};
  }
  function applyFormattedSnapshot(snapshot,result) {
    if(!snapshot || !result || result.status!=='ok') return;
    const {origin,field}=snapshot;
    if(origin==='preview') {
      if(fullTextOpen || serializeEditable()!==snapshot.source) {
        updatePeekStatus('O texto mudou desde a seleção: tente novamente.'); return;
      }
      const scroll=peekBody.scrollTop;
      setDraft(result.text);
      renderEditableDraft(snapshot.start===snapshot.end ? result.caret : null);
      peekBody.scrollTop=scroll;
      peekBody.focus({preventScroll:true});
      restorePreviewCaret(result.caret);
    } else {
      if(!field?.isConnected || field.value!==snapshot.source) return;
      field.value=result.text;
      field.setSelectionRange(result.caret,result.caret);
      field.dispatchEvent(new Event('input',{bubbles:true}));
      field.focus({preventScroll:true});
      field.setSelectionRange(result.caret,result.caret);
    }
  }
  let activeSymbols=null;
  function closeSymbols() {
    closeSymbolContext();
    symbolsPopup.classList.add('la-hidden');
    if (activeSymbols?.trigger) activeSymbols.trigger.setAttribute('aria-expanded','false');
    activeSymbols=null;
  }
  function openSymbols(origin,trigger,snapshot) {
    if (!snapshot) return;
    if (activeSymbols?.trigger===trigger) {closeSymbols();return;}
    closeSymbols();
    activeSymbols={origin,trigger,snapshot};
    symbolsPopup.classList.remove('la-hidden');
    trigger.setAttribute('aria-expanded','true');
    const box=trigger.getBoundingClientRect();
    const width=symbolsPopup.getBoundingClientRect().width || 425;
    const height=symbolsPopup.getBoundingClientRect().height || 370;
    const left=Math.min(Math.max(8,box.left),Math.max(8,innerWidth-width-8));
    const top=(box.bottom+8+height<innerHeight-8) ? box.bottom+8 : Math.max(8,box.top-height-8);
    symbolsPopup.style.left=`${left}px`;
    symbolsPopup.style.top=`${top}px`;
  }
  function insertCatalogCommand(snapshot,command,isTemplate=false,display=false) {
    if (!snapshot || typeof command!=='string' || command.length>2000) return;
    const {source,start,end}=snapshot;
    const analysis=formatter.analyze(source,start,end,mathSegments(source));
    let selected=source.slice(start,end);
    let a=start,b=end,opening='',closing='';
    if (analysis.single) {
      const run=analysis.math[0];
      if (start===run.start && end===run.end) {
        a=run.bodyStart;b=run.bodyEnd;
        selected=source.slice(a,b);
      }
    } else if (analysis.math.length) {
      const msg='Seleção atravessa math modes diferentes. Selecione uma fórmula ou trecho por vez.';
      if (snapshot.origin==='modal') status.textContent=msg;
      else updatePeekStatus(msg);
      return;
    } else {
      opening=display?'\\[':'\\(';
      closing=display?'\\]':'\\)';
    }
    let fragment, caretOffset;
    if (isTemplate) {
      const MARK='\uE003';
      const expanded=command.replaceAll('{{selection}}',selected).replaceAll('{{cursor}}',MARK);
      caretOffset=expanded.indexOf(MARK);
      fragment=expanded.replaceAll(MARK,'');
      if (caretOffset<0) caretOffset=fragment.length;
    } else {
      fragment=command;
      caretOffset=fragment.length;
      // Without a separator, appending text immediately after a command can
      // accidentally create an unknown control sequence (\sinx, \alphax).
      if (/[A-Za-z]$/.test(fragment) && source.slice(b,b+1).match(/^[A-Za-z]/)) {
        fragment+=' ';caretOffset++;
      }
    }
    const replacement=opening+fragment+closing;
    const result={status:'ok',text:source.slice(0,a)+replacement+source.slice(b),
      caret:a+opening.length+caretOffset};
    applyFormattedSnapshot(snapshot,result);
  }
  symbolContextMenu.addEventListener('pointerdown',event=>event.stopPropagation());
  symbolContextMenu.addEventListener('keydown',event=>{
    if (event.key === 'Escape') {
      event.preventDefault();event.stopPropagation();closeSymbolContext();
      symbolsSearch.focus({preventScroll:true});
    }
  });
  symbolsPopup.addEventListener('contextmenu', event=>{
    const button = event.target instanceof Element && event.target.closest('[data-la-catalog]');
    if (!button || !symbolsPopup.contains(button)) return;
    event.preventDefault(); event.stopPropagation();
    const entry=catalogActions.get(button.dataset.laCatalogAction);
    if (!entry) return;
    openSymbolContext(entry.item,event.clientX,event.clientY);
  });
  symbolContextCopy.addEventListener('click',async()=>{
    const item=contextSymbol;
    if (!item) return;
    // Copy a ready-to-edit snippet, not internal {{cursor}} markers.
    const latex=item.command.replaceAll(SELECTION_MARKER,'').replaceAll(CURSOR_MARKER,'');
    const ok=await copyToClipboard(latex);
    closeSymbolContext();
    if (ok) {
      const hint=symbolsPopup.querySelector('.la-symbols-hint');
      if (hint) hint.textContent=`Copiado: ${item.label} (${latex.slice(0,80)})`;
    }
  });
  symbolContextBind.addEventListener('click',()=>{
    const item=contextSymbol;
    if (!item) return;
    closeSymbolContext();
    closeSymbols();
    openKeyboardWindow(catalogActionId(item));
  });
  symbolsClose.addEventListener('click',closeSymbols);
  symbolsPopup.addEventListener('pointerdown',event=>{
    if(event.button===0 && event.target.closest('button')) event.preventDefault();
  });
  symbolsPopup.addEventListener('click',event=>{
    const item=event.target.closest('[data-la-catalog]');
    if(!item || !activeSymbols) return;
    const snapshot=activeSymbols.snapshot;
    closeSymbols();
    insertCatalogCommand(snapshot,item.dataset.laCommand,item.dataset.laTemplate==='true',item.dataset.laDisplay==='true');
  });
  symbolsPopup.addEventListener('keydown',event=>{
    if(event.key==='Escape') { event.preventDefault();event.stopPropagation();closeSymbols(); }
  });
  shadow.addEventListener('pointerdown',event=>{
    if (!symbolContextMenu.classList.contains('la-hidden') &&
        !symbolContextMenu.contains(event.target)) closeSymbolContext();
    if (!symbolsPopup.classList.contains('la-hidden') &&
        !symbolContextMenu.contains(event.target) &&
        !symbolsPopup.contains(event.target) && !event.target.closest('[data-la-symbols]')) closeSymbols();
  },true);

  function closeMathDecision() {
    decisionOverlay.classList.add('la-hidden'); pendingFormatting=null;
  }
  function chooseMathStrategy(strategy) {
    const pending=pendingFormatting;
    closeMathDecision();
    if(!pending) return;
    const result=formatter.formatSource({...pending.snapshot,format:pending.format,
      color:pending.color,strategy,parts:mathSegments(pending.snapshot.source)});
    applyFormattedSnapshot(pending.snapshot,result);
  }
  decisionCancel.addEventListener('click',closeMathDecision);
  decisionSeparate.addEventListener('click',()=>chooseMathStrategy('separate'));
  decisionExpand.addEventListener('click',()=>chooseMathStrategy('expand'));
  decisionOverlay.addEventListener('click',e=>{
    if(e.target===decisionOverlay) closeMathDecision();
  });
  decisionOverlay.addEventListener('keydown',e=>{
    if(e.key==='Escape') { e.preventDefault(); e.stopPropagation();closeMathDecision(); }
  });
  function executeFormatting(origin,format,color,saved=null) {
    if(pendingFormatting) return;
    const snapshot=saved || formattingSnapshot(origin);
    if(!snapshot) return;
    const result=formatter.formatSource({...snapshot,format,color,
      parts:mathSegments(snapshot.source)});
    if(result.status==='choose') {
      pendingFormatting={snapshot,format,color};
      decisionDescription.textContent=`A seleção contém ${result.mathCount} expressão(ões) matemática(s) e texto ou delimitadores diferentes.`;
      decisionHint.textContent=`Ampliar: usar o primeiro delimitador encontrado (${result.firstMode}), incluindo por completo fórmulas atravessadas. Separar: manter os delimitadores existentes e criar \\(…\\) nos trechos externos.`;
      decisionOverlay.classList.remove('la-hidden');
      decisionExpand.focus({preventScroll:true});
      return;
    }
    applyFormattedSnapshot(snapshot,result);
  }
  function wireFormattingBar(barInfo,origin) {
    let savedSelection=null;
    const remember=()=>{ savedSelection=formattingSnapshot(origin); };
    barInfo.bar.addEventListener('pointerdown',e=>{
      if(e.button!==0) return;
      remember();
      if(e.target.closest('button')) e.preventDefault();
    },true);
    for(const button of barInfo.bar.querySelectorAll('[data-la-format]')) {
      button.addEventListener('click',()=>{
        const snapshot=savedSelection || formattingSnapshot(origin);
        savedSelection=null;
        executeFormatting(origin,button.dataset.laFormat,'#3158e5',snapshot);
      });
    }
    for (const button of barInfo.bar.querySelectorAll('[data-la-quick]')) {
      button.addEventListener('click',()=>{
        const snapshot=savedSelection || formattingSnapshot(origin);
        savedSelection=null;
        const item=symbolCatalog.quick[Number(button.dataset.laQuick)];
        if(item) insertCatalogCommand(snapshot,item.command,true);
      });
    }
    barInfo.sizeSelect.addEventListener('change',()=>{
      const snapshot=savedSelection || formattingSnapshot(origin);
      savedSelection=null;
      const chosen=barInfo.sizeSelect.value;
      barInfo.sizeSelect.value='';
      if (chosen) executeFormatting(origin,chosen,'#3158e5',snapshot);
    });
    barInfo.colorPicker.addEventListener('change',()=>{
      const snapshot=savedSelection || formattingSnapshot(origin);
      savedSelection=null;
      executeFormatting(origin,'color',barInfo.colorPicker.value,snapshot);
    });
    barInfo.symbolsTrigger.addEventListener('click',()=>{
      const snapshot=savedSelection || formattingSnapshot(origin);
      savedSelection=null;
      openSymbols(origin,barInfo.symbolsTrigger,snapshot);
    });
  }
  wireFormattingBar(previewFormatTools,'preview');
  wireFormattingBar(modalFormatTools,'modal');
  wireFormattingBar(fullTextFormatTools,'full');

  function keyboardEditingSnapshot(event) {
    const target=event.target;
    if (target===modalInput) return formattingSnapshot('modal');
    if (target===fullTextInput) return formattingSnapshot('full');
    if (target===formulaInput || target?.classList?.contains('la-math-source')) return formattingSnapshot('preview');
    if (!fullTextOpen && peekBody.contains(target) && peekBody.isContentEditable) return formattingSnapshot('preview');
    return null;
  }
  // The real site's editor is deliberately excluded: Chrome and ProseMirror
  // retain their own shortcuts outside the LaTeX Anywhere editing surfaces.
  shadow.addEventListener('keydown',event=>{
    if (!extensionEnabled || event.repeat || keyboardWindowOpen || event.isComposing) return;
    const key=eventKeyCombo(event);
    if (!key) return;
    const action=FIXED_KEY_ACTIONS[key] || keyboardBindings.find(x=>x.key===key)?.action;
    if (!action) return;
    const snapshot=keyboardEditingSnapshot(event);
    if (!snapshot) return;
    if (action.startsWith('format:') && snapshot.start===snapshot.end) return;
    // Never let a native Ctrl+B/I/U toggle HTML styling in our LaTeX source.
    event.preventDefault();event.stopImmediatePropagation();
    if (action.startsWith('format:')) {
      executeFormatting(snapshot.origin,action.slice(7),'#3158e5',snapshot);
      return;
    }
    if (catalogActions.has(action)) {
      const item=catalogActions.get(action).item;
      insertCatalogCommand(snapshot,item.command,item.template===true,item.display===true);
      return;
    }
    const preset=shortcuts.find(x=>`snippet:${x.id}`===action);
    if (!preset) return;
    const selected=snapshot.source.slice(snapshot.start,snapshot.end);
    const built=shortcutTemplateContent(preset.template,selected);
    applyFormattedSnapshot(snapshot,{status:'ok',
      text:snapshot.source.slice(0,snapshot.start)+built.text+snapshot.source.slice(snapshot.end),
      caret:snapshot.start+built.caretOffset});
  },true);


  function openModal() {
    closeMathDecision();
    if (activeFormulaEdit) finishCurrentFormulaEdit();
    closeShortcutEditor();
    clearTimeout(autoApplyTimer);
    if (!currentTarget || !isEligible(currentTarget)) return;
    captureHostSelection(currentTarget);
    modalTarget = currentTarget;
    modalOpen = true;
    modalInput.value = previewDirty && previewSourceTarget === currentTarget
      ? currentPreviewText() : initialDraftForMode(currentTarget);
    modalInitialValue = modalInput.value;
    modalChanged = false;
    renderPreview(fullPreview,modalInput.value);
    status.textContent = 'Nenhuma informação é enviada pela extensão.';
    backdrop.classList.remove('la-hidden');
    toolbar.classList.add('la-hidden');
    peek.classList.add('la-hidden');
    formulaWindow.classList.add('la-hidden');
    fullTextWindow.classList.add('la-hidden');
    updatePeekButton();
    modalInput.focus();
    modalInput.setSelectionRange(modalInput.value.length,modalInput.value.length);
  }

  function closeModal(restoreFocus = true) {
    backdrop.classList.add('la-hidden');
    modalOpen = false;
    const prev = modalTarget;
    modalTarget = null;
    if (fullTextOpen) {
      fullTextWindow.classList.remove('la-hidden');
      fullTextInput.focus({preventScroll:true});
    } else if (restoreFocus && prev && prev.isConnected) prev.focus();
    scheduleRefresh();
  }

  function setTextField(el, value, {skipFocus = false} = {}) {
    if (el.matches('input') && /[\r\n]/.test(value)) return false;
    if (!skipFocus) el.focus();
    if (el.matches('input, textarea')) {
      // React-controlled inputs need the native setter, not el.value = ... alone.
      const type = el.matches('textarea') ? HTMLTextAreaElement : HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(type.prototype, 'value')?.set;
      if (setter) setter.call(el,value);
      else el.value = value;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType:'insertReplacementText', data:value }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      try { el.setSelectionRange(value.length,value.length); } catch { /* type may deny selection */ }
      return el.value === value;
    }
    if (el.isContentEditable) {
      const selection = document.getSelection();
      if (!selection) return false;
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      // Use SOFT line breaks, equivalent to Shift+Enter. In Chromium a single
      // execCommand('insertText', 'a\nb') creates separate <p> paragraphs and
      // therefore extra visual spacing in ProseMirror. insertLineBreak writes
      // <br> / hardBreak nodes within a paragraph instead.
      const lines = value.replace(/\r\n?/g, '\n').split('\n');
      let inserted = document.execCommand('insertText', false, lines[0]);
      for (let i = 1; inserted && i < lines.length; i++) {
        inserted = document.execCommand('insertLineBreak', false, null);
        if (inserted && lines[i]) inserted = document.execCommand('insertText', false, lines[i]);
      }
      return Boolean(inserted) && getText(el).replace(/\r/g,'') === value.replace(/\r\n?/g,'\n');
    }
    return false;
  }

  async function copyToClipboard(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const fallback = document.createElement('textarea');
      fallback.value = value;
      fallback.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      shadow.appendChild(fallback);
      fallback.select();
      const ok = document.execCommand('copy');
      fallback.remove();
      return ok;
    }
  }

  function insertFromModal() {
    const target = modalTarget;
    if (!target || !isEligible(target)) {
      status.textContent = 'Campo original não está mais disponível. Use “Copiar LaTeX”.';
      return;
    }
    const text = modalInput.value;
    const modeAtApply = applyMode;
    closeModal(false);
    const ok = applyToOriginal(target, text, modeAtApply);
    if (!ok) {
      // Do not retry by mutating ProseMirror DOM directly; that can corrupt its state.
      openModal();
      modalInput.value = text;
      renderPreview(fullPreview, text);
      status.textContent = 'Este editor não confirmou a inserção. Use “Copiar LaTeX” e cole manualmente.';
      return;
    }
    // The modal is another explicit editor, so its committed text supersedes the draft.
    const committedText = getText(target);
    connectDraft(target, committedText);
    lastPreviewText = committedText;
    scheduleRefresh();
  }

  editorTrigger.addEventListener('click', openModal);
  hideAllTrigger.addEventListener('click', openVisibilityMenu);
  hideDomainOption.addEventListener('click',()=>setVisibility('domain',true));
  hideGlobalOption.addEventListener('click',()=>setVisibility('global',true));
  document.addEventListener('pointerdown',e=>{
    if (!visibilityMenu.classList.contains('la-hidden') &&
        !e.composedPath().includes(visibilityMenu) && !e.composedPath().includes(hideAllTrigger)) {
      closeVisibilityMenu();
    }
  },true);
  shadow.addEventListener('keydown',e=>{
    if (e.key==='Escape' && !visibilityMenu.classList.contains('la-hidden')) {
      e.preventDefault(); e.stopPropagation(); closeVisibilityMenu(); hideAllTrigger.focus();
    }
  });
  previewTrigger.addEventListener('click', togglePreview);
  editButton.addEventListener('click', openModal);
  hidePeek.addEventListener('click', () => {
    if (activeFormulaEdit) finishCurrentFormulaEdit();
    setPreviewVisibility('hidden');
    peek.classList.add('la-hidden');
    fullTextWindow.classList.add('la-hidden');
    closeShortcutEditor();
    updatePeekButton();
  });
  closeTop.addEventListener('click', () => closeModal());
  cancelButton.addEventListener('click', () => closeModal());
  insertButton.addEventListener('click', insertFromModal);
  copyButton.addEventListener('click', async () => {
    const ok = await copyToClipboard(modalInput.value);
    status.textContent = ok ? 'Código LaTeX copiado.' : 'Não foi possível copiar automaticamente.';
  });
  modalInput.addEventListener('input', () => { modalChanged = true; renderPreview(fullPreview,modalInput.value); });
  backdrop.addEventListener('mousedown', (e) => { if(e.target === backdrop) closeModal(); });

  shadow.addEventListener('keydown', (e) => {
    if (!modalOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModal(); }
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); e.stopPropagation(); insertFromModal(); }
    if (e.key === 'Tab') {
      const buttons = [closeTop,modalInput,modalModeSelect,copyButton,cancelButton,insertButton];
      const current = buttons.indexOf(shadow.activeElement);
      const next = e.shiftKey ? (current<=0 ? buttons.length-1 : current-1) : (current===buttons.length-1 ? 0 : current+1);
      e.preventDefault(); buttons[next].focus();
    }
  });

  // Record keys held within the extension: even a slow Ctrl+Enter/Shift+Enter
  // must never be handed to the host by a timed rich-editor update.
  shadow.addEventListener('keydown', e => {
    if (e.repeat || !e.code) return;
    extensionKeysDown.add(e.code);
  }, true);
  shadow.addEventListener('keyup', e => {
    if (e.code) extensionKeysDown.delete(e.code);
    if (!extensionKeysDown.size && autoApply && previewDirty) scheduleAutoApply();
  }, true);
  // Keyboard focus may leave the window before keyup. Avoid stale held keys.
  window.addEventListener('blur', () => { extensionKeysDown.clear(); });
  document.addEventListener('keyup', e => {
    if (e.code) extensionKeysDown.delete(e.code);
  }, true);

  // Events in a shadow DOM are composed and can bubble to listeners on the
  // hosting page. Prevent the host ChatGPT keyboard shortcuts from responding
  // to Enter, Shift+Enter and Ctrl+Enter typed INSIDE this extension. Native
  // editing remains untouched, including multiline Shift+Enter in the preview
  // and in both textarea editors. Events on the real composer are unaffected.
  for (const type of ['keydown', 'keypress', 'keyup']) {
    shadow.addEventListener(type, event => {
      if (event.key === 'Enter') event.stopPropagation();
    });
  }
  // Likewise, don't let the page's delegated input handlers interpret edits
  // inside our shadow tree as edits to its own composer.
  for (const type of ['beforeinput', 'input']) {
    shadow.addEventListener(type, event => event.stopPropagation());
  }

  // Track caret/selection as the user navigates the original editor, even before
  // opening either UI. Extension controls don't override this saved host selection.
  shadow.addEventListener('pointerdown', () => captureHostSelection(currentTarget), true);
  document.addEventListener('keyup', (e) => {
    if (currentTarget && (e.target === currentTarget || currentTarget.contains(e.target))) captureHostSelection(currentTarget);
  }, true);
  document.addEventListener('pointerup', (e) => {
    if (currentTarget && (e.target === currentTarget || currentTarget.contains(e.target))) captureHostSelection(currentTarget);
  }, true);

  // A framework can replace the actual contenteditable while the preview has
  // keyboard focus. Preserve the associated logical editor and its draft.
  function rebindRecreatedEditor(previous, replacement) {
    if (!previous || !replacement || previous === replacement) return;
    if (previewSourceTarget === previous) {
      previewSourceTarget = replacement;
      const live = getText(replacement);
      if (!previewDirty) {
        connectDraft(replacement, live);
      } else if (live === previewBaseText) {
        previewConflict = false;
        autoApplyPaused = false;
        updatePeekStatus('Campo original reconectado; rascunho preservado');
        if (autoApply && applyMode === 'replace') scheduleAutoApply();
      } else {
        previewConflict = true;
        autoApplyPaused = true;
        updatePeekStatus('O site recriou o campo com texto diferente. Rascunho preservado; revise antes de aplicar.');
      }
    }
  }
  function isRecreatedLogicalEditor(previous, candidate) {
    if (!previous || !candidate || previous === candidate || previous.isConnected) return false;
    if (previous.hasAttribute('data-composer-markdown') && candidate.hasAttribute('data-composer-markdown')) {
      // On ChatGPT, require a single composer input on the page.
      return document.querySelectorAll('[contenteditable="true"][data-composer-markdown]').length === 1;
    }
    return Boolean(previous.id && previous.id === candidate.id && previous.tagName === candidate.tagName);
  }

  // Follow host-driven editor growth (e.g. ChatGPT's expanding composer),
  // but keep a manually resized preview at its saved dimensions.
  let observedEditorSizeTarget = null;
  const editorSizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
        if (extensionEnabled && !modalOpen && !storedLayout.previewSize &&
            observedEditorSizeTarget === currentTarget) placeUI();
      })
    : null;
  function observeEditorSize(target) {
    if (!editorSizeObserver || observedEditorSizeTarget === target) return;
    editorSizeObserver.disconnect();
    observedEditorSizeTarget = target || null;
    if (target && target.isConnected) editorSizeObserver.observe(target);
  }

  document.addEventListener('focusin', (e) => {
    if (applyingToHost) return;
    if (!extensionEnabled) {
      const candidate = findEditor(e.target);
      if (candidate) { currentTarget = candidate; observeEditorSize(candidate); }
      return;
    }
    if (modalOpen) return;
    const candidate = findEditor(e.target);
    if (candidate) {
      // 'open' is sticky until the user closes it. A manual close suppresses
      // auto-open for this field, but detection resumes when switching fields.
      if (candidate !== currentTarget && previewVisibility === 'hidden') previewVisibility = 'auto';
      if (candidate !== currentTarget) {
        if (isRecreatedLogicalEditor(currentTarget, candidate)) rebindRecreatedEditor(currentTarget, candidate);
        capturedCursor = null;
      }
      currentTarget = candidate;
      observeEditorSize(candidate);
      showFullToolbarWithoutTarget = false;
      captureHostSelection(candidate);
      lastPreviewText = null;
      scheduleRefresh();
    } else if (!(e.target === host || host.contains(e.target) || e.composedPath().includes(host))) {
      // Focus on another control or page region is *not* a request to detach
      // the preview from its last source field. In particular, clicking the
      // toolbar, a page button, or an extension pane must not erase the target.
      // The source is replaced only by explicitly focusing another text field.
      if (!toolbarMinimized && !showFullToolbarWithoutTarget) toolbar.classList.add('la-hidden');
      if (previewVisibility !== 'open') peek.classList.add('la-hidden');
      updatePeekButton();
    }
  }, true);
  document.addEventListener('input', (e) => {
    if (applyingToHost || !extensionEnabled || modalOpen || !currentTarget) return;
    if (e.target === currentTarget || currentTarget.contains(e.target)) scheduleRefresh();
  }, true);
  document.addEventListener('selectionchange', () => {
    if (!applyingToHost && extensionEnabled && !modalOpen && currentTarget) {
      if (document.activeElement === currentTarget || currentTarget.contains(document.activeElement)) {
        captureHostSelection(currentTarget);
      }
      scheduleRefresh();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (extensionEnabled && !modalOpen && e.altKey && e.shiftKey && e.code === 'KeyM' && currentTarget && isEligible(currentTarget)) {
      e.preventDefault(); openModal();
    }
  }, true);
  document.addEventListener('scroll', placeUI, true);
  window.addEventListener('resize', () => { placeUI(); if (activeFormulaEdit?.mode === 'detached') placeFormulaWindow(); if (fullTextOpen) placeFullTextWindow(); if (shortcutWindowOpen) placeShortcutWindow(); }, {passive:true});

  // Wait for body if extension content script ran before DOM body materialized.
  (document.body || document.documentElement).appendChild(host);
  loadLayout();
  loadEnabled();

  // Observe edits made by a framework as well as ordinary user input. A
  // contenteditable host can change its DOM without emitting an input event.
  // Only mutations inside our associated editor trigger a refresh; the Shadow
  // DOM UI itself is not traversed and cannot create an observer feedback loop.
  function recoverReplacedEditor(previous) {
    if (!previous) return null;
    let matches = [];
    if (previous.hasAttribute('data-composer-markdown')) {
      matches = Array.from(document.querySelectorAll('[contenteditable="true"][data-composer-markdown]'));
    } else if (previous.id) {
      const byId = document.getElementById(previous.id);
      if (byId && byId.tagName === previous.tagName) matches = [byId];
    }
    // Never arbitrarily bind to a different textarea on a multi-field page.
    matches = matches.filter(node => isEligible(node));
    return matches.length === 1 ? matches[0] : null;
  }
  const observer = new MutationObserver(records => {
    if (modalOpen || !currentTarget) return;
    if (!currentTarget.isConnected) {
      const replacement = recoverReplacedEditor(currentTarget);
      if (!replacement) {
        // Keep the old source reference for error/conflict reporting, but don't
        // write to an unrelated editor or silently discard a pending draft.
        if (!toolbarMinimized) toolbar.classList.add('la-hidden');
        if (previewVisibility !== 'open') peek.classList.add('la-hidden');
        updatePeekStatus('Campo original removido. Volte a focar o campo para reconectar.');
        return;
      }
      rebindRecreatedEditor(currentTarget, replacement);
      currentTarget = replacement;
      observeEditorSize(replacement);
      capturedCursor = null;
      lastPreviewText = null;
      scheduleRefresh();
      return;
    }
    if (records.some(record => record.target === currentTarget || currentTarget.contains(record.target))) {
      scheduleRefresh();
    }
  });
  observer.observe(document.documentElement, { childList:true, characterData:true, subtree:true });
})();
