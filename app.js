/* ============================================================================
 * app.js — UI glue. Wires the FS backend, tree sidebar, Markdown editor
 * (syntax highlight + live preview), context menu, modal, and console.
 * ==========================================================================*/

// ── State ─────────────────────────────────────────────────────────────────────
let selectedPath = null;     // currently selected node
let selectedType = null;     // 'dir' | 'file' of the selected node
let openFilePath = null;     // file open in the editor
let currentLang = 'text';    // language of the open file
let viewMode = localStorage.getItem('info-data-view') || 'split'; // edit | split | preview
let openDirs = new Set(JSON.parse(localStorage.getItem('info-data-open') || '["/"]'));
let saveTimer = null;
let ctxTargetPath = null;
let shell = null;
let editorReady = null;   // resolves when Monaco (or the fallback) is ready
let currentKind = 'editor'; // what the editor-panel is currently showing
let currentBadge = null;  // { name, folder } so the badge can re-render on language change

const persistOpen = () => localStorage.setItem('info-data-open', JSON.stringify([...openDirs]));

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const treeEl       = $('tree');
const editorPanel  = $('editor-panel');
const welcome      = $('welcome');
const editorTitle  = $('editor-title');
const editorTA     = $('editor-textarea');
const highlightEl  = $('highlight').firstElementChild; // <code>
const highlightPre = $('highlight');
const previewEl    = $('preview');
const previewWrap  = $('preview-wrap');
const previewFrame = $('preview-frame');
const viewerHost   = $('viewer-host');
const drawioHost   = $('drawio-host');
const mediaHost    = $('media-host');
const editWrap     = $('edit-wrap');
const editorArea   = $('editor-area');
const modeSwitch   = $('mode-switch');
const langBadge    = $('lang-badge');
const saveStatus   = $('save-status');
const ctxMenu      = $('ctx-menu');
const backendBadge = $('backend-badge');

// ── Tree rendering ────────────────────────────────────────────────────────────
async function refreshTree() {
  const tree = await fs.tree('/');
  treeEl.innerHTML = '';
  if (!tree.children || !tree.children.length) {
    treeEl.innerHTML = `<div class="tree-empty">${t('sidebar.empty')}</div>`;
    return;
  }
  for (const child of tree.children) treeEl.appendChild(renderNode(child, 0));
}

function renderNode(node, depth) {
  const wrap = document.createElement('div');
  wrap.className = 'tree-node';

  const row = document.createElement('div');
  row.className = 'tree-row' + (selectedPath === node.path ? ' selected' : '');
  row.style.paddingLeft = (8 + depth * 14) + 'px';

  const isDir = node.type === 'dir';
  const isOpen = openDirs.has(node.path);
  const isProject = isDir && depth === 0;

  const toggle = document.createElement('span');
  toggle.className = 'tree-toggle' + (isDir ? (isOpen ? ' open' : '') : ' leaf');
  toggle.innerHTML = Icon('chevron-right', { size: 14 });

  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  if (isDir) {
    icon.innerHTML = Icon(isProject ? 'package' : (isOpen ? 'folder-open' : 'folder'), { size: 15 });
    icon.style.color = isProject ? 'var(--accent)' : '#8a93a0';
  } else {
    const fi = fileIcon(node.path);
    const lucide = () => { icon.innerHTML = Icon(fi.icon, { size: 15, color: fi.color }); };
    const url = Settings.iconStyle === 'logos' ? fileLogoURL(node.path) : null;
    if (url) {
      // real logo from CDN; fall back to the Lucide ("OG") icon if it fails to load
      icon.innerHTML = `<img class="ft-logo" src="${url}" alt="" width="16" height="16">`;
      icon.querySelector('img').addEventListener('error', lucide);
    } else {
      lucide();
    }
  }

  const name = document.createElement('span');
  name.className = 'tree-name';
  name.textContent = node.name;

  // Hover action buttons (VS Code-style).
  const actions = document.createElement('span');
  actions.className = 'row-actions';
  if (isDir) {
    actions.appendChild(actionBtn('file-plus', t('sidebar.newDocument'), e => { e.stopPropagation(); setSelected(node, row); promptCreate('document', node.path); }));
    actions.appendChild(actionBtn('folder-plus', t('sidebar.newFolder'), e => { e.stopPropagation(); setSelected(node, row); promptCreate('folder', node.path); }));
  }
  actions.appendChild(actionBtn('pencil', t('tree.rename'), e => { e.stopPropagation(); promptRename(node); }));
  actions.appendChild(actionBtn('trash-2', t('tree.delete'), e => { e.stopPropagation(); promptDelete(node); }, 'danger'));

  row.append(toggle, icon, name, actions);
  wrap.appendChild(row);

  if (isDir) {
    const kids = document.createElement('div');
    kids.className = 'tree-children' + (isOpen ? '' : ' hidden');
    (node.children || []).forEach(c => kids.appendChild(renderNode(c, depth + 1)));
    wrap.appendChild(kids);

    // Clicking the arrow toggles AND selects the folder, so the toolbar
    // buttons (＋Папка / ＋Документ) target the folder you just opened.
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      setSelected(node, row);
      if (openDirs.has(node.path)) { openDirs.delete(node.path); toggle.classList.remove('open'); kids.classList.add('hidden'); }
      else { openDirs.add(node.path); toggle.classList.add('open'); kids.classList.remove('hidden'); }
      persistOpen();
    });
  }

  row.addEventListener('click', () => selectNode(node, row));
  row.addEventListener('contextmenu', e => { e.preventDefault(); setSelected(node, row); showCtxMenu(e, node); });
  return wrap;
}

