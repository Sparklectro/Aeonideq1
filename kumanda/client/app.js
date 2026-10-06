'use strict';

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('kumanda.' + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('kumanda.' + k, JSON.stringify(v));
    } catch {}
  },
};

const DEFAULT_SNIPPETS = [
  'claude=claude',
  'claude -c=claude --continue',
  'git status=git status',
  'git pull=git pull',
  'ls=ls',
  'temizle=clear',
].join('\n');

const state = {
  token: store.get('token', ''),
  info: null,
  sessions: new Map(), // id -> { info, term, fit, el, ws, retry, exited }
  active: null,
  fontSize: store.get('fontSize', 13),
  mods: { ctrl: false, alt: false },
  cwd: store.get('cwd', ''),
};

/* ---------- yardımcılar ---------- */

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

let toastTimer;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (bad ? ' bad' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), bad ? 5000 : 2500);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { Authorization: 'Bearer ' + state.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    showLogin('Anahtar geçersiz ya da çok fazla hatalı deneme yapıldı.');
    throw new Error('Yetkisiz');
  }
  if (!res.ok) {
    const e = new Error(data.error || res.statusText);
    e.status = res.status;
    throw e;
  }
  return data;
}

const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
const joinPath = (a, b) => (a.endsWith(state.info.sep) ? a + b : a + state.info.sep + b);
const baseName = (p) => p.split(/[\\/]/).filter(Boolean).pop() || p;

function actionSheet(title, options) {
  return new Promise((resolve) => {
    const close = (v) => {
      wrap.remove();
      resolve(v);
    };
    const wrap = el(
      'div',
      { class: 'sheet', style: 'background:rgba(0,0,0,.55);justify-content:flex-end', onclick: (e) => e.target === wrap && close(null) },
      el(
        'div',
        { class: 'settings-body', style: 'background:var(--panel);border-radius:16px 16px 0 0;padding-bottom:calc(16px + var(--safe-b))' },
        el('div', { class: 'muted', style: 'font-family:var(--mono);font-size:13px;overflow-wrap:anywhere' }, title),
        options.map(([label, value, cls]) => el('button', { class: 'btn ' + (cls || ''), onclick: () => close(value) }, label)),
        el('button', { class: 'btn', onclick: () => close(null) }, 'Vazgeç')
      )
    );
    document.body.append(wrap);
  });
}

/* ---------- giriş ---------- */

function showLogin(msg = '') {
  $('#login').hidden = false;
  $('#app').hidden = true;
  $('#login-error').textContent = msg;
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  state.token = $('#login-token').value.trim();
  try {
    await start();
    store.set('token', state.token);
    showView('term');
  } catch (err) {
    if (err.message !== 'Yetkisiz') $('#login-error').textContent = 'Bağlanılamadı: ' + err.message;
  }
});

$('#logout').addEventListener('click', () => {
  store.set('token', '');
  location.reload();
});

async function start() {
  state.info = await api('/api/info');
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#host-name').textContent = `${state.info.user}@${state.info.hostname}`;
  if (!state.cwd) state.cwd = state.info.workspace;
  renderKeybar();
  layout();
  await syncSessions();
}

/* ---------- terminal ---------- */

