const fs = require('node:fs');
const mqtt = require('mqtt');
function connect(role, { clientId } = {}) {
  const url = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883';
  const parsed = new URL(url);
  if (!['mqtt:', 'mqtts:'].includes(parsed.protocol)) throw new Error('Protocolo MQTT inválido');
  if (parsed.protocol === 'mqtt:' && !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) throw new Error('Utiliza mqtts fuera del equipo local');
  const prefix = role.toUpperCase();
  const username = process.env[`${prefix}_MQTT_USERNAME`], password = process.env[`${prefix}_MQTT_PASSWORD`];
  if (!username || !password) throw new Error(`Faltan credenciales MQTT de ${role}`);
  const client = mqtt.connect(url, {
    clientId: clientId || `${role}-${process.env.DEVICE_ID || 'entrada-01'}`, username, password,
    protocolVersion: 4, clean: true, reconnectPeriod: 2000, connectTimeout: 5000,
    queueQoSZero: false, resubscribe: false,
    ...(process.env.MQTT_CA_FILE ? { ca: fs.readFileSync(process.env.MQTT_CA_FILE) } : {}),
  });
  client.on('error', error => console.error(`[${role}] MQTT: ${error.message}`));
  client.on('offline',()=>console.log(`MQTT_DISCONNECTED ${role}`));
  return client;
}
function publish(client, topic, payload) {
  if (!client.connected) return Promise.reject(new Error('MQTT desconectado; no se encola la operación'));
  return client.publishAsync(topic, JSON.stringify(payload), { qos: 1, retain: false });
}
module.exports = { connect, publish };