function actionBtn(iconName, title, onClick, cls) {
  const b = document.createElement('button');
  b.className = 'row-action' + (cls ? ' ' + cls : '');
  b.title = title;
  b.innerHTML = Icon(iconName, { size: 13 });
  b.addEventListener('click', onClick);
  return b;
}

// Update selection state + highlight without rebuilding the tree.
function setSelected(node, row) {
  selectedPath = node.path;
  selectedType = node.type;
  treeEl.querySelectorAll('.tree-row.selected').forEach(r => r.classList.remove('selected'));
  if (row) row.classList.add('selected');
}

async function selectNode(node, row) {
  setSelected(node, row);
  if (node.type === 'dir') {
    if (!openDirs.has(node.path)) { openDirs.add(node.path); persistOpen(); }
    await refreshTree();
  } else {
    await openFile(node.path);
    await refreshTree();
  }
}

// Swap the editor-panel between its different "kinds" of view.
function setLayout(mode) {   // 'editor' | 'viewer' | 'drawio' | 'media'
  editorArea.style.display = mode === 'editor' ? 'flex' : 'none';
  viewerHost.style.display = mode === 'viewer' ? 'block' : 'none';
  drawioHost.style.display = mode === 'drawio' ? 'block' : 'none';
  mediaHost.style.display  = mode === 'media' ? 'flex' : 'none';
  modeSwitch.style.display = mode === 'editor' ? '' : 'none';
  saveStatus.style.display = (mode === 'editor' || mode === 'drawio') ? '' : 'none';
}

// Tear down whatever non-editor view was showing.
function leaveAlt() {
  Viewer.dispose();
  Drawio.dispose();
  Media.dispose();
}

// ── Open a file (routes to the right view by type) ───────────────────────────
async function openFile(path) {
  openFilePath = path;
  selectedPath = path;
  selectedType = 'file';
  currentLang = FileTypes.detect(path);
  localStorage.setItem('info-data-last', path);
  welcome.style.display = 'none';
  editorPanel.style.display = 'flex';
  editorTitle.textContent = path;
  leaveAlt();
  const ext = (path.split('.').pop() || '').toLowerCase();

  // 3D model → Three.js viewer + simple editor
  if (Viewer.isModel(path)) {
    currentKind = 'viewer';
    langBadge.textContent = '3D · ' + ext.toUpperCase();
    setLayout('viewer');
    try {
      const buf = await fs.readBinary(path);
      if (!buf || !buf.byteLength) throw new Error(t('error.fileEmpty'));
      await Viewer.open(buf, ext, PathUtil.basename(path), viewerHost, { onSaveGLB: glb => saveModelGLB(path, glb) });
    } catch (e) {
      Viewer.dispose();
      Viewer.showError(viewerHost, e);
    }
    return;
  }

  // .drawio → diagrams.net editor (view + edit)
  if (Drawio.isDrawio(path)) {
    currentKind = 'drawio';
    langBadge.textContent = t('kind.diagram');
    setLayout('drawio');
    saveStatus.textContent = '';
    const xml = (await fs.readFile(path)) || '';
    Drawio.open(xml, drawioHost, makeDrawioSaver(path));
    return;
  }

  // media: image / video / audio / zip
  if (Media.isImage(path) || Media.isVideo(path) || Media.isAudio(path) || Media.isZip(path)) {
    currentKind = 'media';
    setLayout('media');
    const nm = PathUtil.basename(path);
    try {
      const buf = await fs.readBinary(path);
      if (Media.isImage(path)) {
        langBadge.textContent = t('kind.image');
        await Media.openImage(buf, ext, nm, mediaHost, { onSave: ab => saveMedia(path, ab) });
      } else if (Media.isVideo(path)) {
        langBadge.textContent = t('kind.video');
        await Media.openVideo(buf, ext, nm, mediaHost, {
          onSaveTrim: ab => saveMediaSibling(path, '-trim.webm', ab),
          onSaveFrame: ab => saveMediaSibling(path, '-frame.png', ab),
        });
      } else if (Media.isAudio(path)) {
        langBadge.textContent = t('kind.audio');
        await Media.openAudio(buf, ext, nm, mediaHost);
      } else {
        langBadge.textContent = t('kind.archive');
        await Media.openZip(buf, nm, mediaHost);
      }
    } catch (e) {
      mediaHost.innerHTML = `<div class="media-msg">${t('error.mediaOpen')}<br><span>${(e && e.message) || e}</span></div>`;
    }
    return;
  }

  // text / markdown / code → editor
  currentKind = 'editor';
  const content = await fs.readFile(path);
  if (content === null) return;
  if (editorReady) await editorReady;   // ensure the editor exists before loading content
  setLayout('editor');
  langBadge.textContent = FileTypes.label(currentLang);
  saveStatus.textContent = '';
  Editor.open(content, currentLang);
  applyViewMode();
  Editor.focus();
}