function makeTerm() {
  const term = new Terminal({
    fontFamily: "ui-monospace, 'Cascadia Mono', 'JetBrains Mono', Menlo, Consolas, monospace",
    fontSize: state.fontSize,
    cursorBlink: true,
    scrollback: 5000,
    allowProposedApi: true,
    theme: { background: '#0b0d10', foreground: '#e6e8ec', cursor: '#d97757', selectionBackground: '#d9775766' },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon.WebLinksAddon((_, uri) => window.open(uri, '_blank')));
  return { term, fit };
}

async function syncSessions() {
  const list = await api('/api/sessions');
  for (const info of list) if (!state.sessions.has(info.id)) addSession(info);
  for (const id of [...state.sessions.keys()]) if (!list.find((s) => s.id === id)) dropSession(id);
  if (!state.active && state.sessions.size) activate(state.sessions.keys().next().value);
  renderTabs();
}

function addSession(info) {
  const { term, fit } = makeTerm();
  const host = el('div', { style: 'position:absolute;inset:0', hidden: true });
  $('#terminal').append(host);
  term.open(host);
  const s = { info, term, fit, el: host, ws: null, retry: 0, exited: false };
  state.sessions.set(info.id, s);
  term.onData((d) => sendInput(d, s));
  term.onResize(({ cols, rows }) => wsSend(s, { t: 'resize', cols, rows }));
  connect(s);
  return s;
}

function dropSession(id) {
  const s = state.sessions.get(id);
  if (!s) return;
  s.closing = true;
  s.ws?.close();
  s.term.dispose();
  s.el.remove();
  state.sessions.delete(id);
  if (state.active === id) {
    state.active = null;
    const next = state.sessions.keys().next().value;
    if (next) activate(next);
  }
  renderTabs();
}

function connect(s) {
  if (s.closing || s.exited) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws?id=${s.info.id}&token=${encodeURIComponent(state.token)}`);
  s.ws = ws;
  ws.onopen = () => {
    s.retry = 0;
    updateDot();
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'hello') {
      s.term.reset();
      if (m.replay) s.term.write(m.replay);
      fitActive();
      wsSend(s, { t: 'resize', cols: s.term.cols, rows: s.term.rows });
    } else if (m.t === 'o') s.term.write(m.d);
    else if (m.t === 'exit') {
      s.exited = true;
      s.term.write(`\r\n\x1b[2m[oturum kapandı, çıkış kodu ${m.code}]\x1b[0m\r\n`);
      renderTabs();
    } else if (m.t === 'error') {
      s.exited = true;
      s.term.write(`\r\n\x1b[31m${m.d}\x1b[0m\r\n`);
      renderTabs();
    }
  };
  ws.onclose = () => {
    updateDot();
    if (s.closing || s.exited) return;
    // Telefon uykuya geçince bağlantı kopar; geri gelince otomatik bağlan.
    const delay = Math.min(10000, 500 * 2 ** s.retry++);
    setTimeout(() => document.visibilityState === 'visible' && connect(s), delay);
  };
}

function wsSend(s, msg) {
  if (s?.ws?.readyState === WebSocket.OPEN) s.ws.send(JSON.stringify(msg));
}

function updateDot() {
  const s = state.sessions.get(state.active);
  const on = s ? s.ws?.readyState === WebSocket.OPEN : true;
  $('#conn-dot').className = 'dot ' + (on ? 'on' : 'off');
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || $('#app').hidden) return;
  for (const s of state.sessions.values()) {
    if (!s.ws || s.ws.readyState === WebSocket.CLOSED) {
      s.retry = 0;
      connect(s);
    }
  }
  syncSessions().catch(() => {});
});

function activate(id) {
  state.active = id;
  for (const [sid, s] of state.sessions) s.el.hidden = sid !== id;
  $('#term-empty').hidden = !!id;
  renderTabs();
  updateDot();
  requestAnimationFrame(() => {
    fitActive();
    state.sessions.get(id)?.term.focus();
  });
}

function fitActive() {
  const s = state.sessions.get(state.active);
  if (!s || s.el.hidden || !s.el.offsetWidth) return;
  try {
    s.fit.fit();
  } catch {}
}

function renderTabs() {
  const tabs = $('#session-tabs');
  tabs.replaceChildren(
    ...[...state.sessions.values()].map((s) =>
      el(
        'div',
        { class: 'chip' + (s.info.id === state.active ? ' active' : '') + (s.exited ? ' dead' : ''), onclick: () => activate(s.info.id) },
        el('span', { class: 'label' }, s.info.name),
        el('button', { class: 'x', title: 'Kapat', onclick: (e) => (e.stopPropagation(), closeSession(s.info.id)) }, '✕')
      )
    )
  );
  $('#term-empty').hidden = state.sessions.size > 0;
}

async function newSession(opts = {}) {
  const s = state.sessions.get(state.active);
  const cols = s?.term.cols || 80;
  const rows = s?.term.rows || 24;
  const info = await api('/api/sessions', { method: 'POST', body: { cols, rows, ...opts } });
  addSession(info);
  showView('term');
  activate(info.id);
}

async function closeSession(id) {
  const s = state.sessions.get(id);
  if (s && !s.exited && !confirm(`"${s.info.name}" kapatılsın mı? İçinde çalışan her şey sonlanır.`)) return;
  await api('/api/sessions?id=' + id, { method: 'DELETE' }).catch(() => {});
  dropSession(id);
}

$('#new-session').addEventListener('click', () => newSession().catch((e) => toast(e.message, true)));

/* Ekstra tuşlar ve Ctrl/Alt kilitleri: telefon klavyesinde olmayan tuşlar. */

const KEYS = [
  ['Esc', '\x1b'],
  ['Tab', '\t'],
  ['Ctrl', 'ctrl'],
  ['Alt', 'alt'],
  ['↑', '\x1b[A'],
  ['↓', '\x1b[B'],
  ['←', '\x1b[D'],
  ['→', '\x1b[C'],
  ['^C', '\x03'],
  ['^D', '\x04'],
  ['^Z', '\x1a'],
  ['^R', '\x12'],
  ['^L', '\x0c'],
  ['Home', '\x1b[H'],
  ['End', '\x1b[F'],
  ['PgUp', '\x1b[5~'],
  ['PgDn', '\x1b[6~'],
  ...'|/\\-_~$&*:;"\'`<>{}[]()'.split('').map((c) => [c, c]),
  ['Metin', 'text'],
  ['Yapıştır', 'paste'],
];

function snippets() {
  return store
    .get('snippets', DEFAULT_SNIPPETS)
    .split('\n')
    .map((l) => l.split('='))
    .filter((p) => p.length >= 2 && p[0].trim())
    .map(([label, ...cmd]) => [label.trim(), cmd.join('=')]);
}

function renderKeybar() {
  const bar = $('#keybar');
  const btn = (label, onPress, cls = '') =>
    el('button', {
      class: cls,
      // pointerdown + preventDefault: tuşa basınca terminal odağı (ve klavye) kaybolmasın.
      onpointerdown: (e) => {
        e.preventDefault();
        onPress(e.currentTarget);
      },
    }, label);

  // Üst satır: tuşlar (her zaman görünür), alt satır: hızlı komutlar.
  bar.replaceChildren(
    el('div', { class: 'keyrow' }, ...KEYS.map(([label, val]) =>
      btn(label, (b) => {
        if (val === 'ctrl' || val === 'alt') {
          state.mods[val] = !state.mods[val];
          b.classList.toggle('on', state.mods[val]);
        } else if (val === 'paste') paste();
        else if (val === 'text') showBufferText();
        else sendInput(val, state.sessions.get(state.active), true);
      })
    )),
    el('div', { class: 'keyrow' }, ...snippets().map(([label, cmd]) => btn(label, () => runInActive(cmd), 'snip')))
  );
}

function sendInput(data, s, fromBar = false) {
  if (!s) return;
  const { ctrl, alt } = state.mods;
  if (ctrl || alt) {
    if (ctrl && data.length === 1) {
      const c = data.toUpperCase().charCodeAt(0);
      if (c >= 64 && c <= 95) data = String.fromCharCode(c - 64);
      else if (data === ' ') data = '\x00';
    } else if (ctrl && /^\x1b\[[ABCD]$/.test(data)) {
      data = '\x1b[1;5' + data.slice(-1);
    }
    if (alt) data = '\x1b' + data;
    state.mods.ctrl = state.mods.alt = false;
    document.querySelectorAll('#keybar button.on').forEach((b) => b.classList.remove('on'));
  }
  wsSend(s, { t: 'i', d: data });
  if (fromBar) s.term.focus();
}

function runInActive(cmd) {
  const s = state.sessions.get(state.active);
  if (!s || s.exited) return newSession({ cmd }).catch((e) => toast(e.message, true));
  wsSend(s, { t: 'i', d: cmd + '\r' });
  s.term.focus();
}

async function paste() {
  const s = state.sessions.get(state.active);
  if (!s) return;
  let text = null;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    // Pano API'si yalnızca HTTPS'te çalışır; yerel ağda elle yapıştırma kutusu aç.
    text = prompt('Yapıştırılacak metin:');
  }
  if (text) wsSend(s, { t: 'i', d: text });
}

// Mobilde xterm içinde metin seçmek zor; görünen çıktıyı seçilebilir düz metin olarak aç.
function showBufferText() {
  const s = state.sessions.get(state.active);
  if (!s) return;
  const buf = s.term.buffer.active;
  const lines = [];
  for (let i = Math.max(0, buf.length - 1000); i < buf.length; i++) lines.push(buf.getLine(i)?.translateToString(true) ?? '');
  openEditor({ path: s.info.name + ' — çıktı (salt okunur)', content: lines.join('\n').trimEnd(), readonly: true });
}

/* Satır modu: otomatik düzeltme/IME sorunları için komutu düz bir kutuda yaz. */
const cmdHistory = store.get('history', []);
let histIdx = -1;
function applyLineMode() {
  $('#line-input').hidden = !store.get('lineMode', false);
  layout();
}
$('#line-text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendLine();
  } else if (e.key === 'ArrowUp' && cmdHistory.length) {
    histIdx = Math.min(cmdHistory.length - 1, histIdx + 1);
    e.target.value = cmdHistory[histIdx];
  } else if (e.key === 'ArrowDown') {
    histIdx = Math.max(-1, histIdx - 1);
    e.target.value = histIdx < 0 ? '' : cmdHistory[histIdx];
  }
});
$('#line-send').addEventListener('click', sendLine);
function sendLine() {
  const input = $('#line-text');
  const cmd = input.value;
  runInActive(cmd);
  if (cmd.trim() && cmdHistory[0] !== cmd) cmdHistory.unshift(cmd);
  cmdHistory.length = Math.min(cmdHistory.length, 100);
  store.set('history', cmdHistory);
  histIdx = -1;
  input.value = '';
  input.focus();
}

/* Yazı boyutu */
function setFont(delta) {
  state.fontSize = Math.max(8, Math.min(28, state.fontSize + delta));
  store.set('fontSize', state.fontSize);
  for (const s of state.sessions.values()) s.term.options.fontSize = state.fontSize;
  fitActive();
}
$('#font-up').addEventListener('click', () => setFont(1));
$('#font-down').addEventListener('click', () => setFont(-1));

/* Klavye açılınca görünür alana sığ. */
function layout() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-h', h + 'px');
  document.body.classList.toggle('kb-open', vv ? vv.height < window.innerHeight * 0.8 : false);
  requestAnimationFrame(fitActive);
}
window.visualViewport?.addEventListener('resize', layout);
window.addEventListener('resize', layout);

/* ---------- sekmeler ---------- */

function showView(name) {
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== 'view-' + name;
  for (const b of document.querySelectorAll('.tabbar button')) b.classList.toggle('active', b.dataset.view === name);
  if (name === 'term') requestAnimationFrame(fitActive);
  if (name === 'projects') loadProjects();
  if (name === 'files') loadDir(state.cwd);
  store.set('view', name);
}
document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

/* ---------- projeler ---------- */

let projects = [];
async function loadProjects() {
  const list = $('#project-list');
  try {
    projects = await api('/api/projects');
  } catch (e) {
    return list.replaceChildren(el('p', { class: 'error' }, e.message));
  }
  if (!projects.length) {
    return list.replaceChildren(el('p', { class: 'muted' }, `${state.info.workspace} içinde git projesi yok. Aşağıdan GitHub'dan klonlayabilirsin.`));
  }
  list.replaceChildren(...projects.map(projectCard));
}

function projectCard(p) {
  const out = el('pre', { class: 'output', hidden: true });
  const act = async (action, extra = {}) => {
    out.hidden = false;
    out.textContent = `git ${action}…`;
    try {
      const r = await api('/api/git/action', { method: 'POST', body: { dir: p.path, action, ...extra } });
      out.textContent = r.output;
      if (r.status) Object.assign(p, r.status);
      if (!r.ok) toast(`git ${action} başarısız`, true);
      else if (action !== 'status' && action !== 'diff' && action !== 'log') loadProjects();
    } catch (e) {
      out.textContent = e.message;
    }
  };
  const b = (label, fn, cls = '') => el('button', { class: 'btn sm ' + cls, onclick: fn }, label);
  return el(
    'div',
    { class: 'card' },
    el(
      'h3',
      {},
      p.name,
      el('span', { class: 'badge' }, '⎇ ' + (p.branch || '?')),
      p.changed ? el('span', { class: 'badge warn' }, `${p.changed} değişiklik`) : el('span', { class: 'badge ok' }, 'temiz'),
      p.ahead ? el('span', { class: 'badge' }, `↑${p.ahead}`) : null,
      p.behind ? el('span', { class: 'badge warn' }, `↓${p.behind}`) : null
    ),
    el('div', { class: 'meta' }, p.remote || p.path),
    el(
      'div',
      { class: 'actions' },
      b('Claude', () => newSession({ cwd: p.path, cmd: 'claude', name: 'claude · ' + p.name }).catch((e) => toast(e.message, true)), 'primary'),
      b('Terminal', () => newSession({ cwd: p.path, name: p.name }).catch((e) => toast(e.message, true))),
      b('Dosyalar', () => {
        state.cwd = p.path;
        showView('files');
      }),
      b('Durum', () => act('status')),
      b('Fark', () => act('diff')),
      b('Geçmiş', () => act('log')),
      b('Pull', () => act('pull')),
      b('Commit', () => {
        const message = prompt('Commit mesajı (tüm değişiklikler eklenir):');
        if (message) act('commit', { message });
      }),
      b('Push', () => confirm(`${p.name} → origin/${p.branch} gönderilsin mi?`) && act('push'))
    ),
    out
  );
}

$('#refresh-projects').addEventListener('click', loadProjects);

let repos = [];
$('#load-repos').addEventListener('click', async () => {
  const list = $('#repo-list');
  list.replaceChildren(el('p', { class: 'muted' }, 'Yükleniyor…'));
  try {
    repos = await api('/api/github/repos');
    $('#repo-filter').hidden = false;
    renderRepos();
  } catch (e) {
    list.replaceChildren(el('p', { class: 'error' }, e.message));
  }
});
$('#repo-filter').addEventListener('input', renderRepos);

function renderRepos() {
  const q = $('#repo-filter').value.toLowerCase();
  const have = new Set(projects.map((p) => p.name.toLowerCase()));
  $('#repo-list').replaceChildren(
    ...repos
      .filter((r) => !q || r.fullName.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
      .map((r) =>
        el(
          'div',
          { class: 'card' },
          el('h3', {}, r.fullName, r.private ? el('span', { class: 'badge' }, 'özel') : null, r.language ? el('span', { class: 'badge' }, r.language) : null),
          el('div', { class: 'meta' }, r.description || '', r.description ? ' · ' : '', 'son push ' + new Date(r.pushedAt).toLocaleDateString('tr-TR')),
          el(
            'div',
            { class: 'actions' },
            have.has(r.name.toLowerCase())
              ? el('span', { class: 'badge ok' }, 'bilgisayarda var')
              : el('button', { class: 'btn sm primary', onclick: (e) => clone(r.cloneUrl, e.currentTarget) }, 'Klonla'),
            el('a', { class: 'btn sm', href: r.htmlUrl, target: '_blank', rel: 'noopener' }, "GitHub'da aç")
          )
        )
      )
  );
}

async function clone(url, button) {
  if (button) {
    button.disabled = true;
    button.textContent = 'Klonlanıyor…';
  }
  try {
    const r = await api('/api/git/clone', { method: 'POST', body: { url } });
    toast('Klonlandı: ' + r.path);
    await loadProjects();
    if (repos.length) renderRepos();
  } catch (e) {
    toast(e.message, true);
    if (button) {
      button.disabled = false;
      button.textContent = 'Klonla';
    }
  }
}

$('#clone-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const url = $('#clone-url').value.trim();
  if (url) clone(url, e.submitter).then(() => ($('#clone-url').value = ''));
});

/* ---------- dosyalar ---------- */

async function loadDir(dir) {
  const list = $('#fs-list');
  try {
    const r = await api('/api/fs/list?path=' + encodeURIComponent(dir || ''));
    state.cwd = r.path;
    store.set('cwd', r.path);
    $('#fs-path').value = r.path;
    $('#fs-up').disabled = !r.parent;
    $('#fs-up').dataset.parent = r.parent || '';
    list.replaceChildren(
      ...r.items.map((it) => {
        const full = joinPath(r.path, it.name);
        return el(
          'div',
          { class: 'fs-item', onclick: () => (it.dir ? loadDir(full) : openFile(full)) },
          el('span', { class: 'ic' }, it.dir ? '📁' : '📄'),
          el('span', { class: 'nm' }, it.name),
          it.dir ? null : el('span', { class: 'sz' }, fmtSize(it.size)),
          el('button', { class: 'more', onclick: (e) => (e.stopPropagation(), fileMenu(full, it)) }, '⋯')
        );
      })
    );
    if (!r.items.length) list.append(el('p', { class: 'muted' }, 'Klasör boş.'));
  } catch (e) {
    toast(e.message, true);
  }
}

async function fileMenu(full, it) {
  const choice = await actionSheet(full, [
    ...(it.dir ? [['Burada terminal aç', 'term'], ['Burada Claude başlat', 'claude']] : [['Düzenle', 'edit']]),
    ['Yeniden adlandır', 'rename'],
    ['Sil', 'delete', 'danger'],
  ]);
  try {
    if (choice === 'term') await newSession({ cwd: full, name: it.name });
    else if (choice === 'claude') await newSession({ cwd: full, cmd: 'claude', name: 'claude · ' + it.name });
    else if (choice === 'edit') await openFile(full);
    else if (choice === 'rename') {
      const name = prompt('Yeni ad:', it.name);
      if (name && name !== it.name) {
        await api('/api/fs/rename', { method: 'POST', body: { from: full, to: joinPath(state.cwd, name) } });
        loadDir(state.cwd);
      }
    } else if (choice === 'delete') {
      if (confirm(`${it.name} ${it.dir ? 've içindeki her şey ' : ''}kalıcı olarak silinsin mi?`)) {
        await api('/api/fs/delete', { method: 'POST', body: { path: full } });
        loadDir(state.cwd);
      }
    }
  } catch (e) {
    toast(e.message, true);
  }
}

$('#fs-go').addEventListener('click', () => loadDir($('#fs-path').value.trim()));
$('#fs-path').addEventListener('keydown', (e) => e.key === 'Enter' && loadDir(e.target.value.trim()));
$('#fs-up').addEventListener('click', (e) => e.currentTarget.dataset.parent && loadDir(e.currentTarget.dataset.parent));
$('#fs-term').addEventListener('click', () => newSession({ cwd: state.cwd, name: baseName(state.cwd) }).catch((e) => toast(e.message, true)));
$('#fs-new-file').addEventListener('click', async () => {
  const name = prompt('Dosya adı:');
  if (!name) return;
  const path = joinPath(state.cwd, name);
  try {
    await api('/api/fs/write', { method: 'POST', body: { path, content: '' } });
    await loadDir(state.cwd);
    openFile(path);
  } catch (e) {
    toast(e.message, true);
  }
});
$('#fs-new-dir').addEventListener('click', async () => {
  const name = prompt('Klasör adı:');
  if (!name) return;
  try {
    await api('/api/fs/mkdir', { method: 'POST', body: { path: joinPath(state.cwd, name) } });
    loadDir(state.cwd);
  } catch (e) {
    toast(e.message, true);
  }
});

/* ---------- editör ---------- */

let editing = null;
async function openFile(path) {
  try {
    const r = await api('/api/fs/read?path=' + encodeURIComponent(path));
    openEditor(r);
  } catch (e) {
    toast(e.message, true);
  }
}

function openEditor({ path, content, mtime, readonly = false }) {
  editing = { path, mtime, original: content, readonly };
  $('#editor-name').textContent = '\u200e' + path + '\u200e'; // rtl kesmede yol bozulmasın
  const ta = $('#editor-text');
  ta.value = content;
  ta.readOnly = readonly;
  $('#editor-save').hidden = readonly;
  $('#editor').hidden = false;
  ta.scrollTop = readonly ? ta.scrollHeight : 0;
}

async function saveEditor(force = false) {
  if (!editing || editing.readonly) return;
  const content = $('#editor-text').value;
  try {
    const r = await api('/api/fs/write', { method: 'POST', body: { path: editing.path, content, mtime: force ? undefined : editing.mtime } });
    editing.mtime = r.mtime;
    editing.original = content;
    toast('Kaydedildi');
  } catch (e) {
    if (e.status === 409 && confirm(e.message + '\n\nYine de üzerine yazılsın mı?')) return saveEditor(true);
    toast(e.message, true);
  }
}

$('#editor-save').addEventListener('click', () => saveEditor());
$('#editor-close').addEventListener('click', () => {
  if (editing && !editing.readonly && $('#editor-text').value !== editing.original && !confirm('Kaydedilmemiş değişiklikler kaybolsun mu?')) return;
  $('#editor').hidden = true;
  editing = null;
  if (!$('#view-files').hidden) loadDir(state.cwd);
});
$('#editor-text').addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.target.readOnly) {
    e.preventDefault();
    e.target.setRangeText('  ', e.target.selectionStart, e.target.selectionEnd, 'end');
  } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveEditor();
  }
});

