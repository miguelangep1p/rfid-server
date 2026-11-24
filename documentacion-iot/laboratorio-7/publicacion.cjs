// Separate publisher, equivalent to the publisher exercise in guide 7.
const { connect, publish } = require('./src/client.cjs');
const { parseSerial, topics } = require('./src/protocol.cjs');
const { randomUUID } = require('node:crypto');
const uid = process.argv[2];
if (!uid) throw new Error('Uso: npm run iot:publish -- UID_HEXADECIMAL');
const device = process.env.DEVICE_ID || 'entrada-01';
const value = parseSerial(`ACCESO,${uid},ensayo_publicador`, device);
const client = connect('bridge', {clientId:`publisher-${randomUUID()}`});
const timer = setTimeout(() => { console.error('Tiempo de conexión agotado'); client.end(true); process.exitCode=1; },10000);
client.once('connect',async () => {
  try { await publish(client,topics(device).readings,value); console.log(JSON.stringify(value,null,2)); }
  catch(error) { console.error(error.message); process.exitCode=1; }
  finally { clearTimeout(timer); client.end(true); }
});