// Save edited 3D model: GLB exported by the viewer is written back. We overwrite
// .glb in place; other formats get a sibling .glb (originals stay intact).
async function saveModelGLB(origPath, glbBuffer) {
  const ext = (origPath.split('.').pop() || '').toLowerCase();
  const target = ext === 'glb' ? origPath : origPath.replace(/\.[^.]+$/, '') + '.glb';
  await fs.writeFile(target, glbBuffer);
  if (target !== origPath) { await refreshTree(); await openFile(target); }
}

// Save edited media back to the same file (image re-encode).
async function saveMedia(path, buffer) {
  await fs.writeFile(path, buffer);
  await openFile(path);   // reload to reflect the saved result
}
// Save a derived media file next to the original (video trim / captured frame).
async function saveMediaSibling(origPath, suffix, buffer) {
  const target = origPath.replace(/\.[^.]+$/, '') + suffix;
  await fs.writeFile(target, buffer);
  await refreshTree();
  await openFile(target);
}

// Returns a debounced autosave handler for a .drawio file.
let drawioTimer = null;
function makeDrawioSaver(path) {
  return xml => {
    saveStatus.textContent = t('save.unsaved');
    clearTimeout(drawioTimer);
    drawioTimer = setTimeout(async () => {
      await fs.writeFile(path, xml);
      saveStatus.textContent = t('save.saved');
      const saved = t('save.saved');
      setTimeout(() => { if (saveStatus.textContent === saved) saveStatus.textContent = ''; }, 1500);
    }, 600);
  };
}

function renderPreview() {
  if (!FileTypes.canPreview(currentLang)) return;
  const p = FileTypes.preview(currentLang, Editor.getValue());
  if (!p) return;
  if (p.kind === 'iframe') {
    previewEl.style.display = 'none';
    previewFrame.style.display = 'block';
    previewFrame.srcdoc = p.payload;
  } else {
    previewFrame.style.display = 'none';
    previewEl.style.display = 'block';
    previewEl.innerHTML = p.payload;
  }
}

// Editor change handler — wired into the Editor facade (Monaco or fallback).
function onEditorChange() {
  if (currentKind !== 'editor') return;   // a viewer/diagram/image is active
  if (viewMode !== 'edit') renderPreview();
  saveStatus.textContent = t('save.unsaved');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!openFilePath) return;
    await fs.writeFile(openFilePath, Editor.getValue());
    const saved = t('save.saved');
    saveStatus.textContent = saved;
    setTimeout(() => { if (saveStatus.textContent === saved) saveStatus.textContent = ''; }, 1500);
  }, 500);
}

// ── View modes ────────────────────────────────────────────────────────────────
function applyViewMode() {
  const can = FileTypes.canPreview(currentLang);
  modeSwitch.style.display = can ? 'flex' : 'none';
  const mode = can ? viewMode : 'edit';   // non-previewable types: editor only
  editWrap.style.display = mode === 'preview' ? 'none' : '';
  previewWrap.style.display = (can && mode !== 'edit') ? '' : 'none';
  editorArea.classList.toggle('split', can && mode === 'split');
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === viewMode));
  if (can && mode !== 'edit') renderPreview();
  Editor.layout();
}
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    viewMode = btn.dataset.mode;
    localStorage.setItem('info-data-view', viewMode);
    applyViewMode();
    if (viewMode !== 'edit') renderPreview();
  });
});

function showWelcome() {
  welcome.style.display = 'flex';
  editorPanel.style.display = 'none';
  openFilePath = null;
  currentKind = 'editor';
  leaveAlt();
}

