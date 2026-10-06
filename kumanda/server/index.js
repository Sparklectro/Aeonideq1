#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { WebSocketServer } from 'ws';
import { loadConfig, safeEqual, updateSavedConfig } from './config.js';
import { SessionManager, platformInfo, ptyMode } from './sessions.js';
import * as fsApi from './fs-api.js';
import * as gitApi from './git-api.js';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'client');

// İstemcinin kullandığı xterm dosyaları node_modules'tan servis edilir (CDN gerekmez).
const VENDOR = {
  'xterm.js': require.resolve('@xterm/xterm/lib/xterm.js'),
  'xterm.css': require.resolve('@xterm/xterm/css/xterm.css'),
  'addon-fit.js': require.resolve('@xterm/addon-fit/lib/addon-fit.js'),
  'addon-web-links.js': require.resolve('@xterm/addon-web-links/lib/addon-web-links.js'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export function createServer(cfg) {
  const sessions = new SessionManager({ shell: cfg.shell, workspace: cfg.workspace });
  const failures = new Map(); // ip -> {count, until}

  function authorized(req, url) {
    const ip = req.socket.remoteAddress;
    const f = failures.get(ip);
    if (f && f.until > Date.now()) return false;
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : url.searchParams.get('token');
    if (safeEqual(token, cfg.token)) {
      failures.delete(ip);
      return true;
    }
    // Kaba kuvvet denemelerini yavaşlat: 5 hatalı denemeden sonra 1 dakika kilit.
    const n = (f?.count || 0) + 1;
    failures.set(ip, { count: n, until: n >= 5 ? Date.now() + 60_000 : 0 });
    return false;
  }

  const routes = {
    'GET /api/info': () => ({
      ...platformInfo(),
      workspace: cfg.workspace,
      shell: sessions.shell,
      githubToken: Boolean(cfg.githubToken),
    }),
    'GET /api/sessions': () => sessions.list(),
    'POST /api/sessions': (b) => sessions.create({ ...b, cwd: b.cwd && fsApi.resolvePath(b.cwd, cfg.workspace) }).info(),
    'DELETE /api/sessions': (b, q) => ({ ok: sessions.kill(q.get('id')) }),
    'GET /api/fs/list': (b, q) => fsApi.listDir(fsApi.resolvePath(q.get('path'), cfg.workspace)),
    'GET /api/fs/read': (b, q) => fsApi.readFile(fsApi.resolvePath(q.get('path'), cfg.workspace)),
    'POST /api/fs/write': (b) => fsApi.writeFile(fsApi.resolvePath(b.path, cfg.workspace), b.content ?? '', b.mtime),
    'POST /api/fs/mkdir': (b) => fsApi.makeDir(fsApi.resolvePath(b.path, cfg.workspace)),
    'POST /api/fs/delete': (b) => fsApi.remove(fsApi.resolvePath(b.path, cfg.workspace)),
    'POST /api/fs/rename': (b) =>
      fsApi.rename(fsApi.resolvePath(b.from, cfg.workspace), fsApi.resolvePath(b.to, cfg.workspace)),
    'GET /api/projects': () => gitApi.listProjects(cfg.workspace),
    'GET /api/github/repos': () => gitApi.listGithubRepos(cfg),
    'POST /api/git/clone': (b) => gitApi.cloneRepo(cfg, b),
    'POST /api/git/action': (b) => gitApi.gitAction(cfg, { ...b, dir: fsApi.resolvePath(b.dir, cfg.workspace) }),
    'POST /api/settings': (b) => {
      if ('githubToken' in b) {
        cfg.githubToken = b.githubToken || null;
        updateSavedConfig({ githubToken: b.githubToken || null });
      }
      if (b.workspace) {
        cfg.workspace = fsApi.resolvePath(b.workspace, cfg.workspace);
        fs.mkdirSync(cfg.workspace, { recursive: true });
        sessions.workspace = cfg.workspace;
        updateSavedConfig({ workspace: cfg.workspace });
      }
      return { ok: true, workspace: cfg.workspace, githubToken: Boolean(cfg.githubToken) };
    },
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) {
        if (!authorized(req, url)) return send(res, 401, { error: 'Yetkisiz' });
        const handler = routes[`${req.method} ${url.pathname}`];
        if (!handler) return send(res, 404, { error: 'Bulunamadı' });
        const body = req.method === 'GET' ? {} : await readJson(req);
        return send(res, 200, await handler(body, url.searchParams));
      }
      return serveStatic(url.pathname, res);
    } catch (e) {
      const status = e.status || (e.code === 'ENOENT' ? 404 : e.code === 'EACCES' || e.code === 'EPERM' ? 403 : 500);
      send(res, status, { error: e.message });
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws' || !authorized(req, url)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => attach(ws, url.searchParams));
  });

  // Bir terminal oturumuna bağlan. Bağlantı koparsa oturum yaşamaya devam eder;
  // telefon geri bağlanınca son 256 KB çıktı yeniden gönderilir.
  function attach(ws, params) {
    const s = sessions.get(params.get('id'));
    if (!s) {
      ws.send(JSON.stringify({ t: 'error', d: 'Oturum bulunamadı' }));
      return ws.close();
    }
    let pending = '';
    let timer = null;
    const flush = () => {
      timer = null;
      if (pending && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'o', d: pending }));
      pending = '';
    };
    const client = {
      send(d) {
        // Mobil ağda çok sayıda küçük çerçeve yerine ~16 ms'lik paketler gönder.
        pending += d;
        timer ??= setTimeout(flush, 16);
      },
      exit(code) {
        flush();
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'exit', code }));
      },
    };
    ws.send(JSON.stringify({ t: 'hello', session: s.info(), replay: s.buffer }));
    if (s.exitCode !== null) client.exit(s.exitCode);
    s.clients.add(client);

    const alive = setInterval(() => ws.readyState === ws.OPEN && ws.ping(), 25_000);
    ws.on('message', (raw) => {
      let m;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (m.t === 'i' && typeof m.d === 'string') s.write(m.d);
      else if (m.t === 'resize') s.resize(m.cols, m.rows);
    });
    ws.on('close', () => {
      clearInterval(alive);
      clearTimeout(timer);
      s.clients.delete(client);
    });
  }

  server.sessions = sessions;
  return server;
}

