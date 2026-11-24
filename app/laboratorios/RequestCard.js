'use client';
import styles from './modern.module.css';
import Icon from './Icon';
import {stateOf,elapsed,needsFollowUp,durationLabel} from './request-view.cjs';
import {manualLink,normalizePhone} from '../../documentacion-iot/laboratorio-7/src/whatsapp-link.cjs';

const stages=[['solicitada','Solicitud'],['recibida','Recepción'],['aceptada','Aceptación'],['en_atencion','Llegada'],['atendida','Cierre']];
const labels={solicitada:'Nueva solicitud',recibida:'Recibida',aceptada:'Personal en camino',en_atencion:'En atención',atendida:'Atendida',cancelada:'Cancelada'};
const nextState={solicitada:'recibida',recibida:'aceptada',aceptada:'en_atencion',en_atencion:'atendida'};
const actions={recibida:'Confirmar recepción',aceptada:'Aceptar atención',en_atencion:'Registrar llegada',atendida:'Constatar asistencia y cerrar'};
const date=value=>new Date(value).toLocaleString('es-PE',{timeZone:'America/Lima'});

export default function RequestCard({request,now,busy,phone,action,api,deliveryLabel,onTransition,onCancel,onDetails,onTrack}){
 const p=request.payload,state=stateOf(request),next=nextState[state],index=stages.findIndex(s=>s[0]===state),followUp=needsFollowUp(request,now);
 return <article id={`request-${request.notification_id}`} tabIndex={-1} data-notification-id={request.notification_id} data-state={state} className={`${styles.requestCard} ${followUp?styles.requestFollowUp:''} ${!next?styles.requestFinished:''}`}>
  <div className={styles.requestTop}><div className={styles.requestIdentity}><span className={styles.requestIcon} aria-hidden="true">{p.source==='canal_alternativo'?'↗':'◎'}</span><div><p className={styles.requestCode}>SOLICITUD · {request.notification_id.slice(0,8).toUpperCase()}</p><h3>Apoyo en {p.location}</h3></div></div><span className={`${styles.stateBadge} ${styles[state]||''}`}>{labels[state]||state}</span></div>
  {next&&<div className={styles.petitionText}><span className={styles.petitionAvatar}><Icon name="person" size={24}/></span><div><strong>{state==='aceptada'?'El personal está en camino':state==='en_atencion'?'El apoyo está en curso':'Una persona está esperando apoyo'}</strong><p>{state==='aceptada'?`${p.agent||'El responsable'} aceptó la solicitud. Registra la llegada al estar en el punto.`:state==='en_atencion'?'La llegada está registrada. Cierra la solicitud cuando termine el apoyo.':'Confirma el aviso y coordina la atención en el punto indicado.'}</p></div></div>}
  <div className={styles.requestFacts}><div><span>Registrada</span><strong>{date(request.created_at)}</strong></div><div><span>Responsable</span><strong>{p.agent||'Sin asignar'}</strong></div><div><span>{next?'Desde el registro':'Estado final'}</span><strong className={followUp?styles.timeWarning:''}>{next?durationLabel(elapsed(request,now)):labels[state]}</strong></div></div>
  {followUp&&<p className={styles.followUpMessage}>Requiere seguimiento · lleva más de 60 segundos sin aceptación.</p>}
  <ol className={styles.progress} aria-label="Etapas de la asistencia">{stages.map(([key,label],i)=>{const reached=state==='cancelada'?(p.history||[]).some(h=>h.to===key):i<=index;return <li key={key} className={reached?styles.stepDone:''} aria-current={state===key?'step':undefined}><span aria-hidden="true">{reached?'✓':i+1}</span>{label}</li>})}</ol>
  <div className={styles.requestBottom}><div className={styles.delivery}><span aria-hidden="true">↗</span><p>WhatsApp<strong>{deliveryLabel(p.whatsapp?.initial?.status||p.whatsapp?.manual?.status)}</strong></p></div><div className={styles.requestActions}>{normalizePhone(phone)?<a className={styles.whatsappButton} href={manualLink({...p,notification_id:request.notification_id},phone)} target="_blank" rel="noopener noreferrer" onClick={()=>action(()=>api(`assistance/${request.notification_id}/whatsapp-link`,{recipient:phone}),'Enlace de WhatsApp preparado. El mensaje requiere envío manual.')}>Abrir WhatsApp</a>:<button className={styles.secondary} disabled title="Indica el WhatsApp de seguridad">Abrir WhatsApp</button>}{next&&<button disabled={busy} onClick={()=>onTransition(request,next)}>{actions[next]}</button>}</div></div>
  <div className={styles.requestFoot}><button type="button" className={styles.textButton} onClick={()=>onDetails(request)}>Ver detalles e historial <span aria-hidden="true">↗</span></button><button type="button" className={styles.textButton} onClick={()=>onTrack(request)}><Icon name="map" size={14}/>Ver rastreo simulado</button>{next&&<button type="button" className={styles.cancelButton} disabled={busy} onClick={()=>onCancel(request)}>Cancelar solicitud</button>}<span className={styles.sourceTag}>{p.source==='canal_alternativo'?'Canal alternativo':'Tarjeta de proximidad'}</span></div>
 </article>;
}