// ── Context menu ──────────────────────────────────────────────────────────────
function showCtxMenu(e, node) {
  ctxTargetPath = node.path;
  ctxMenu.innerHTML = '';
  const addItem = (iconName, label, fn, danger) => {
    const el = document.createElement('div');
    el.className = 'ctx-item' + (danger ? ' danger' : '');
    el.innerHTML = Icon(iconName, { size: 15 }) + `<span>${label}</span>`;
    el.addEventListener('click', () => { hideCtxMenu(); fn(); });
    ctxMenu.appendChild(el);
  };
  const sep = () => { const s = document.createElement('div'); s.className = 'ctx-sep'; ctxMenu.appendChild(s); };

  if (node.type === 'dir') {
    addItem('file-plus', t('sidebar.newDocument'), () => promptCreate('document', node.path));
    addItem('folder-plus', t('sidebar.newFolder'), () => promptCreate('folder', node.path));
    sep();
  }
  addItem('pencil', t('tree.rename'), () => promptRename(node));
  addItem('trash-2', t('tree.delete'), () => promptDelete(node), true);

  ctxMenu.style.left = Math.min(e.clientX, window.innerWidth - 170) + 'px';
  ctxMenu.style.top = e.clientY + 'px';
  ctxMenu.classList.add('visible');
}
function hideCtxMenu() { ctxMenu.classList.remove('visible'); ctxTargetPath = null; }
document.addEventListener('click', hideCtxMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideCtxMenu(); hideModal(); hideFormats(); Settings.close(); } });

// ── Modal ─────────────────────────────────────────────────────────────────────
const modalOverlay = $('modal-overlay');
const modalTitle = $('modal-title');
const modalInput = $('modal-input');
const modalOk = $('modal-ok');
const modalCancel = $('modal-cancel');
let modalCb = null;     // prompt callback (receives input value)
let confirmCb = null;   // confirm callback (no argument)

const modalExtra = $('modal-extra');
function showModal(title, placeholder, defaultVal, okLabel, cb, extraHTML) {
  modalTitle.textContent = title;
  modalInput.style.display = '';
  modalInput.placeholder = placeholder;
  modalInput.value = defaultVal || '';
  modalOk.textContent = okLabel || 'OK';
  modalExtra.innerHTML = extraHTML || '';
  modalCb = cb; confirmCb = null;
  modalOverlay.classList.add('visible');
  setTimeout(() => { modalInput.focus(); modalInput.select(); }, 40);
}
// Simple yes/no confirm (no typing required).
function showConfirm(title, okLabel, onOk) {
  modalTitle.textContent = title;
  modalInput.style.display = 'none';
  modalExtra.innerHTML = '';
  modalOk.textContent = okLabel || 'OK';
  modalCb = null; confirmCb = onOk;
  modalOverlay.classList.add('visible');
  setTimeout(() => modalOk.focus(), 40);
}
function hideModal() { modalOverlay.classList.remove('visible'); modalCb = null; confirmCb = null; modalInput.style.display = ''; modalExtra.innerHTML = ''; }
function submitModal() {
  if (confirmCb) { const cb = confirmCb; confirmCb = null; hideModal(); cb(); return; }
  const v = modalInput.value.trim();
  if (modalCb) modalCb(v);
  hideModal();
}
modalOk.addEventListener('click', submitModal);
modalCancel.addEventListener('click', hideModal);
modalInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitModal(); });
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) hideModal(); });

// ── Create / rename / delete ────────────────────────────────────────────────
function promptCreate(type, parentPath) {
  const titleKey = { project: 'modal.newProject', folder: 'modal.newFolder', document: 'modal.newDocument' }[type];
  const extra = type === 'document' ? formatsHintHTML() : '';
  showModal(t(titleKey), type === 'document' ? 'note.md' : t('modal.namePh'), '', t('modal.create'), async name => {
    if (!name) return;
    if (name.includes('/')) { alert(t('modal.noSlash')); return; }
    if (type === 'document' && !/\.[a-z0-9]+$/i.test(name)) name += '.md';
    const path = PathUtil.join(parentPath, name);
    if (await fs.exists(path)) { alert(t('modal.exists')); return; }
    if (type === 'document') await fs.createFile(path, '');
    else await fs.mkdir(path);
    openDirs.add(parentPath); persistOpen();
    if (type === 'document') { await openFile(path); }
    else { selectedPath = path; selectedType = 'dir'; }
    await refreshTree();
  }, extra);
}

function promptRename(node) {
  showModal(t('modal.renameTitle'), t('modal.renamePh'), node.name, t('modal.rename'), async newName => {
    if (!newName || newName === node.name) return;
    const newPath = PathUtil.join(PathUtil.parent(node.path), newName);
    await fs.move(node.path, newPath);
    if (openFilePath === node.path) { openFilePath = newPath; editorTitle.textContent = newPath; }
    if (selectedPath === node.path) selectedPath = newPath;
    await refreshTree();
  });
}

