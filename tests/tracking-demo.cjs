const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ROUTE,positionAt,advance,stageAt}=require('../app/laboratorios/tracking-demo.cjs');
test('La ruta ficticia respeta origen, destino y límites sin coordenadas GPS',()=>{
 assert.deepEqual(positionAt(0),{x:110,y:110});assert.deepEqual(positionAt(1),{x:755,y:390});
 assert.deepEqual(positionAt(-5),positionAt(0));assert.deepEqual(positionAt(4),positionAt(1));
 assert.deepEqual(positionAt(NaN),positionAt(0));
 for(let i=0;i<=100;i++){const point=positionAt(i/100);assert.ok(point.x>=110&&point.x<=755);assert.ok(point.y>=110&&point.y<=390)}
 assert.equal(ROUTE.length,6);
});
test('El avance admite velocidades de demostración y no salta por una pestaña suspendida',()=>{
 assert.equal(advance(0,1000,1),1/45);assert.equal(advance(0,1000,4),4/45);
 assert.equal(advance(0,60000,1),1/45);assert.equal(advance(0.5,-10,2),0.5);
 assert.equal(advance(0.99,1000,4),1);assert.equal(advance(0,1000,99),1/45);
 assert.equal(stageAt(1),'Llegada simulada');assert.match(stageAt(0.7),/simulado/);
});
