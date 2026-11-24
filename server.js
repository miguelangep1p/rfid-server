const express = require('express');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dev = process.argv.includes('--dev');
require('@next/env').loadEnvConfig(__dirname, dev);
process.env.NODE_ENV = dev ? 'development' : 'production';
const nextApp = require('next')({ dev, dir: __dirname });
const clients = new Set();
const publish = (event, data) => { for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
const app = express();
app.use(express.json());

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'accesos.db');
let db;

// ─── Guardar BD en disco ──────────────────────────────────
function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH + '.tmp', Buffer.from(data));
  fs.renameSync(DB_PATH + '.tmp', DB_PATH);
}

// ─── Helpers para queries ─────────────────────────────────
function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
  publish('actualizar', {});
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ─── Puerto Serial ────────────────────────────────────────
const port = new SerialPort({ path: process.env.SERIAL_PATH || 'COM3', baudRate: Number(process.env.SERIAL_BAUD_RATE || 9600), autoOpen: false });
const status = () => ({ connected: port.isOpen, path: port.path });
port.on('open', () => publish('estado', status()));
port.on('close', () => publish('estado', status()));
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

parser.on('data', (line) => {
  line = line.trim();
  console.log('[Serial]', line);

  if (!line.startsWith('ACCESO,')) return;

  const partes = line.split(',');
  if (partes.length < 3) return;

  const uid       = partes[1].toUpperCase();
  const timestamp = partes[2];

  const usuario = get(
    `SELECT * FROM usuarios
     WHERE uid = ? AND activo = 1
     AND (expira IS NULL OR expira > datetime('now','localtime'))`,
    [uid]
  );

  const resultado = usuario ? 'CONCEDIDO' : 'DENEGADO';
  const nombre    = usuario?.nombre || 'Desconocido';

  if (usuario) {
    port.write(`CONCEDIDO,${usuario.relay}\n`);
  } else {
    port.write('DENEGADO\n');
  }

  run("INSERT INTO accesos VALUES (NULL,?,?,?,?)", [uid, timestamp, resultado, nombre]);
  publish('acceso', { uid, timestamp, resultado, nombre });
  console.log(`[${timestamp}] ${uid} (${nombre}) → ${resultado} [Relay ${usuario?.relay ?? '-'}]`);
});

port.on('error', (err) => console.error('Error serial:', err.message));

// ─── API ──────────────────────────────────────────────────

app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.get('/api/estado', (req, res) => res.json(status()));
app.get('/api/eventos', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`event: estado\ndata: ${JSON.stringify(status())}\n\n`);
  clients.add(res);
  const timer = setInterval(() => res.write(': heartbeat\n\n'), 20000);
  res.on('close', () => { clearInterval(timer); clients.delete(res); });
});
app.use('/api', (req, res, next) => {
  if (req.method !== 'POST') return next();
  const { uid, nombre, relay, horas } = req.body || {};
  if (relay !== undefined && ![1,2].includes(Number(relay))) return res.status(400).json({ error: 'Relay inválido' });
  if (['/usuarios', '/pase-temporal'].includes(req.path)) {
    if (typeof uid !== 'string' || !/^[a-fA-F0-9]{4,32}$/.test(uid.trim()) || typeof nombre !== 'string' || !nombre.trim() || nombre.length > 120) return res.status(400).json({ error: 'Indica un UID hexadecimal y un nombre válido' });
    req.body.uid = uid.trim(); req.body.nombre = nombre.trim();
    if (req.path === '/pase-temporal' && (!Number.isFinite(Number(horas)) || Number(horas) <= 0 || Number(horas) > 8760)) return res.status(400).json({ error: 'Duración inválida (más de 0 y hasta 8760 horas)' });
  }
  next();
});
app.get('/api/accesos', (req, res) => {
  res.json(all("SELECT * FROM accesos ORDER BY id DESC LIMIT 100"));
});

app.get('/api/usuarios', (req, res) => {
  res.json(all("SELECT * FROM usuarios WHERE activo = 1"));
});

app.post('/api/usuarios', (req, res) => {
  const { uid, nombre, relay } = req.body;
  if (!uid || !nombre || !relay) return res.status(400).json({ error: 'Faltan datos' });
  run("INSERT OR REPLACE INTO usuarios VALUES (?,?,1,NULL,?)", [uid.toUpperCase(), nombre, relay]);
  res.json({ ok: true, mensaje: `${nombre} agregado` });
});

app.delete('/api/usuarios/:uid', (req, res) => {
  run("UPDATE usuarios SET activo = 0 WHERE uid = ?", [req.params.uid.toUpperCase()]);
  res.json({ ok: true });
});

app.post('/api/pase-temporal', (req, res) => {
  const { uid, nombre, horas, relay } = req.body;
  if (!uid || !nombre || !horas || !relay) return res.status(400).json({ error: 'Faltan datos' });
  run(
    "INSERT OR REPLACE INTO usuarios VALUES (?,?,1,datetime('now','localtime',?),?)",
    [uid.toUpperCase(), nombre, `+${horas} hours`, relay]
  );
  res.json({ ok: true, mensaje: `Pase de ${horas}h generado para ${nombre}` });
});

app.post('/api/abrir', (req, res) => {
  const relay = Number(req.body.relay || 1);
  if (!port.isOpen) return res.status(503).json({ error: 'El lector está desconectado. Revisa la conexión USB.' });
  port.write(`ABRIR,${relay}\n`, (err) => {
    if (err) return res.status(500).json({ error: 'No se pudo enviar comando' });
    const ts = new Date().toLocaleString('es-PE', { hour12: false });
    run("INSERT INTO accesos VALUES (NULL,?,?,?,?)", ['REMOTO', ts, 'CONCEDIDO', `Acceso Remoto Relay ${relay}`]);
    res.json({ ok: true });
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((error, req, res, next) => { console.error(error); res.status(error.status || 500).json({ error: 'No se pudo completar la operación' }); });
app.get('/',(req,res)=>res.redirect('/acceso'));
app.use((req, res) => nextApp.getRequestHandler()(req, res));

// ─── Iniciar servidor después de cargar BD ────────────────
Promise.all([initSqlJs(), nextApp.prepare()]).then(([SQL]) => {
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('📂 Base de datos cargada desde disco');
  } else {
    db = new SQL.Database();
    console.log('🆕 Base de datos nueva creada');
  }

  // Crear tablas
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      uid    TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      activo INTEGER DEFAULT 1,
      expira TEXT DEFAULT NULL,
      relay  INTEGER DEFAULT 1
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS accesos (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      uid       TEXT,
      timestamp TEXT,
      resultado TEXT,
      nombre    TEXT
    )
  `);

  // Usuarios iniciales
  db.run("INSERT OR IGNORE INTO usuarios VALUES (?,?,1,NULL,?)", ["74D81506",  "Sebastian",    1]);
  db.run("INSERT OR IGNORE INTO usuarios VALUES (?,?,1,NULL,?)", ["613B0D17", "Miguel Angel", 2]);
  saveDb();

  if (process.env.SERIAL_DISABLED !== '1') {
    const connect = () => { if (!port.isOpen && !port.opening) port.open(error => { if (error) publish('estado', status()); }); };
    connect();
    setInterval(connect, 5000).unref();
  }
  const httpPort = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const server = app.listen(httpPort, host, () => console.log(`Panel RFID: http://${host}:${server.address().port}`));
}).catch(error => { console.error(error); process.exit(1); });