function promptDelete(node) {
  const title = t(node.type === 'dir' ? 'modal.deleteDir' : 'modal.deleteFile', { name: node.name });
  showConfirm(title, t('modal.delete'), async () => {
    await fs.remove(node.path);
    if (openFilePath === node.path || (openFilePath && openFilePath.startsWith(node.path + '/'))) showWelcome();
    if (selectedPath === node.path) { selectedPath = null; selectedType = null; }
    await refreshTree();
  });
}

// ── Toolbar ─────────────────────────────────────────────────────────────────
const parentForNew = () => {
  // Use the selected folder; if a file is selected, use its containing folder.
  if (!selectedPath) return '/';
  if (selectedType === 'dir') return selectedPath;
  return PathUtil.parent(selectedPath);
};
$('btn-project').addEventListener('click', () => promptCreate('project', '/'));
$('btn-folder').addEventListener('click', () => promptCreate('folder', parentForNew()));
$('btn-document').addEventListener('click', () => promptCreate('document', parentForNew()));
// Sidebar-header action buttons (VS Code-style).
$('hdr-project').addEventListener('click', () => promptCreate('project', '/'));
$('hdr-folder').addEventListener('click', () => promptCreate('folder', parentForNew()));
$('hdr-document').addEventListener('click', () => promptCreate('document', parentForNew()));

// Inject Lucide icons + translated labels into the chrome. Re-run on language change.
function initIcons() {
  $('btn-connect').innerHTML  = rememberedHandle
    ? Icon('hard-drive', { size: 15 }) + `<span>${t('app.reconnect', { name: rememberedHandle.name })}</span>`
    : Icon('hard-drive', { size: 15 }) + `<span>${t('app.connect')}</span>`;
  $('btn-project').innerHTML  = Icon('package', { size: 15 }) + `<span>${t('app.project')}</span>`;
  $('btn-folder').innerHTML   = Icon('folder-plus', { size: 15 }) + `<span>${t('app.folder')}</span>`;
  $('btn-document').innerHTML = Icon('file-plus', { size: 15 }) + `<span>${t('app.document')}</span>`;
  $('btn-console').innerHTML  = Icon('terminal', { size: 15 }) + `<span>${t('app.console')}</span>`;
  $('hdr-settings').innerHTML = Icon('settings', { size: 16 });
  $('hdr-project').innerHTML  = Icon('package', { size: 16 });
  $('hdr-folder').innerHTML   = Icon('folder-plus', { size: 16 });
  $('hdr-document').innerHTML = Icon('file-plus', { size: 16 });
  $('console-close').innerHTML = Icon('x', { size: 15 });
  $('btn-help').innerHTML = Icon('circle-help', { size: 18 });
  $('formats-close').innerHTML = Icon('x', { size: 16 });
  $('settings-close').innerHTML = Icon('x', { size: 16 });
  const wi = document.querySelector('.welcome-icon');
  if (wi) wi.innerHTML = Icon('package', { size: 46 });
}

// Re-render the dynamic, JS-built UI when the language changes.
window.onI18nApply = () => {
  initIcons();
  if (currentBadge) setBackendBadge(currentBadge.name, currentBadge.folder);
  const wf = $('welcome-formats'); if (wf) wf.innerHTML = formatsGridHTML();
  if (formatsOverlay.classList.contains('visible')) $('formats-body').innerHTML = formatsGridHTML();
};

// ── Settings ─────────────────────────────────────────────────────────────────
$('hdr-settings').addEventListener('click', () => Settings.open());
$('settings-close').addEventListener('click', () => Settings.close());
$('settings-overlay').addEventListener('click', e => { if (e.target === $('settings-overlay')) Settings.close(); });
Settings.onChange = () => refreshTree();

// ── Supported-formats panel ──────────────────────────────────────────────────
const formatsOverlay = $('formats-overlay');
function showFormats() { $('formats-body').innerHTML = formatsGridHTML(); formatsOverlay.classList.add('visible'); }
function hideFormats() { formatsOverlay.classList.remove('visible'); }
$('btn-help').addEventListener('click', showFormats);
$('formats-close').addEventListener('click', hideFormats);
formatsOverlay.addEventListener('click', e => { if (e.target === formatsOverlay) hideFormats(); });

// ── Disk connect (File System Access API) ─────────────────────────────────────
const btnConnect = $('btn-connect');
let rememberedHandle = null;   // last folder, awaiting a click to re-grant access

// Switch the app onto a (granted) directory handle and remember it.
async function activateDisk(handle) {
  await DiskBackend.persistHandle(handle);
  const name = await fs.useDisk(handle);
  setBackendBadge(name, handle.name);
  rememberedHandle = null;
  resetConnectButton();
  selectedPath = null; selectedType = null;
  showWelcome();
  await refreshTree();
  bindShell();
}

