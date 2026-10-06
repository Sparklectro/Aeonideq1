import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import WebSocket from 'ws';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kumanda-test-'));
process.env.KUMANDA_HOME = path.join(tmp, 'home');
process.env.KUMANDA_WORKSPACE = path.join(tmp, 'ws');
process.env.KUMANDA_TOKEN = 'test-token';
process.env.KUMANDA_SHELL = '/bin/sh';

const { loadConfig } = await import('../server/config.js');
const { createServer } = await import('../server/index.js');

let server, base;
before(async () => {
  server = createServer(loadConfig());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.sessions.killAll();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const api = (p, { method = 'GET', body, token = 'test-token' } = {}) =>
  fetch(base + p, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, data: await r.json() }));

function openWs(id) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?id=${id}&token=test-token`);
  ws.out = '';
  ws.hello = new Promise((resolve) =>
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'hello') resolve(m);
      if (m.t === 'o') ws.out += m.d;
    })
  );
  ws.waitFor = async (text, ms = 5000) => {
    const end = Date.now() + ms;
    while (!ws.out.includes(text)) {
      if (Date.now() > end) throw new Error(`"${text}" gelmedi. Çıktı: ${JSON.stringify(ws.out)}`);
      await new Promise((r) => setTimeout(r, 30));
    }
  };
  return ws;
}

test('arayüz dosyaları anahtarsız, API anahtarlı', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/vendor/xterm.js')).status, 200);
  assert.equal((await fetch(base + '/../server/config.js')).status, 404);
  assert.equal((await api('/api/info', { token: 'yanlis' })).status, 401);
  const { status, data } = await api('/api/info');
  assert.equal(status, 200);
  assert.equal(data.workspace, process.env.KUMANDA_WORKSPACE);
});

test('terminal oturumu: komut çalışır, kopup geri bağlanınca geçmiş gelir', async () => {
  const { data: s } = await api('/api/sessions', { method: 'POST', body: { cols: 100, rows: 30 } });
  const ws = openWs(s.id);
  await ws.hello;
  ws.send(JSON.stringify({ t: 'i', d: 'echo merhaba-$((40+2))\r' }));
  await ws.waitFor('merhaba-42');
  ws.close();

  // Bağlantı koptu ama oturum yaşıyor.
  const ws2 = openWs(s.id);
  const hello = await ws2.hello;
  assert.match(hello.replay, /merhaba-42/);
  ws2.send(JSON.stringify({ t: 'i', d: 'pwd\r' }));
  await ws2.waitFor(process.env.KUMANDA_WORKSPACE);
  ws2.close();

  assert.equal((await api('/api/sessions')).data.length, 1);
  await api('/api/sessions?id=' + s.id, { method: 'DELETE' });
  assert.equal((await api('/api/sessions')).data.length, 0);
});

test('oturum açılırken komut çalıştırılabilir (ör. claude)', async () => {
  const { data: s } = await api('/api/sessions', { method: 'POST', body: { cmd: 'echo basladi-ok' } });
  const ws = openWs(s.id);
  await ws.hello;
  await ws.waitFor('basladi-ok');
  ws.close();
  await api('/api/sessions?id=' + s.id, { method: 'DELETE' });
});

test('dosya oku/yaz ve eşzamanlı değişiklik koruması', async () => {
  const w = await api('/api/fs/write', { method: 'POST', body: { path: 'deneme/a.txt', content: 'bir' } });
  assert.equal(w.status, 200);
  const r = await api('/api/fs/read?path=deneme/a.txt');
  assert.equal(r.data.content, 'bir');
  const list = await api('/api/fs/list?path=deneme');
  assert.deepEqual(list.data.items.map((i) => i.name), ['a.txt']);

  const later = new Date(Date.now() + 5000);
  fs.utimesSync(r.data.path, later, later); // başka biri dosyayı değiştirdi
  const conflict = await api('/api/fs/write', { method: 'POST', body: { path: 'deneme/a.txt', content: 'iki', mtime: r.data.mtime } });
  assert.equal(conflict.status, 409);
});

test('yerel git projeleri listelenir, commit çalışır', async () => {
  const dir = path.join(process.env.KUMANDA_WORKSPACE, 'proje');
  fs.mkdirSync(dir);
  const g = (...a) => execFileSync('git', a, { cwd: dir });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'x.txt'), '1');

  let { data } = await api('/api/projects');
  assert.equal(data[0].name, 'proje');
  assert.equal(data[0].branch, 'main');
  assert.equal(data[0].changed, 1);

  const c = await api('/api/git/action', { method: 'POST', body: { dir: 'proje', action: 'commit', message: 'ilk' } });
  assert.equal(c.data.ok, true, c.data.output);
  assert.equal(c.data.status.changed, 0);
});
