const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,createHmac}=require('node:crypto');
const {Pool}=require('pg');
const express=require('express');
const wa=require('../documentacion-iot/laboratorio-7/src/whatsapp.cjs');
const assistance=require('../documentacion-iot/laboratorio-7/src/assistance.cjs');

test('WhatsApp: concurrencia, historial PostgreSQL y webhook firmado; HTTP de Meta simulado',
 {skip:process.env.IOT_WHATSAPP_TEST!=='1',timeout:30000},async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 const admin=new Pool({host:'127.0.0.1',port:55432,database:'asistencia',user:'iot_owner',password:process.env.POSTGRES_PASSWORD});
 const event=randomUUID(),device=`wa-test-${randomUUID()}`;
 const payload=assistance.initial({event_id:event,device_id:device,decision:'DENEGADO'});
 const config=wa.configuration({WHATSAPP_MODE:'cloud',WHATSAPP_ACCESS_TOKEN:'test-token-not-real',
  WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_API_VERSION:'v25.0',WHATSAPP_TEMPLATE_NAME:'asistencia_unt',
  WHATSAPP_TO:'51999999999',WHATSAPP_APP_SECRET:'only-for-tests',WHATSAPP_VERIFY_TOKEN:'verification-test'});
 let calls=0,server;
 try{
  await pool.query("INSERT INTO access_control.events(event_id,uid,device_id,device_time_raw,received_at,decision) VALUES($1,'SIN_TARJETA',$2,'Prueba WhatsApp',now(),'DENEGADO')",[event,device]);
  await pool.query('INSERT INTO access_control.notifications(notification_id,event_id,payload) VALUES($1,$2,$3)',[payload.notification_id,event,payload]);
  const fake=async()=>{calls++;await assistance.update(pool,payload.notification_id,device,'recibida','Agente prueba','');return {ok:true,json:async()=>({messages:[{id:'wamid.initial.test'}]})}};
  const outcomes=await Promise.all([wa.dispatchOnce(pool,device,config,fake),wa.dispatchOnce(pool,device,config,fake)]);
  assert.equal(outcomes.filter(Boolean).length,1);assert.equal(calls,1);
  let p=(await pool.query('SELECT payload FROM access_control.notifications WHERE notification_id=$1',[payload.notification_id])).rows[0].payload;
  assert.equal(p.assistance_state,'recibida');assert.equal(p.whatsapp.initial.status,'submitted');assert.equal(p.history.length,2);
  assert.equal(await wa.dispatchOnce(pool,device,config,fake),false);assert.equal(calls,1);
  const old=new Date(Date.now()-61000).toISOString();
  await pool.query("UPDATE access_control.notifications SET created_at=($2::text)::timestamptz,payload=jsonb_set(payload,'{requested_at}',to_jsonb($2::text)) WHERE notification_id=$1",[payload.notification_id,old]);
  await wa.dispatchOnce(pool,device,config,async()=>{calls++;return {ok:true,json:async()=>({messages:[{id:'wamid.escalation.test'}]})}});
  assert.equal(calls,2);assert.equal(await wa.dispatchOnce(pool,device,config,fake),false);

  const app=express();wa.mountWebhook(app,express,pool,config);app.use(express.json());
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  const base=`http://127.0.0.1:${server.address().port}/api/whatsapp/webhook`;
  assert.equal((await fetch(base+'?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123')).status,403);
  assert.equal(await (await fetch(base+'?hub.mode=subscribe&hub.verify_token=verification-test&hub.challenge=123')).text(),'123');
  const raw=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{value:{metadata:{phone_number_id:config.phoneId},statuses:[{id:'wamid.initial.test',status:'delivered'}]}}]}]});
  assert.equal((await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:raw})).status,401);
  const signature='sha256='+createHmac('sha256',config.appSecret).update(raw).digest('hex');
  assert.equal((await fetch(base,{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':signature},body:raw})).status,200);
  p=(await pool.query('SELECT payload FROM access_control.notifications WHERE notification_id=$1',[payload.notification_id])).rows[0].payload;
  assert.equal(p.whatsapp.initial.status,'delivered');assert.equal(p.assistance_state,'recibida');assert.equal(p.arrived_at,undefined);
  await assistance.update(pool,payload.notification_id,device,'cancelada','Agente prueba','Fin del ensayo');
  assert.equal(await wa.dispatchOnce(pool,device,config,fake),false);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  await admin.query('DELETE FROM access_control.notifications WHERE event_id=$1',[event]);
  await admin.query('DELETE FROM access_control.events WHERE event_id=$1',[event]);await pool.end();await admin.end();
 }
});