async function connectDisk() {
  // If we remember a folder, try to silently re-grant it first (one click,
  // no folder dialog). Browsers require this gesture; they won't auto-grant.
  if (rememberedHandle) {
    try {
      if (await rememberedHandle.requestPermission({ mode: 'readwrite' }) === 'granted') {
        await activateDisk(rememberedHandle);
        return;
      }
    } catch { /* fall through to the picker */ }
  }
  try {
    const handle = await window.showDirectoryPicker({ id: 'info-data', mode: 'readwrite' });
    await activateDisk(handle);
  } catch (e) {
    if (e && e.name !== 'AbortError') alert(t('error.folderConnect') + e.message);
  }
}

function setBackendBadge(name, folder) {
  currentBadge = { name, folder };
  if (name === 'Disk') backendBadge.innerHTML = Icon('hard-drive', { size: 13 }) + `<span>${t('badge.disk', { name: folder || '—' })}</span>`;
  else backendBadge.innerHTML = Icon('database', { size: 13 }) + `<span>${t('badge.browser')}</span>`;
}

// Toolbar button reflects whether a remembered folder is waiting to reconnect.
function offerReconnect(name) {
  btnConnect.title = t('app.reconnect', { name });
  btnConnect.innerHTML = Icon('hard-drive', { size: 15 }) + `<span>${t('app.reconnect', { name })}</span>`;
  btnConnect.classList.add('btn-accent');
}
function resetConnectButton() {
  btnConnect.title = '';
  btnConnect.innerHTML = Icon('hard-drive', { size: 15 }) + `<span>${t('app.connect')}</span>`;
  btnConnect.classList.remove('btn-accent');
}

if (btnConnect) {
  if (DiskBackend.supported) btnConnect.addEventListener('click', connectDisk);
  else btnConnect.style.display = 'none';
}

// ── Console panel ──────────────────────────────────────────────────────────────
const consolePanel = $('console-panel');
const consoleOut = $('console-output');
const consoleInput = $('console-input');
const consolePrompt = $('console-prompt');
const consoleHints = $('console-hints');
const ghostTyped = document.querySelector('#console-ghost .ghost-typed');
const ghostRest  = document.querySelector('#console-ghost .ghost-rest');
let cmdHistory = [];
let histIndex = -1;

// IntelliSense: command descriptions + which commands take a path argument.
// Console commands → i18n key for their description (resolved with t() at render).
const COMMANDS = {
  help: 'cmd.help', pwd: 'cmd.pwd', ls: 'cmd.ls', cd: 'cmd.cd', project: 'cmd.project',
  mkdir: 'cmd.mkdir', touch: 'cmd.touch', write: 'cmd.write', cat: 'cmd.cat', open: 'cmd.open',
  rm: 'cmd.rm', mv: 'cmd.mv', cp: 'cmd.cp', tree: 'cmd.tree', find: 'cmd.find', echo: 'cmd.echo', clear: 'cmd.clear',
};
const PATH_CMDS = new Set(['ls','cd','cat','open','rm','mv','cp','tree','find','touch','mkdir','write']);
let applySuggestion = null;   // invoked on Tab — applies the selected suggestion
let currentMatches = [];      // [{ label, desc, ghostRest, apply }] — capped to MAX_HINTS
let hintIndex = 0;            // which suggestion is highlighted (the Tab target)
const MAX_HINTS = 12;         // keep navigation index and rendered chips 1:1

function bindShell() {
  shell = new Shell({
    fs,
    onRefresh: () => refreshTree(),
    onOpen: p => openFile(p),
    onClear: () => { consoleOut.innerHTML = ''; },
  });
  updatePrompt();
}
function updatePrompt() { consolePrompt.textContent = (shell ? shell.cwd : '/') + ' ❯'; }

function consoleEcho(text, cls) {
  const div = document.createElement('div');
  div.className = 'console-line' + (cls ? ' ' + cls : '');
  div.textContent = text;
  consoleOut.appendChild(div);
}

async function runConsole(line) {
  consoleEcho((shell.cwd) + ' ❯ ' + line, 'console-cmd');
  const res = await shell.run(line);
  if (!res.cleared) for (const l of res.lines) consoleEcho(l, res.error ? 'console-err' : 'console-ok');
  updatePrompt();
  consoleOut.scrollTop = consoleOut.scrollHeight;
}

