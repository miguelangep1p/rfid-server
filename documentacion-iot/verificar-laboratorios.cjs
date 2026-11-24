const fs = require('node:fs');
const path = require('node:path');
const {spawn,spawnSync} = require('node:child_process');
const {randomUUID,randomBytes} = require('node:crypto');
const assert = require('node:assert/strict');
const mqtt = require('mqtt');
const {Pool} = require('pg');
const {parseSerial,topics,serialCommand} = require('./laboratorio-7/src/protocol.cjs');
const {Repository} = require('./laboratorio-7/src/repository.cjs');
const root = path.resolve(__dirname,'..');
const labs=process.argv.includes('--include-8')?[6,7,8]:[6,7];
process.chdir(root);
process.loadEnvFile(path.join(__dirname,'laboratorio-6/.env.local'));
const runId=randomUUID(), uid=randomBytes(4).toString('hex').toUpperCase(), device='entrada-01';
const evidence={run_id:runId,date_local:'2026-10-24',started_at:new Date().toISOString(),timezone:'America/Lima',mode:'Real EMQX/PostgreSQL; serial simulado; sin participantes',cases:[],traces:[]};
const children=[], clients=[];
const admin=new Pool({host:'127.0.0.1',port:55432,user:'iot_owner',password:process.env.POSTGRES_PASSWORD,database:'asistencia',connectionTimeoutMillis:5000});
const app=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
function redact(s) {
  for(const [k,v] of Object.entries(process.env)) if(/PASSWORD|COOKIE|DATABASE_URL/.test(k) && v) s=s.split(v).join('[REDACTADO]');
  return s;
}
function command(exe,args) {
  const r=spawnSync(exe,args,{encoding:'utf8',timeout:120000,windowsHide:true});
  if(r.status!==0) throw new Error(redact(r.stderr || r.stdout || r.error?.message || `${exe} falló`));
  return redact(r.stdout.trim());
}
async function check(lab,id,description,fn) {
  if(!labs.includes(lab))return;
  try { const detail=await fn();evidence.cases.push({lab,id,description,status:'APROBADO',detail});console.log(`${id}: APROBADO`);return detail; }
  catch(error) {evidence.cases.push({lab,id,description,status:'FALLO',detail:redact(error.message)});throw error;}
}
function timeout(promise,ms=8000,label='Operación') {
  let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}: tiempo agotado`)),ms)})]).finally(()=>clearTimeout(timer));
}
async function connect(role,url=process.env.MQTT_URL,overrides={}) {
  const c=mqtt.connect(url,{username:process.env[`${role}_MQTT_USERNAME`],password:process.env[`${role}_MQTT_PASSWORD`],clientId:`evidence-${randomUUID()}`,reconnectPeriod:0,connectTimeout:4000,...overrides});clients.push(c);
  c.on('error',()=>{});
  await timeout(new Promise((resolve,reject)=>{c.once('connect',resolve);c.once('error',reject)}),6000,'Conexión MQTT');return c;
}
function message(c,topic,predicate=()=>true) {
  return timeout(new Promise(resolve=>{
    const listener=(name,buffer)=>{if(name!==topic)return;const value=JSON.parse(buffer);if(predicate(value)){c.removeListener('message',listener);resolve(value)}};
    c.on('message',listener);
  }),8000,'Recepción de mensaje');
}
async function start(name,ready) {
  const child=spawn(process.execPath,[`documentacion-iot/laboratorio-7/src/${name}.cjs`],{cwd:root,env:{...process.env,SERIAL_SIMULATED:'1'},stdio:['pipe','pipe','pipe'],windowsHide:true});children.push(child);
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  await timeout(new Promise((resolve,reject)=>{child.stdout.on('data',()=>{if(output.includes(ready))resolve()});child.once('exit',()=>reject(new Error(redact(output))))}),15000,`Inicio ${name}`);
  return {child,output:()=>output};
}
async function deniedPublish(c,topic) {
 const closed=timeout(new Promise(resolve=>c.once('close',resolve)),5000,'Rechazo ACL');c.publish(topic,'{}',{qos:0});await closed;
 return 'El bróker desconectó al cliente por publicación no autorizada.';
}
async function main() {
 await check(6,'L6-01','Docker y motor Linux',()=>command('docker',['version','--format','{{.Server.Version}}'])+'\n'+command('docker',['info','--format','{{.OSType}}']));
 await check(6,'L6-02','Contenedor hello-world',()=>command('docker',['run','--rm','hello-world']));
 await check(6,'L6-03','Servicios y versión EMQX',()=>command('docker',['ps','--filter','name=asistencia-iot-labs','--format','{{.Names}} | {{.Status}}'])+'\n'+command('docker',['exec','asistencia-iot-labs-emqx-1','/opt/emqx/bin/emqx','ctl','status']));
 await check(6,'L6-04','PostgreSQL y esquema aplicado',async()=>({version:(await admin.query('SELECT version()')).rows[0].version,tables:(await admin.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('access_control','mqtt_security') ORDER BY 1,2")).rows}));
 await check(6,'L6-05','Validación del protocolo sin hardware',()=>command(process.execPath,['--test','tests/iot-protocol.cjs']));
 await check(8,'L8-01','Roles PostgreSQL separados',async()=>(await admin.query("SELECT rolname,rolsuper FROM pg_roles WHERE rolname IN ('iot_app','mqtt_reader') ORDER BY rolname")).rows);
 await check(8,'L8-02','Usuarios y reglas sin exponer credenciales',async()=>({users:(await admin.query('SELECT username,active,is_superuser FROM mqtt_security.mqtt_user ORDER BY username')).rows,acl:(await admin.query('SELECT username,permission,action,topic FROM mqtt_security.mqtt_acl ORDER BY username,action,topic')).rows}));
 const observer=await connect('OBSERVER');
 await check(8,'L8-03','Autenticación válida de observador',async()=> 'CONNACK aceptado con credencial de observador.');
 await observer.subscribeAsync(topics(device).alerts,{qos:1});
 await check(8,'L8-04','Contraseña MQTT incorrecta',async()=>{
   await assert.rejects(connect('BRIDGE',process.env.MQTT_URL,{password:'incorrecta-ensayo'}));return 'Conexión rechazada; no se usó una tarjeta física.';
 });
 await check(8,'L8-05','Observador no publica comandos',async()=>deniedPublish(await connect('OBSERVER'),topics(device).commands));
 await check(8,'L8-06','Puente no publica comandos',async()=>deniedPublish(await connect('BRIDGE'),topics(device).commands));
 await check(8,'L8-07','Puente no se suscribe a otro dispositivo',async()=>{
   const c=await connect('BRIDGE');
   const result=await timeout(new Promise(resolve=>{
     c.once('close',()=>resolve('disconnect'));
     c.subscribe('asistencia/v1/dispositivos/entrada-02/comandos',{qos:1},(error,grants)=>{if(error || grants?.some(g=>g.qos===128))resolve('denied')});
   }),5000);
   assert.ok(['disconnect','denied'].includes(result));return result;
 });
 await check(7,'L7-01','MQTT sobre WebSocket en listener 8083',async()=>{
   const sub=await connect('OBSERVER','ws://127.0.0.1:8083/mqtt');await sub.subscribeAsync(topics(device).alerts,{qos:1});
   const pub=await connect('VALIDATOR');const value={type:'ensayo_websocket',run_id:runId};const received=message(sub,topics(device).alerts,v=>v.run_id===runId);
   await pub.publishAsync(topics(device).alerts,JSON.stringify(value),{qos:1,retain:false});assert.deepEqual(await received,value);sub.end(true);pub.end(true);
   return {topic:topics(device).alerts,payload:value,received:true};
 });
 await app.query('INSERT INTO access_control.cards(uid,name,assistance_requested) VALUES($1,$2,true)',[uid,`Ensayo documental ${runId}`]);
 await app.query("INSERT INTO access_control.permissions(uid,device_id,relay,valid_from,valid_until) VALUES($1,$2,2,now()-interval '1 minute',now()-interval '1 minute'+interval '3 hours')",[uid,device]);
 await start('validator','Validador preparado');const bridge=await start('bridge','Puente preparado');
 let eventId;
 await check(7,'L7-02','Flujo serial simulado a MQTT, decisión y aviso',async()=>{
   const received=message(observer,topics(device).alerts,v=>v.type==='asistencia_solicitada');
   bridge.child.stdin.write(`ACCESO,${uid},fecha_simulada\n`);const alert=await received;eventId=alert.event_id;
   assert.equal(alert.decision,'CONCEDIDO');evidence.traces.push({kind:'notification',value:alert});return alert;
 });
 await check(7,'L7-03','Registro de comando simulado para relé 2',async()=>{
   let row;
   for(let i=0;i<50;i++){row=(await app.query('SELECT command_id,payload,status,result FROM access_control.commands WHERE event_id=$1',[eventId])).rows[0];if(row?.status==='simulated')break;await new Promise(r=>setTimeout(r,100))}
   assert.equal(row.status,'simulated');assert.equal(row.payload.relay,2);assert.equal(row.result.physical_open,null);return row;
 });
 const repo=new Repository(app);
 await check(7,'L7-04','Evento duplicado no crea nueva orden',async()=>{
   assert.equal((await repo.decide({...parseSerial(`ACCESO,${uid},fecha_simulada`,device),event_id:eventId})).duplicate,true);
   const count=(await app.query('SELECT count(*)::int AS n FROM access_control.commands WHERE event_id=$1',[eventId])).rows[0].n;assert.equal(count,1);return {commands:count};
 });
 await check(7,'L7-05','Publicador independiente y tarjeta desconocida sin comando',async()=>{
   const e=JSON.parse(command(process.execPath,['documentacion-iot/laboratorio-7/publicacion.cjs',randomBytes(8).toString('hex')]));
   let out;
   for(let i=0;i<50;i++){
     out=(await app.query('SELECT decision FROM access_control.events WHERE event_id=$1',[e.event_id])).rows[0];
     if(out)break;await new Promise(resolve=>setTimeout(resolve,100));
   }
   assert.equal(out.decision,'DENEGADO');
   assert.equal((await app.query('SELECT count(*)::int AS n FROM access_control.commands WHERE event_id=$1',[e.event_id])).rows[0].n,0);
   // Remove only this exact isolated event; it has no command/notification children.
   await admin.query('DELETE FROM access_control.events WHERE event_id=$1',[e.event_id]);return {publisher_payload:e,decision:out.decision,commands:0};
 });
 await check(7,'L7-06','Comando vencido rechazado por protocolo',()=>{
   const now=Date.now();assert.throws(()=>serialCommand({command_id:randomUUID(),event_id:randomUUID(),device_id:device,action:'CONCEDIDO',relay:2,issued_at:new Date(now-5000).toISOString(),expires_at:new Date(now).toISOString()},device,now));return 'No se escribe al serial; comprobación de parser, no medición física.';
 });
 await check(8,'L8-08','Límite temporal semiabierto y duración de 3 horas',async()=>{
   const result=(await app.query("SELECT ($1::timestamptz >= $1::timestamptz AND $1::timestamptz < $1::timestamptz+interval '3 hours') AS at_start, ($1::timestamptz+interval '3 hours' < $1::timestamptz+interval '3 hours') AS at_end",['2026-10-24T09:00:00-05:00'])).rows[0];
   assert.equal(result.at_start,true);assert.equal(result.at_end,false);
   await app.query("UPDATE access_control.permissions SET valid_from=now()-interval '3 hours',valid_until=now() WHERE uid=$1",[uid]);
   const out=await repo.decide(parseSerial(`ACCESO,${uid},fecha_simulada`,device));assert.equal(out.decision,'DENEGADO');assert.equal(out.command,undefined);assert.ok(out.alert);
   return {boundary_query:result,expired_decision:out.decision,assistance_still_requested:true,real_three_hour_wait:false};
 });
 await check(8,'L8-09','Restricción SQL rechaza duración distinta de 3 horas',async()=>{
   await assert.rejects(app.query("INSERT INTO access_control.permissions(uid,device_id,relay,valid_from,valid_until) VALUES($1,$2,1,now(),now()+interval '2 hours')",[uid,device]),e=>e.code==='23514');return 'CHECK violation 23514 esperado; no se creó permiso inválido.';
 });
 await check(7,'L7-07','Registro del extremo serial simulado',()=>bridge.output());
}
(async()=>{
 try {await main();evidence.status='APROBADO';}
 catch(error){evidence.status='INCOMPLETO';evidence.error=redact(error.message);console.error(evidence.error);process.exitCode=1;}
 finally {
  for(const c of clients)c.end(true);
  for(const child of children)if(child.exitCode===null){await new Promise(resolve=>{child.once('exit',resolve);child.kill()})}
  try {
   for(const table of ['notifications','commands'])await admin.query(`DELETE FROM access_control.${table} WHERE event_id IN (SELECT event_id FROM access_control.events WHERE uid=$1)`,[uid]);
   await admin.query('DELETE FROM access_control.events WHERE uid=$1',[uid]);
   await admin.query('DELETE FROM access_control.permissions WHERE uid=$1',[uid]);
   await admin.query('DELETE FROM access_control.cards WHERE uid=$1',[uid]);
   evidence.cleanup='Datos temporales de este UID de ensayo retirados.';
  }catch(error){evidence.cleanup=redact(error.message);process.exitCode=1}
  await app.end();await admin.end();evidence.finished_at=new Date().toISOString();
  for(const lab of labs){
   const target=path.join(__dirname,`laboratorio-${lab}/evidencias`);fs.mkdirSync(target,{recursive:true});
   const own={...evidence,cases:evidence.cases.filter(c=>c.lab===lab),traces:lab===7?evidence.traces:[]};
   fs.writeFileSync(path.join(target,'verificacion-software.json'),JSON.stringify(own,null,2)+'\n');
  }
 }
})();
