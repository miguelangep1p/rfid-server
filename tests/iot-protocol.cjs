const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {parseSerial,serialCommand,reading,LineBuffer,topics} = require('../documentacion-iot/laboratorio-7/src/protocol.cjs');
const device='entrada-01';
const now=Date.now();
const command=() => ({command_id:randomUUID(),event_id:randomUUID(),device_id:device,action:'CONCEDIDO',relay:2,issued_at:new Date(now).toISOString(),expires_at:new Date(now+5000).toISOString()});
test('Serial fragmentado, CRLF y recuperación tras trama sobredimensionada',() => {
 const lines=[]; const buffer=new LineBuffer(line=>lines.push(line));
 buffer.push('ACCESO,AABB'); buffer.push('CCDD,2026-10-20 09:00:00\r\n');
 buffer.push('x'.repeat(1000)); buffer.push('\nACCESO,11223344,fecha\n');
 assert.equal(lines.length,2); assert.equal(parseSerial(lines[0],device).uid,'AABBCCDD');
 assert.equal(parseSerial(lines[1],device).uid,'11223344');
});
test('Rechaza campos adicionales y UID no hexadecimal',()=>{
 for(const line of ['ACCESO,ZZZZ1234,fecha','ACCESO,AABBCCDD,fecha,extra','ACCESO,AABBCCDD,','OTRO,AABBCCDD,fecha']) assert.throws(()=>parseSerial(line,device));
 assert.throws(()=>topics('entrada/+/comandos'));
});
test('No convierte comandos ambiguos ni índices de relé inválidos',()=>{
 assert.equal(serialCommand(command(),device,now),'CONCEDIDO,2\n');
 for(const patch of [{relay:'2'},{relay:3},{action:'ABRIR,1'},{device_id:'otro'},{command_id:'sin-id'}]) assert.throws(()=>serialCommand({...command(),...patch},device,now));
});
test('Rechaza órdenes vencidas, futuras o de vigencia excesiva',()=>{
 for(const patch of [{expires_at:new Date(now).toISOString()},{issued_at:new Date(now+2000).toISOString()},{expires_at:new Date(now+6000).toISOString()},{expires_at:'invalid'}]) assert.throws(()=>serialCommand({...command(),...patch},device,now));
});
test('Lecturas atrasadas no generan nuevas aperturas tras reconexión',()=>{
 const e=parseSerial('ACCESO,AABBCCDD,fecha',device,now);
 assert.equal(reading(e,device,now),e);
 assert.throws(()=>reading(e,device,now+10001));
 assert.throws(()=>reading({...e,event_id:'malformed'},device,now));
});
