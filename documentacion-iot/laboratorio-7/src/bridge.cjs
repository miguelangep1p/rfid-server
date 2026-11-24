const { SerialPort } = require('serialport');
const readline = require('node:readline');
const { topics, parseSerial, serialCommand, LineBuffer } = require('./protocol.cjs');
const { connect, publish } = require('./client.cjs');
const {initialNode,updateNode}=require('./node-status.cjs');
const device = process.env.DEVICE_ID || 'entrada-01', t = topics(device);
const simulated = process.env.SERIAL_SIMULATED === '1';
const client = connect('bridge');
const port = simulated ? null : new SerialPort({ path: process.env.SERIAL_PATH || 'COM3', baudRate: Number(process.env.SERIAL_BAUD_RATE || 9600), autoOpen: false });
// A restart creates a new epoch: commands issued before it cannot be replayed.
const started = Date.now(), seen = new Map();
let subscribed = false, busy = false;
let node=initialNode();
function state() {
  console.log(`BRIDGE_STATE ${JSON.stringify({connected:simulated || port.isOpen,simulated,node})}`);
  return publish(client, t.state, { device_id: device, connected: simulated || port.isOpen, simulated, timestamp: new Date().toISOString() }).catch(e => console.error(e.message));
}
client.on('offline', () => { subscribed = false; });
client.on('connect', async () => {
  try {
    const grants = await client.subscribeAsync(t.commands, { qos: 1 });
    if (grants.some(g => g.qos === 128)) throw new Error('Suscripción de comandos denegada');
    subscribed = true; await state();
    console.log(`Puente preparado (${simulated ? 'SIMULADO' : 'SERIAL'}), dispositivo ${device}`);
  } catch (error) { console.error(error.message); }
});
async function onLine(line) {
  try {
    const diagnostic=updateNode(node,line);
    if(diagnostic){node=diagnostic;console.log(`[Arduino] ${line}`);await state();return;}
    if(!line.startsWith('ACCESO,')&&!line.startsWith('AYUDA,')){console.log(`[Arduino] ${line}`);return;}
    if (!subscribed) throw new Error('Puente no preparado; lectura descartada');
    await publish(client, t.readings, parseSerial(line, device));
  } catch (error) { console.error(`Lectura descartada: ${error.message}`); }
}
if (simulated) readline.createInterface({ input: process.stdin }).on('line', onLine);
else {
  const framer = new LineBuffer(onLine);
  port.on('data', chunk => framer.push(chunk));
  port.on('open',()=>{node=initialNode();state()}); port.on('close',()=>{node=initialNode();state()});
  port.on('error', error => console.error(`Serial: ${error.message}`));
  const open = () => { if (!port.isOpen && !port.opening) port.open(error => { if (error) console.error(`No se abrió serial: ${error.message}`); }); };
  open(); setInterval(open, 3000).unref();
}
client.on('message', async (topic, buffer, packet) => {
  if (topic !== t.commands || packet.retain || buffer.length > 2048) return;
  try {
    const command = JSON.parse(buffer);
    if(command.type==='assistance_status'){
      const {UUID}=require('./protocol.cjs');
      if(!UUID.test(command.event_id)||!UUID.test(command.solicitud_id)||command.device_id!==device||!['solicitada','recibida','aceptada','en_atencion','atendida','cancelada'].includes(command.state)||Date.parse(command.expires_at)<=Date.now()||!Number.isFinite(Date.parse(command.expires_at))||Date.parse(command.expires_at)>Date.now()+5000)throw new Error('Estado de asistencia inválido');
      const feedback=`ASISTENCIA,${command.event_id},${command.state}\n`;
      if(simulated)console.log(`[SIMULADO] ${feedback.trim()}`);
      else if(port.isOpen)await new Promise((resolve,reject)=>port.write(feedback,e=>e?reject(e):resolve()));
      else throw new Error('Serial desconectado; indicar canal alternativo');
      return;
    }
    const line = serialCommand(command, device);
    for (const [key, expires] of seen) if (expires <= Date.now()) seen.delete(key);
    if (Date.parse(command.issued_at) < started || seen.has(command.command_id)) return;
    if (busy || (!simulated && !port.isOpen)) throw new Error('Relé ocupado o serial desconectado');
    // Mark before write: failures cannot cause an automatic retry of an opening.
    seen.set(command.command_id, Date.parse(command.expires_at));
    busy = true; setTimeout(() => { busy = false; }, 3000).unref();
    if (simulated) console.log(`[SIMULADO, sin apertura física] ${line.trim()}`);
    else await new Promise((resolve, reject) => port.write(line, error => error ? reject(error) : port.drain(error => error ? reject(error) : resolve())));
    await publish(client, t.results, { command_id: command.command_id, event_id: command.event_id, device_id: device, status: simulated ? 'simulated' : 'serial_write_completed', physical_open: null });
  } catch (error) { console.error(`Orden descartada: ${error.message}`); }
});
function stop() { client.end(true); if (port?.isOpen) port.close(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