consoleInput.addEventListener('keydown', async e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    if (applySuggestion) applySuggestion();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (currentMatches.length) {
      // Suggestions open: arrows move through them.
      selectHint(hintIndex + (e.key === 'ArrowDown' ? 1 : -1));
    } else {
      // No suggestions: walk command history. Keep suggestions closed so the
      // arrows keep cycling history (recalling a path command must not reopen
      // the hint list and hijack the next arrow press).
      if (e.key === 'ArrowUp') {
        if (histIndex > 0) { histIndex--; consoleInput.value = cmdHistory[histIndex]; }
      } else if (histIndex < cmdHistory.length - 1) {
        histIndex++; consoleInput.value = cmdHistory[histIndex];
      } else {
        histIndex = cmdHistory.length; consoleInput.value = '';
      }
      clearSuggestions();
    }
  } else if (e.key === 'Enter') {
    const line = consoleInput.value;
    consoleInput.value = '';
    clearSuggestions();
    if (line.trim()) { cmdHistory.push(line); histIndex = cmdHistory.length; }
    await runConsole(line);
  } else if (e.key === 'Escape') {
    clearSuggestions();   // dismiss suggestions; arrows then reach history
  }
});

consoleInput.addEventListener('input', () => updateSuggestions());
consoleInput.addEventListener('scroll', () => { document.getElementById('console-ghost').scrollLeft = consoleInput.scrollLeft; });

function clearSuggestions() {
  applySuggestion = null;
  currentMatches = [];
  hintIndex = 0;
  ghostTyped.textContent = '';
  ghostRest.textContent = '';
  consoleHints.innerHTML = '';
}

function renderHints() {
  // currentMatches is already capped to MAX_HINTS, so chips map 1:1 to indices.
  consoleHints.innerHTML = '';
  currentMatches.forEach((m, idx) => {
    const chip = document.createElement('span');
    chip.className = 'hint-chip' + (idx === hintIndex ? ' top' : '');
    chip.innerHTML = `<b>${FileTypes.esc(m.label)}</b>${m.desc ? `<i>${FileTypes.esc(m.desc)}</i>` : ''}`;
    chip.addEventListener('mousedown', ev => { ev.preventDefault(); selectHint(idx); m.apply(); consoleInput.focus(); });
    consoleHints.appendChild(chip);
  });
}

