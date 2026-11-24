const {randomUUID}=require('node:crypto');
const STATES=['solicitada','recibida','aceptada','en_atencion','atendida','cancelada'];
const NEXT={solicitada:['recibida','cancelada'],recibida:['aceptada','cancelada'],aceptada:['en_atencion','cancelada'],en_atencion:['atendida','cancelada'],atendida:[],cancelada:[]};
function recommend({state,wait,connected=true,available=true,duplicate=false}){
 if(!STATES.includes(state)||!Number.isFinite(wait)||wait<0)throw new Error('Entrada de reglas inválida');
 if(['atendida','cancelada'].includes(state))return 'sin_accion';
 if(duplicate)return 'ignorar_duplicado';
 if(!connected)return 'canal_alternativo';
 if(['aceptada','en_atencion'].includes(state))return 'mantener_seguimiento';
 if(!available)return 'avisar_responsable_alterno';
 return wait>=60?'recordar_y_escalar':'notificar_guardia';
}
function transition(payload,target,actor,reason='',now=new Date().toISOString()){
 const state=payload.assistance_state||'solicitada';
 if(!NEXT[state]?.includes(target)){const e=new Error('La solicitud cambió o la transición no está permitida');e.status=409;throw e;}
 if(typeof actor!=='string'||!actor.trim())throw new Error('Falta responsable');
 if(target==='cancelada'&&(!reason.trim()||reason.length>500)){const e=new Error('Indica el motivo de cancelación (hasta 500 caracteres)');e.status=400;throw e;}
 return {...payload,assistance_state:target,...(target==='aceptada'?{agent:actor}:{}),
  history:[...(payload.history||[]),{from:state,to:target,actor,at:now,reason}],
  [({recibida:'received_at',aceptada:'accepted_at',en_atencion:'arrived_at',atendida:'closed_at',cancelada:'cancelled_at'})[target]]:now};
}
async function update(pool,id,device,target,actor,reason){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const {rows}=await db.query("SELECT * FROM access_control.notifications WHERE notification_id=$1 AND payload->>'location'=$2 FOR UPDATE",[id,device]);
  if(!rows.length){const e=new Error('Solicitud no encontrada');e.status=404;throw e;}
  const original=rows[0].payload;
  if(!original.assistance_state)original.assistance_state=rows[0].status==='acknowledged'?'recibida':'solicitada';
  const payload=transition(original,target,actor,reason);
  await db.query("UPDATE access_control.notifications SET payload=$2,status=CASE WHEN $3='recibida' THEN 'acknowledged' ELSE status END WHERE notification_id=$1",[id,payload,target]);
  await db.query('COMMIT');return payload;
 }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
}
function initial(event,source='tarjeta'){
 const at=new Date().toISOString();
 return {notification_id:randomUUID(),event_id:event.event_id,location:event.device_id,type:'asistencia_solicitada',message:'Se requiere apoyo en el ingreso',channel:'mqtt_y_panel_web',decision:event.decision,
  source,assistance_state:'solicitada',requested_at:at,device_time_raw:event.device_time_raw,
  history:[{from:null,to:'solicitada',actor:source,at}],rule_history:[]};
}
// Persist each recommendation once per state and action, including after restarts.
async function evaluate(pool,device,connected,available){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const {rows}=await db.query("SELECT * FROM access_control.notifications WHERE payload->>'location'=$1 AND COALESCE(payload->>'assistance_state','solicitada') NOT IN ('atendida','cancelada') FOR UPDATE",[device]);
  for(const row of rows){
   const p=row.payload,state=p.assistance_state||'solicitada';
   const action=recommend({state,wait:Math.max(0,(Date.now()-Date.parse(p.requested_at||row.created_at))/1000),connected,available});
   const history=p.rule_history||[];
   if(!history.some(r=>r.state===state&&r.action===action)){
    p.rule_history=[...history,{state,action,at:new Date().toISOString()}];p.recommendation=action;
    await db.query('UPDATE access_control.notifications SET payload=$2 WHERE notification_id=$1',[row.notification_id,p]);
   }
  }
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
}
module.exports={recommend,transition,update,initial,evaluate};