/* ---------- önizleme ---------- */

function previewUrl() {
  const v = $('#preview-url').value.trim();
  if (!v) return null;
  store.set('preview', v);
  if (/^\d+$/.test(v)) return `${location.protocol}//${location.hostname}:${v}/`;
  if (/^:\d+/.test(v)) return `${location.protocol}//${location.hostname}${v}`;
  return /^https?:\/\//.test(v) ? v : 'http://' + v;
}
$('#preview-url').value = store.get('preview', '');
$('#preview-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const u = previewUrl();
  if (u) $('#preview-frame').src = u;
});
$('#preview-ext').addEventListener('click', () => {
  const u = previewUrl();
  if (u) window.open(u, '_blank');
});

/* ---------- ayarlar ---------- */

$('#open-settings').addEventListener('click', () => {
  const i = state.info;
  $('#info-list').replaceChildren(
    ...[
      ['Bilgisayar', i.hostname],
      ['Kullanıcı', i.user],
      ['Sistem', i.platform],
      ['Kabuk', `${i.shell} (${i.ptyMode})`],
      ['GitHub', i.githubToken ? 'jeton kayıtlı' : 'gh girişi / yok'],
    ].flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])
  );
  $('#set-workspace').value = i.workspace;
  $('#set-gh').value = '';
  $('#set-line').checked = store.get('lineMode', false);
  $('#set-snippets').value = store.get('snippets', DEFAULT_SNIPPETS);
  $('#settings').hidden = false;
});
$('#settings-close').addEventListener('click', () => {
  $('#settings').hidden = true;
  layout();
});
$('#save-settings').addEventListener('click', async () => {
  const body = { workspace: $('#set-workspace').value.trim() };
  const gh = $('#set-gh').value.trim();
  if (gh) body.githubToken = gh;
  try {
    const r = await api('/api/settings', { method: 'POST', body });
    Object.assign(state.info, r);
    toast('Ayarlar kaydedildi');
  } catch (e) {
    toast(e.message, true);
  }
});
$('#set-line').addEventListener('change', (e) => {
  store.set('lineMode', e.target.checked);
  applyLineMode();
});
$('#save-snippets').addEventListener('click', () => {
  store.set('snippets', $('#set-snippets').value);
  renderKeybar();
  toast('Hızlı komutlar güncellendi');
});

/* ---------- açılış ---------- */

(async function boot() {
  const m = location.hash.match(/token=([^&]+)/);
  if (m) {
    state.token = decodeURIComponent(m[1]);
    store.set('token', state.token);
    history.replaceState(null, '', location.pathname);
  }
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
  applyLineMode();
  if (!state.token) return showLogin();
  try {
    await start();
    showView(store.get('view', 'term'));
  } catch (e) {
    if (e.message !== 'Yetkisiz') showLogin('Sunucuya ulaşılamadı: ' + e.message);
  }
})();

// Giriş ekranı açıkken QR bağlantısı aynı sekmede açılırsa yalnızca hash değişir.
window.addEventListener('hashchange', () => /token=/.test(location.hash) && location.reload());
