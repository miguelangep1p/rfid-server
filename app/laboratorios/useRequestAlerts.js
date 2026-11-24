'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {stateOf,needsFollowUp} from './request-view.cjs';

const stateNames={recibida:'Recepción confirmada',aceptada:'Un agente atenderá la solicitud',en_atencion:'Llegada del personal registrada',atendida:'Asistencia finalizada',cancelada:'Solicitud cancelada'};
export default function useRequestAlerts(requests,enabled,now){
 const [feed,setFeed]=useState([]),[toasts,setToasts]=useState([]),[sound,setSound]=useState(false),[desktop,setDesktop]=useState(false),[volume,setVolume]=useState(0.35);
 const audio=useRef(null),seen=useRef(null),reminders=useRef(new Map()),counter=useRef(0);
 const notify=useCallback((title,body='',kind='info',requestId=null)=>{
  const notice={id:`${Date.now()}-${counter.current++}`,title,body,kind,requestId,at:Date.now(),read:false};
  setFeed(old=>[notice,...old].slice(0,40));setToasts(old=>[...old.slice(-2),notice]);return notice;
 },[]);
 const play=useCallback((kind='new',force=false)=>{
  const context=audio.current;if(!context||context.state!=='running'||(!sound&&!force))return;
  const notes=kind==='reminder'?[440,554]:kind==='success'?[523,784]:[659,880,1046];
  notes.forEach((frequency,i)=>{const at=context.currentTime+i*0.16,oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume*0.22,at+0.015);gain.gain.exponentialRampToValueAtTime(0.001,at+0.22);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(at);oscillator.stop(at+0.24)});
 },[sound,volume]);
 const toggleSound=useCallback(async()=>{
  if(sound){await audio.current?.suspend();setSound(false);return;}
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)throw new Error('Este navegador no admite los avisos sonoros.');
  if(!audio.current||audio.current.state==='closed')audio.current=new Audio();
  await audio.current.resume();if(audio.current.state!=='running')throw new Error('Pulsa otra vez para permitir el sonido del navegador.');
  setSound(true);play('new',true);
 },[sound,play]);
 const enableDesktop=useCallback(async()=>{
  if(!('Notification' in window))throw new Error('Este navegador no admite notificaciones de escritorio.');
  if(desktop){setDesktop(false);return;}
  const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
  if(permission!=='granted')throw new Error('Las notificaciones están bloqueadas. Puedes permitirlas desde los ajustes del navegador.');
  setDesktop(true);
 },[desktop]);
 useEffect(()=>{
  if(!enabled){seen.current=null;reminders.current.clear();setFeed([]);setToasts([]);setDesktop(false);setSound(false);audio.current?.suspend();}
 },[enabled]);
 useEffect(()=>{
  if(!enabled||!requests)return;
  const current=new Map(requests.map(r=>[r.notification_id,stateOf(r)]));
  if(seen.current){
   const added=requests.filter(r=>!seen.current.has(r.notification_id));
   if(added.length)play('new');
   for(const r of added){
    const title='Nueva solicitud de asistencia',body=`Una persona solicita apoyo en ${r.payload.location}.`;
    notify(title,body,'new',r.notification_id);
    if(desktop&&'Notification' in window&&Notification.permission==='granted'){try{new Notification('Umbral · Nueva solicitud',{body,tag:r.notification_id})}catch{}}
   }
   for(const r of requests){const previous=seen.current.get(r.notification_id),state=stateOf(r);if(previous&&previous!==state)notify(stateNames[state]||'Solicitud actualizada',r.payload.location,'success',r.notification_id);}
  }
  seen.current=current;
 },[requests,enabled,notify,play,desktop]);
 useEffect(()=>{
  if(!enabled||!requests)return;
  const due=requests.filter(r=>needsFollowUp(r,now)&&now-(reminders.current.get(r.notification_id)||0)>=60000);
  if(!due.length)return;
  due.forEach(r=>reminders.current.set(r.notification_id,now));
  const first=due[0];notify('Hay solicitudes esperando atención',due.length===1?`Revisa el aviso de ${first.payload.location}.`:`${due.length} solicitudes llevan al menos 60 segundos sin aceptación.`,'reminder',first.notification_id);play('reminder');
 },[requests,now,enabled,notify,play]);
 useEffect(()=>{if(!toasts.length)return;const timer=setTimeout(()=>setToasts(old=>old.slice(1)),6500);return()=>clearTimeout(timer)},[toasts]);
 useEffect(()=>()=>{audio.current?.close()},[]);
 return {feed,toasts,sound,desktop,volume,setVolume,notify,play,toggleSound,enableDesktop,
  unread:feed.filter(n=>!n.read).length,
  markRead:id=>setFeed(old=>old.map(n=>!id||n.id===id?{...n,read:true}:n)),
  dismiss:id=>setToasts(old=>old.filter(n=>n.id!==id)),
  audioState:()=>audio.current?.state||'inactive'};
}
