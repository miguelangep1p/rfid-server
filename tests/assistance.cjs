const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {recommend,transition,initial}=require('../documentacion-iot/laboratorio-7/src/assistance.cjs');
const {parseSerial,reading}=require('../documentacion-iot/laboratorio-7/src/protocol.cjs');
test('Tramas del firmware AVR conservan identidad y admiten fallo de RTC sin abrir acceso',()=>{
 const {LineBuffer}=require('../documentacion-iot/laboratorio-7/src/protocol.cjs');
 const frames=[];
 const framer=new LineBuffer(line=>frames.push(parseSerial(line,'entrada-01')));
 const line='AYUDA,74D81506,RTC_NO_VALIDO,554e5401-0000-4000-8000-000100000001\r\n';
 for(const fragment of [line.slice(0,12),line.slice(12,45),line.slice(45),line])framer.push(fragment);
 assert.equal(frames.length,2);assert.equal(frames[0].event_id,frames[1].event_id);
 assert.equal(frames[0].assistance_only,true);assert.equal(frames[0].device_time_raw,'RTC_NO_VALIDO');
 assert.equal(reading(frames[0],'entrada-01').uid,'74D81506');
});
for(const [name,input,expected] of [
 ['inicial',{state:'solicitada',wait:0},'notificar_guardia'],
 ['antes del umbral',{state:'recibida',wait:59},'notificar_guardia'],
 ['sin agente',{state:'solicitada',wait:60,available:false},'avisar_responsable_alterno'],
 ['umbral',{state:'recibida',wait:60},'recordar_y_escalar'],
 ['aceptada',{state:'aceptada',wait:70},'mantener_seguimiento'],
 ['desconexión',{state:'aceptada',wait:70,connected:false},'canal_alternativo'],
 ['duplicado',{state:'solicitada',wait:0,duplicate:true,connected:false},'ignorar_duplicado'],
 ['atendida',{state:'atendida',wait:70,duplicate:true},'sin_accion'],
 ['cancelada',{state:'cancelada',wait:0,connected:false},'sin_accion'],
])test(`Reglas: ${name}`,()=>assert.equal(recommend(input),expected));
test('Reglas rechazan estado inválido',()=>assert.throws(()=>recommend({state:'abierta',wait:0})));
test('Reglas rechazan tiempo negativo',()=>assert.throws(()=>recommend({state:'solicitada',wait:-1})));
test('Recepción y aceptación no acreditan llegada; cierre exige secuencia y conserva actor',()=>{
 let p=initial({event_id:randomUUID(),device_id:'entrada-01'});
 assert.throws(()=>transition(p,'atendida','Agente'),{status:409});
 p=transition(p,'recibida','Agente');p=transition(p,'aceptada','Agente');
 assert.equal(p.arrived_at,undefined);assert.equal(p.closed_at,undefined);
 assert.throws(()=>transition(p,'aceptada','Segundo agente'),{status:409});
 p=transition(p,'en_atencion','Agente');p=transition(p,'atendida','Agente');
 assert.equal(p.history.length,5);assert.equal(p.agent,'Agente');assert.ok(p.arrived_at);assert.ok(p.closed_at);
 assert.throws(()=>transition(p,'recibida','Agente'),{status:409});
});
test('Cancelación exige motivo y no permite reactivar',()=>{
 const p=initial({event_id:randomUUID(),device_id:'entrada-01'});
 assert.throws(()=>transition(p,'cancelada','Agente',''),{status:400});
 const c=transition(p,'cancelada','Agente','Usuario retira solicitud');
 assert.equal(c.history[1].reason,'Usuario retira solicitud');
 assert.throws(()=>transition(c,'recibida','Agente'),{status:409});
});
test('AYUDA conserva event_id en retransmisión, distingue acceso y valida formato',()=>{
 const id=randomUUID(),line=`AYUDA,AABBCCDD,2026-10-27T10:00:00-05:00,${id}`;
 const a=parseSerial(line,'entrada-01'),b=parseSerial(line,'entrada-01');
 assert.equal(a.event_id,b.event_id);assert.equal(a.assistance_only,true);assert.equal(reading(a,'entrada-01').event_id,id);
 assert.equal(parseSerial('ACCESO,AABBCCDD,fecha','entrada-01').assistance_only,undefined);
 assert.throws(()=>parseSerial('AYUDA,AABBCCDD,fecha,invalido','entrada-01'));
 assert.throws(()=>reading({...a,assistance_only:'true'},'entrada-01'));
});
