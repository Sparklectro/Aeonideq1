import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const SCROLLBACK_LIMIT = 256 * 1024; // yeniden bağlanınca gönderilecek geçmiş
const isWin = process.platform === 'win32';
export const isTermux = Boolean(process.env.PREFIX?.includes('com.termux')) || process.platform === 'android';
// node-pty'nin Android için derlenmiş sürümü yok; Termux'ta doğrudan Python köprüsü kullanılır.
let pty = null;
if (!isTermux) {
  try {
    pty = require('@lydell/node-pty');
  } catch {}
}
const HELPER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pty-helper.py');

function onPath(cmd) {
  try {
    execFileSync(isWin ? 'where' : 'which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function defaultShell() {
  if (isWin) return onPath('pwsh.exe') ? 'pwsh.exe' : 'powershell.exe';
  if (isTermux && process.env.PREFIX) return path.join(process.env.PREFIX, 'bin', 'bash');
  return process.env.SHELL || (fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh');
}

const python = isWin ? null : ['python3', 'python'].find(onPath);

// Öncelik: node-pty → Python PTY köprüsü (boyut değişimini destekler) → script → düz borular.
export const ptyMode = pty ? 'pty' : python ? 'python' : !isWin && onPath('script') ? 'script' : 'pipe';

export class SessionManager {
  constructor({ shell, workspace }) {
    this.shell = shell || defaultShell();
    this.workspace = workspace;
    this.sessions = new Map();
  }

  list() {
    return [...this.sessions.values()].map((s) => s.info());
  }

  get(id) {
    return this.sessions.get(id);
  }

  create({ cwd, cmd, name, cols = 80, rows = 24 } = {}) {
    const dir = cwd && fs.existsSync(cwd) ? cwd : this.workspace;
    const s = new Session({ shell: this.shell, cwd: dir, name, cols, rows });
    this.sessions.set(s.id, s);
    s.onExit = () => {
      // Kapanan oturumu biraz tut ki istemci çıkış kodunu görebilsin.
      setTimeout(() => this.sessions.delete(s.id), 60_000).unref();
    };
    if (cmd) setTimeout(() => s.write(cmd + '\r'), 300);
    return s;
  }

  kill(id) {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.kill();
    this.sessions.delete(id);
    return true;
  }

  killAll() {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }
}

class Session {
  constructor({ shell, cwd, name, cols, rows }) {
    this.id = crypto.randomBytes(6).toString('hex');
    this.name = name || shell.split(/[\\/]/).pop().replace(/\.exe$/i, '');
    this.cwd = cwd;
    this.cols = cols;
    this.rows = rows;
    this.createdAt = Date.now();
    this.buffer = '';
    this.clients = new Set();
    this.exitCode = null;
    this.onExit = null;

    const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', KUMANDA: '1' };

    if (pty) {
      this.proc = pty.spawn(shell, [], { name: 'xterm-256color', cols, rows, cwd, env });
      this.proc.onData((d) => this.emit(d));
      this.proc.onExit(({ exitCode }) => this.exited(exitCode));
    } else {
      let child;
      if (ptyMode === 'python') {
        child = spawn(python, [HELPER, String(cols), String(rows), shell, '-l'], {
          cwd,
          detached: true,
          env,
          stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
        });
        this.ctl = child.stdio[3];
        this.ctl.on('error', () => {});
      } else if (ptyMode === 'script') {
        child = spawn('script', ['-qfc', shell, '/dev/null'], { cwd, detached: true, env: { ...env, COLUMNS: String(cols), LINES: String(rows) } });
      } else {
        child = spawn(shell, isWin ? [] : ['-i'], { cwd, detached: !isWin, env });
      }
      child.stdout.on('data', (d) => this.emit(d.toString('utf8')));
      child.stderr.on('data', (d) => this.emit(d.toString('utf8')));
      child.on('exit', (code) => this.exited(code ?? 0));
      child.on('error', (e) => this.emit(`\r\n[kumanda] kabuk başlatılamadı: ${e.message}\r\n`));
      this.proc = child;
    }
    this.pid = this.proc.pid;
  }

  info() {
    return {
      id: this.id,
      name: this.name,
      cwd: this.cwd,
      pid: this.pid,
      createdAt: this.createdAt,
      clients: this.clients.size,
      exited: this.exitCode !== null,
      exitCode: this.exitCode,
    };
  }

  emit(data) {
    this.buffer += data;
    if (this.buffer.length > SCROLLBACK_LIMIT) this.buffer = this.buffer.slice(-SCROLLBACK_LIMIT);
    for (const c of this.clients) c.send(data);
  }

  exited(code) {
    if (this.exitCode !== null) return;
    this.exitCode = code;
    for (const c of this.clients) c.exit(code);
    this.onExit?.();
  }

  write(data) {
    if (this.exitCode !== null) return;
    if (pty) this.proc.write(data);
    else this.proc.stdin.write(data);
  }

  resize(cols, rows) {
    cols = Math.max(10, Math.min(500, cols | 0));
    rows = Math.max(4, Math.min(300, rows | 0));
    this.cols = cols;
    this.rows = rows;
    if (this.exitCode !== null) return;
    try {
      if (pty) this.proc.resize(cols, rows);
      else this.ctl?.write(`${cols} ${rows}\n`);
    } catch {}
  }

  kill() {
    try {
      if (pty) this.proc.kill();
      else if (isWin) spawn('taskkill', ['/pid', String(this.pid), '/T', '/F']);
      else {
        // Kabuğu ve altındaki her şeyi (süreç grubu) kapat; inatçıysa 2 sn sonra zorla.
        const group = -this.pid;
        process.kill(group, 'SIGHUP');
        setTimeout(() => {
          try {
            process.kill(group, 'SIGKILL');
          } catch {}
        }, 2000).unref();
      }
    } catch {}
  }
}

export const platformInfo = () => ({
  platform: process.platform,
  hostname: os.hostname(),
  user: os.userInfo().username,
  home: os.homedir(),
  sep: isWin ? '\\' : '/',
  ptyMode,
  termux: isTermux,
  places: places(),
});

// Dosyalar sekmesindeki kısayollar. Termux'ta telefonun paylaşılan hafızası ~/storage altındadır.
function places() {
  const home = os.homedir();
  const list = [['Ev', home]];
  const candidates = isTermux
    ? [
        ['Telefon hafızası', path.join(home, 'storage', 'shared')],
        ['İndirilenler', path.join(home, 'storage', 'downloads')],
        ['Kamera', path.join(home, 'storage', 'dcim')],
      ]
    : [['Masaüstü', path.join(home, 'Desktop')], ['İndirilenler', path.join(home, 'Downloads')]];
  for (const [name, p] of candidates) if (fs.existsSync(p)) list.push([name, p]);
  return list;
}
