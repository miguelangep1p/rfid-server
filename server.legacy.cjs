const express = require('express');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const DB_PATH = './accesos.db';
let db;

// ─── Guardar BD en disco ──────────────────────────────────
function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ─── Helpers para queries ─────────────────────────────────
function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
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
const port = new SerialPort({ path: 'COM3', baudRate: 9600 });
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
  console.log(`[${timestamp}] ${uid} (${nombre}) → ${resultado} [Relay ${usuario?.relay ?? '-'}]`);
});

port.on('error', (err) => console.error('Error serial:', err.message));

// ─── API ──────────────────────────────────────────────────

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
  const relay = req.body.relay || 1;
  port.write(`ABRIR,${relay}\n`, (err) => {
    if (err) return res.status(500).json({ error: 'No se pudo enviar comando' });
    const ts = new Date().toLocaleString('es-PE', { hour12: false });
    run("INSERT INTO accesos VALUES (NULL,?,?,?,?)", ['REMOTO', ts, 'CONCEDIDO', `Acceso Remoto Relay ${relay}`]);
    res.json({ ok: true });
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── Iniciar servidor después de cargar BD ────────────────
initSqlJs().then(SQL => {
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

  app.listen(3000, () => console.log('✅ Servidor en http://localhost:3000'));
});