const {createHmac,timingSafeEqual}=require('node:crypto');

function configuration(env=process.env){
 const mode=env.WHATSAPP_MODE||'manual';
 const config={mode,token:env.WHATSAPP_ACCESS_TOKEN,phoneId:env.WHATSAPP_PHONE_NUMBER_ID,
  version:env.WHATSAPP_API_VERSION,template:env.WHATSAPP_TEMPLATE_NAME,
  language:env.WHATSAPP_TEMPLATE_LANGUAGE||'es',to:env.WHATSAPP_TO,
  alternate:env.WHATSAPP_ALTERNATE_TO||env.WHATSAPP_TO,
  appSecret:env.WHATSAPP_APP_SECRET,verifyToken:env.WHATSAPP_VERIFY_TOKEN,
  maxAge:Number(env.WHATSAPP_MAX_AGE_SECONDS||300)};
 const missing=[];
 if(!['manual','disabled','simulated','cloud'].includes(mode))missing.push('WHATSAPP_MODE');
 if(!Number.isFinite(config.maxAge)||config.maxAge<60||config.maxAge>3600)missing.push('WHATSAPP_MAX_AGE_SECONDS');
 if(mode==='cloud'){
  for(const [key,value,pattern] of [
   ['WHATSAPP_ACCESS_TOKEN',config.token,/^\S{10,4096}$/],
   ['WHATSAPP_PHONE_NUMBER_ID',config.phoneId,/^\d{5,30}$/],
   ['WHATSAPP_API_VERSION',config.version,/^v\d{1,3}\.0$/],
   ['WHATSAPP_TEMPLATE_NAME',config.template,/^[a-z0-9_]{1,512}$/],
   ['WHATSAPP_TEMPLATE_LANGUAGE',config.language,/^[a-z]{2,3}(?:_[A-Z]{2})?$/],
   ['WHATSAPP_TO',config.to,/^[1-9]\d{7,14}$/],
   ['WHATSAPP_ALTERNATE_TO',config.alternate,/^[1-9]\d{7,14}$/],
  ])if(typeof value!=='string'||!pattern.test(value))missing.push(key);
 }
 return {...config,ready:['simulated','cloud'].includes(mode)&&!missing.length,missing};
}
function publicConfiguration(config){
 return {mode:config.mode,ready:config.ready,missing:config.missing,
  delivery_tracking:Boolean(config.appSecret&&config.verifyToken),
  recipient:config.to?`••••${config.to.slice(-4)}`:null};
}
function message(config,request,kind){
 return {messaging_product:'whatsapp',recipient_type:'individual',to:kind==='escalation'?config.alternate:config.to,
  type:'template',template:{name:config.template,language:{code:config.language},
   components:[{type:'body',parameters:[
    {type:'text',text:request.location},
    {type:'text',text:request.notification_id},
    {type:'text',text:kind==='escalation'?'Recordatorio: solicitud pendiente de atención':'Nueva solicitud de asistencia'},
   ]}]}};
}
async function send(config,request,kind,fetcher=fetch){
 if(!config.ready)throw new Error('WhatsApp no está configurado');
 if(config.mode==='simulated')return {status:'simulated',finished_at:new Date().toISOString()};
 try{
  const response=await fetcher(`https://graph.facebook.com/${config.version}/${config.phoneId}/messages`,{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},
   body:JSON.stringify(message(config,request,kind)),
  });
  const data=await response.json();
  if(!response.ok)return {status:response.status>=500?'unknown':'failed',http_status:response.status,
   ...(Number.isInteger(data.error?.code)?{error_code:data.error.code}:{})};
  const id=data.messages?.[0]?.id;
  if(typeof id!=='string'||!id||id.length>512)return {status:'unknown'};
  return {status:'submitted',message_id:id,submitted_at:new Date().toISOString()};
 }catch{return {status:'unknown'}}
}

function due(payload,createdAt,now,config){
 const state=payload.assistance_state||'solicitada';
 if(!['solicitada','recibida'].includes(state))return null;
 const age=(now-Date.parse(payload.requested_at||createdAt))/1000;
 if(!Number.isFinite(age)||age<0||age>config.maxAge)return null;
 if(!payload.whatsapp?.initial)return 'initial';
 if(age>=60&&!payload.whatsapp?.escalation)return 'escalation';
 return null;
}

