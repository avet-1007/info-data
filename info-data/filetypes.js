/* ============================================================================
 * filetypes.js — Per-extension syntax highlighting + preview.
 *
 *   FileTypes.detect(path)        -> language id
 *   FileTypes.label(lang)         -> human label
 *   FileTypes.highlight(lang,src) -> HTML for the editor overlay
 *   FileTypes.canPreview(lang)    -> true if a rendered preview exists
 *   FileTypes.preview(lang,src)   -> { kind:'doc'|'iframe', payload }
 *
 * Markdown reuses markdown.js. Code languages use a small sticky-regex
 * tokenizer. Only Markdown and HTML have a meaningful rendered preview; for
 * everything else the editor still gets full syntax highlighting.
 * ==========================================================================*/

const FileTypes = (() => {

  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const EXT = {
    md:'markdown', markdown:'markdown', mdown:'markdown',
    html:'html', htm:'html', xml:'html', svg:'html', vue:'html',
    css:'css', scss:'css', less:'css',
    js:'javascript', mjs:'javascript', cjs:'javascript', jsx:'javascript',
    ts:'javascript', tsx:'javascript',
    json:'json',
    py:'python',
    sh:'shell', bash:'shell', zsh:'shell',
  };

  const LABELS = {
    markdown:'Markdown', html:'HTML', css:'CSS', javascript:'JavaScript',
    json:'JSON', python:'Python', shell:'Shell', text:'Текст',
  };

  function detect(path) {
    const m = /\.([a-z0-9]+)$/i.exec(path || '');
    if (!m) return 'text';
    return EXT[m[1].toLowerCase()] || 'text';
  }

  const label = lang => LABELS[lang] || 'Текст';

  // ── Generic sticky-regex tokenizer ─────────────────────────────────────────
  // rules: [{ re, cls }] tried in order at each position.
  function tokenize(src, rules) {
    const sticky = rules.map(r => ({ re: new RegExp(r.re.source, r.re.flags.replace(/[gy]/g, '') + 'y'), cls: r.cls }));
    let out = '', i = 0;
    while (i < src.length) {
      let matched = false;
      for (const r of sticky) {
        r.re.lastIndex = i;
        const m = r.re.exec(src);
        if (m && m.index === i && m[0].length) {
          out += `<span class="${r.cls}">${esc(m[0])}</span>`;
          i += m[0].length; matched = true; break;
        }
      }
      if (!matched) { out += esc(src[i]); i++; }
    }
    return out + '\n';
  }

  const RULES = {
    javascript: [
      { re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//,                         cls: 'tok-comment' },
      { re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/, cls: 'tok-string' },
      { re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/,                   cls: 'tok-number' },
      { re: /\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|this|typeof|instanceof|in|of|await|async|yield|try|catch|finally|throw|import|export|from|as|default|null|undefined|true|false|void|delete)\b/, cls: 'tok-keyword' },
    ],
    css: [
      { re: /\/\*[\s\S]*?\*\//,                            cls: 'tok-comment' },
      { re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/,         cls: 'tok-string' },
      { re: /@[\w-]+/,                                      cls: 'tok-keyword' },
      { re: /[.#][\w-]+/,                                   cls: 'tok-tag' },
      { re: /[-a-zA-Z]+(?=\s*:)/,                           cls: 'tok-attr' },
      { re: /#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr|pt)?\b/, cls: 'tok-number' },
    ],
    json: [
      { re: /"(?:[^"\\]|\\.)*"(?=\s*:)/,                    cls: 'tok-attr' },
      { re: /"(?:[^"\\]|\\.)*"/,                            cls: 'tok-string' },
      { re: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/,         cls: 'tok-number' },
      { re: /\b(?:true|false|null)\b/,                      cls: 'tok-keyword' },
    ],
    html: [
      { re: /<!--[\s\S]*?-->/,                              cls: 'tok-comment' },
      { re: /<!DOCTYPE[^>]*>/i,                             cls: 'tok-punc' },
      { re: /"(?:[^"]*)"|'(?:[^']*)'/,                      cls: 'tok-string' },
      { re: /<\/?[\w:-]+/,                                  cls: 'tok-tag' },
      { re: /\/?>/,                                         cls: 'tok-tag' },
      { re: /\b[\w:-]+(?==)/,                               cls: 'tok-attr' },
    ],
    python: [
      { re: /#[^\n]*/,                                      cls: 'tok-comment' },
      { re: /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, cls: 'tok-string' },
      { re: /\b\d+(?:\.\d+)?\b/,                            cls: 'tok-number' },
      { re: /\b(?:def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|lambda|None|True|False|and|or|not|in|is|pass|break|continue|global|nonlocal|yield|raise|assert|async|await)\b/, cls: 'tok-keyword' },
    ],
    shell: [
      { re: /#[^\n]*/,                                      cls: 'tok-comment' },
      { re: /"(?:[^"\\]|\\.)*"|'[^']*'/,                    cls: 'tok-string' },
      { re: /\$\w+|\$\{[^}]+\}/,                            cls: 'tok-attr' },
      { re: /\b(?:if|then|else|elif|fi|for|in|do|done|while|case|esac|function|echo|cd|export|local|return)\b/, cls: 'tok-keyword' },
    ],
  };

  function highlight(lang, src) {
    if (lang === 'markdown') return Markdown.highlight(src) + '\n';
    if (RULES[lang]) return tokenize(src, RULES[lang]);
    return esc(src) + '\n'; // plain text
  }

  const PREVIEWABLE = new Set(['markdown', 'html']);
  const canPreview = lang => PREVIEWABLE.has(lang);

  function preview(lang, src) {
    if (lang === 'markdown') return { kind: 'doc', payload: Markdown.render(src) };
    if (lang === 'html')     return { kind: 'iframe', payload: src };
    return null;
  }

  return { detect, label, highlight, canPreview, preview, esc };
})();

window.FileTypes = FileTypes;