// Highlight suggestion i (wraps around) and point the ghost text + Tab at it.
function selectHint(i) {
  if (!currentMatches.length) { applySuggestion = null; return; }
  hintIndex = (i % currentMatches.length + currentMatches.length) % currentMatches.length;
  const m = currentMatches[hintIndex];
  ghostTyped.textContent = consoleInput.value;
  ghostRest.textContent = m.ghostRest;
  applySuggestion = m.apply;
  [...consoleHints.children].forEach((chip, idx) => {
    const on = idx === hintIndex;
    chip.classList.toggle('top', on);
    if (on) chip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

// Split a partial path token into { dir, namePrefix, prefixStr }.
function splitPartial(partial) {
  const slash = partial.lastIndexOf('/');
  if (slash < 0) return { dir: shell.cwd, namePrefix: partial, prefixStr: '' };
  const prefixStr = partial.slice(0, slash + 1);
  const dir = prefixStr.startsWith('/') ? PathUtil.normalize(prefixStr) : PathUtil.join(shell.cwd, prefixStr);
  return { dir, namePrefix: partial.slice(slash + 1), prefixStr };
}

const replaceLastToken = (val, trailingSpace, token) =>
  trailingSpace ? val + token : val.replace(/\S+$/, token);

async function updateSuggestions() {
  clearSuggestions();
  const val = consoleInput.value;
  if (!val || !shell) return;
  const trailingSpace = /\s$/.test(val);
  const tokens = val.split(/\s+/).filter(Boolean);

  // ── Completing the command (first word) ──
  if (tokens.length <= 1 && !trailingSpace) {
    const prefix = tokens[0] || '';
    const matches = Object.keys(COMMANDS).filter(c => c.startsWith(prefix)).sort();
    if (!matches.length) return;
    currentMatches = matches.slice(0, MAX_HINTS).map(c => ({
      label: c, desc: t(COMMANDS[c]),
      ghostRest: c.slice(prefix.length),
      apply: () => { consoleInput.value = c + ' '; updateSuggestions(); },
    }));
    renderHints();
    selectHint(0);
    return;
  }

  // ── Completing a path argument ──
  const cmd = tokens[0];
  if (!PATH_CMDS.has(cmd)) return;
  const partial = trailingSpace ? '' : tokens[tokens.length - 1];
  const { dir, namePrefix, prefixStr } = splitPartial(partial);
  let entries;
  try { entries = await fs.list(dir); } catch { return; }
  const matches = entries
    .filter(e => e.name.startsWith(namePrefix))
    .sort((a, b) => (a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)))
    .map(e => ({ display: e.name + (e.type === 'dir' ? '/' : ''), type: e.type }));
  if (!matches.length) return;

  currentMatches = matches.slice(0, MAX_HINTS).map(m => ({
    label: m.display, desc: m.type === 'dir' ? t('kind.folder') : t('kind.file'),
    ghostRest: m.display.slice(namePrefix.length),
    apply: () => { consoleInput.value = replaceLastToken(val, trailingSpace, prefixStr + m.display); updateSuggestions(); },
  }));
  renderHints();
  selectHint(0);
}

function openConsole() {
  consolePanel.classList.add('open');
  let h = +localStorage.getItem('info-data-console-h') || 320;
  consolePanel.style.height = Math.min(h, window.innerHeight - 140) + 'px';
  consoleInput.focus();
}
function closeConsole() {
  consolePanel.classList.remove('open');
  consolePanel.style.height = '';   // animate back to 0 via the base rule
}
$('btn-console').addEventListener('click', () =>
  consolePanel.classList.contains('open') ? closeConsole() : openConsole());
$('console-close').addEventListener('click', closeConsole);

// ── Resizable panels ────────────────────────────────────────────────────────
// One drag helper for every divider. Listeners are attached per-drag and torn
// down on mouseup, and a body class disables text selection + iframe pointer
// events for the duration so the HTML preview can't hijack the drag.
function startDrag(handle, cursor, onMove, onStart, onEnd) {
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    handle.classList.add('dragging');
    document.body.classList.add('dragging-active');
    document.body.style.cursor = cursor;
    if (onStart) onStart();
    const move = ev => { ev.preventDefault(); onMove(ev); };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      handle.classList.remove('dragging');
      document.body.classList.remove('dragging-active');
      document.body.style.cursor = '';
      if (onEnd) onEnd();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

const sidebar = $('sidebar');

// Sidebar width
startDrag($('resizer'), 'col-resize', e => {
  const w = Math.max(180, Math.min(480, e.clientX - sidebar.getBoundingClientRect().left));
  sidebar.style.width = w + 'px';
  localStorage.setItem('info-data-sidebar-w', w);
  Editor.layout();
});

// Editor / preview split ratio
startDrag($('split-resizer'), 'col-resize', e => {
  const rect = editorArea.getBoundingClientRect();
  const ratio = Math.max(0.15, Math.min(0.85, (e.clientX - rect.left) / rect.width));
  editorArea.style.setProperty('--split', (ratio * 100).toFixed(2) + '%');
  localStorage.setItem('info-data-split', ratio);
  Editor.layout();
});

// Console height (drag its top edge; cursor distance from viewport bottom)
startDrag($('console-resizer'), 'row-resize', e => {
  const h = Math.max(120, Math.min(window.innerHeight - 140, window.innerHeight - e.clientY));
  consolePanel.style.height = h + 'px';
  localStorage.setItem('info-data-console-h', h);
  Editor.layout();
}, () => consolePanel.classList.add('resizing'), () => consolePanel.classList.remove('resizing'));

// Keep an open console from overflowing when the window shrinks.
window.addEventListener('resize', () => {
  if (consolePanel.classList.contains('open')) {
    consolePanel.style.height = Math.min(consolePanel.offsetHeight, window.innerHeight - 140) + 'px';
  }
});

// Restore saved sizes.
(function restoreSizes() {
  const sw = +localStorage.getItem('info-data-sidebar-w');
  if (sw) sidebar.style.width = sw + 'px';
  const sr = +localStorage.getItem('info-data-split');
  if (sr) editorArea.style.setProperty('--split', (sr * 100).toFixed(2) + '%');
})();

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  document.documentElement.lang = getLang();
  initIcons();
  applyI18n();   // translate static [data-i18n] + dynamic UI
  $('welcome-formats').innerHTML = formatsGridHTML();
  // Kick off the editor (Monaco from CDN, or the built-in fallback). Don't block
  // the tree on it; openFile() awaits editorReady before loading any content.
  editorReady = Editor.init({
    textarea: editorTA,
    highlightCode: highlightEl,
    host: $('monaco-host'),
    onChange: onEditorChange,
  });

  let backendName = await fs.useIndexedDB();
  setBackendBadge('IndexedDB', null);
  // Reconnect the last opened folder. If the browser still grants permission we
  // attach silently; otherwise we remember the handle and surface a one-click
  // "Открыть «folder»" button (the API forbids silent re-grant after close).
  if (DiskBackend.supported) {
    try {
      const handle = await DiskBackend.restoreHandle();
      if (handle) {
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          backendName = await fs.useDisk(handle);
          setBackendBadge(backendName, handle.name);
        } else {
          rememberedHandle = handle;
          offerReconnect(handle.name);
        }
      }
    } catch { /* keep IndexedDB */ }
  }
  bindShell();
  showWelcome();
  await refreshTree();

  await editorReady;
  applyViewMode();

  // Reopen the last file viewed in this storage backend.
  const last = localStorage.getItem('info-data-last');
  if (last && await fs.exists(last)) await openFile(last);
}

boot();
