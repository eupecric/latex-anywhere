# Changelog

All notable changes to LaTeX Anywhere are recorded here. Versions follow the
extension manifest version; dates refer to repository publication milestones.

## [1.10.2] - 2026-11-18

### Markdown preview and boxed math

- Render Markdown alongside LaTeX in the editor preview and the modal result
  pane: emphasis, headings, lists, blockquotes, tables, links, code and
  strikethrough (GFM-compatible syntax).
- Preserve the user's Markdown source on Apply and Copy. Double-click a
  rendered Markdown fragment to edit its original markup, or use the separate
  full-text source editor.
- Detect completed Markdown syntax during editing and enable automatic preview
  opening when the source contains renderable Markdown.
- Avoid rendering LaTeX that appears inside Markdown code spans or fenced code.
- Keep Markdown output safe: construct DOM nodes without trusting embedded HTML,
  reject unsafe URL protocols and do not load external images automatically.
- Recognize `\\boxed{...}` with the bundled KaTeX and add a boxed-expression
  template to the structure palette.
- Bundle the MIT-licensed Marked 4.0.19 locally and preserve its license notice.

### Verification

- Chromium simulated-page tests: Markdown and boxed math rendering, live
  Markdown completion, source round-tripping, editing by double click,
  safe handling of HTML/links, and fenced-code isolation.
- JavaScript syntax and Manifest V3 validation; native extension behavior on
  the current ChatGPT UI still requires installation testing.

## [1.10.1] - 2026-11-18

### Persistent visibility scopes

- Replace the single **Ocultar** action with a choice between hiding the
  extension **on the current domain** and **on all sites**.
- Save the global and domain preferences independently in `chrome.storage.local`.
  Both persist across page refreshes, reopening tabs, and browser restarts.
- Add a browser-action popup with separate switches for global and current-domain
  hiding. The popup remains accessible when the entire extension UI is hidden.
- Keep `Alt+Shift+L` as a recovery shortcut: it toggles the current domain, or
  restores global visibility when the global hide is active.
- Give global hiding priority over domain settings; keep old per-origin hiding
  preferences as a one-time fallback until explicitly replaced.
- Update per-tab icon badges: `ALL` for global hiding and `OFF` for domain hiding.
- Keep hidden panels and drafts intact in an existing tab without automatic
  application while hidden.

### Verification

- JavaScript syntax and Manifest V3 validation.
- Chromium DOM tests with simulated Chrome storage for domain/global toggling,
  priority, and restoration; popup toggle behavior tested separately.
- Native extension integration on real websites remains unverified in this environment.

## [1.10.0] - 2026-11-18

### Initial public repository version

- Import the Chrome Manifest V3 extension, including its bundled libraries.
- Include editing and live LaTeX preview for text inputs and rich editors.
- Support LaTeX symbols and structures through a searchable catalog.
- Support configurable keyboard shortcuts and fixed formatting shortcuts.
- Add symbol right-click actions: copy LaTeX or assign a keyboard shortcut.
- Include draggable and resizable windows, zoom controls, and manual/automatic
  application modes.
- Publish project copyright notices and Apache-2.0 licensing; preserve the
  separately licensed KaTeX component and its notice.

This first repository release is a development build and has not yet been
validated as a published Chrome Web Store package.
