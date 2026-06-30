/* ============================================================================
 * formats.js — Single source of truth for what file types info-data supports,
 * and the HTML for the "Поддерживаемые форматы" panel (welcome + modal).
 * ==========================================================================*/

const SUPPORTED_FORMATS = [
  { name: 'Markdown',  icon: 'file-text', color: '#9aa6ff', exts: ['md'], view: true, edit: true },
  { name: 'HTML',      icon: 'file-code', color: '#e06c75', exts: ['html', 'htm'], view: true, edit: true },
  { key: 'fmt.code',   icon: 'file-code', color: '#61afef', exts: ['css', 'js', 'ts', 'json', 'py', 'sh', 'xml'], view: false, edit: true },
  { key: 'fmt.text',   icon: 'file-text', color: '#9aa0a6', exts: ['txt', '…'], view: false, edit: true },
  { key: 'fmt.images', icon: 'image', color: '#c678dd', exts: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'], view: true, edit: true },
  { key: 'fmt.models', icon: 'box', color: '#f5a97f', exts: ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', 'dae'], view: true, edit: true },
  { key: 'fmt.diagrams', icon: 'shapes', color: '#8aadf4', exts: ['drawio'], view: true, edit: true },
  { key: 'kind.video', icon: 'box', color: '#e06c75', exts: ['mp4', 'webm', 'mov', 'avi', 'mkv'], view: true, edit: true },
  { key: 'kind.audio', icon: 'box', color: '#56b6c2', exts: ['mp3', 'wav', 'ogg', 'flac', 'm4a'], view: true, edit: false },
  { key: 'kind.archive', icon: 'package', color: '#e5c07b', exts: ['zip', 'rar', '7z', 'tar', 'gz'], view: true, edit: false },
];

const fmtName = f => f.key ? t(f.key) : f.name;

function formatsGridHTML() {
  const cap = (label, ok) => `<span class="fmt-cap ${ok ? 'on' : 'off'}">${label}</span>`;
  return `<div class="fmt-grid">` + SUPPORTED_FORMATS.map(f => `
    <div class="fmt-card">
      <div class="fmt-head">
        <span class="fmt-icon" style="color:${f.color}">${Icon(f.icon, { size: 18 })}</span>
        <span class="fmt-name">${fmtName(f)}</span>
      </div>
      <div class="fmt-exts">${f.exts.map(e => `<code>.${e}</code>`).join('')}</div>
      <div class="fmt-caps">${cap(t('formats.view'), f.view)}${cap(t('formats.edit'), f.edit)}</div>
    </div>`).join('') + `</div>`;
}

// Compact one-line hint of every supported extension (for the create dialog).
function formatsHintHTML() {
  const chips = SUPPORTED_FORMATS.flatMap(f => f.exts.filter(e => e !== '…'))
    .map(e => `<code>.${e}</code>`).join('');
  return `<div class="fmt-hint"><span class="fmt-hint-label">${t('formats.hintLabel')}</span><div class="fmt-hint-chips">${chips}</div></div>`;
}

window.SUPPORTED_FORMATS = SUPPORTED_FORMATS;
window.formatsGridHTML = formatsGridHTML;
window.formatsHintHTML = formatsHintHTML;
