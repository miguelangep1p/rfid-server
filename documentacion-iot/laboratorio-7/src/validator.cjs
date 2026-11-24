const { Pool } = require('pg');
const { topics, reading, UUID } = require('./protocol.cjs');
const { Repository } = require('./repository.cjs');
const { connect, publish } = require('./client.cjs');
const device = process.env.DEVICE_ID || 'entrada-01', t = topics(device);
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
const pool = new Pool({ connectionString:process.env.DATABASE_URL, connectionTimeoutMillis:5000, query_timeout:5000 });
pool.on('error', error => console.error(`PostgreSQL: ${error.message}`));
const repository = new Repository(pool), client = connect('validator');
client.on('connect', async () => {
  try {
    const grants = await client.subscribeAsync([t.readings,t.results], { qos:1 });
    if (grants.some(g => g.qos === 128)) throw new Error('Suscripción denegada');
    console.log(`Validador preparado, dispositivo ${device}`);
  } catch (error) { console.error(error.message); }
});
client.on('message', async (topic, buffer, packet) => {
  if (packet.retain || buffer.length > 4096) return;
  try {
    const value = JSON.parse(buffer);
    if (topic === t.results) {
      if (!UUID.test(value.command_id) || !UUID.test(value.event_id) || value.device_id !== device || !['simulated','serial_write_completed'].includes(value.status)) throw new Error('Resultado inválido');
      await repository.result(value); return;
    }
    if (topic !== t.readings) return;
    const outcome = await repository.decide(reading(value, device));
    if(outcome.alert){
      try{await publish(client,t.commands,{type:'assistance_status',device_id:device,event_id:value.event_id,solicitud_id:outcome.alert.notification_id,state:outcome.alert.assistance_state||'solicitada',expires_at:new Date(Date.now()+5000).toISOString()})}catch(e){console.error('Sin confirmación al nodo:',e.message)}
    }
    if (outcome.duplicate) return;
    if (outcome.command) {
      try {
        if (Date.parse(outcome.command.expires_at) <= Date.now()) throw new Error('Orden vencida');
        await publish(client,t.commands,outcome.command);
        // Do not overwrite a result already received from the bridge.
        await pool.query("UPDATE access_control.commands SET status='mqtt_published' WHERE command_id=$1 AND status='pending'", [outcome.command.command_id]);
      } catch (error) { await repository.commandStatus(outcome.command.command_id,'send_failed'); console.error(error.message); }
    }
    if (outcome.alert) {
      try { await publish(client,t.alerts,outcome.alert); await repository.alertStatus(outcome.alert.notification_id,'mqtt_published'); }
      catch (error) { await repository.alertStatus(outcome.alert.notification_id,'send_failed'); console.error(error.message); }
    }
    console.log(`Decisión registrada: ${outcome.decision}; evento ${value.event_id}`);
  } catch (error) { console.error(`Evento rechazado: ${error.message}`); }
});
async function stop() { client.end(true); await pool.end(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
