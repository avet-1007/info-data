/* ============================================================================
 * settings.js — Settings modal: language switcher + file-tree icon style.
 *
 *   Settings.iconStyle           'logos' (real CDN logos) | 'lucide' (built-in)
 *   Settings.open() / close()
 *   Settings.onChange = fn       called when the icon style changes
 * ==========================================================================*/

const Settings = (() => {
  const KEY = 'info-data-icon-style';
  let iconStyle = localStorage.getItem(KEY) || 'logos';
  let onChange = null;

  function setIconStyle(v) {
    if (v === iconStyle) return;
    iconStyle = v; localStorage.setItem(KEY, v);
    if (onChange) onChange();
    render();
  }

  function render() {
    const body = document.getElementById('settings-body');
    if (!body) return;
    const langs = window.I18N_LANGS.map(l =>
      `<button class="seg-btn ${getLang() === l.code ? 'on' : ''}" data-lang="${l.code}">${l.label}</button>`).join('');
    body.innerHTML = `
      <div class="set-row">
        <div class="set-label">${Icon('languages', { size: 16 })}<span>${t('settings.language')}</span></div>
        <div class="seg">${langs}</div>
      </div>
      <div class="set-row">
        <div class="set-label">${Icon('shapes', { size: 16 })}<span>${t('settings.fileIcons')}</span></div>
        <div class="seg">
          <button class="seg-btn ${iconStyle === 'logos' ? 'on' : ''}" data-icon="logos">${t('settings.iconsLogos')}</button>
          <button class="seg-btn ${iconStyle === 'lucide' ? 'on' : ''}" data-icon="lucide">${t('settings.iconsLucide')}</button>
        </div>
      </div>
      <p class="set-hint">${t('settings.iconsHint')}</p>`;
    body.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { setLang(b.dataset.lang); render(); });
    body.querySelectorAll('[data-icon]').forEach(b => b.onclick = () => setIconStyle(b.dataset.icon));
  }

  function open() { render(); document.getElementById('settings-overlay').classList.add('visible'); }
  function close() { document.getElementById('settings-overlay').classList.remove('visible'); }

  return {
    get iconStyle() { return iconStyle; },
    setIconStyle, open, close, render,
    set onChange(fn) { onChange = fn; },
  };
})();

window.Settings = Settings;
