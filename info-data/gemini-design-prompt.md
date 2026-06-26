# Prompt for Gemini — redesign the UI of "info-data"

Paste everything below into Gemini, then attach **`index.html`** *and* **`style.css`** (both — the look lives in `style.css`).

---

You are a senior product designer + front-end engineer. I have a working local web app called **info-data** — a personal data vault that runs entirely in the browser. It has:

- a **left sidebar** with a collapsible file tree (projects 🗂 → folders 📁 → documents 📄);
- a **Markdown / code editor** with live syntax highlighting and a side-by-side rendered preview (Edit / Split / Preview modes);
- a **bottom console panel** (a mini terminal with command hints);
- a top **toolbar** (storage badge, "connect disk folder", new project/folder/document, console toggle);
- modals and a right-click context menu.

I'm attaching `index.html` and `style.css`. **Redesign the visual styling to look like a premium, modern developer tool** (think Linear, Raycast, VS Code, Obsidian). Return a **complete, drop-in replacement `style.css`** (and only minimal `index.html` markup tweaks if truly necessary, listed separately).

### Hard constraints — do not break these
1. **Dark theme only.** No light mode. Calm, low-contrast surfaces; one tasteful accent color. No rainbow gradients or color clutter.
2. **100% self-contained.** No external CSS, fonts, icons, or scripts — no CDN links, no `@import` from the web, no Google Fonts. It must work offline and from `file://`. Use only system fonts and inline emoji that are already there.
3. **Do not rename or remove any `id` or `class` that the JavaScript depends on.** You may restyle them freely, but the following selectors MUST keep working:
   `#toolbar #sidebar #tree .tree-node .tree-row .tree-toggle .tree-icon .tree-name .tree-children(.hidden) .selected`
   `#workspace #editor-panel #editor-header #editor-title #lang-badge #mode-switch .mode-btn(.active) #save-status`
   `#editor-area(.split) #edit-wrap #highlight #editor-textarea #preview-wrap #preview #preview-frame`
   `#welcome #console-panel(.open) #console-header #console-output #console-hints .hint-chip(.top) #console-inputline #console-prompt #console-field #console-ghost .ghost-typed .ghost-rest #console-input`
   `#ctx-menu(.visible) .ctx-item(.danger) .ctx-sep #modal-overlay(.visible) #modal #resizer(.dragging)`
   `.btn .btn-accent .badge`
   Syntax-token classes (keep all, restyle colors): `.tok-heading .tok-bold .tok-code .tok-fence .tok-link .tok-url .tok-quote .tok-list .tok-punc .tok-strike .tok-keyword .tok-string .tok-comment .tok-number .tok-tag .tok-attr`
4. **The editor overlay must stay pixel-aligned.** `#highlight` and `#editor-textarea` are layered on top of each other — they must keep identical `font-family`, `font-size`, `line-height`, `padding`, `letter-spacing`, `white-space`, and `tab-size`, or the syntax highlighting will drift out of alignment with the typed text. Same rule for `#console-ghost` vs `#console-input`.
5. Keep CSS variables in `:root` for the palette so colors stay centralized.
6. Layout must stay responsive and never produce horizontal page scroll; wide content scrolls inside its own pane.

### What I want improved
- Refined **type scale**, spacing rhythm, and alignment across toolbar, sidebar, editor header, and console.
- A more polished **color system**: better surface elevation (base → panel → card), subtle borders, a single confident accent, accessible contrast.
- Nicer **interactive states**: hover, active/selected, focus rings, smooth but quick transitions.
- Cleaner **tree rows**, **buttons/badges**, **mode switch**, **console hint chips**, **modal**, and **context menu**.
- Tasteful **Markdown preview typography** (`.markdown-body`) — comfortable reading measure, good code-block and table styling.
- Optional: a subtle micro-detail pass (rounded radii consistency, shadow language, empty-state polish).

### Output format
1. The full new `style.css`, ready to paste over the old one.
2. A short bullet list of any `index.html` changes (if any), with exact before/after snippets.
3. 3–5 sentences explaining the design decisions.

Do not change behavior, only appearance. If unsure whether a selector is load-bearing, keep it.
