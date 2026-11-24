// Illustrative coordinates in an SVG plane, never latitude/longitude.
const ROUTE=[[110,110],[260,110],[260,235],[530,235],[530,390],[755,390]];
function clampProgress(value){return Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;}
function positionAt(value){
 const progress=clampProgress(value),lengths=ROUTE.slice(1).map((point,i)=>Math.hypot(point[0]-ROUTE[i][0],point[1]-ROUTE[i][1]));
 const total=lengths.reduce((sum,length)=>sum+length,0);let remaining=total*progress;
 for(let i=0;i<lengths.length;i++){
  if(remaining<=lengths[i]||i===lengths.length-1){const ratio=remaining/lengths[i];return {x:ROUTE[i][0]+(ROUTE[i+1][0]-ROUTE[i][0])*ratio,y:ROUTE[i][1]+(ROUTE[i+1][1]-ROUTE[i][1])*ratio};}
  remaining-=lengths[i];
 }
 return {x:ROUTE[0][0],y:ROUTE[0][1]};
}
function advance(progress,elapsedMs,speed=1){
 const delta=Number.isFinite(elapsedMs)?Math.max(0,elapsedMs):0;
 const rate=[1,2,4].includes(speed)?speed:1;
 return clampProgress(clampProgress(progress)+Math.min(delta,1000)*rate/45000);
}
function stageAt(value){const progress=clampProgress(value);return progress>=1?'Llegada simulada':progress>=0.65?'Acercándose al punto · simulado':progress>0?'Personal en camino · simulado':'En espera · demostración';}
module.exports={ROUTE,clampProgress,positionAt,advance,stageAt};
