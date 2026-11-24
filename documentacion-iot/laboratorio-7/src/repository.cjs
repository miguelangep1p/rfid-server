const {initial}=require('./assistance.cjs');
const { randomUUID } = require('node:crypto');
class Repository {
  constructor(pool) { this.pool = pool; }
  async decide(event) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Serialize duplicate events before reading permissions or creating side effects.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [event.event_id]);
      const existing = await db.query('SELECT event_id FROM access_control.events WHERE event_id=$1', [event.event_id]);
      if (existing.rowCount) {
        const notice=await db.query('SELECT payload FROM access_control.notifications WHERE event_id=$1',[event.event_id]);
        await db.query('COMMIT');return {duplicate:true,alert:notice.rows[0]?.payload};
      }
      const { rows } = await db.query(`SELECT p.*, c.assistance_requested FROM access_control.permissions p
        JOIN access_control.cards c USING(uid) WHERE p.uid=$1 AND p.device_id=$2
        AND c.active AND p.revoked_at IS NULL AND p.valid_from <= now()
        AND (p.valid_until IS NULL OR now() < p.valid_until) ORDER BY p.id DESC LIMIT 1`, [event.uid,event.device_id]);
      const permit = rows[0], decision = permit ? 'CONCEDIDO' : 'DENEGADO';
      await db.query(`INSERT INTO access_control.events(event_id,uid,device_id,device_time_raw,received_at,decision,permission_id)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [event.event_id,event.uid,event.device_id,event.device_time_raw,event.received_at,decision,permit?.id || null]);
      let command, alert;
      if (permit && !event.assistance_only) {
        const now = Date.now();
        command = { command_id: randomUUID(), event_id: event.event_id, device_id: event.device_id, action:'CONCEDIDO', relay:permit.relay, issued_at:new Date(now).toISOString(), expires_at:new Date(now+5000).toISOString() };
        await db.query('INSERT INTO access_control.commands(command_id,event_id,payload) VALUES($1,$2,$3)', [command.command_id,event.event_id,command]);
      }
      // Assistance remains separate from access permission, including denied attempts.
      const card = await db.query('SELECT assistance_requested FROM access_control.cards WHERE uid=$1 AND active', [event.uid]);
      if (event.assistance_only || card.rows[0]?.assistance_requested) {
        alert = initial({...event,decision});
        await db.query('INSERT INTO access_control.notifications(notification_id,event_id,payload) VALUES($1,$2,$3)', [alert.notification_id,event.event_id,alert]);
      }
      await db.query('COMMIT'); return { decision, command, alert };
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  async commandStatus(id, status) { await this.pool.query('UPDATE access_control.commands SET status=$2 WHERE command_id=$1', [id,status]); }
  async alertStatus(id, status) { await this.pool.query("UPDATE access_control.notifications SET status=$2 WHERE notification_id=$1 AND status<>'acknowledged'", [id,status]); }
  async result(value) {
    await this.pool.query(`UPDATE access_control.commands SET status=$2,result=$3
      WHERE command_id=$1 AND event_id=$4 AND payload->>'device_id'=$5`, [value.command_id,value.status,value,value.event_id,value.device_id]);
  }
}
module.exports = { Repository };
