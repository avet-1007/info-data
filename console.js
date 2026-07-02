/* ============================================================================
 * console.js — A small shell over the FS abstraction.
 *
 *   new Shell({ fs, onRefresh, onOpen })
 *   shell.run(line) -> Promise<{ lines: string[], error?: boolean, cwd }>
 *
 * Commands: help pwd ls cd mkdir touch write cat rm mv cp tree find open echo clear
 * Paths may be absolute (/a/b) or relative to the shell's cwd.
 * ==========================================================================*/

class Shell {
  constructor({ fs, onRefresh, onOpen, onClear }) {
    this.fs = fs;
    this.onRefresh = onRefresh || (() => {});
    this.onOpen = onOpen || (() => {});
    this.onClear = onClear || (() => {});
    this.cwd = '/';
  }

  resolve(p) {
    if (!p) return this.cwd;
    return p.startsWith('/') ? PathUtil.normalize(p) : PathUtil.join(this.cwd, p);
  }

  // Split a line into tokens, honouring single/double quotes.
  tokenize(line) {
    const out = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(line)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
    return out;
  }

  async run(line) {
    line = line.trim();
    if (!line) return { lines: [], cwd: this.cwd };

    const tokens = this.tokenize(line);
    const cmd = tokens[0];
    const args = tokens.slice(1);
    const lines = [];
    const out = (...s) => lines.push(...s);
    let error = false;

    try {
      switch (cmd) {
        case 'help':
          out(
            'Commands:',
            '  pwd                 print working directory',
            '  ls [path]           list directory',
            '  cd <path>           change directory ( .. and / supported )',
            '  project <name>      create a top-level project folder',
            '  mkdir <path>        create folder (makes parents)',
            '  touch <file>        create empty file',
            '  write <file> <txt>  write text to a file (overwrites)',
            '  cat <file>          print file contents',
            '  open <file>         open a file in the editor',
            '  rm [-r] <path>      remove file or folder (-r for folders)',
            '  mv <src> <dst>      move / rename',
            '  cp <src> <dst>      copy a file',
            '  tree [path]         print the tree',
              '  find <term> [path]  search names under path',
            '  ai <prompt>          ask AI assistant',
            '  echo <text>         print text',
            '  clear               clear the console',
          );
          break;

        case 'pwd':
          out(this.cwd);
          break;

        case 'ls': {
          const dir = this.resolve(args[0]);
          const st = await this.fs.stat(dir);
          if (!st) { out(`ls: no such path: ${dir}`); error = true; break; }
          if (st.type === 'file') { out(PathUtil.basename(dir)); break; }
          const items = await this.fs.list(dir);
          items.sort((a, b) => (a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)));
          if (!items.length) { out('(empty)'); break; }
          for (const it of items) out(it.type === 'dir' ? it.name + '/' : it.name);
          break;
        }

        case 'cd': {
          const target = this.resolve(args[0] || '/');
          const st = await this.fs.stat(target);
          if (!st) { out(`cd: no such path: ${target}`); error = true; break; }
          if (st.type !== 'dir') { out(`cd: not a directory: ${target}`); error = true; break; }
          this.cwd = target;
          break;
        }

        case 'project': {
          if (!args[0]) { out('project: missing name'); error = true; break; }
          if (args[0].includes('/')) { out('project: name cannot contain "/"'); error = true; break; }
          const p = '/' + args[0];
          if (await this.fs.exists(p)) { out(`project: already exists: ${args[0]}`); error = true; break; }
          await this.fs.mkdir(p);
          this.onRefresh();
          out(`created project /${args[0]}`);
          break;
        }

        case 'mkdir': {
          if (!args[0]) { out('mkdir: missing path'); error = true; break; }
          const p = this.resolve(args[0]);
          await this.fs.mkdir(p);
          this.onRefresh();
          break;
        }

        case 'touch': {
          if (!args[0]) { out('touch: missing file'); error = true; break; }
          const p = this.resolve(args[0]);
          if (!(await this.fs.exists(p))) await this.fs.createFile(p, '');
          this.onRefresh();
          break;
        }

        case 'write': {
          if (args.length < 1) { out('write: usage: write <file> <text>'); error = true; break; }
          const p = this.resolve(args[0]);
          const text = args.slice(1).join(' ');
          await this.fs.writeFile(p, text);
          this.onRefresh();
          break;
        }

        case 'cat': {
          if (!args[0]) { out('cat: missing file'); error = true; break; }
          const p = this.resolve(args[0]);
          const c = await this.fs.readFile(p);
          if (c === null) { out(`cat: not a file: ${p}`); error = true; break; }
          out(...(c.length ? c.split('\n') : ['(empty file)']));
          break;
        }

        case 'open': {
          if (!args[0]) { out('open: missing file'); error = true; break; }
          const p = this.resolve(args[0]);
          const st = await this.fs.stat(p);
          if (!st || st.type !== 'file') { out(`open: not a file: ${p}`); error = true; break; }
          this.onOpen(p);
          out(`opened ${p}`);
          break;
        }

        case 'rm': {
          const recursive = args.includes('-r') || args.includes('-rf');
          const target = args.find(a => !a.startsWith('-'));
          if (!target) { out('rm: missing path'); error = true; break; }
          const p = this.resolve(target);
          const st = await this.fs.stat(p);
          if (!st) { out(`rm: no such path: ${p}`); error = true; break; }
          if (st.type === 'dir') {
            const kids = await this.fs.list(p);
            if (kids.length && !recursive) { out(`rm: ${p} is a non-empty directory (use -r)`); error = true; break; }
          }
          await this.fs.remove(p);
          this.onRefresh();
          break;
        }

        case 'mv': {
          if (args.length < 2) { out('mv: usage: mv <src> <dst>'); error = true; break; }
          let src = this.resolve(args[0]);
          let dst = this.resolve(args[1]);
          // If dst is an existing directory, move into it.
          const dstStat = await this.fs.stat(dst);
          if (dstStat && dstStat.type === 'dir') dst = PathUtil.join(dst, PathUtil.basename(src));
          if (!(await this.fs.exists(src))) { out(`mv: no such path: ${src}`); error = true; break; }
          await this.fs.move(src, dst);
          this.onRefresh();
          break;
        }

        case 'cp': {
          if (args.length < 2) { out('cp: usage: cp <src> <dst>'); error = true; break; }
          const src = this.resolve(args[0]);
          let dst = this.resolve(args[1]);
          const srcStat = await this.fs.stat(src);
          if (!srcStat) { out(`cp: no such path: ${src}`); error = true; break; }
          if (srcStat.type !== 'file') { out('cp: only files can be copied'); error = true; break; }
          const dstStat = await this.fs.stat(dst);
          if (dstStat && dstStat.type === 'dir') dst = PathUtil.join(dst, PathUtil.basename(src));
          await this.fs.createFile(dst, (await this.fs.readFile(src)) || '');
          this.onRefresh();
          break;
        }

        case 'tree': {
          const rootPath = this.resolve(args[0]);
          const st = await this.fs.stat(rootPath);
          if (!st) { out(`tree: no such path: ${rootPath}`); error = true; break; }
          out(rootPath === '/' ? '/' : PathUtil.basename(rootPath));
          const walk = async (p, prefix) => {
            const items = await this.fs.list(p);
            items.sort((a, b) => (a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)));
            for (let k = 0; k < items.length; k++) {
              const last = k === items.length - 1;
              const it = items[k];
              out(prefix + (last ? '└─ ' : '├─ ') + it.name + (it.type === 'dir' ? '/' : ''));
              if (it.type === 'dir') await walk(it.path, prefix + (last ? '   ' : '│  '));
            }
          };
          if (st.type === 'dir') await walk(rootPath, '');
          break;
        }

        case 'find': {
          if (!args[0]) { out('find: usage: find <term> [path]'); error = true; break; }
          const term = args[0].toLowerCase();
          const base = this.resolve(args[1]);
          const hits = [];
          const walk = async p => {
            for (const it of await this.fs.list(p)) {
              if (it.name.toLowerCase().includes(term)) hits.push(it.path + (it.type === 'dir' ? '/' : ''));
              if (it.type === 'dir') await walk(it.path);
            }
          };
          await walk(base);
          out(...(hits.length ? hits : ['(no matches)']));
          break;
        }

        case 'ai': {
          const aiCmd = window.AI && AI.makeShellCommand && AI.makeShellCommand(this);
          if (aiCmd) {
            const r = await aiCmd(args);
            if (r.error) error = true;
            for (const l of r.lines) out(l);
          } else {
            out('AI not available');
            error = true;
          }
          break;
        }

        case 'echo':
          out(args.join(' '));
          break;

        case 'clear':
          this.onClear();
          return { lines: [], cwd: this.cwd, cleared: true };

        default:
          out(`unknown command: ${cmd}  (try 'help')`);
          error = true;
      }
    } catch (e) {
      out(`error: ${e && e.message ? e.message : e}`);
      error = true;
    }

    return { lines, error, cwd: this.cwd };
  }
}

window.Shell = Shell;
