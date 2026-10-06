import fs from 'node:fs/promises';
import path from 'node:path';
import { expandHome } from './config.js';

const MAX_READ = 2 * 1024 * 1024;

// Göreli yollar çalışma klasörüne göre çözülür; "~" ev dizinidir.
// Terminal zaten tam erişim verdiği için dosya API'si de kökle sınırlı değildir.
export function resolvePath(p, workspace) {
  if (!p) return workspace;
  const expanded = expandHome(p);
  return path.resolve(path.isAbsolute(expanded) ? expanded : path.join(workspace, expanded));
}

export async function listDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const items = await Promise.all(
    entries.map(async (e) => {
      const full = path.join(dir, e.name);
      let size = 0;
      let mtime = 0;
      let isDir = e.isDirectory();
      try {
        const st = await fs.stat(full);
        size = st.size;
        mtime = st.mtimeMs;
        isDir = st.isDirectory();
      } catch {}
      return { name: e.name, dir: isDir, size, mtime };
    })
  );
  items.sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name, 'tr'));
  return { path: dir, parent: path.dirname(dir) === dir ? null : path.dirname(dir), items };
}

export async function readFile(file) {
  const st = await fs.stat(file);
  if (st.isDirectory()) throw httpError(400, 'Bu bir klasör');
  if (st.size > MAX_READ) throw httpError(413, `Dosya çok büyük (${st.size} bayt, sınır ${MAX_READ})`);
  const buf = await fs.readFile(file);
  if (buf.subarray(0, 8000).includes(0)) throw httpError(415, 'İkili (binary) dosya düzenlenemez');
  return { path: file, content: buf.toString('utf8'), mtime: st.mtimeMs };
}

export async function writeFile(file, content, expectedMtime) {
  if (expectedMtime) {
    // Başka biri (ör. Claude Code) dosyayı bu arada değiştirdiyse üzerine yazma.
    const st = await fs.stat(file).catch(() => null);
    if (st && Math.abs(st.mtimeMs - expectedMtime) > 1) {
      throw httpError(409, 'Dosya sen açtıktan sonra değişmiş; yeniden yükle');
    }
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
  const st = await fs.stat(file);
  return { path: file, mtime: st.mtimeMs };
}

export async function makeDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  return { path: dir };
}

export async function remove(target) {
  await fs.rm(target, { recursive: true, force: false });
  return { path: target };
}

export async function rename(from, to) {
  await fs.rename(from, to);
  return { path: to };
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
