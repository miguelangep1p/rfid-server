const assistance=require('./src/assistance.cjs');
const whatsapp=require('./src/whatsapp.cjs');
const {manualLink}=require('./src/whatsapp-link.cjs');
const express=require('express');
const {Pool}=require('pg');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {randomBytes,randomUUID,createHash,timingSafeEqual}=require('node:crypto');
const {connect,publish}=require('./src/client.cjs');
const {topics,UUID}=require('./src/protocol.cjs');
const root=path.resolve(__dirname,'../..');
const dev=process.argv.includes('--dev');
const web=require('next')({dev,dir:root});
const app=express(), pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:5000});
const device=process.env.DEVICE_ID || 'entrada-01', t=topics(device);
const simulated=process.env.SERIAL_SIMULATED==='1';
let port=Number(process.env.LAB_PORT || process.env.PORT || (process.argv.includes('--main')?3000:3100));
const whatsappConfig=whatsapp.configuration();
if(!process.env.PANEL_PASSWORD || !process.env.DATABASE_URL)throw new Error('Ejecutar iot:panel:setup y comprobar DATABASE_URL.');
const agents=new Map();
const sessions=new Map(), attempts=new Map(), listeners=new Set(), workers=[];
const state={simulated,device_id:device,serial_path:process.env.SERIAL_PATH||'COM3',bridge_ready:false,validator_ready:false,serial_connected:false,node:null,relay_control_enabled:simulated||process.env.SERIAL_RELAYS_ENABLED==='1'};
let sender;
pool.on('error',error=>console.error(`PostgreSQL: ${error.message}`));
let server,stopping=false,lastReading=0,ruleTimer,ruleBusy=false,whatsappTimer,whatsappBusy=false;
function signal(){for(const response of listeners)response.write('event: actualizar\ndata: {}\n\n');}
function equal(a,b){return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());}
function cookie(req){return /(?:^|;\s*)labs_session=([a-f0-9]{48})(?:;|$)/.exec(req.headers.cookie || '')?.[1];}
function authenticated(req){const key=cookie(req),expires=sessions.get(key);if(expires && expires>Date.now())return true;if(key)sessions.delete(key);return false;}
function status(){return {...state,mqtt_connected:sender?.connected||false,ready:state.bridge_ready&&state.validator_ready&&state.serial_connected&&Boolean(sender?.connected)&&(simulated||(state.node?.booted&&state.node.reader_connected&&state.node.identity_ready))};}
app.disable('x-powered-by');
whatsapp.mountWebhook(app,express,pool,whatsappConfig);
app.use(express.json({limit:'8kb'}));
app.use('/api/labs',(req,res,next)=>{
 res.set('Cache-Control','no-store');
 if(!['GET','HEAD'].includes(req.method)){
  const expected=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`]);
  if(!expected.has(req.headers.origin))return res.status(403).json({error:'Origen no autorizado'});
 }
 next();
});
app.get('/api/labs/session',(req,res)=>res.json({authenticated:authenticated(req)}));
app.post('/api/labs/session',(req,res)=>{
 const key=req.ip,now=Date.now(),record=attempts.get(key);
 if(record && now-record.start<300000 && record.count>=10)return res.status(429).json({error:'Demasiados intentos. Intenta de nuevo en cinco minutos.'});
 if(typeof req.body?.password!=='string' || !equal(req.body.password,process.env.PANEL_PASSWORD)){
  attempts.set(key,record && now-record.start<300000?{...record,count:record.count+1}:{start:now,count:1});
  return res.status(401).json({error:'Contraseña incorrecta'});
 }
 if(typeof req.body.agent!=='string'||!req.body.agent.trim()||req.body.agent.length>100)return res.status(400).json({error:'Identifica al agente responsable'});
 attempts.delete(key);for(const [id,expiry]of sessions)if(expiry<=now)sessions.delete(id);
 const token=randomBytes(24).toString('hex');sessions.set(token,now+8*60*60*1000);agents.set(token,req.body.agent.trim());
 res.set('Set-Cookie',`labs_session=${token}; HttpOnly; SameSite=Strict; Path=/api/labs; Max-Age=28800`);
 res.json({ok:true});
});
app.use('/api/labs',(req,res,next)=>authenticated(req)?next():res.status(401).json({error:'Inicia sesión para usar el panel'}));
app.delete('/api/labs/session',(req,res)=>{
 sessions.delete(cookie(req));res.set('Set-Cookie','labs_session=; HttpOnly; SameSite=Strict; Path=/api/labs; Max-Age=0');res.json({ok:true});
});
app.get('/api/labs/snapshot',async(req,res,next)=>{
 try{
  const [cards,events,notifications]=await Promise.all([
   pool.query(`SELECT c.uid,c.name,c.active,c.assistance_requested,p.relay,p.valid_from,p.valid_until,p.revoked_at,
    (c.active AND p.id IS NOT NULL AND p.revoked_at IS NULL AND p.valid_from<=now() AND (p.valid_until IS NULL OR now()<p.valid_until)) AS valid
    FROM access_control.cards c LEFT JOIN LATERAL (SELECT * FROM access_control.permissions WHERE uid=c.uid AND device_id=$1 ORDER BY id DESC LIMIT 1)p ON true ORDER BY c.name`,[device]),
   pool.query(`SELECT e.*,c.name,cmd.status AS command_status,cmd.result FROM access_control.events e
    LEFT JOIN access_control.cards c USING(uid) LEFT JOIN access_control.commands cmd USING(event_id)
    WHERE e.device_id=$1 ORDER BY e.decided_at DESC LIMIT 100`,[device]),
   pool.query(`SELECT notification_id,event_id,payload,status,created_at FROM access_control.notifications
    WHERE payload->>'location'=$1 ORDER BY created_at DESC LIMIT 100`,[device]),
  ]);
  res.json({status:status(),agent:agents.get(cookie(req)),whatsapp:whatsapp.publicConfiguration(whatsappConfig),cards:cards.rows,events:events.rows,notifications:notifications.rows});
 }catch(error){next(error)}
});
app.get('/api/labs/assistance/export',async(req,res,next)=>{
 try{const {rows}=await pool.query("SELECT * FROM access_control.notifications WHERE payload->>'location'=$1 ORDER BY created_at",[device]);res.attachment('historial-asistencia.json').json({exported_at:new Date().toISOString(),device_id:device,requests:rows})}catch(e){next(e)}
});
app.get('/api/labs/events',(req,res)=>{
 res.set({'Content-Type':'text/event-stream',Connection:'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();listeners.add(res);res.write('event: actualizar\ndata: {}\n\n');
 const timer=setInterval(()=>{if(!authenticated(req)){res.end();return}res.write('event: actualizar\ndata: {}\n\n')},2000);
 req.on('close',()=>{clearInterval(timer);listeners.delete(res)});
});
app.post('/api/labs/cards',async(req,res,next)=>{
 const {uid,name,relay,assistance_requested,temporary,starts_at}=req.body||{};
 if(typeof uid!=='string'||!/^(?:[0-9a-f]{2}){4,10}$/i.test(uid)||typeof name!=='string'||!name.trim()||name.length>120||![1,2].includes(relay)||typeof assistance_requested!=='boolean'||typeof temporary!=='boolean'||typeof starts_at!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(starts_at)||!Number.isFinite(Date.parse(starts_at)))return res.status(400).json({error:'Revisa UID, nombre, relé e inicio con zona horaria.'});
 let db;
 try{
  db=await pool.connect();await db.query('BEGIN');
  await db.query(`INSERT INTO access_control.cards(uid,name,active,assistance_requested) VALUES($1,$2,true,$3)
    ON CONFLICT(uid) DO UPDATE SET name=$2,active=true,assistance_requested=$3`,[uid.toUpperCase(),name.trim(),assistance_requested]);
  await db.query('UPDATE access_control.permissions SET revoked_at=now() WHERE uid=$1 AND device_id=$2 AND revoked_at IS NULL',[uid.toUpperCase(),device]);
  const {rows}=await db.query(`INSERT INTO access_control.permissions(uid,device_id,relay,valid_from,valid_until)
    VALUES($1,$2,$3,$4,CASE WHEN $5::boolean THEN $4::timestamptz+interval '3 hours' ELSE NULL END) RETURNING id,valid_from,valid_until`,[uid.toUpperCase(),device,relay,starts_at,temporary]);
  await db.query('COMMIT');res.status(201).json({ok:true,permission:rows[0]});signal();
 }catch(error){if(db)await db.query('ROLLBACK');next(error)}finally{db?.release()}
});
app.delete('/api/labs/cards/:uid',async(req,res,next)=>{
 if(!/^(?:[0-9a-f]{2}){4,10}$/i.test(req.params.uid))return res.status(400).json({error:'UID inválido'});
 try{await pool.query('UPDATE access_control.cards SET active=false WHERE uid=$1',[req.params.uid.toUpperCase()]);res.json({ok:true});signal()}catch(error){next(error)}
});
app.post('/api/labs/readings',(req,res)=>{
 if(!simulated)return res.status(409).json({error:'La simulación está deshabilitada en modo serial real.'});
 if(!status().ready)return res.status(503).json({error:'Espera a que el puente y el validador estén preparados.'});
 if(typeof req.body?.uid!=='string'||!/^(?:[0-9a-f]{2}){4,10}$/i.test(req.body.uid))return res.status(400).json({error:'UID hexadecimal inválido'});
 if(Date.now()-lastReading<3000)return res.status(409).json({error:'Espera tres segundos entre lecturas de ensayo.'});
 lastReading=Date.now();
 const bridge=workers.find(w=>w.name==='bridge');
 const frame=req.body.intent==='assistance'?`AYUDA,${req.body.uid.toUpperCase()},${new Date().toISOString()},${randomUUID()}`:`ACCESO,${req.body.uid.toUpperCase()},${new Date().toISOString()}`;
 bridge.child.stdin.write(`${frame}\n`,error=>{
  if(error)return res.status(503).json({error:'El puente no recibe lecturas'});
  res.status(202).json({ok:true,simulated:true});
 });
});
app.post('/api/labs/commands',async(req,res,next)=>{
 if(!state.relay_control_enabled)return res.status(409).json({error:'La apertura está deshabilitada hasta configurar los pines reales de los relés.'});
 if(![1,2].includes(req.body?.relay))return res.status(400).json({error:'Relé inválido'});
 if(!status().ready)return res.status(503).json({error:'Puente no disponible'});
 if(Date.now()-lastReading<3000)return res.status(409).json({error:'Espera tres segundos entre órdenes de ensayo.'});
 lastReading=Date.now();
 let db,command;
 try{
  db=await pool.connect();await db.query('BEGIN');const now=new Date(),id=randomUUID();
  command={command_id:randomUUID(),event_id:id,device_id:device,action:'ABRIR',relay:req.body.relay,issued_at:now.toISOString(),expires_at:new Date(now.getTime()+5000).toISOString()};
  await db.query("INSERT INTO access_control.events(event_id,uid,device_id,device_time_raw,received_at,decision) VALUES($1,'REMOTO',$2,$3,$4,'CONCEDIDO')",[id,device,'Orden manual autenticada',now]);
  await db.query('INSERT INTO access_control.commands(command_id,event_id,payload) VALUES($1,$2,$3)',[command.command_id,id,command]);await db.query('COMMIT');lastReading=Date.now();
 }catch(error){if(db)await db.query('ROLLBACK');return next(error)}finally{db?.release()}
 try{
  if(Date.parse(command.expires_at)<=Date.now())throw new Error('Orden vencida antes de envío');
  await publish(sender,t.commands,command);
  await pool.query("UPDATE access_control.commands SET status='mqtt_published' WHERE command_id=$1 AND status='pending'",[command.command_id]);
  res.status(202).json({ok:true,simulated,physical_open:null,command_id:command.command_id});signal();
 }catch(error){await pool.query("UPDATE access_control.commands SET status='send_failed' WHERE command_id=$1 AND status='pending'",[command.command_id]);res.status(503).json({error:'No se confirmó la publicación. Revisa el historial antes de repetir.'})}
});
app.post('/api/labs/assistance/:id/whatsapp-link',async(req,res,next)=>{
 if(!UUID.test(req.params.id))return res.status(400).json({error:'Identificador inválido'});
 try{
  const result=await pool.query("SELECT payload FROM access_control.notifications WHERE notification_id=$1 AND payload->>'location'=$2",[req.params.id,device]);
  if(!result.rowCount)return res.status(404).json({error:'Solicitud no encontrada'});
  let url;try{url=manualLink(result.rows[0].payload,req.body?.recipient||whatsappConfig.to)}catch(e){return res.status(400).json({error:e.message})}
  const manual={status:'link_prepared',at:new Date().toISOString(),actor:agents.get(cookie(req))||'operador_local'};
  await pool.query(`UPDATE access_control.notifications SET payload=jsonb_set(payload,'{whatsapp}',
   COALESCE(payload->'whatsapp','{}'::jsonb)||jsonb_build_object('manual',$3::jsonb))
   WHERE notification_id=$1 AND payload->>'location'=$2`,[req.params.id,device,manual]);
  res.json({url,status:'link_prepared',sent:false});signal();
 }catch(e){next(e)}
});
app.post('/api/labs/notifications/:id/ack',async(req,res,next)=>{
 if(!UUID.test(req.params.id))return res.status(400).json({error:'Identificador inválido'});
 try{await assistance.update(pool,req.params.id,device,'recibida',agents.get(cookie(req))||'operador_local','');res.json({ok:true});signal()}catch(e){next(e)}
});
app.post('/api/labs/assistance/:id/state',async(req,res,next)=>{
 if(!UUID.test(req.params.id))return res.status(400).json({error:'Identificador inválido'});
 if(typeof req.body?.state!=='string'||(req.body.reason!==undefined&&typeof req.body.reason!=='string'))return res.status(400).json({error:'Estado o motivo inválido'});
 try{const result=await assistance.update(pool,req.params.id,device,req.body.state,agents.get(cookie(req))||'operador_local',req.body.reason||'');res.json(result);signal();if(sender?.connected)publish(sender,t.commands,{type:'assistance_status',device_id:device,event_id:result.event_id,solicitud_id:req.params.id,state:result.assistance_state,expires_at:new Date(Date.now()+5000).toISOString()}).catch(e=>console.error('Sin confirmación al nodo:',e.message))}catch(e){next(e)}
});
// Alternative channel: assistance does not require a credential or permission to open.
app.post('/api/labs/assistance',async(req,res,next)=>{
 const event=req.body?.event_id;
 if(!UUID.test(event))return res.status(400).json({error:'event_id UUID requerido para evitar duplicados'});
 let db;
 try{
  db=await pool.connect();await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[event]);
  const existing=await db.query('SELECT notification_id FROM access_control.notifications WHERE event_id=$1',[event]);
  if(existing.rowCount){await db.query('COMMIT');return res.json({notification_id:existing.rows[0].notification_id,duplicate:true})}
  await db.query("INSERT INTO access_control.events(event_id,uid,device_id,device_time_raw,received_at,decision) VALUES($1,'SIN_TARJETA',$2,'Canal alternativo',now(),'DENEGADO')",[event,device]);
  const payload=assistance.initial({event_id:event,device_id:device,decision:'DENEGADO',device_time_raw:'Canal alternativo'},'canal_alternativo');
  await db.query('INSERT INTO access_control.notifications(notification_id,event_id,payload) VALUES($1,$2,$3)',[payload.notification_id,event,payload]);
  await db.query('COMMIT');res.status(201).json(payload);signal();
 }catch(e){if(db)await db.query('ROLLBACK');next(e)}finally{db?.release()}
});
app.use('/api/labs',(req,res)=>res.status(404).json({error:'Ruta no encontrada'}));
app.use((error,req,res,next)=>{console.error(`Panel: ${error.code || error.message}`);if(!res.headersSent)res.status(error.status || 503).json({error:error.status?error.message:'No se pudo completar la operación.'})});
app.get('/acceso',(req,res)=>res.redirect('/?vista=credenciales'));
app.use((req,res)=>web.getRequestHandler()(req,res));
function worker(name){
 const child=spawn(process.execPath,[path.join(__dirname,`src/${name}.cjs`)],{cwd:root,env:process.env,stdio:['pipe','pipe','pipe'],windowsHide:true});workers.push({name,child});
 let buffer='';child.stdout.on('data',chunk=>{
  buffer+=chunk;let index;
  while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);
   if(line.includes('Puente preparado'))state.bridge_ready=true;
   if(line.includes('Validador preparado'))state.validator_ready=true;
   if(line.startsWith('BRIDGE_STATE ')){try{const bridgeState=JSON.parse(line.slice(13));state.serial_connected=bridgeState.connected;state.node=bridgeState.node||null}catch{}}
   if(line.includes('MQTT_DISCONNECTED')){if(name==='bridge')state.bridge_ready=false;else state.validator_ready=false}
   console.log(`[${name}] ${line}`);signal();
  }
 });
 child.stderr.on('data',chunk=>console.error(`[${name}] ${chunk.toString().trim()}`));
 child.on('exit',()=>{state[`${name}_ready`]=false;if(name==='bridge')state.serial_connected=false;signal()});
}
async function stop(){
 if(stopping)return;stopping=true;clearInterval(ruleTimer);clearInterval(whatsappTimer);for(const res of listeners)res.end();
 for(const {child}of workers)if(child.exitCode===null)child.kill();
 sender?.end(true);await pool.end();if(server)server.close();process.exit(0);
}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
process.on('message',message=>{if(message==='shutdown')stop()});
web.prepare().then(async()=>{
 await pool.query('SELECT 1');
 ruleTimer=setInterval(async()=>{if(ruleBusy||stopping)return;ruleBusy=true;try{await assistance.evaluate(pool,device,status().ready,process.env.ASSISTANCE_AGENT_AVAILABLE!=='0')}catch(e){console.error('Reglas:',e.message)}finally{ruleBusy=false}},5000);
 whatsappTimer=setInterval(async()=>{if(whatsappBusy||stopping||!whatsappConfig.ready)return;whatsappBusy=true;try{if(await whatsapp.dispatchOnce(pool,device,whatsappConfig))signal()}catch(e){console.error('No se pudo registrar el envío de WhatsApp')}finally{whatsappBusy=false}},2000);
 sender=connect('validator',{clientId:`panel-${randomUUID()}`});
 worker('validator');worker('bridge');server=app.listen(port,'127.0.0.1',()=>{port=server.address().port;console.log(`Panel de laboratorios: http://127.0.0.1:${port}/laboratorios`)});
}).catch(error=>{console.error(error.message);stop()});
