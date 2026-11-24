// Explicit seed utility for lab credentials, not a migration of accesos.db.
const { Pool } = require('pg');
const [uid,name,relayText,assistance,validFromText] = process.argv.slice(2);
const relay = Number(relayText), date = new Date(validFromText);
if (!/^(?:[0-9A-F]{2}){4,10}$/.test(uid || '') || !name || ![1,2].includes(relay) || !['true','false'].includes(assistance) || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(validFromText || '') || !Number.isFinite(date.getTime())) {
  throw new Error('Uso: npm run iot:card -- UID "Nombre de prueba" 1 true INICIO_ISO_CON_ZONA. Vigencia: 3 horas desde el inicio explícito.');
}
const { topics } = require('./protocol.cjs');
const device = process.env.DEVICE_ID || 'entrada-01'; topics(device);
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
const pool = new Pool({connectionString:process.env.DATABASE_URL});
(async () => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('INSERT INTO access_control.cards(uid,name,assistance_requested) VALUES($1,$2,$3) ON CONFLICT(uid) DO UPDATE SET name=$2,assistance_requested=$3,active=true',[uid,name,assistance === 'true']);
    await db.query('UPDATE access_control.permissions SET revoked_at=now() WHERE uid=$1 AND device_id=$2 AND revoked_at IS NULL',[uid,device]);
    const {rows} = await db.query(`INSERT INTO access_control.permissions(uid,device_id,relay,valid_from,valid_until)
      VALUES($1,$2,$3,$4,$4::timestamptz + interval '3 hours') RETURNING id,valid_from,valid_until`,[uid,device,relay,date.toISOString()]);
    await db.query('COMMIT'); console.log(rows[0]);
  } catch(error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); await pool.end(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
