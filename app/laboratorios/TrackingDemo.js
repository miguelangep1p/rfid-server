'use client';
import {useEffect,useRef,useState} from 'react';
import Icon from './Icon';
import styles from './tracking.module.css';
import {ROUTE,positionAt,advance,stageAt,clampProgress} from './tracking-demo.cjs';
import {stateOf} from './request-view.cjs';

export default function TrackingDemo({requests,selectedId,onSelect,onView,onComplete}){
 const [progress,setProgress]=useState(0),[running,setRunning]=useState(false),[speed,setSpeed]=useState(1);
 const completed=useRef(false),completion=useRef(onComplete);
 completion.current=onComplete;
 const request=requests.find(r=>r.notification_id===selectedId),point=request?.payload.location||'entrada-01',position=positionAt(progress),percent=Math.round(progress*100);
 useEffect(()=>{
  if(!running)return;
  let previous=performance.now();
  const timer=setInterval(()=>{const current=performance.now(),elapsed=current-previous;previous=current;setProgress(p=>advance(p,elapsed,speed))},100);
  const pauseWhenHidden=()=>{if(document.hidden)setRunning(false)};
  document.addEventListener('visibilitychange',pauseWhenHidden);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',pauseWhenHidden)};
 },[running,speed]);
 useEffect(()=>{
  if(progress>=1){setRunning(false);if(!completed.current){completed.current=true;completion.current?.()}}
 },[progress]);
 function reset(){setRunning(false);setProgress(0);completed.current=false;}
 function seek(value){setRunning(false);const next=clampProgress(Number(value)/100);if(next<1)completed.current=false;setProgress(next);}
 return <section className={styles.tracking} aria-labelledby="tracking-title">
  <div className={styles.disclosure}><span>DEMO · SIN GPS</span><p>El mapa, la posición y el recorrido son simulados. La persona solicitante permanece asociada al punto fijo del lector; no se rastrea su desplazamiento.</p></div>
  <div className={styles.top}><div><p className={styles.eyebrow}>UNA VISTA DE CÓMO LLEGARÍA EL APOYO</p><h2 id="tracking-title">Seguimiento del personal de apoyo</h2><p>Explora el recorrido en una maqueta interactiva, sin modificar la atención real.</p></div><label>Solicitud de referencia<select aria-label="Solicitud de referencia para el rastreo" value={selectedId||'demo'} onChange={e=>onSelect(e.target.value==='demo'?null:e.target.value)}><option value="demo">Ejemplo ficticio · sin solicitud real</option>{requests.map(r=><option key={r.notification_id} value={r.notification_id}>#{r.notification_id.slice(0,8).toUpperCase()} · {r.payload.location}</option>)}</select></label></div>
  <div className={styles.layout}>
   <div className={styles.mapCard}>
    <div className={styles.mapHeader}><div><span className={styles.mapDot}/><strong>Escenario de demostración</strong></div><span>Croquis ilustrativo · no es un plano oficial</span></div>
    <div className={styles.mapViewport}>
     <svg className={styles.map} viewBox="0 0 900 510" role="img" aria-label={`Croquis simulado del puesto de seguridad al punto ${point}. Avance del recorrido: ${percent} por ciento.`}>
      <defs><pattern id="demo-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e0ebe8" strokeWidth=".8"/></pattern><filter id="demo-shadow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#286f64" floodOpacity=".18"/></filter></defs>
      <rect width="900" height="510" fill="#f4f8f5"/><rect width="900" height="510" fill="url(#demo-grid)"/>
      <path d="M0 315H900M360 0V510M650 0V510" stroke="#e2ede4" strokeWidth="38" fill="none"/>
      <g className={styles.buildings}><rect x="45" y="35" width="140" height="120" rx="16"/><rect x="390" y="50" width="190" height="110" rx="16"/><rect x="690" y="55" width="160" height="150" rx="16"/><rect x="65" y="355" width="145" height="110" rx="16"/><rect x="390" y="350" width="85" height="105" rx="14"/></g>
      <g className={styles.mapLabels}><text x="115" y="70" textAnchor="middle">PUESTO DE SEGURIDAD</text><text x="485" y="100" textAnchor="middle">BIBLIOTECA · DEMO</text><text x="770" y="115" textAnchor="middle">AULAS · DEMO</text><text x="138" y="405" textAnchor="middle">ÁREA VERDE</text><text x="430" y="400" textAnchor="middle">PATIO</text></g>
      <g fill="#cee2d1"><circle cx="305" cy="365" r="16"/><circle cx="320" cy="420" r="12"/><circle cx="600" cy="75" r="15"/><circle cx="823" cy="302" r="19"/><circle cx="70" cy="255" r="13"/></g>
      <polyline points={ROUTE.map(p=>p.join(',')).join(' ')} fill="none" stroke="#fff" strokeWidth="23" strokeLinejoin="round" strokeLinecap="round"/>
      <polyline points={ROUTE.map(p=>p.join(',')).join(' ')} fill="none" stroke="#c4d9d2" strokeWidth="5" strokeDasharray="6 10" strokeLinejoin="round" strokeLinecap="round"/>
      <polyline data-testid="demo-route-progress" points={ROUTE.map(p=>p.join(',')).join(' ')} pathLength="100" fill="none" stroke="#179e89" strokeWidth="6" strokeDasharray={`${progress*100} 100`} strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx="110" cy="110" r="9" fill="#a9c7be" stroke="#fff" strokeWidth="4"/>
      <g transform="translate(755 390)"><circle r="33" fill="#eeb783" opacity=".2"/><circle r="19" fill="#eb9d55" stroke="#fff" strokeWidth="5"/><circle r="5" fill="#fff"/></g>
      <rect x="655" y="427" width="201" height="43" rx="12" fill="#fff" stroke="#e5e7dc"/><text x="755" y="453" textAnchor="middle" className={styles.destinationLabel}>Punto de ayuda · {point}</text>
      <g data-testid="demo-agent-marker" data-progress={percent} transform={`translate(${position.x} ${position.y})`} filter="url(#demo-shadow)"><circle r="33" fill="#1a9e8b" opacity=".13"/><circle r="22" fill="#0a857b" stroke="#fff" strokeWidth="5"/><circle cx="0" cy="-5" r="5" fill="none" stroke="#fff" strokeWidth="2"/><path d="M-8 9c0-9 16-9 16 0" fill="none" stroke="#fff" strokeWidth="2"/></g>
      <g transform="translate(840 245)"><circle r="22" fill="#fff" stroke="#d8e5df"/><path d="m0-13 7 22-7-5-7 5z" fill="#9db6a8"/><text y="-30" textAnchor="middle" className={styles.mapLabels}>N · DEMO</text></g>
     </svg>
     <div className={styles.mapWatermark}>RECORRIDO SIMULADO</div>
    </div>
    <div className={styles.legend}><span><i className={styles.agentDot}/>Personal · posición simulada</span><span><i className={styles.pointDot}/>Punto fijo de ayuda</span><span>Sin coordenadas ni ubicación real</span></div>
   </div>
   <aside className={styles.routePanel}>
    <div className={styles.routeIdentity}><span><Icon name="person" size={26}/></span><div><p>PERSONAL DE APOYO · DEMO</p><h3>Agente de demostración</h3></div></div>
    <p className={styles.routeStatus} role="status">{running?stageAt(progress):progress>=1?'Llegada simulada':progress>0?'Recorrido en pausa · simulado':'Listo para iniciar la demostración'}</p>
    <div className={styles.percent}><strong>{percent}<small>%</small></strong><span>del recorrido ficticio</span></div><progress aria-label="Avance del recorrido simulado" value={progress} max="1"/>
    <dl><div><dt>Origen</dt><dd>Puesto de seguridad · demo</dd></div><div><dt>Destino</dt><dd>{point}</dd></div><div><dt>Duración del escenario</dt><dd>45 segundos a velocidad 1×</dd></div><div><dt>Restante en la simulación</dt><dd>{Math.ceil((1-progress)*45/speed)} s · no es una estimación real</dd></div></dl>
    <div className={styles.controls}><button disabled={progress>=1} onClick={()=>setRunning(r=>!r)}>{running?'Pausar simulación':progress>0?'Continuar simulación':'Iniciar simulación'}</button><button className={styles.secondary} onClick={reset}>Reiniciar simulación</button></div>
    <label className={styles.speed}>Velocidad de demostración<select aria-label="Velocidad de demostración" value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value="1">1× · 45 segundos</option><option value="2">2× · más rápido</option><option value="4">4× · presentación breve</option></select></label>
    <label className={styles.seek} htmlFor="tracking-progress">Explorar el recorrido<input id="tracking-progress" type="range" min="0" max="100" step="1" value={percent} onChange={e=>seek(e.target.value)} /></label><button className={styles.completeButton} onClick={()=>{setRunning(false);setProgress(1)}} disabled={progress>=1}>Completar recorrido de prueba</button>
   </aside>
  </div>
  <div className={styles.reference}><Icon name="help"/><div><strong>{request?'Solicitud real usada solo como referencia':'Esta demostración no crea una solicitud'}</strong><p>{request?`#${request.notification_id.slice(0,8).toUpperCase()} · Estado real: ${stateOf(request).replaceAll('_',' ')}. La simulación no registra llegada ni cierre.`:'El recorrido y el agente son ficticios. Puedes repetir la presentación sin añadir eventos al historial.'}</p></div>{request&&<button onClick={()=>onView(request.notification_id)}>Ver solicitud real</button>}</div>
  {progress>=1&&<div className={styles.demoComplete} role="status"><strong>Recorrido de demostración completado</strong><p>El marcador llegó al destino de la maqueta. No se ha confirmado ninguna llegada ni atención real.</p></div>}
 </section>;
}
