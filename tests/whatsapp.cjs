const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const wa=require('../documentacion-iot/laboratorio-7/src/whatsapp.cjs');
const {manualLink,normalizePhone}=require('../documentacion-iot/laboratorio-7/src/whatsapp-link.cjs');
const env={WHATSAPP_MODE:'cloud',WHATSAPP_ACCESS_TOKEN:'test-token-never-real',WHATSAPP_PHONE_NUMBER_ID:'123456789',
 WHATSAPP_API_VERSION:'v25.0',WHATSAPP_TEMPLATE_NAME:'asistencia_unt',WHATSAPP_TO:'51999999999'};
const request={notification_id:'550e8400-e29b-41d4-a716-446655440000',location:'entrada-01'};
test('Enlace wa.me prepara mensaje sin cuenta Business ni envío automático',()=>{
 assert.equal(wa.configuration({}).mode,'manual');
 assert.equal(normalizePhone('+51 999-999-999'),'51999999999');
 assert.equal(normalizePhone('javascript:alert(1)'),null);
 const url=new URL(manualLink(request,'+51 999 999 999'));
 assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/51999999999');
 assert.match(url.searchParams.get('text'),/entrada-01/);assert.ok(url.searchParams.get('text').includes(request.notification_id));
 assert.throws(()=>manualLink(request,'999'));
});
test('WhatsApp queda desactivado sin configuración y no expone secretos',()=>{
 assert.equal(wa.configuration({}).ready,false);
 const incomplete=wa.configuration({WHATSAPP_MODE:'cloud'});assert.equal(incomplete.ready,false);assert.ok(incomplete.missing.includes('WHATSAPP_ACCESS_TOKEN'));
 const publicConfig=JSON.stringify(wa.publicConfiguration(wa.configuration(env)));
 assert.ok(!publicConfig.includes(env.WHATSAPP_ACCESS_TOKEN));assert.ok(!publicConfig.includes(env.WHATSAPP_TO));
 assert.equal(wa.configuration({...env,WHATSAPP_TO:'999'}).ready,false);
 assert.equal(wa.configuration({...env,WHATSAPP_API_VERSION:'https://otro.example'}).ready,false);
});
test('Plantilla contiene punto e identificador; no incluye identidad ni diagnóstico',()=>{
 const config=wa.configuration({...env,WHATSAPP_ALTERNATE_TO:'51888888888'});
 assert.equal(config.ready,true);
 const body=wa.message(config,{...request,name:'Persona privada',diagnosis:'privado'},'initial');
 assert.equal(body.to,env.WHATSAPP_TO);assert.equal(body.type,'template');
 assert.deepEqual(body.template.components[0].parameters.map(p=>p.text),['entrada-01',request.notification_id,'Nueva solicitud de asistencia']);
 assert.ok(!JSON.stringify(body).includes('privado'));
 assert.equal(wa.message(config,request,'escalation').to,'51888888888');
});
test('Respuesta aceptada por Meta no equivale a entrega',async()=>{
 let calls=0;
 const result=await wa.send(wa.configuration(env),request,'initial',async(url,options)=>{
  calls++;assert.equal(url,'https://graph.facebook.com/v25.0/123456789/messages');
  assert.equal(options.headers.Authorization,`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`);
  return {ok:true,json:async()=>({messages:[{id:'wamid.test'}]})};
 });
 assert.equal(calls,1);assert.equal(result.status,'submitted');assert.equal(result.message_id,'wamid.test');
});
test('Simulación nunca llama a la API',async()=>{
 const result=await wa.send(wa.configuration({WHATSAPP_MODE:'simulated'}),request,'initial',()=>{throw new Error('No debe acceder a red')});
 assert.equal(result.status,'simulated');
});
test('Rechazos y resultados inciertos se distinguen sin filtrar errores con secretos',async()=>{
 const config=wa.configuration(env);
 const rejected=await wa.send(config,request,'initial',async()=>({ok:false,status:401,json:async()=>({error:{code:190,message:env.WHATSAPP_ACCESS_TOKEN}})}));
 assert.equal(rejected.status,'failed');assert.equal(rejected.error_code,190);assert.ok(!JSON.stringify(rejected).includes(env.WHATSAPP_ACCESS_TOKEN));
 const uncertain=await wa.send(config,request,'initial',async()=>{throw new Error('Timeout')});assert.equal(uncertain.status,'unknown');
 const invalid=await wa.send(config,request,'initial',async()=>({ok:true,json:async()=>({})}));assert.equal(invalid.status,'unknown');
});
test('Aviso único y recordatorio; no enviar al aceptar, cancelar, vencer o cerrar',()=>{
 const now=Date.now(),config=wa.configuration({WHATSAPP_MODE:'simulated'});
 const at=new Date(now-61000).toISOString(),p={...request,requested_at:at,assistance_state:'solicitada'};
 assert.equal(wa.due(p,at,now,config),'initial');
 p.whatsapp={initial:{status:'submitted'}};assert.equal(wa.due(p,at,now,config),'escalation');
 p.whatsapp.escalation={status:'unknown'};assert.equal(wa.due(p,at,now,config),null);
 for(const assistance_state of ['aceptada','en_atencion','atendida','cancelada'])assert.equal(wa.due({...p,whatsapp:{},assistance_state},at,now,config),null);
 assert.equal(wa.due({...p,whatsapp:{},requested_at:new Date(now-301000).toISOString()},at,now,config),null);
});
test('Webhook valida firma sobre bytes originales y evita retroceder de leído a enviado',()=>{
 const raw=Buffer.from('{"object":"whatsapp_business_account"}'),secret='secret-for-tests';
 const signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
 assert.equal(wa.validSignature(raw,signature,secret),true);
 assert.equal(wa.validSignature(Buffer.from('{}'),signature,secret),false);
 assert.equal(wa.validSignature(raw,'sha256=invalido',secret),false);
 assert.equal(wa.validSignature(raw,signature,''),false);
 assert.equal(wa.mergeStatus({status:'read'},'sent','date').status,'read');
 assert.equal(wa.mergeStatus({status:'delivered'},'failed','date').status,'delivered');
 assert.equal(wa.mergeStatus({status:'submitted'},'delivered','date').status,'delivered');
});
