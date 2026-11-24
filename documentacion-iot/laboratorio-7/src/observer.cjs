const { connect } = require('./client.cjs');
const { topics } = require('./protocol.cjs');
const topic = topics(process.env.DEVICE_ID || 'entrada-01').alerts;
const client = connect('observer');
client.on('connect', async () => {
  try {
    const grants = await client.subscribeAsync(topic,{qos:1});
    if (grants.some(g => g.qos === 128)) throw new Error('Suscripción denegada');
    console.log('Observador de avisos conectado. Solo consola, sin confirmación del guardia.');
  } catch (error) { console.error(error.message); }
});
client.on('message',(name,buffer,packet) => {
  if (name !== topic || packet.retain || buffer.length > 4096) return;
  try {
    const value = JSON.parse(buffer);
    if (value.type !== 'asistencia_solicitada') return;
    console.log(JSON.stringify({ received_at:new Date().toISOString(), ...value }));
  } catch { console.error('Aviso inválido'); }
});
process.on('SIGINT',() => client.end(true));
