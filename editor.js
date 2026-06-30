/* ============================================================================
 * editor.js — Code editor with a Monaco front-end and a built-in fallback.
 *
 * Monaco (the VS Code editor) is loaded lazily from a CDN. When it loads we get
 * real syntax highlighting, multi-cursor, find/replace and Emmet (type `!` then
 * Tab for an HTML5 skeleton). When it can't load (offline), we transparently
 * fall back to the original textarea + highlight-overlay editor, which also
 * supports a minimal `!` HTML expansion.
 *
 *   Editor.init({ editWrap, textarea, highlightCode, host, onChange }) -> Promise<bool isMonaco>
 *   Editor.open(value, lang)   set content + language
 *   Editor.getValue()          current text
 *   Editor.focus() / layout()
 *   Editor.isMonaco
 * ==========================================================================*/

const Editor = (() => {
  const MONACO = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs';
  const EMMET  = 'https://cdn.jsdelivr.net/npm/emmet-monaco-es@5/dist/emmet-monaco.min.js';

  const LANG = {
    markdown: 'markdown', html: 'html', css: 'css', javascript: 'javascript',
    json: 'json', python: 'python', shell: 'shell', text: 'plaintext',
  };

  const HTML5_HEAD = `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Document</title>\n</head>\n<body>\n    `;
  const HTML5_TAIL = `\n</body>\n</html>\n`;

  let monaco = null, mEditor = null, usingMonaco = false, suppress = false;
  let curLang = 'text', onChange = null;
  let ta, hlCode, hlPre, host;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('failed: ' + src));
      document.head.appendChild(s);
    });
  }

  async function loadMonaco() {
    if (window.monaco) return (monaco = window.monaco);
    await loadScript(MONACO + '/loader.js');
    // Cross-origin worker via Blob. On file:// blob URLs are blocked — falls back to data: URI.
    const BASE = MONACO.replace(/\/vs$/, '');
    window.MonacoEnvironment = {
      baseUrl: BASE,
      getWorkerUrl() {
        const src = `
          self.MonacoEnvironment = { baseUrl: '${BASE}' };
          importScripts('${BASE}/vs/base/worker/workerMain.js');
        `;
        try {
          const blob = new Blob([src], { type: 'text/javascript' });
          return URL.createObjectURL(blob);
        } catch {
          return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(src);
        }
      },
    };
    await new Promise((res, rej) => {
      window.require.config({ paths: { vs: MONACO } });
      window.require(['vs/editor/editor.main'], () => res(), rej);
    });
    monaco = window.monaco;
    return monaco;
  }

  function defineTheme() {
    monaco.editor.defineTheme('info-dark', {
      base: 'vs-dark', inherit: true, rules: [],
      colors: {
        'editor.background': '#0d0d11',
        'editor.foreground': '#e8e8ea',
        'editorLineNumber.foreground': '#3a3a42',
        'editorLineNumber.activeForeground': '#8a8a95',
        'editorGutter.background': '#0d0d11',
        'editor.lineHighlightBackground': '#ffffff08',
        'editor.lineHighlightBorder': '#00000000',
        'editorCursor.foreground': '#6b7bd0',
        'editor.selectionBackground': '#6b7bd055',
        'editorWidget.background': '#18181b',
        'editorWidget.border': '#2c2c30',
        'editorSuggestWidget.background': '#18181b',
        'editorSuggestWidget.selectedBackground': '#6b7bd033',
        'input.background': '#18181b',
        'focusBorder': '#6b7bd0',
      },
    });
  }

  async function init(opts) {
    ta = opts.textarea; hlCode = opts.highlightCode; hlPre = hlCode.parentElement;
    host = opts.host; onChange = opts.onChange;
    wireFallback();   // always wired; harmless when Monaco wins

    try {
      await loadMonaco();
      defineTheme();
      mEditor = monaco.editor.create(host, {
        value: '', language: 'plaintext', theme: 'info-dark',
        automaticLayout: true, minimap: { enabled: false },
        fontSize: 14, lineHeight: 22,
        fontFamily: 'JetBrains Mono, SF Mono, Fira Code, Menlo, Consolas, monospace',
        fontLigatures: true, tabSize: 2, wordWrap: 'on',
        scrollBeyondLastLine: false, padding: { top: 16, bottom: 16 },
        renderWhitespace: 'none', smoothScrolling: true, cursorBlinking: 'smooth',
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      });
      mEditor.onDidChangeModelContent(() => { if (!suppress && onChange) onChange(); });

      // Emmet: `!`+Tab boilerplate and abbreviation expansion for HTML/CSS.
      try {
        await loadScript(EMMET);
        if (window.emmetMonaco) { window.emmetMonaco.emmetHTML(monaco); window.emmetMonaco.emmetCss(monaco); }
      } catch (_) { /* emmet is optional */ }

      usingMonaco = true;
      host.style.display = 'block';
      ta.style.display = 'none';
      hlPre.style.display = 'none';
    } catch (e) {
      console.warn('[info-data] Monaco unavailable, using built-in editor:', e.message);
      usingMonaco = false;
      host.style.display = 'none';
    }
    return usingMonaco;
  }

  function open(value, lang) {
    curLang = lang;
    if (usingMonaco) {
      suppress = true;
      monaco.editor.setModelLanguage(mEditor.getModel(), LANG[lang] || 'plaintext');
      mEditor.setValue(value);
      mEditor.setScrollTop(0);
      suppress = false;
    } else {
      ta.value = value;
      applyHighlight();
      hlPre.scrollTop = 0;
    }
  }

  const getValue = () => usingMonaco ? mEditor.getValue() : ta.value;
  const focus = () => usingMonaco ? mEditor.focus() : ta.focus();
  const layout = () => { if (usingMonaco && mEditor) mEditor.layout(); };

  // ── Fallback editor behaviour ───────────────────────────────────────────────
  function applyHighlight() { hlCode.innerHTML = FileTypes.highlight(curLang, ta.value); }
  function syncScroll() { hlPre.scrollTop = ta.scrollTop; hlPre.scrollLeft = ta.scrollLeft; }

  function wireFallback() {
    ta.addEventListener('input', () => { applyHighlight(); if (onChange) onChange(); });
    ta.addEventListener('scroll', syncScroll);
    ta.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const v = ta.value, pos = ta.selectionStart;
      const lineStart = v.lastIndexOf('\n', pos - 1) + 1;
      const lineText = v.slice(lineStart, pos);

      // Emmet `!` / `html:5` -> HTML5 skeleton (fallback's one trick).
      if (curLang === 'html' && /^\s*(!|html:5)\s*$/.test(lineText) && /^\s*$/.test(v.slice(pos, v.indexOf('\n', pos) === -1 ? v.length : v.indexOf('\n', pos)))) {
        const before = v.slice(0, lineStart);
        const after = v.slice(pos);
        ta.value = before + HTML5_HEAD + HTML5_TAIL + after;
        const caret = (before + HTML5_HEAD).length;
        ta.selectionStart = ta.selectionEnd = caret;
        applyHighlight(); if (onChange) onChange();
        return;
      }
      // Default: insert two spaces.
      ta.value = v.slice(0, pos) + '  ' + v.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = pos + 2;
      applyHighlight();
    });
  }

  return {
    init, open, getValue, focus, layout,
    get isMonaco() { return usingMonaco; },
  };
})();

window.Editor = Editor;