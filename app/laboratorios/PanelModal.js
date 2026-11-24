'use client';
import {useEffect,useRef,useState} from 'react';
import styles from './modern.module.css';
import {stateOf,elapsed,durationLabel} from './request-view.cjs';

const copy={
 recibida:{title:'Confirmar recepción',description:'Confirma que viste el aviso. La solicitud seguirá pendiente de aceptación.',button:'Confirmar recepción',icon:'✓'},
 aceptada:{title:'¿Vas a atender esta solicitud?',description:'Quedarás como responsable. Confirma cuando estés disponible para acudir al punto.',button:'Aceptar atención',icon:'↗'},
 en_atencion:{title:'¿Ya llegaste al punto de ayuda?',description:'Registra la llegada únicamente cuando estés junto a la persona que solicitó apoyo.',button:'Registrar llegada',icon:'⌖'},
 atendida:{title:'¿La asistencia ha finalizado?',description:'Confirma que el apoyo terminó. Esta acción cierra la solicitud y conserva su historial.',button:'Constatar asistencia y cerrar',icon:'✓'},
};
export default function PanelModal({modal,onClose,onSubmit,busy,error,request,agent,now,alerts,onView}){
 const dialog=useRef(null),[reason,setReason]=useState('');
 useEffect(()=>{const element=dialog.current;element.showModal();return()=>{if(element.open)element.close()}},[]);
 const type=modal.type,content=copy[modal.target],isIncoming=type==='incoming';
 const title=type==='create'?'Registrar una solicitud de ayuda':type==='cancel'?'Cancelar esta solicitud':type==='details'?'El recorrido de esta solicitud':type==='notifications'?'Tu centro de avisos':type==='settings'?'Avisos a tu medida':isIncoming?'Alguien necesita tu apoyo':content?.title||'Solicitud actualizada';
 async function submit(e){e.preventDefault();await onSubmit(reason);}
 function keepFocus(e){
  if(e.key!=='Tab')return;
  const elements=Array.from(dialog.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(element=>element.getClientRects().length);
  if(!elements.length){e.preventDefault();dialog.current.focus();return;}
  const first=elements[0],last=elements[elements.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
 }
 return <dialog ref={dialog} tabIndex={-1} className={`${styles.modal} ${isIncoming?styles.incomingModal:''}`} aria-labelledby="panel-modal-title" onKeyDown={keepFocus} onCancel={e=>{e.preventDefault();if(!busy)onClose()}} onClick={e=>{if(e.target===e.currentTarget&&!busy){const rect=e.currentTarget.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onClose()}}}>
  <button className={styles.modalClose} type="button" aria-label="Cerrar ventana" disabled={busy} onClick={onClose}>×</button>
  <span className={styles.modalIcon} aria-hidden="true">{isIncoming?'◎':type==='cancel'?'!':type==='settings'?'♫':type==='notifications'?'♧':type==='create'?'+':content?.icon||'✓'}</span>
  <p className={styles.modalEyebrow}>{isIncoming?'NUEVA PETICIÓN · EN TIEMPO REAL':type==='settings'?'PREFERENCIAS DEL PANEL':'UMBRAL · ASISTENCIA'}</p><h2 id="panel-modal-title">{title}</h2>
  {type==='settings'?<div className={styles.modalBody}><p>Activa los avisos para percibir las solicitudes aunque estés en otra sección del panel.</p><div className={styles.preferenceRow}><div><strong>Avisos sonoros</strong><p>Una melodía para nuevas peticiones y otra para recordatorios.</p></div><button type="button" onClick={()=>onSubmit('sound')}>{alerts.sound?'Desactivar sonido':'Activar sonido'}</button></div><label className={styles.volume} htmlFor="alert-volume">Volumen de los avisos <output>{Math.round(alerts.volume*100)}%</output><input id="alert-volume" type="range" min="0.05" max="0.8" step="0.05" value={alerts.volume} onChange={e=>alerts.setVolume(Number(e.target.value))} /></label><button className={styles.secondary} type="button" disabled={!alerts.sound} onClick={()=>alerts.play('new')}>Probar sonido</button><div className={styles.preferenceRow}><div><strong>Notificaciones de escritorio</strong><p>El navegador te pedirá permiso. Funcionan mientras este panel esté abierto.</p></div><button type="button" onClick={()=>onSubmit('desktop')}>{alerts.desktop?'Desactivar escritorio':'Activar escritorio'}</button></div><p className={styles.small}>Los recordatorios suenan como máximo una vez por minuto mientras la solicitud siga sin aceptar.</p></div>
  :type==='notifications'?<div className={styles.modalBody}><p>Los avisos se conservan durante esta sesión. Leerlos no acepta una solicitud.</p><div className={styles.noticeList}>{!alerts.feed.length?<p>No hay avisos nuevos. Las peticiones aparecerán aquí al llegar.</p>:alerts.feed.map(n=><button className={styles.noticeItem} type="button" key={n.id} data-read={n.read} onClick={()=>{alerts.markRead(n.id);if(n.requestId)onView(n.requestId)}}><span aria-hidden="true">{n.kind==='new'?'◎':n.kind==='reminder'?'!':'✓'}</span><div><strong>{n.title}</strong><p>{n.body}</p><small>{new Date(n.at).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}</small></div></button>)}</div><button className={styles.secondary} type="button" onClick={()=>alerts.markRead()}>Marcar avisos como leídos</button></div>
  :type==='details'?<div className={styles.modalBody}><p>{request?.payload.location} · Solicitud #{request?.notification_id.slice(0,8).toUpperCase()}</p><ol className={styles.historyList}>{request?.payload.history?.map((h,i)=><li key={i}><span aria-hidden="true">✓</span><div><strong>{({solicitada:'Solicitud registrada',recibida:'Recepción confirmada',aceptada:'Atención aceptada',en_atencion:'Llegada registrada',atendida:'Asistencia finalizada',cancelada:'Solicitud cancelada'})[h.to]||h.to}</strong><p>{h.actor} · {new Date(h.at).toLocaleString('es-PE',{timeZone:'America/Lima'})}</p>{h.reason&&<p>{h.reason}</p>}</div></li>)}</ol><p>Fecha del dispositivo: {request?.payload.device_time_raw||'No disponible'}</p><p className={styles.small}>Identificador completo: {request?.notification_id}</p><button type="button" onClick={onClose}>Volver al panel</button></div>
  :<form onSubmit={submit} className={styles.modalBody}><p>{isIncoming?'Se acaba de registrar una petición de asistencia. Revisa el punto y confirma su recepción para empezar.':type==='create'?'Usa este canal cuando la persona no tenga tarjeta o necesite ayuda para utilizar el lector.':type==='cancel'?'La solicitud dejará de estar activa. Explica el motivo para conservar un registro claro.':content?.description}</p>
   <div className={styles.modalRequest}><div><span>Punto de ayuda</span><strong>{request?.payload.location||modal.location}</strong></div>{request&&<><div><span>Desde el registro</span><strong>{durationLabel(elapsed(request,now))}</strong></div><small>Solicitud #{request.notification_id.slice(0,8).toUpperCase()} · {stateOf(request).replaceAll('_',' ')}</small></>}</div>
   {modal.target==='aceptada'&&<p className={styles.assignedTo}>Responsable: <strong>{agent}</strong></p>}
   {type==='cancel'&&<label className={styles.reasonField}>Motivo de cancelación<textarea required maxLength={500} rows={3} autoFocus placeholder="Por ejemplo: la persona retiró su solicitud." value={reason} onChange={e=>setReason(e.target.value)} /></label>}
   {error&&<p className={styles.error} role="alert">{error}</p>}
   <div className={styles.modalActions}><button type="button" className={styles.secondary} disabled={busy} onClick={()=>isIncoming?onView(request.notification_id):onClose()}>{isIncoming?'Ver en el panel':'Volver'}</button><button disabled={busy||type==='cancel'&&!reason.trim()} type="submit">{busy?'Guardando…':isIncoming?'Confirmar recepción':type==='create'?'Crear solicitud':type==='cancel'?'Confirmar cancelación':content?.button||'Confirmar'}</button></div>
  </form>}
  {(type==='settings'||type==='notifications')&&error&&<p className={styles.error} role="alert">{error}</p>}
 </dialog>;
}
