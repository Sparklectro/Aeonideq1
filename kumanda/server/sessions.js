import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';

const require = createRequire(import.meta.url);
let pty = null;
try {
  pty = require('@lydell/node-pty');
} catch {
  // Yerel PTY modülü yoksa (ör. Termux) aşağıdaki yedek yönteme düşülür.
}

const SCROLLBACK_LIMIT = 256 * 1024; // yeniden bağlanınca gönderilecek geçmiş
const isWin = process.platform === 'win32';

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
  return process.env.SHELL || (fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh');
}

export const ptyMode = pty ? 'pty' : !isWin && onPath('script') ? 'script' : 'pipe';

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
      // Yedek: Unix'te `script` gerçek bir PTY sağlar; o da yoksa düz borular.
      const child =
        ptyMode === 'script'
          ? spawn('script', ['-qfc', shell, '/dev/null'], { cwd, detached: true, env: { ...env, COLUMNS: String(cols), LINES: String(rows) } })
          : spawn(shell, isWin ? [] : ['-i'], { cwd, detached: !isWin, env });
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
    if (pty && this.exitCode === null) {
      try {
        this.proc.resize(cols, rows);
      } catch {}
    }
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
});
