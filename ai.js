/* ============================================================================
 * ai.js — AI automation panel with FULL tool access.
 *
 *   AI.open() / close() / toggle()
 *   AI.ask(text)     send a prompt, stream response, execute tools
 *
 * Available tools (used inline in AI responses):
 *   [tool:read <path>]         — read file
 *   [tool:write <path>]        — write file (content follows until [/tool])
 *   [tool:ls <path>]           — list directory
 *   [tool:mkdir <path>]        — create directory
 *   [tool:touch <path>]        — create empty file
 *   [tool:open <path>]         — open file in editor
 *   [tool:tree [path]]         — show file tree
 *   [tool:exec <command>]      — run console command
 *   [tool:echo <text>]         — show text in output
 *   [tool:ask <question>]      — ask user (shows prompt, waits for answer)
 *   [tool:edit <path>]         — replace current file content (content follows)
 *   [tool:remove <path>]       — delete file or empty dir
 * ==========================================================================*/

const AI = (() => {
  const API = 'https://web-api-proxy.inceptionlabs.ai/v1/playground';
  const MODEL = 'mercury-2';

  let panel, output, input, sendBtn, sysInput, statusEl;
  let abortController = null;
  let isStreaming = false;
  let conversation = [];

  // Match [tool:cmd args] or [tool:cmd args]content[/tool]
  // Only match valid paths: alphanumeric, dots, dashes, underscores, slashes, spaces
  const TOOL_PATTERN = /\[tool:(\w+)\s+([\w.\/\-_\s]+?)\]([\s\S]*?)\[\/tool\]|\[tool:(\w+)\s+([\w.\/\-_\s]+?)\]/g;

  // ── Path resolver (try /Home/ fallback) ──────────────────────────────────
  async function resolvePath(path, fs) {
    if (!fs) fs = window.fs;
    if (!fs) return null;
    let found = false;
    try { found = await fs.exists(path).catch(() => false); } catch {}
    if (found) return path;
    // Try prepending /Home/ if the path doesn't already start with it
    if (!path.startsWith('/Home/')) {
      const alt = '/Home/' + path.replace(/^\//, '');
      try { if (await fs.exists(alt).catch(() => false)) return alt; } catch {}
    }
    // Try without all-data/ prefix
    const stripped = path.replace(/^\/?all-data\//, '/');
    if (stripped !== path) {
      try { if (await fs.exists(stripped).catch(() => false)) return stripped; } catch {}
      if (!stripped.startsWith('/Home/')) {
        const alt2 = '/Home/' + stripped.replace(/^\//, '');
        try { if (await fs.exists(alt2).catch(() => false)) return alt2; } catch {}
      }
    }
    return null;
  }

  // ── Tool implementations ─────────────────────────────────────────────────
  const tools = {
    async read(path) {
      path = path.trim();
      const fs = window.fs;
      if (!fs) return 'Error: file system not available';
      const target = await resolvePath(path);
      if (!target) return `Error: "${path}" does not exist`;
      const content = await fs.readFile(target);
      return content ?? '(empty file)';
    },

    async write(path, content) {
      path = path.trim();
      content = content.trim();
      const fs = window.fs;
      if (!fs) return 'Error: file system not available';
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '/';
      if (parent) {
        try { const pe = await fs.exists(parent).catch(() => false); if (!pe) await fs.mkdir(parent); } catch {}
      }
      try {
        const pe = await fs.exists(path).catch(() => false);
        if (pe) {
          await fs.writeFile(path, content);
        } else {
          await fs.createFile(path, content);
        }
      } catch (e) {
        return `Error writing ${path}: ${e.message}`;
      }
      const api = window.appAPI;
      if (api) api.refreshTree();
      return `Written ${content.length} bytes to ${path}`;
    },

    async edit(path, content) {
      const fs = window.fs;
      if (!fs) return 'Error: file system not available';
      const target = await resolvePath(path, fs) || path;
      const found = target !== path ? true : await fs.exists(target).catch(() => false);
      try {
        if (found) {
          await fs.writeFile(target, content);
        } else {
          await fs.createFile(target, content);
        }
        if (window.appAPI) window.appAPI.refreshTree();
        return `Edited ${target} (${content.length} chars)`;
      } catch (e) {
        return `Error editing ${target}: ${e.message}`;
      }
    },

    async ls(path) {
      path = path.trim() || '/';
      const fs = window.fs;
      if (!fs) return 'Error: file system not available';
      try {
        const exists = await fs.exists(path).catch(() => false);
        if (!exists) return `Error: "${path}" does not exist`;
        const items = await fs.list(path);
        if (!items || !items.length) return '(empty)';
        items.sort((a, b) => (a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)));
        return items.map(i => (i.type === 'dir' ? '[dir] ' : i.type === 'project' ? '[proj] ' : '[file] ') + i.name).join('\n');
      } catch (e) {
        return `Error listing ${path}: ${e.message}`;
      }
    },

    async mkdir(path) {
      path = path.trim();
      const fs = window.fs;
      if (!fs) return 'Error: file system not available';
      try { await fs.mkdir(path); } catch (e) { return `Error: ${e.message}`; }
      if (window.appAPI) window.appAPI.refreshTree();
      return `Created directory ${path}`;
    },

    async touch(path) {
      path = path.trim();
      const fs = window.fs;
      if (!fs) return 'Error: file system not available';
      const target = await resolvePath(path, fs) || path;
      try {
        if (!(await fs.exists(target))) await fs.createFile(target, '');
        else return `File already exists: ${target}`;
      } catch (e) { return `Error: ${e.message}`; }
      if (window.appAPI) window.appAPI.refreshTree();
      return `Created file ${target}`;
    },

    async open(path) {
      path = path.trim();
      const fs = window.fs;
      const api = window.appAPI;
      if (!api || !api.openFile) return 'Error: cannot open file';
      const target = await resolvePath(path, fs);
      if (!target) return `Error: "${path}" does not exist`;
      try { await api.openFile(target); return `Opened ${target} in editor`; }
      catch (e) { return `Error opening ${target}: ${e.message}`; }
    },

    async remove(path) {
      path = path.trim();
      const fs = window.fs;
      if (!fs) return 'Error: file system not available';
      const target = await resolvePath(path, fs);
      if (!target) return `Error: "${path}" does not exist`;
      try { await fs.remove(target); } catch (e) { return `Error: ${e.message}`; }
      if (window.appAPI) window.appAPI.refreshTree();
      return `Removed ${target}`;
    },

    async tree(path) {
      path = path.trim() || '/';
      const fs = window.fs;
      if (!fs) return 'Error: file system not available';
      const walk = async (p, prefix) => {
        const items = await fs.list(p);
        if (!items) return '';
        items.sort((a, b) => (a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)));
        let out = '';
        for (let k = 0; k < items.length; k++) {
          const last = k === items.length - 1;
          const it = items[k];
          out += prefix + (last ? '└─ ' : '├─ ') + it.name + (it.type === 'dir' ? '/' : '') + '\n';
          if (it.type === 'dir') out += await walk(it.path, prefix + (last ? '   ' : '│  '));
        }
        return out;
      };
      const rootName = path === '/' ? '/' : path.split('/').pop();
      let result = rootName + '\n';
      result += await walk(path, '');
      return result || '(empty)';
    },

    async exec(cmd) {
      cmd = cmd.trim();
      const shell = window.appShell;
      if (!shell) return 'Error: console shell not available';
      try {
        const res = await shell.run(cmd);
        return res.lines.join('\n') || '(no output)';
      } catch (e) {
        return 'Error: ' + (e.message || e);
      }
    },

    echo(text) {
      return text;
    },

    ask(question) {
      return new Promise(resolve => {
        const answer = prompt('AI спрашивает: ' + question.trim());
        resolve(answer ?? '(user cancelled)');
      });
    },
  };

  // ── System prompt builder ────────────────────────────────────────────────
  async function buildSystemPrompt() {
    let ctx = 'You are an AI assistant integrated into info-data -- a browser-based file editor. ';
    ctx += 'You have FULL ACCESS to the file system and all app tools.\n\n';
    ctx += '## Current context\n';
    const api = window.appAPI;
    const openFile = api ? api.getOpenFile() : null;
    ctx += `- Open file: ${openFile || '(none)'}\n`;
    if (openFile) {
      const lang = api ? api.getEditorLang() : 'text';
      ctx += `- Language: ${lang}\n`;
      const content = api ? api.getEditorContent() : '';
      ctx += `- Content (${content.length} chars):\n\`\`\`\n${content.slice(0, 2000)}${content.length > 2000 ? '\n...(truncated)' : ''}\n\`\`\`\n`;
    }
    try {
      const fs = window.fs;
      if (fs) {
        const items = await fs.list('/');
        const names = items.map(i => i.name).join('\n');
        ctx += `- Root files:\n\`\`\`\n${names.slice(0, 500)}\n\`\`\`\n`;
      }
    } catch { ctx += '- Root files: (unavailable)\n'; }

    ctx += '\n## Available tools\n';
    ctx += 'You can invoke tools inline in your response using these formats:\n\n';
    ctx += '- `[tool:read <path>]` -- read a file. Path must contain only letters, numbers, dots, dashes, underscores, and slashes.\n';
    ctx += '- `[tool:write <path>]\ncontent\n[/tool]` -- create or overwrite a file. Path same rules.\n';
    ctx += '- `[tool:edit <path>]\nnew content\n[/tool]` -- edit existing file content. Path same rules.\n';
    ctx += '- `[tool:ls <path>]` -- list directory contents.\n';
    ctx += '- `[tool:mkdir <path>]` -- create a directory.\n';
    ctx += '- `[tool:touch <path>]` -- create an empty file.\n';
    ctx += '- `[tool:open <path>]` -- open a file in the editor.\n';
    ctx += '- `[tool:remove <path>]` -- delete a file or empty directory.\n';
    ctx += '- `[tool:tree [path]]` -- show the file tree.\n';
    ctx += '- `[tool:exec <command>]` -- run a console command (ls, cat, mkdir, etc.).\n';
    ctx += '- `[tool:echo <text>]` -- display text in the output.\n';
    ctx += '- `[tool:ask <question>]` -- ask the user a question and wait for answer.\n\n';
    ctx += 'CRITICAL: Only issue ONE tool call per response. NEVER put content inside [tool:edit] or [tool:write] -- just the path. The path must be an EXACT existing file path like /Home/guide - md/note.md. Do NOT add extra ] brackets inside tool calls.';
    ctx += 'Do NOT generate tool calls with garbled or fake paths. If the path contains characters like #, *, %, ^, !, then it is WRONG -- do not use it.\n';
    ctx += 'When you use a tool, I will execute it and show the result right after your response.\n';
    ctx += 'Always prefer using tools over just describing what the user should do.\n';
    ctx += 'Be proactive -- if the user asks to do something, do it immediately.\n';
    ctx += 'Paths are POSIX-style absolute: /, /Project, /Project/note.md\n';
    ctx += 'The root / corresponds to the app root.';

    return ctx;
  }

  // ── Tool executor ────────────────────────────────────────────────────────
  async function executeTools(text) {
    let match;
    TOOL_PATTERN.lastIndex = 0;
    const results = [];

    while ((match = TOOL_PATTERN.exec(text)) !== null) {
      const cmd = (match[1] || match[4] || '').trim();
      const args = (match[2] || match[5] || '').trim();
      const body = (match[3] || '').trim();
      if (!cmd) continue;
      const toolFn = tools[cmd];
      if (!toolFn) {
        results.push({ cmd, args, result: `Unknown tool: ${cmd}` });
        continue;
      }
      try {
        let result;
        if (body && (cmd === 'write' || cmd === 'edit')) {
          result = await toolFn(args, body);
        } else if (body) {
          result = await toolFn(body);
        } else {
          result = await toolFn(args);
        }
        results.push({ cmd, args, result });
      } catch (e) {
        results.push({ cmd, args, result: 'Error: ' + (e.message || e) });
      }
    }
    return results;
  }

  // ── UI ───────────────────────────────────────────────────────────────────
  function init() {
    panel = document.getElementById('ai-panel');
    output = document.getElementById('ai-output');
    input = document.getElementById('ai-input');
    sendBtn = document.getElementById('ai-send');
    sysInput = document.getElementById('ai-sys');
    statusEl = document.getElementById('ai-status');
    if (!panel) return;

    const resizer = document.getElementById('ai-resizer');
    if (resizer) {
      if (panel.classList.contains('open')) resizer.classList.add('visible');
      else resizer.classList.remove('visible');
    }
    sendBtn.addEventListener('click', () => send());
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });
  }

  function open() {
    panel.classList.add('open');
    const resizer = document.getElementById('ai-resizer');
    if (resizer) resizer.classList.add('visible');
    let w = +localStorage.getItem('info-data-ai-w') || 380;
    panel.style.width = Math.min(w, window.innerWidth - 400) + 'px';
    input.focus();
  }

  function close() {
    if (isStreaming) abort();
    panel.classList.remove('open');
    panel.style.width = '';
    const resizer = document.getElementById('ai-resizer');
    if (resizer) resizer.classList.remove('visible');
  }

  function toggle() {
    panel.classList.contains('open') ? close() : open();
  }

  function abort() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    isStreaming = false;
    setStatus('');
    sendBtn.disabled = false;
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function addMessage(msg, role) {
    const div = document.createElement('div');
    div.className = 'ai-msg ' + role;
    const pre = document.createElement('pre');
    pre.textContent = msg;
    div.appendChild(pre);
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
    return pre;
  }

  function addToolResult(cmd, result, isError) {
    const div = document.createElement('div');
    div.className = 'ai-line' + (isError ? ' ai-err' : '');
    div.textContent = `[${cmd}]\n${result}`;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  async function send() {
    const text = input.value.trim();
    if (!text || isStreaming) return;

    input.value = '';
    sendBtn.disabled = true;
    isStreaming = true;

    const system = sysInput.value.trim() || '';
    const systemPrompt = system || await buildSystemPrompt();
    conversation.push({ role: 'user', content: text });
    addMessage(text, 'user');
    setStatus('AI работает…');

    const msgEl = addMessage('', 'assistant');
    let buffer = '';

    abortController = new AbortController();

    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            ...conversation,
          ],
          max_tokens: 16000,
          stream: true,
          diffusing: true,
          reasoning_effort: 'instant',
        }),
        signal: abortController.signal,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let partial = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        partial += decoder.decode(value, { stream: true });
        const lines = partial.split('\n');
        partial = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json || json === '[DONE]') continue;
          try {
            const chunk = JSON.parse(json);
            const content = chunk.choices?.[0]?.delta?.content || '';
            if (content) {
              buffer += content;
              msgEl.textContent = buffer;
              output.scrollTop = output.scrollHeight;
            }
          } catch { /* skip */ }
        }
      }

      conversation.push({ role: 'assistant', content: buffer });
      setStatus('');

      // Execute any tools found in the response
      const toolResults = await executeTools(buffer);
      if (toolResults.length) {
        let toolCtx = '';
        for (const tr of toolResults) {
          addToolResult(`${tr.cmd} ${tr.args}`, tr.result, tr.result.startsWith('Error'));
          toolCtx += `\n[${tr.cmd} ${tr.args}]\n${tr.result}\n`;
        }
        conversation.push({ role: 'system', content: `Tool results:${toolCtx}` });
      }

    } catch (e) {
      if (e.name === 'AbortError') {
        setStatus('Прервано');
      } else {
        setStatus('Ошибка');
        const errDiv = document.createElement('div');
        errDiv.className = 'ai-line ai-err';
        errDiv.textContent = 'Error: ' + (e.message || e);
        output.appendChild(errDiv);
      }
    }

    isStreaming = false;
    sendBtn.disabled = false;
    abortController = null;
  }

  // ── Console command integration ──
  function makeShellCommand(shell) {
    return async (args) => {
      if (!args.length) return { lines: ['Usage: ai <prompt>'], cwd: shell.cwd };
      const prompt = args.join(' ');
      const lines = [];
      const system = await buildSystemPrompt();
      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
            max_tokens: 4000,
            stream: false,
          diffusing: false,
          reasoning_effort: 'high',
          }),
        });
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || '(no response)';
        const toolResults = await executeTools(text);
        lines.push(text);
        for (const tr of toolResults) {
          lines.push(`\n[${tr.cmd} ${tr.args}]`);
          lines.push(tr.result);
        }
      } catch (e) {
        lines.push('AI error: ' + (e.message || e));
      }
      return { lines, cwd: shell.cwd };
    };
  }

  return {
    init, open, close, toggle, abort,
    makeShellCommand,
  };
})();

window.AI = AI;