function send(res, status, data) {
  const body = JSON.stringify(data ?? null);
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) {
        reject(fsApi.httpError(413, 'İstek çok büyük'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(fsApi.httpError(400, 'Geçersiz JSON'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(pathname, res) {
  let file;
  if (pathname.startsWith('/vendor/')) file = VENDOR[pathname.slice(8)];
  else {
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    file = path.join(CLIENT_DIR, rel);
    if (!file.startsWith(CLIENT_DIR + path.sep)) file = null;
  }
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end('Bulunamadı');
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(file).pipe(res);
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const cfg = loadConfig();
  const server = createServer(cfg);
  server.listen(cfg.port, cfg.host, () => {
    const hosts = cfg.host === '0.0.0.0' ? ['localhost', ...lanAddresses()] : [cfg.host];
    const urls = hosts.map((h) => `http://${h}:${cfg.port}/#token=${cfg.token}`);
    console.log('\n  Kumanda çalışıyor');
    console.log(`  Kabuk     : ${server.sessions.shell} (${ptyMode})`);
    console.log(`  Projeler  : ${cfg.workspace}\n`);
    for (const u of urls) console.log(`  ${u}`);
    const phoneUrl = urls[1] || urls[0];
    try {
      console.log('\n  Telefonla okut:');
      require('qrcode-terminal').generate(phoneUrl, { small: true }, (q) => console.log(q.replace(/^/gm, '  ')));
    } catch {}
    if (ptyMode !== 'pty') {
      console.log(`  Uyarı: node-pty yüklenemedi, "${ptyMode}" yedek modu kullanılıyor.`);
    }
  });
  const stop = () => {
    server.sessions.killAll();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
