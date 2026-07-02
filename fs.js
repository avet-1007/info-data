/* ============================================================================
 * fs.js — Path-based file-system abstraction with two backends.
 *
 *   IDBBackend  — IndexedDB. Default. No practical size limit, works in every
 *                 browser, persists offline. The virtual file tree lives here.
 *   DiskBackend — File System Access API. Operates on a REAL folder on disk
 *                 (e.g. Documents/info-data). Projects/folders become real
 *                 directories, documents become real .md files. Chromium only.
 *
 * Both expose the same async API so the rest of the app never cares which is
 * active:  list, stat, exists, mkdir, writeFile, readFile, createFile, remove,
 *          move.
 * Paths are POSIX-style absolute strings: '/', '/Project', '/Project/note.md'.
 * ==========================================================================*/

// ── Path helpers ──────────────────────────────────────────────────────────────
const PathUtil = {
  normalize(p) {
    if (!p || p === '/') return '/';
    const parts = [];
    for (const seg of p.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return '/' + parts.join('/');
  },
  join(base, child) {
    if (child.startsWith('/')) return this.normalize(child);
    return this.normalize((base === '/' ? '' : base) + '/' + child);
  },
  parent(p) {
    p = this.normalize(p);
    if (p === '/') return '/';
    const i = p.lastIndexOf('/');
    return i <= 0 ? '/' : p.slice(0, i);
  },
  basename(p) {
    p = this.normalize(p);
    if (p === '/') return '/';
    return p.slice(p.lastIndexOf('/') + 1);
  },
  segments(p) {
    return this.normalize(p).split('/').filter(Boolean);
  },
};

// ============================================================================
// IndexedDB backend
// ============================================================================
class IDBBackend {
  constructor() {
    this.name = 'IndexedDB';
    this.db = null;
  }

  async init() {
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('info-data-fs-v2', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('nodes')) {
          const os = db.createObjectStore('nodes', { keyPath: 'path' });
          os.createIndex('parent', 'parent', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // Ensure root exists
    if (!(await this._get('/'))) {
      await this._put({ path: '/', parent: null, type: 'dir', name: '/', created: Date.now(), modified: Date.now() });
    }
  }

  _tx(mode) { return this.db.transaction('nodes', mode).objectStore('nodes'); }

  _get(path) {
    return new Promise((resolve, reject) => {
      const r = this._tx('readonly').get(path);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }
  _put(rec) {
    return new Promise((resolve, reject) => {
      const r = this._tx('readwrite').put(rec);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }
  _del(path) {
    return new Promise((resolve, reject) => {
      const r = this._tx('readwrite').delete(path);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }
  _childrenOf(path) {
    return new Promise((resolve, reject) => {
      const out = [];
      const idx = this._tx('readonly').index('parent');
      const r = idx.openCursor(IDBKeyRange.only(path));
      r.onsuccess = () => {
        const c = r.result;
        if (c) { out.push(c.value); c.continue(); }
        else resolve(out);
      };
      r.onerror = () => reject(r.error);
    });
  }
  _all() {
    return new Promise((resolve, reject) => {
      const r = this._tx('readonly').getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  async exists(path) { return !!(await this._get(PathUtil.normalize(path))); }

  async stat(path) {
    const rec = await this._get(PathUtil.normalize(path));
    if (!rec) return null;
    return { path: rec.path, name: rec.name, type: rec.type, created: rec.created, modified: rec.modified };
  }

  async list(path) {
    path = PathUtil.normalize(path);
    const kids = await this._childrenOf(path);
    return kids.map(r => ({ path: r.path, name: r.name, type: r.type, created: r.created, modified: r.modified }));
  }

  async mkdir(path) {
    path = PathUtil.normalize(path);
    if (await this._get(path)) return;
    const parent = PathUtil.parent(path);
    if (!(await this._get(parent))) await this.mkdir(parent);
    await this._put({ path, parent, type: 'dir', name: PathUtil.basename(path), created: Date.now(), modified: Date.now() });
  }

  async createFile(path, content = '') {
    path = PathUtil.normalize(path);
    const parent = PathUtil.parent(path);
    if (!(await this._get(parent))) await this.mkdir(parent);
    await this._put({ path, parent, type: 'file', name: PathUtil.basename(path), content, created: Date.now(), modified: Date.now() });
  }

  async writeFile(path, content) {
    path = PathUtil.normalize(path);
    const rec = await this._get(path);
    if (rec && rec.type === 'file') {
      rec.content = content; rec.modified = Date.now();
      await this._put(rec);
    } else {
      await this.createFile(path, content);
    }
  }

  async readFile(path) {
    const rec = await this._get(PathUtil.normalize(path));
    return rec && rec.type === 'file' ? (rec.content || '') : null;
  }

  // Binary read — returns an ArrayBuffer (used by the 3D viewer etc.).
  async readBinary(path) {
    const rec = await this._get(PathUtil.normalize(path));
    if (!rec || rec.type !== 'file') return null;
    const c = rec.content;
    if (c instanceof ArrayBuffer) return c;
    if (c instanceof Blob) return await c.arrayBuffer();
    if (ArrayBuffer.isView(c)) return c.buffer;
    return new TextEncoder().encode(c || '').buffer;
  }

  async remove(path) {
    path = PathUtil.normalize(path);
    const rec = await this._get(path);
    if (!rec) return;
    if (rec.type === 'dir') {
      const kids = await this._childrenOf(path);
      for (const k of kids) await this.remove(k.path);
    }
    await this._del(path);
  }

  async move(oldPath, newPath) {
    oldPath = PathUtil.normalize(oldPath);
    newPath = PathUtil.normalize(newPath);
    const rec = await this._get(oldPath);
    if (!rec) return;
    const newParent = PathUtil.parent(newPath);
    if (!(await this._get(newParent))) await this.mkdir(newParent);

    if (rec.type === 'dir') {
      const kids = await this._childrenOf(oldPath);
      // Move self first
      await this._del(oldPath);
      await this._put({ ...rec, path: newPath, parent: newParent, name: PathUtil.basename(newPath), modified: Date.now() });
      // Recurse into children, re-parenting paths
      for (const k of kids) {
        const childNew = PathUtil.join(newPath, k.name);
        await this.move(k.path, childNew);
      }
    } else {
      await this._del(oldPath);
      await this._put({ ...rec, path: newPath, parent: newParent, name: PathUtil.basename(newPath), modified: Date.now() });
    }
  }
}

// ============================================================================
// Disk backend (File System Access API)
// ============================================================================
class DiskBackend {
  constructor(rootHandle) {
    this.name = 'Disk';
    this.root = rootHandle;
    this._dirCache = new Map(); // path -> FileSystemDirectoryHandle
    this._dirCache.set('/', rootHandle);
  }

  static get supported() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  async init() { /* root handle supplied in constructor */ }

  async _dirHandle(path, create = false) {
    path = PathUtil.normalize(path);
    if (this._dirCache.has(path)) return this._dirCache.get(path);
    let handle = this.root;
    let cur = '';
    for (const seg of PathUtil.segments(path)) {
      cur = PathUtil.join(cur || '/', seg);
      handle = await handle.getDirectoryHandle(seg, { create });
      this._dirCache.set(cur, handle);
    }
    return handle;
  }

  async _fileHandle(path, create = false) {
    const parent = await this._dirHandle(PathUtil.parent(path), create);
    return parent.getFileHandle(PathUtil.basename(path), { create });
  }

  async exists(path) {
    // stat() resolves to null (it does NOT throw) when the entry is missing,
    // and throws only if an ancestor directory is absent — treat both as "no".
    const st = await this.stat(path).catch(() => null);
    return st !== null;
  }

  async stat(path) {
    path = PathUtil.normalize(path);
    if (path === '/') return { path: '/', name: '/', type: 'dir' };
    const parent = await this._dirHandle(PathUtil.parent(path));
    const name = PathUtil.basename(path);
    for await (const [n, h] of parent.entries()) {
      if (n === name) {
        const type = h.kind === 'directory' ? 'dir' : 'file';
        let modified = Date.now();
        if (type === 'file') { try { modified = (await h.getFile()).lastModified; } catch {} }
        return { path, name, type, modified };
      }
    }
    return null;
  }

  async list(path) {
    const dir = await this._dirHandle(path);
    const out = [];
    for await (const [name, h] of dir.entries()) {
      const childPath = PathUtil.join(path, name);
      const type = h.kind === 'directory' ? 'dir' : 'file';
      let modified = Date.now();
      if (type === 'file') { try { modified = (await h.getFile()).lastModified; } catch {} }
      out.push({ path: childPath, name, type, modified });
    }
    return out;
  }

  async mkdir(path) { await this._dirHandle(path, true); }

  async createFile(path, content = '') {
    const fh = await this._fileHandle(path, true);
    const w = await fh.createWritable();
    await w.write(content); await w.close();
  }

  async writeFile(path, content) { await this.createFile(path, content); }

  async readFile(path) {
    try {
      const fh = await this._fileHandle(path, false);
      return await (await fh.getFile()).text();
    } catch { return null; }
  }

  async readBinary(path) {
    try {
      const fh = await this._fileHandle(path, false);
      return await (await fh.getFile()).arrayBuffer();
    } catch { return null; }
  }

  async remove(path) {
    path = PathUtil.normalize(path);
    const parent = await this._dirHandle(PathUtil.parent(path));
    await parent.removeEntry(PathUtil.basename(path), { recursive: true });
    // Invalidate cache for this subtree
    for (const k of [...this._dirCache.keys()]) {
      if (k === path || k.startsWith(path + '/')) this._dirCache.delete(k);
    }
  }

  async move(oldPath, newPath) {
    oldPath = PathUtil.normalize(oldPath);
    newPath = PathUtil.normalize(newPath);
    const st = await this.stat(oldPath);
    if (!st) return;
    if (st.type === 'file') {
      const content = await this.readFile(oldPath);
      await this.createFile(newPath, content);
      await this.remove(oldPath);
    } else {
      await this.mkdir(newPath);
      for (const child of await this.list(oldPath)) {
        await this.move(child.path, PathUtil.join(newPath, child.name));
      }
      await this.remove(oldPath);
    }
  }

  // Persist/restore the directory handle so the folder reconnects next session.
  static async persistHandle(handle) {
    try {
      const db = await IDBHandleStore.open();
      await IDBHandleStore.set(db, 'rootDir', handle);
    } catch {}
  }
  static async restoreHandle() {
    try {
      const db = await IDBHandleStore.open();
      return await IDBHandleStore.get(db, 'rootDir');
    } catch { return null; }
  }
}

// Tiny IndexedDB store just for the directory handle (handles can be structured-cloned).
const IDBHandleStore = {
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('info-data-handles', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('h');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  set(db, key, val) {
    return new Promise((resolve, reject) => {
      const r = db.transaction('h', 'readwrite').objectStore('h').put(val, key);
      r.onsuccess = () => resolve(); r.onerror = () => reject(r.error);
    });
  },
  get(db, key) {
    return new Promise((resolve, reject) => {
      const r = db.transaction('h', 'readonly').objectStore('h').get(key);
      r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error);
    });
  },
};

// ============================================================================
// FS facade — picks/holds the active backend, builds an in-memory tree, and
// handles one-time migration from the old localStorage store.
// ============================================================================
class FS {
  constructor() { this.backend = null; }

  async useIndexedDB() {
    const b = new IDBBackend();
    await b.init();
    this.backend = b;
    await this._migrateLegacy();
    return b.name;
  }

  async useDisk(handle) {
    const b = new DiskBackend(handle);
    await b.init();
    this.backend = b;
    return b.name;
  }

  get backendName() { return this.backend ? this.backend.name : 'none'; }

  // Proxy the backend API ------------------------------------------------------
  exists(p)            { return this.backend.exists(p); }
  stat(p)              { return this.backend.stat(p); }
  list(p)              { return this.backend.list(p); }
  mkdir(p)             { return this.backend.mkdir(p); }
  createFile(p, c)     { return this.backend.createFile(p, c); }
  writeFile(p, c)      { return this.backend.writeFile(p, c); }
  readFile(p)          { return this.backend.readFile(p); }
  readBinary(p)        { return this.backend.readBinary(p); }
  remove(p)            { return this.backend.remove(p); }
  move(a, b)           { return this.backend.move(a, b); }

  // Recursively build a tree object for the sidebar.
  async tree(path = '/') {
    const st = await this.stat(path) || { path, name: PathUtil.basename(path) || '/', type: 'dir' };
    const node = { path, name: st.name, type: st.type, modified: st.modified };
    if (st.type === 'dir') {
      const kids = await this.list(path);
      kids.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      node.children = [];
      for (const k of kids) node.children.push(await this.tree(k.path));
    }
    return node;
  }

  // One-time import of the original localStorage prototype data.
  async _migrateLegacy() {
    const KEY = 'info-data-store';
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    let old;
    try { old = JSON.parse(raw); } catch { return; }
    if (!old || !old.root) { localStorage.removeItem(KEY); return; }

    const walk = async (id, basePath) => {
      const n = old[id];
      if (!n) return;
      for (const cid of (n.children || [])) {
        const child = old[cid];
        if (!child) continue;
        if (child.type === 'document') {
          let name = child.name || 'untitled';
          if (!/\.[a-z0-9]+$/i.test(name)) name += '.md';
          await this.createFile(PathUtil.join(basePath, name), child.content || '');
        } else {
          const dirPath = PathUtil.join(basePath, child.name || 'folder');
          await this.mkdir(dirPath);
          await walk(cid, dirPath);
        }
      }
    };
    await walk('root', '/');
    // Back up then clear so we don't re-import.
    localStorage.setItem('info-data-store.bak', raw);
    localStorage.removeItem(KEY);
  }
}

window.PathUtil   = PathUtil;
window.DiskBackend = DiskBackend;
window.fs = new FS();
