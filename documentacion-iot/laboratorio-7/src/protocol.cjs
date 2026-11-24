const { randomUUID } = require('node:crypto');
const DEVICE = /^[a-zA-Z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function topics(device) {
  if (!DEVICE.test(device)) throw new Error('Dispositivo inválido');
  const base = `asistencia/v1/dispositivos/${device}`;
  return { readings: `${base}/lecturas`, commands: `${base}/comandos`, results: `${base}/resultados`, state: `${base}/estado`, alerts: 'asistencia/v1/seguridad/avisos' };
}
function parseSerial(line, device, now = Date.now()) {
  if (typeof line !== 'string' || line.length > 160) throw new Error('Línea serial inválida');
  const fields = line.trim().split(',');
  const help = fields[0] === 'AYUDA';
  if ((help ? fields.length !== 4 || !UUID.test(fields[3]) : fields.length !== 3) || !['ACCESO','AYUDA'].includes(fields[0]) || !/^(?:[0-9a-f]{2}){4,10}$/i.test(fields[1]) || !fields[2] || /[\x00-\x1f]/.test(fields[2])) throw new Error('Formato serial inválido');
  topics(device);
  return { schema: 1, event_id: help ? fields[3] : randomUUID(), ...(help?{assistance_only:true}:{}), device_id: device, uid: fields[1].toUpperCase(), device_time_raw: fields[2], received_at: new Date(now).toISOString() };
}
function reading(value, device, now = Date.now()) {
  if (!value || (value.assistance_only !== undefined && typeof value.assistance_only !== 'boolean') || value.schema !== 1 || !UUID.test(value.event_id) || value.device_id !== device || !/^(?:[0-9A-F]{2}){4,10}$/.test(value.uid) || typeof value.device_time_raw !== 'string' || value.device_time_raw.length > 80) throw new Error('Evento inválido');
  const time = Date.parse(value.received_at);
  if (!Number.isFinite(time) || time > now + 1000 || now - time > 10000) throw new Error('Evento fuera de vigencia');
  return value;
}
function serialCommand(value, device, now = Date.now()) {
  if (!value || !UUID.test(value.command_id) || !UUID.test(value.event_id) || value.device_id !== device || !['CONCEDIDO', 'ABRIR'].includes(value.action) || ![1, 2].includes(value.relay)) throw new Error('Comando inválido');
  const issued = Date.parse(value.issued_at), expires = Date.parse(value.expires_at);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now + 1000 || expires <= now || expires <= issued || expires - issued > 5000) throw new Error('Comando vencido o inválido');
  return `${value.action},${value.relay}\n`;
}
// Bounded framing: discard an oversized frame through its newline, then recover.
class LineBuffer {
  constructor(consume) { this.consume = consume; this.buffer = ''; this.discard = false; }
  push(chunk) {
    for (const char of chunk.toString()) {
      if (char === '\n') {
        if (!this.discard && this.buffer) this.consume(this.buffer.replace(/\r$/, ''));
        this.buffer = ''; this.discard = false;
      } else if (!this.discard) {
        this.buffer += char;
        if (this.buffer.length > 160) { this.buffer = ''; this.discard = true; }
      }
    }
  }
}
module.exports = { topics, parseSerial, reading, serialCommand, LineBuffer, UUID };
