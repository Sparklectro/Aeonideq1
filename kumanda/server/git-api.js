import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { httpError } from './fs-api.js';

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024, timeout: 10 * 60_000, ...opts }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

const git = (cwd, args, extra = []) => run('git', [...extra, ...args], { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });

// GitHub jetonu: önce yapılandırma/ortam, yoksa bilgisayarda `gh auth login` yapılmışsa onun jetonu.
export async function githubToken(cfg) {
  if (cfg.githubToken) return cfg.githubToken;
  const r = await run('gh', ['auth', 'token']);
  return r.ok ? r.stdout.trim() : null;
}

function authArgs(token) {
  if (!token) return [];
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  // Jeton yalnızca bu komut için başlık olarak gider; .git/config'e yazılmaz.
  return ['-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`];
}

export async function listGithubRepos(cfg) {
  const token = await githubToken(cfg);
  if (!token) {
    throw httpError(401, 'GitHub jetonu yok. Ayarlar\'dan ekle ya da bilgisayarda `gh auth login` çalıştır.');
  }
  const repos = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`https://api.github.com/user/repos?per_page=100&sort=pushed&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'kumanda' },
    });
    if (!res.ok) throw httpError(res.status, `GitHub hatası: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    repos.push(
      ...batch.map((r) => ({
        fullName: r.full_name,
        name: r.name,
        private: r.private,
        description: r.description,
        cloneUrl: r.clone_url,
        htmlUrl: r.html_url,
        defaultBranch: r.default_branch,
        pushedAt: r.pushed_at,
        language: r.language,
      }))
    );
    if (batch.length < 100) break;
  }
  return repos;
}

export async function cloneRepo(cfg, { url, dir }) {
  if (!url) throw httpError(400, 'url gerekli');
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) url = `https://github.com/${url}.git`;
  const name = dir || url.split('/').pop().replace(/\.git$/, '');
  const target = path.resolve(cfg.workspace, name);
  if (await exists(target)) throw httpError(409, `${target} zaten var`);
  const token = url.startsWith('https://github.com/') ? await githubToken(cfg) : null;
  const r = await git(cfg.workspace, ['clone', url, target], authArgs(token));
  if (!r.ok) throw httpError(500, r.stderr || r.stdout);
  return { path: target, output: r.stderr + r.stdout };
}

async function exists(p) {
  return fs.stat(p).then(() => true, () => false);
}

export async function projectStatus(dir) {
  const r = await git(dir, ['status', '--porcelain=v2', '--branch']);
  if (!r.ok) return null;
  const info = { path: dir, name: path.basename(dir), branch: null, ahead: 0, behind: 0, changed: 0, remote: null };
  for (const line of r.stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) info.branch = line.slice(14);
    else if (line.startsWith('# branch.ab ')) {
      const [a, b] = line.slice(12).split(' ');
      info.ahead = Math.abs(parseInt(a, 10));
      info.behind = Math.abs(parseInt(b, 10));
    } else if (line && !line.startsWith('#')) info.changed++;
  }
  const remote = await git(dir, ['remote', 'get-url', 'origin']);
  if (remote.ok) info.remote = remote.stdout.trim();
  return info;
}

export async function listProjects(workspace) {
  const entries = await fs.readdir(workspace, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));
  const all = await Promise.all(
    dirs.map(async (e) => {
      const dir = path.join(workspace, e.name);
      if (!(await exists(path.join(dir, '.git')))) return null;
      return projectStatus(dir);
    })
  );
  return all.filter(Boolean);
}

// Telefondan tek dokunuşla yapılabilen güvenli git işlemleri. Gerisi için terminal var.
export async function gitAction(cfg, { dir, action, message }) {
  if (!dir) throw httpError(400, 'dir gerekli');
  const token = await githubToken(cfg);
  const remote = await git(dir, ['remote', 'get-url', 'origin']);
  const auth = remote.ok && remote.stdout.trim().startsWith('https://github.com/') ? authArgs(token) : [];
  const steps = {
    status: [['status']],
    fetch: [['fetch', '--all', '--prune']],
    pull: [['pull', '--ff-only']],
    push: [['push', '-u', 'origin', 'HEAD']],
    diff: [['diff', '--stat'], ['diff']],
    log: [['log', '--oneline', '--graph', '--decorate', '-n', '30']],
    commit: [['add', '-A'], ['commit', '-m', message || 'Telefondan güncelleme']],
  }[action];
  if (!steps) throw httpError(400, `Bilinmeyen işlem: ${action}`);
  let output = '';
  for (const args of steps) {
    const needsAuth = ['fetch', 'pull', 'push'].includes(args[0]);
    const r = await git(dir, args, needsAuth ? auth : []);
    output += `$ git ${args.join(' ')}\n${r.stdout}${r.stderr}\n`;
    if (!r.ok) return { ok: false, output };
  }
  return { ok: true, output, status: await projectStatus(dir) };
}
