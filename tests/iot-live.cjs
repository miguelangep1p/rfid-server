// Real EMQX/PostgreSQL test. Serial endpoint is explicitly simulated.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {randomBytes,randomUUID} = require('node:crypto');
const {once} = require('node:events');
const mqtt = require('mqtt');
const {Pool} = require('pg');
const {Repository} = require('../documentacion-iot/laboratorio-7/src/repository.cjs');
const {parseSerial,topics} = require('../documentacion-iot/laboratorio-7/src/protocol.cjs');
const enabled=process.env.IOT_INTEGRATION==='1';
test('EMQX + PostgreSQL: decisión, aviso, serial simulado, ACL y expiración', {skip:!enabled,timeout:60000},async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 const admin=new Pool({host:'127.0.0.1',port:55432,database:'asistencia',user:'iot_owner',password:process.env.POSTGRES_PASSWORD});
 const device='entrada-01', uid=randomBytes(4).toString('hex').toUpperCase();
 const processes=[],clients=[]; const eventIds=[];
 async function start(file,ready){
  const child=spawn(process.execPath,[`documentacion-iot/laboratorio-7/src/${file}.cjs`],{env:{...process.env,SERIAL_SIMULATED:'1'},stdio:['pipe','pipe','pipe']});processes.push(child);
  let output=''; child.stdout.on('data',b=>{output+=b});child.stderr.on('data',b=>{output+=b});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(output||'Servicio no preparado')),15000);const onData=()=>{if(output.includes(ready)){clearTimeout(timer);resolve()}};child.stdout.on('data',onData);child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Servicio terminó ${code}: ${output}`))})});
  return {child,output:()=>output};
 }
 async function connect(role,override={}){
  const client=mqtt.connect(process.env.MQTT_URL,{clientId:`test-${randomUUID()}`,username:process.env[`${role}_MQTT_USERNAME`],password:process.env[`${role}_MQTT_PASSWORD`],reconnectPeriod:0,connectTimeout:3000,...override});clients.push(client);
  await once(client,'connect');return client;
 }
 try{
  await pool.query('INSERT INTO access_control.cards(uid,name,assistance_requested) VALUES($1,$2,true)',[uid,'Prueba automatizada']);
  await pool.query("INSERT INTO access_control.permissions(uid,device_id,relay,valid_from,valid_until) VALUES($1,$2,2,now()-interval '1 minute',now()-interval '1 minute'+interval '3 hours')",[uid,device]);
  const observer=await connect('OBSERVER');await observer.subscribeAsync(topics(device).alerts,{qos:1});
  await start('validator','Validador preparado');const bridge=await start('bridge','Puente preparado');
  const alertPromise=once(observer,'message');bridge.child.stdin.write(`ACCESO,${uid},fecha_prueba\n`);
  const [,payload]=await alertPromise;const alert=JSON.parse(payload);eventIds.push(alert.event_id);
  assert.equal(alert.type,'asistencia_solicitada');assert.equal(alert.decision,'CONCEDIDO');
  let row;
  for(let i=0;i<50;i++){
   const result=await pool.query('SELECT status FROM access_control.commands WHERE event_id=$1',[alert.event_id]);row=result.rows[0];
   if(row?.status==='simulated') break;
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(row.status,'simulated');assert.match(bridge.output(),/sin apertura física/);
  const repo=new Repository(pool);const duplicate=await repo.decide({...parseSerial(`ACCESO,${uid},fecha_prueba`,device),event_id:alert.event_id});assert.equal(duplicate.duplicate,true);
  await pool.query("UPDATE access_control.permissions SET valid_from=now()-interval '3 hours',valid_until=now() WHERE uid=$1",[uid]);
  const e=parseSerial(`ACCESO,${uid},fecha_prueba`,device);eventIds.push(e.event_id);
  const denied=await repo.decide(e);assert.equal(denied.decision,'DENEGADO');assert.equal(denied.command,undefined);assert.ok(denied.alert);
  const help=parseSerial(`AYUDA,FFFFFFFF,fecha_prueba,${randomUUID()}`,device);eventIds.push(help.event_id);
  const helpOutcome=await repo.decide(help);assert.equal(helpOutcome.command,undefined);assert.ok(helpOutcome.alert);
  assert.equal((await repo.decide(help)).duplicate,true);
  const assistance=require('../documentacion-iot/laboratorio-7/src/assistance.cjs');
  const id=helpOutcome.alert.notification_id;
  await assistance.update(pool,id,device,'recibida','Agente A','');
  const competing=await Promise.allSettled(['Agente A','Agente B'].map(actor=>assistance.update(pool,id,device,'aceptada',actor,'')));
  assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(competing.find(r=>r.status==='rejected').reason.status,409);
  let persisted=(await pool.query('SELECT payload FROM access_control.notifications WHERE notification_id=$1',[id])).rows[0].payload;
  assert.equal(persisted.arrived_at,undefined);assert.equal(persisted.closed_at,undefined);
  await assistance.update(pool,id,device,'en_atencion',persisted.agent,'');
  await assistance.update(pool,id,device,'atendida',persisted.agent,'');
  await assert.rejects(()=>assistance.update(pool,id,device,'recibida','Agente A',''),{status:409});
  await assistance.evaluate(pool,device,true,true);
  await assistance.evaluate(pool,device,true,true);
  const ruleRow=(await pool.query('SELECT payload FROM access_control.notifications WHERE notification_id=$1',[alert.notification_id])).rows[0].payload;
  assert.equal(ruleRow.rule_history.filter(r=>r.action==='notificar_guardia').length,1);
  const invalid=mqtt.connect(process.env.MQTT_URL,{clientId:`bad-${randomUUID()}`,username:process.env.BRIDGE_MQTT_USERNAME,password:'wrong',reconnectPeriod:0,connectTimeout:3000});clients.push(invalid);
  const [authError]=await once(invalid,'error');assert.ok(authError);
  const rogue=await connect('OBSERVER');rogue.on('error',()=>{});const close=once(rogue,'close');
  rogue.publish(topics(device).commands,'{}',{qos:0});await close;
 } finally{
  for(const c of clients)c.end(true);
  for(const child of processes){if(child.exitCode===null){const ended=once(child,'exit');child.kill();await ended}}
  for(const table of ['notifications','commands','events']) if(eventIds.length) await admin.query(`DELETE FROM access_control.${table} WHERE event_id=ANY($1::uuid[])`,[eventIds]);
  await admin.query('DELETE FROM access_control.permissions WHERE uid=$1',[uid]);await admin.query('DELETE FROM access_control.cards WHERE uid=$1',[uid]);await pool.end();await admin.end();
 }
});