// Claim durably before HTTP. A timeout or crash is not retried automatically:
// Cloud API does not provide an exactly-once guarantee for this POST.
async function dispatchOnce(pool,device,config,fetcher=fetch){
 if(!config.ready)return false;
 const db=await pool.connect();let claimed;
 try{
  await db.query('BEGIN');
  const {rows}=await db.query(`SELECT notification_id,payload,created_at FROM access_control.notifications
   WHERE payload->>'location'=$1 AND created_at>=now()-($2*interval '1 second')
   AND COALESCE(payload->>'assistance_state','solicitada') IN ('solicitada','recibida')
   AND (payload->'whatsapp'->'initial' IS NULL OR
    (created_at<=now()-interval '60 seconds' AND payload->'whatsapp'->'escalation' IS NULL))
   ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20`,[device,config.maxAge]);
  for(const row of rows){
   const kind=due(row.payload,row.created_at,Date.now(),config);
   if(!kind)continue;
   const at=new Date().toISOString();
   const delivery={status:'sending',claimed_at:at,mode:config.mode};
   const payload={...row.payload,whatsapp:{...row.payload.whatsapp,[kind]:delivery}};
   await db.query('UPDATE access_control.notifications SET payload=$2 WHERE notification_id=$1',[row.notification_id,payload]);
   claimed={id:row.notification_id,kind,payload,delivery};break;
  }
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
 if(!claimed)return false;
 const result=await send(config,claimed.payload,claimed.kind,fetcher);
 await pool.query(`UPDATE access_control.notifications SET payload=jsonb_set(payload,$2::text[],$3::jsonb)
  WHERE notification_id=$1`,[claimed.id,['whatsapp',claimed.kind],{...claimed.delivery,...result}]);
 return true;
}

function validSignature(raw,signature,secret){
 if(!secret||typeof signature!=='string'||!/^sha256=[0-9a-f]{64}$/.test(signature))return false;
 const expected=createHmac('sha256',secret).update(raw).digest();
 return timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));
}
function mergeStatus(previous,incoming,at){
 const ranks={submitted:0,sent:1,delivered:2,read:3};
 if(!['sent','delivered','read','failed'].includes(incoming))return previous;
 if(incoming==='failed'&&['delivered','read'].includes(previous.status))return previous;
 if(incoming!=='failed'&&(ranks[incoming]??-1)<(ranks[previous.status]??-1))return previous;
 return {...previous,status:incoming,delivery_updated_at:at};
}
async function receiveStatuses(pool,body,config){
 if(body.object!=='whatsapp_business_account')return;
 for(const entry of body.entry||[])for(const change of entry.changes||[]){
  const value=change.value;
  if(value?.metadata?.phone_number_id!==config.phoneId)continue;
  for(const status of value.statuses||[]){
   if(typeof status.id!=='string'||status.id.length>512||!['sent','delivered','read','failed'].includes(status.status))continue;
   const db=await pool.connect();
   try{
    await db.query('BEGIN');
    const {rows}=await db.query(`SELECT notification_id,payload FROM access_control.notifications
     WHERE payload->'whatsapp'->'initial'->>'message_id'=$1
     OR payload->'whatsapp'->'escalation'->>'message_id'=$1 FOR UPDATE`,[status.id]);
    for(const row of rows){
     for(const kind of ['initial','escalation'])if(row.payload.whatsapp?.[kind]?.message_id===status.id){
      const previous=row.payload.whatsapp[kind];
      row.payload.whatsapp[kind]=mergeStatus(previous,status.status,new Date().toISOString());
     }
     await db.query('UPDATE access_control.notifications SET payload=$2 WHERE notification_id=$1',[row.notification_id,row.payload]);
    }
    await db.query('COMMIT');
   }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
  }
 }
}
function mountWebhook(app,express,pool,config){
 app.get('/api/whatsapp/webhook',(req,res)=>{
  res.set('Cache-Control','no-store');
  if(config.mode!=='cloud'||!config.verifyToken)return res.sendStatus(503);
  if(req.query['hub.mode']!=='subscribe'||req.query['hub.verify_token']!==config.verifyToken||typeof req.query['hub.challenge']!=='string')return res.sendStatus(403);
  res.type('text/plain').send(req.query['hub.challenge']);
 });
 app.post('/api/whatsapp/webhook',express.raw({type:'application/json',limit:'128kb'}),async(req,res)=>{
  if(config.mode!=='cloud'||!config.appSecret)return res.sendStatus(503);
  if(!Buffer.isBuffer(req.body)||!validSignature(req.body,req.headers['x-hub-signature-256'],config.appSecret))return res.sendStatus(401);
  let body;try{body=JSON.parse(req.body)}catch{return res.sendStatus(400)}
  try{await receiveStatuses(pool,body,config);res.sendStatus(200)}catch{res.sendStatus(503)}
 });
}
module.exports={configuration,publicConfiguration,message,send,due,dispatchOnce,validSignature,mergeStatus,receiveStatuses,mountWebhook};
