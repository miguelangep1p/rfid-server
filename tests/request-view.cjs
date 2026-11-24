const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summary,needsFollowUp,ordered,elapsed}=require('../app/laboratorios/request-view.cjs');
const now=Date.parse('2026-10-27T15:00:00Z');
function request(id,state,seconds,extra={}){return {notification_id:id,created_at:new Date(now-seconds*1000).toISOString(),payload:{assistance_state:state,...extra}}}
test('Sin llegadas registradas no se inventa un tiempo de asistencia',()=>{
 const stats=summary([request('a','aceptada',90),request('b','cancelada',100)],now);
 assert.equal(stats.averageArrival,null);assert.equal(stats.arrivalCount,0);assert.equal(stats.following,1);assert.equal(stats.completed,0);
});
test('Seguimiento comienza a 60 segundos y excluye aceptadas y finalizadas',()=>{
 assert.equal(needsFollowUp(request('a','recibida',59),now),false);
 assert.equal(needsFollowUp(request('a','recibida',60),now),true);
 assert.equal(needsFollowUp(request('b','aceptada',1000),now),false);
 assert.equal(needsFollowUp(request('c','atendida',1000),now),false);
 const result=ordered([request('closed','atendida',50),request('following','aceptada',90),request('new','solicitada',10),request('old','recibida',80)],now);
 assert.deepEqual(result.map(r=>r.notification_id),['old','new','following','closed']);
});
test('Promedio operativo solo utiliza llegadas con secuencia temporal válida',()=>{
 const stats=summary([request('a','en_atencion',100,{arrived_at:new Date(now-40000).toISOString()}),request('b','atendida',200,{arrived_at:new Date(now-80000).toISOString()}),request('bad','atendida',0,{arrived_at:new Date(now-10000).toISOString()})],now);
 assert.equal(stats.averageArrival,90);assert.equal(stats.arrivalCount,2);
 assert.equal(elapsed(request('future','solicitada',-10),now),0);
});
