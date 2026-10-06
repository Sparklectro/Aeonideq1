import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const CONFIG_DIR = process.env.KUMANDA_HOME || path.join(os.homedir(), '.kumanda');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Ayarlar ~/.kumanda/config.json içinde saklanır; ortam değişkenleri her zaman önceliklidir.
export function loadConfig() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {}

  let changed = false;
  if (!saved.token) {
    saved.token = crypto.randomBytes(24).toString('base64url');
    changed = true;
  }
  if (!saved.workspace) {
    saved.workspace = path.join(os.homedir(), 'kumanda-projeler');
    changed = true;
  }
  if (changed) saveConfig(saved);

  const cfg = {
    token: process.env.KUMANDA_TOKEN || saved.token,
    host: process.env.KUMANDA_HOST || saved.host || '0.0.0.0',
    port: Number(process.env.KUMANDA_PORT || saved.port || 7681),
    workspace: path.resolve(expandHome(process.env.KUMANDA_WORKSPACE || saved.workspace)),
    shell: process.env.KUMANDA_SHELL || saved.shell || null,
    githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || saved.githubToken || null,
  };
  fs.mkdirSync(cfg.workspace, { recursive: true });
  return cfg;
}

export function saveConfig(data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function updateSavedConfig(patch) {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {}
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '') delete saved[k];
    else saved[k] = v;
  }
  saveConfig(saved);
}
