function stateOf(request){
 return request.payload.assistance_state||(request.status==='acknowledged'?'recibida':'solicitada');
}
function isActive(request){return !['atendida','cancelada'].includes(stateOf(request));}
function elapsed(request,now){
 const start=Date.parse(request.payload.requested_at||request.created_at);
 return Number.isFinite(start)?Math.max(0,Math.floor((now-start)/1000)):null;
}
function needsFollowUp(request,now){return ['solicitada','recibida'].includes(stateOf(request))&&(elapsed(request,now)??0)>=60;}
function durationLabel(seconds){return seconds===null?'Sin registro':`${Math.floor(seconds/60)} min ${seconds%60} s`;}
function summary(requests,now){
 const waiting=requests.filter(r=>['solicitada','recibida'].includes(stateOf(r)));
 const arrivals=requests.flatMap(r=>{
  const start=Date.parse(r.payload.requested_at||r.created_at),end=Date.parse(r.payload.arrived_at);
  return Number.isFinite(start)&&Number.isFinite(end)&&end>=start?[(end-start)/1000]:[];
 });
 return {waiting:waiting.length,following:requests.filter(r=>['aceptada','en_atencion'].includes(stateOf(r))).length,
  completed:requests.filter(r=>stateOf(r)==='atendida').length,followUp:waiting.filter(r=>needsFollowUp(r,now)).length,
  averageArrival:arrivals.length?Math.round(arrivals.reduce((a,b)=>a+b,0)/arrivals.length):null,arrivalCount:arrivals.length};
}
function ordered(requests,now){
 const priority=r=>needsFollowUp(r,now)?0:['solicitada','recibida'].includes(stateOf(r))?1:isActive(r)?2:3;
 return [...requests].sort((a,b)=>{
  const group=priority(a)-priority(b);if(group)return group;
  const delta=Date.parse(a.created_at)-Date.parse(b.created_at);
  return Number.isFinite(delta)?(isActive(a)?delta:-delta):0;
 });
}
module.exports={stateOf,isActive,elapsed,needsFollowUp,durationLabel,summary,ordered};
