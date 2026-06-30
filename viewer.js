/* ============================================================================
 * viewer.js — 3D model viewer + simple editor.
 * Uses Three.js UMD builds (r147 — last version with examples/js/).
 *
 *   Viewer.isModel(path)
 *   Viewer.open(buffer, ext, name, host, { onSaveGLB })
 *   Viewer.showError(host, error)  — visual error explanation card
 *   Viewer.dispose()
 * ==========================================================================*/

const Viewer = (() => {
  const MODEL_EXT = new Set(['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', 'dae']);
  const isModel = path => {
    const m = /\.([a-z0-9]+)$/i.exec(path || '');
    return !!(m && MODEL_EXT.has(m[1].toLowerCase()));
  };

  let renderer, scene, camera, controls, pmrem, tcontrols;
  let host, rafId, ro, model, home = null, autoRotate = false;
  let editMode = false, selected = null, raycaster, pointer, onSaveGLB = null;
  let downXY = null;

  function ensureThree() {
    if (!window.THREE) throw new Error('THREE is not defined');
    if (!raycaster) raycaster = new THREE.Raycaster();
    if (!pointer) pointer = new THREE.Vector2();
  }

  function loaderFor(ext) {
    switch (ext) {
      case 'glb':
      case 'gltf':
        return new THREE.GLTFLoader();
      case 'obj':
        return new THREE.OBJLoader();
      case 'stl':
        return new THREE.STLLoader();
      case 'ply':
        return new THREE.PLYLoader();
      case 'fbx':
        return new THREE.FBXLoader();
      case '3mf':
        return new THREE.ThreeMFLoader();
      case 'dae':
        return new THREE.ColladaLoader();
      default:
        throw new Error('формат не поддерживается: ' + ext);
    }
  }

  const stdMaterial = () => new THREE.MeshStandardMaterial({ color: 0xbcc2cc, metalness: 0.1, roughness: 0.65 });

  function setupScene() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.encoding  = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0d11);

    pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(4, 8, 6);
    scene.add(dir);

    camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10000);
    camera.position.set(3, 2, 4);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    renderer.domElement.addEventListener('pointerdown', e => { downXY = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    resize();
    ro = new ResizeObserver(resize);
    ro.observe(host);

    const loop = () => {
      rafId = requestAnimationFrame(loop);
      if (autoRotate && model && !editMode) model.rotation.y += 0.005;
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
  }

  function resize() {
    if (!renderer || !host) return;
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function onPointerUp(e) {
    if (!editMode || !downXY) return;
    const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
    downXY = null;
    if (moved > 4) return;
    if (tcontrols && tcontrols.dragging) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(model, true).filter(h => h.object.isMesh);
    select(hits.length ? hits[0].object : null);
  }

  function select(mesh) {
    selected = mesh;
    if (mesh) { tcontrols.attach(mesh); } else { tcontrols.detach(); }
    updateEditPanel();
  }

  function setEditMode(on) {
    editMode = on;
    if (on && !tcontrols) {
      tcontrols = new THREE.TransformControls(camera, renderer.domElement);
      tcontrols.setSize(0.8);
      tcontrols.addEventListener('dragging-changed', e => { controls.enabled = !e.value; });
      scene.add(tcontrols);
    }
    if (!on && tcontrols) { tcontrols.detach(); selected = null; }
    autoRotate = on ? false : autoRotate;
    rebuildOverlay();
  }

  async function exportGLB() {
    const exporter = new THREE.GLTFExporter();
    return await new Promise((res, rej) =>
      exporter.parse(model, r => res(r), e => rej(e), { binary: true }));
  }

  function disposeObject(obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
          for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
          m.dispose();
        });
      }
    });
  }
  function clearModel() { if (model) { scene.remove(model); disposeObject(model); model = null; } }
  function clearGrid() { const g = scene && scene.getObjectByName('__grid'); if (g) scene.remove(g); }

  function parseModel(loader, ext, buffer) {
    if (ext === 'glb' || ext === 'gltf') {
      const data = ext === 'glb' ? buffer : new TextDecoder().decode(buffer);
      return new Promise((res, rej) => loader.parse(data, '', g => res(g.scene), rej));
    }
    if (ext === 'obj') return loader.parse(new TextDecoder().decode(buffer));
    if (ext === 'dae') return loader.parse(new TextDecoder().decode(buffer), '').scene;
    if (ext === 'stl') {
      const g = loader.parse(buffer);
      g.computeVertexNormals();
      return new THREE.Mesh(g, stdMaterial());
    }
    if (ext === 'ply') {
      const g = loader.parse(buffer);
      g.computeVertexNormals();
      const mat = stdMaterial();
      if (g.hasAttribute('color')) mat.vertexColors = true;
      return new THREE.Mesh(g, mat);
    }
    if (ext === 'fbx') return loader.parse(buffer, '');
    if (ext === '3mf') return loader.parse(buffer);
    throw new Error('формат не поддерживается: ' + ext);
  }

  function frame(object) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    const grid = new THREE.GridHelper(maxDim * 4, 20, 0x444450, 0x26262e);
    grid.position.y = -size.y / 2;
    grid.name = '__grid';
    scene.add(grid);

    camera.near = maxDim / 100;
    camera.far = maxDim * 100;
    camera.position.set(maxDim * 1.6, maxDim * 1.1, maxDim * 2.0);
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.minDistance = maxDim * 0.1;
    controls.maxDistance = maxDim * 20;
    controls.update();
    home = camera.position.clone();
  }

  let curName = '', curExt = '', curTris = 0;

  async function open(buffer, ext, name, container, opts = {}) {
    await ensureThree();
    if (host && host !== container) dispose();
    host = container;
    onSaveGLB = opts.onSaveGLB || null;
    editMode = false; selected = null;
    if (!renderer) setupScene();
    else if (renderer.domElement.parentElement !== host) host.appendChild(renderer.domElement);
    host.querySelectorAll('.viewer-bar, .viewer-msg, .viewer-edit, .viewer-host-overlay').forEach(el => el.remove());
    if (tcontrols) { tcontrols.detach(); }
    clearModel(); clearGrid();

    const loader = await loaderFor(ext);
    model = await parseModel(loader, ext, buffer);
    scene.add(model);
    frame(model);

    let tris = 0;
    model.traverse(o => {
      const g = o.geometry;
      if (g) tris += (g.index ? g.index.count : (g.attributes.position?.count || 0)) / 3;
    });
    curName = name; curExt = ext; curTris = Math.round(tris);
    rebuildOverlay();
    resize();
  }

  const I = (n) => (window.Icon ? Icon(n, { size: 15 }) : '');
  function btn(html, title, on, fn, extraCls) {
    const b = document.createElement('button');
    b.className = 'viewer-btn' + (on ? ' on' : '') + (extraCls ? ' ' + extraCls : '');
    b.innerHTML = html; b.title = title; b.onclick = fn; return b;
  }

  function rebuildOverlay() {
    host.querySelectorAll('.viewer-bar, .viewer-edit').forEach(el => el.remove());

    const bar = document.createElement('div');
    bar.className = 'viewer-bar';
    bar.innerHTML = `<span class="viewer-name">${curName}</span><span class="viewer-meta">${curExt.toUpperCase()} · ${curTris.toLocaleString('ru')} △</span>`;
    const actions = document.createElement('div'); actions.className = 'viewer-actions';
    actions.append(
      btn('⟲', 'Сбросить вид', false, () => { if (home) camera.position.copy(home); controls.target.set(0, 0, 0); controls.update(); }),
      btn('↻', 'Автоповорот', autoRotate, () => { autoRotate = !autoRotate; rebuildOverlay(); }),
      btn('◰', 'Каркас', false, e => {
        const on = e.currentTarget.classList.toggle('on');
        model.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.wireframe = on); });
      }),
      btn(I('pencil'), 'Редактировать', editMode, () => setEditMode(!editMode), 'edit-toggle'),
    );
    bar.appendChild(actions);
    host.appendChild(bar);

    if (editMode) buildEditBar();
  }

  let colorInput;
  function buildEditBar() {
    const eb = document.createElement('div');
    eb.className = 'viewer-edit';
    const tools = document.createElement('div'); tools.className = 'viewer-actions';
    const setMode = (m, el) => { tcontrols.setMode(m); eb.querySelectorAll('.tmode').forEach(x => x.classList.remove('on')); el.classList.add('on'); };
    const bMove = btn(I('move-3d'), 'Двигать', true, e => setMode('translate', e.currentTarget), 'tmode');
    const bRot  = btn(I('rotate-3d'), 'Вращать', false, e => setMode('rotate', e.currentTarget), 'tmode');
    const bScl  = btn(I('scale-3d'), 'Масштаб', false, e => setMode('scale', e.currentTarget), 'tmode');
    tools.append(bMove, bRot, bScl);

    colorInput = document.createElement('input');
    colorInput.type = 'color'; colorInput.className = 'viewer-color'; colorInput.title = 'Цвет выбранной части';
    colorInput.oninput = () => {
      if (!selected) return;
      const mats = Array.isArray(selected.material) ? selected.material : [selected.material];
      mats.forEach(m => { if (m.color) m.color.set(colorInput.value); });
    };

    const save = btn(I('save') + '<span>Сохранить</span>', 'Сохранить как GLB', false, doSave, 'save-btn');
    const hint = document.createElement('span'); hint.className = 'viewer-edit-hint'; hint.textContent = 'Клик по части модели — выбрать';

    eb.append(tools, colorInput, hint, save);
    host.appendChild(eb);
    if (tcontrols) tcontrols.setMode('translate');
    updateEditPanel();
  }

  function updateEditPanel() {
    if (!colorInput) return;
    if (selected && selected.material) {
      const m = Array.isArray(selected.material) ? selected.material[0] : selected.material;
      if (m.color) colorInput.value = '#' + m.color.getHexString();
      colorInput.disabled = false;
    } else { colorInput.disabled = true; }
  }

  async function doSave(e) {
    const b = e.currentTarget; const prev = b.innerHTML;
    b.disabled = true; b.innerHTML = I('save') + '<span>Сохранение…</span>';
    try {
      const glb = await exportGLB();
      if (onSaveGLB) await onSaveGLB(glb);
      b.innerHTML = I('save') + '<span>Сохранено ✓</span>';
    } catch (err) {
      b.innerHTML = I('save') + '<span>Ошибка</span>';
      console.warn('[viewer] save failed', err);
    }
    setTimeout(() => { b.innerHTML = prev; b.disabled = false; }, 1600);
  }

  /* ── Error explanation card ─────────────────────────────────── */

  function showError(container, error) {
    container.querySelectorAll('.viewer-err').forEach(el => el.remove());
    const msg = (error && (error.message || String(error))) || 'unknown error';
    const isNetwork = /Failed to load|Failed to fetch|NetworkError|THREE is not defined/.test(msg);
    const isFormat  = /формат не поддерживается/i.test(msg);
    const isParse   = /parse|load|unexpected token/i.test(msg);

    const hasThree = typeof THREE !== 'undefined';
    const info = isNetwork ? {
      icon:  '🌐',
      title: hasThree ? 'Движок 3D загрузился, но не все компоненты' : 'Движок 3D не загрузился',
      diagram: [
        ['Браузер',  'локальная папка'],
        ['Three.js', '3D-движок (r147)'],
        ['✗ ОШИБКА'],
      ],
      cause:  hasThree ? 'Не загрузился один из компонентов Three.js.' : 'Файл Three.js не смог загрузиться.',
      why:    'Без него браузер не умеет показывать 3D-модели.',
      fix: [
        'Проверьте, что папка three/ лежит рядом с index.html',
        'Перезагрузите страницу и попробуйте ещё раз',
      ],
      detail: msg,
    } : isFormat ? {
      icon:  '📄',
      title: 'Формат файла не поддерживается',
      diagram: [
        ['Файл',     '*.???'],
        ['Программа', 'распознаёт формат'],
        ['✗ НЕ ИЗВЕСТЕН'],
      ],
      cause:  'Программа не знает, как открыть такой тип файла.',
      why:    'Поддерживаются: GLB, GLTF, OBJ, STL, PLY, FBX, 3MF, DAE.',
      fix: [
        'Конвертируйте модель в GLB или OBL через любой 3D-редактор',
        'Или откройте файл через другую программу',
      ],
      detail: msg,
    } : isParse ? {
      icon:  '💥',
      title: 'Файл повреждён или несовместим',
      diagram: [
        ['Файл',     curName || 'модель'],
        ['Three.js', 'пытается прочитать данные'],
        ['✗ СБОЙ'],
      ],
      cause:  'Данные внутри файла не соответствуют ожидаемой структуре.',
      why:    'Файл мог быть повреждён при скачивании, сохранении или конвертации.',
      fix: [
        'Скачайте файл заново (возможно, он пришёл не полностью)',
        'Пересохраните модель в 3D-редакторе (Blender, Maya и т.п.)',
        'Экспортируйте в GLB — самый стабильный формат',
      ],
      detail: msg,
    } : {
      icon:  '⚠️',
      title: 'Не удалось открыть 3D-модель',
      diagram: [
        ['Приложение'],
        ['Файл / компонент'],
        ['✗ ОШИБКА'],
      ],
      cause:  'Произошла непредвиденная ошибка при открытии файла.',
      why:    '',
      fix: [
        'Перезагрузите страницу',
        'Проверьте, открывается ли файл в других программах',
        'Напишите разработчикам, приложив скриншот',
      ],
      detail: msg,
    };

    const card = document.createElement('div');
    card.className = 'viewer-err';

    card.innerHTML = `
      <div class="err-icon">${info.icon}</div>
      <div class="err-title">${info.title}</div>

      <div class="err-diagram">
        ${info.diagram.map((row, i) => {
          const [label, sub] = row;
          if (label.startsWith('✗')) return `<div class="err-arrow err-break">✗</div><div class="err-box err-fail"><span>${label}</span></div>`;
          return (i > 0 ? '<div class="err-arrow">↓</div>' : '') +
            `<div class="err-box">${sub ? `<small>${sub}</small>` : ''}<span>${label}</span></div>`;
        }).join('')}
      </div>

      <div class="err-section">
        <div class="err-h">❓ Что случилось</div>
        <div class="err-text">${info.cause} ${info.why}</div>
      </div>

      <div class="err-section">
        <div class="err-h">🔧 Как исправить</div>
        <ol class="err-steps">
          ${info.fix.map(s => `<li>${s}</li>`).join('')}
        </ol>
      </div>

      <details class="err-details">
        <summary>📋 Техническая информация</summary>
        <code>${info.detail}</code>
      </details>
    `;

    container.innerHTML = '';
    container.appendChild(card);
  }

  function dispose() {
    if (rafId) cancelAnimationFrame(rafId), rafId = null;
    if (ro) ro.disconnect(), ro = null;
    if (tcontrols) { tcontrols.detach(); tcontrols.dispose?.(); tcontrols = null; }
    if (model) { disposeObject(model); model = null; }
    if (pmrem) pmrem.dispose(), pmrem = null;
    if (controls) controls.dispose(), controls = null;
    if (renderer) { renderer.dispose(); renderer.forceContextLoss?.(); renderer.domElement?.remove(); renderer = null; }
    scene = camera = home = selected = null; editMode = false; colorInput = null;
    if (host) host.innerHTML = '';
  }

  return { isModel, open, showError, dispose };
})();

window.Viewer = Viewer;
