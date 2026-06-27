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
    treeEl.innerHTML = `<div class="tree-empty">Пусто — создайте проект</div>`;
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
    icon.innerHTML = Icon(fi.icon, { size: 15, color: fi.color });
  }

  const name = document.createElement('span');
  name.className = 'tree-name';
  name.textContent = node.name;

  // Hover action buttons (VS Code-style).
  const actions = document.createElement('span');
  actions.className = 'row-actions';
  if (isDir) {
    actions.appendChild(actionBtn('file-plus', 'Новый документ', e => { e.stopPropagation(); setSelected(node, row); promptCreate('document', node.path); }));
    actions.appendChild(actionBtn('folder-plus', 'Новая папка', e => { e.stopPropagation(); setSelected(node, row); promptCreate('folder', node.path); }));
  }
  actions.appendChild(actionBtn('pencil', 'Переименовать', e => { e.stopPropagation(); promptRename(node); }));
  actions.appendChild(actionBtn('trash-2', 'Удалить', e => { e.stopPropagation(); promptDelete(node); }, 'danger'));

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

// ── Editor ──────────────────────────────────────────────────────────────────
async function openFile(path) {
  const content = await fs.readFile(path);
  if (content === null) return;
  if (editorReady) await editorReady;   // ensure the editor exists before loading content
  openFilePath = path;
  selectedPath = path;
  selectedType = 'file';
  currentLang = FileTypes.detect(path);
  localStorage.setItem('info-data-last', path);
  welcome.style.display = 'none';
  editorPanel.style.display = 'flex';
  editorTitle.textContent = path;
  langBadge.textContent = FileTypes.label(currentLang);
  saveStatus.textContent = '';
  Editor.open(content, currentLang);
  applyViewMode();
  Editor.focus();
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
  if (viewMode !== 'edit') renderPreview();
  saveStatus.textContent = 'Не сохранено…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!openFilePath) return;
    await fs.writeFile(openFilePath, Editor.getValue());
    saveStatus.textContent = 'Сохранено ✓';
    setTimeout(() => { if (saveStatus.textContent === 'Сохранено ✓') saveStatus.textContent = ''; }, 1500);
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
    addItem('file-plus', 'Новый документ', () => promptCreate('document', node.path));
    addItem('folder-plus', 'Новая папка', () => promptCreate('folder', node.path));
    sep();
  }
  addItem('pencil', 'Переименовать', () => promptRename(node));
  addItem('trash-2', 'Удалить', () => promptDelete(node), true);

  ctxMenu.style.left = Math.min(e.clientX, window.innerWidth - 170) + 'px';
  ctxMenu.style.top = e.clientY + 'px';
  ctxMenu.classList.add('visible');
}
function hideCtxMenu() { ctxMenu.classList.remove('visible'); ctxTargetPath = null; }
document.addEventListener('click', hideCtxMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideCtxMenu(); hideModal(); } });

// ── Modal ─────────────────────────────────────────────────────────────────────
const modalOverlay = $('modal-overlay');
const modalTitle = $('modal-title');
const modalInput = $('modal-input');
const modalOk = $('modal-ok');
const modalCancel = $('modal-cancel');
let modalCb = null;     // prompt callback (receives input value)
let confirmCb = null;   // confirm callback (no argument)

function showModal(title, placeholder, defaultVal, okLabel, cb) {
  modalTitle.textContent = title;
  modalInput.style.display = '';
  modalInput.placeholder = placeholder;
  modalInput.value = defaultVal || '';
  modalOk.textContent = okLabel || 'OK';
  modalCb = cb; confirmCb = null;
  modalOverlay.classList.add('visible');
  setTimeout(() => { modalInput.focus(); modalInput.select(); }, 40);
}
// Simple yes/no confirm (no typing required).
function showConfirm(title, okLabel, onOk) {
  modalTitle.textContent = title;
  modalInput.style.display = 'none';
  modalOk.textContent = okLabel || 'OK';
  modalCb = null; confirmCb = onOk;
  modalOverlay.classList.add('visible');
  setTimeout(() => modalOk.focus(), 40);
}
function hideModal() { modalOverlay.classList.remove('visible'); modalCb = null; confirmCb = null; modalInput.style.display = ''; }
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
  const labels = { project: 'Новый проект', folder: 'Новая папка', document: 'Новый документ' };
  showModal(labels[type], type === 'document' ? 'note.md' : 'Название…', '', 'Создать', async name => {
    if (!name) return;
    if (name.includes('/')) { alert('Имя не может содержать «/»'); return; }
    if (type === 'document' && !/\.[a-z0-9]+$/i.test(name)) name += '.md';
    const path = PathUtil.join(parentPath, name);
    if (await fs.exists(path)) { alert('Такой элемент уже существует'); return; }
    if (type === 'document') await fs.createFile(path, '');
    else await fs.mkdir(path);
    openDirs.add(parentPath); persistOpen();
    if (type === 'document') { await openFile(path); }
    else { selectedPath = path; selectedType = 'dir'; }
    await refreshTree();
  });
}

