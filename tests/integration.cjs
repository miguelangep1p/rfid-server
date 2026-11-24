const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const hash = () => require('node:crypto').createHash('sha256').update(fs.readFileSync('accesos.db')).digest('hex');

test('API, eventos, pases, revocación y persistencia sin hardware', { timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rfid-test-'));
  const dbPath = path.join(dir, 'test.db');
  const originalHash = hash();
  let child, base;
  let log = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, SERIAL_DISABLED: '1', DB_PATH: dbPath, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.on('data', b => { log += b; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(log || 'No inició el servidor')), 40000);
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Servidor terminado: ${code} ${log}`)); });
      child.stdout.on('data', b => { log += b; const match = String(b).match(/Panel RFID: (http:\/\/[^\s]+)/); if (match) { base = match[1]; clearTimeout(timer); resolve(); } });
    });
  }
  async function stop() { if (!child || child.exitCode !== null) return; await new Promise(resolve => { child.once('exit', resolve); child.kill(); }); }
  async function request(route, body, method = 'POST') {
    return fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  }
  const controller = new AbortController();
  try {
    await start();
    const home = await fetch(base+'/acceso'); assert.equal(home.status, 200); assert.match(await home.text(), /Todo bajo control/);
    assert.equal((await (await fetch(base + '/api/estado')).json()).connected, false);
    const events = await fetch(base + '/api/eventos', { signal: controller.signal });
    assert.match(events.headers.get('content-type'), /text\/event-stream/);
    const reader = events.body.getReader(); assert.match(new TextDecoder().decode((await reader.read()).value), /event: estado/);
    assert.equal((await request('/api/usuarios', { uid: 'abcd1234', nombre: 'Prueba', relay: 2 })).status, 200);
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: actualizar/);
    controller.abort();
    let users = await (await fetch(base + '/api/usuarios')).json(); assert.equal(users.find(u => u.uid === 'ABCD1234').relay, 2);
    assert.equal((await request('/api/pase-temporal', { uid: 'AABBCCDD', nombre: 'Temporal', horas: 2, relay: 1 })).status, 200);
    users = await (await fetch(base + '/api/usuarios')).json(); assert.ok(users.find(u => u.uid === 'AABBCCDD').expira);
    assert.equal((await request('/api/pase-temporal', { uid: 'AABBCCDD', nombre: 'Temporal', horas: -1, relay: 1 })).status, 400);
    assert.equal((await request('/api/usuarios', { uid: '<script>', nombre: 'Inválido', relay: 1 })).status, 400);
    assert.equal((await request('/api/abrir', { relay: 3 })).status, 400);
    assert.equal((await request('/api/abrir', { relay: 1 })).status, 503);
    assert.equal((await (await fetch(base + '/api/accesos')).json()).length, 0);
    assert.equal((await request('/api/usuarios/ABCD1234', null, 'DELETE')).status, 200);
    await stop(); await start();
    users = await (await fetch(base + '/api/usuarios')).json(); assert.ok(!users.some(u => u.uid === 'ABCD1234')); assert.ok(users.some(u => u.uid === 'AABBCCDD'));
    assert.equal(hash(), originalHash);
  } finally { controller.abort(); await stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