function promptRename(node) {
  showModal('Переименовать', 'Новое имя…', node.name, 'Сохранить', async newName => {
    if (!newName || newName === node.name) return;
    const newPath = PathUtil.join(PathUtil.parent(node.path), newName);
    await fs.move(node.path, newPath);
    if (openFilePath === node.path) { openFilePath = newPath; editorTitle.textContent = newPath; }
    if (selectedPath === node.path) selectedPath = newPath;
    await refreshTree();
  });
}

function promptDelete(node) {
  const what = node.type === 'dir' ? '«' + node.name + '» и всё содержимое' : '«' + node.name + '»';
  showConfirm(`Удалить ${what}?`, 'Удалить', async () => {
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

// Inject Lucide icons into the static chrome (toolbar, header, badge, welcome).
function initIcons() {
  $('btn-connect').innerHTML  = Icon('hard-drive', { size: 15 }) + '<span>Подключить папку</span>';
  $('btn-project').innerHTML  = Icon('package', { size: 15 }) + '<span>Проект</span>';
  $('btn-folder').innerHTML   = Icon('folder-plus', { size: 15 }) + '<span>Папка</span>';
  $('btn-document').innerHTML = Icon('file-plus', { size: 15 }) + '<span>Документ</span>';
  $('btn-console').innerHTML  = Icon('terminal', { size: 15 }) + '<span>Консоль</span>';
  $('hdr-project').innerHTML  = Icon('package', { size: 16 });
  $('hdr-folder').innerHTML   = Icon('folder-plus', { size: 16 });
  $('hdr-document').innerHTML = Icon('file-plus', { size: 16 });
  $('console-close').innerHTML = Icon('x', { size: 15 });
  const wi = document.querySelector('.welcome-icon');
  if (wi) wi.innerHTML = Icon('package', { size: 46 });
}

// ── Disk connect (File System Access API) ─────────────────────────────────────
const btnConnect = $('btn-connect');
async function connectDisk() {
  try {
    const handle = await window.showDirectoryPicker({ id: 'info-data', mode: 'readwrite' });
    await DiskBackend.persistHandle(handle);
    const name = await fs.useDisk(handle);
    setBackendBadge(name, handle.name);
    selectedPath = null; showWelcome();
    await refreshTree();
    bindShell();
  } catch (e) {
    if (e && e.name !== 'AbortError') alert('Не удалось подключить папку: ' + e.message);
  }
}
function setBackendBadge(name, folder) {
  if (name === 'Disk') backendBadge.innerHTML = Icon('hard-drive', { size: 13 }) + `<span>Диск: ${folder || 'папка'}</span>`;
  else backendBadge.innerHTML = Icon('database', { size: 13 }) + '<span>Браузер (IndexedDB)</span>';
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
const COMMANDS = {
  help:'список команд', pwd:'текущая папка', ls:'список', cd:'перейти в папку',
  project:'создать проект (папку в корне)', mkdir:'создать папку', touch:'создать файл',
  write:'записать в файл', cat:'показать файл', open:'открыть в редакторе',
  rm:'удалить', mv:'переместить / переименовать', cp:'копировать',
  tree:'дерево', find:'поиск по имени', echo:'вывести текст', clear:'очистить консоль',
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
      label: c, desc: COMMANDS[c],
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
    label: m.display, desc: m.type === 'dir' ? 'папка' : 'файл',
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
  initIcons();
  // Kick off the editor (Monaco from CDN, or the built-in fallback). Don't block
  // the tree on it; openFile() awaits editorReady before loading any content.
  editorReady = Editor.init({
    textarea: editorTA,
    highlightCode: highlightEl,
    host: $('monaco-host'),
    onChange: onEditorChange,
  });

  let backendName = await fs.useIndexedDB();
  // Try to silently reconnect a previously-granted disk folder.
  if (DiskBackend.supported) {
    try {
      const handle = await DiskBackend.restoreHandle();
      if (handle && (await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
        backendName = await fs.useDisk(handle);
        setBackendBadge(backendName, handle.name);
      } else {
        setBackendBadge('IndexedDB');
      }
    } catch { setBackendBadge('IndexedDB'); }
  } else {
    setBackendBadge('IndexedDB');
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
