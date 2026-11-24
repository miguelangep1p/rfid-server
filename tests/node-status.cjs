const {test}=require('node:test');
const assert=require('node:assert/strict');
const {initialNode,updateNode}=require('../documentacion-iot/laboratorio-7/src/node-status.cjs');
test('Abrir USB no acredita lector operativo; los fallos sobreviven al anuncio de arranque',()=>{
 const initial=initialNode();assert.equal(initial.booted,false);assert.equal(initial.reader_connected,null);
 let node=updateNode(initial,'ERROR:RFID_NO_ENCONTRADO');
 node=updateNode(node,'AVISO:RTC_NO_VALIDO_SE_USARA_HORA_DEL_SERVIDOR');
 node=updateNode(node,'SISTEMA_LISTO');
 assert.equal(node.booted,true);assert.equal(node.reader_connected,false);assert.equal(node.rtc_valid,false);assert.equal(node.identity_ready,true);
});
test('Arranque normal y diagnósticos se distinguen de lecturas y estados de asistencia',()=>{
 const node=updateNode(initialNode(),'SISTEMA_LISTO');assert.equal(node.reader_connected,true);
 assert.equal(updateNode(node,'AYUDA,AABBCCDD,fecha,id'),null);
 assert.equal(updateNode(node,'ESTADO_AYUDA,id,aceptada'),null);
 assert.equal(updateNode(updateNode(initialNode(),'ERROR:EEPROM_NO_DISPONIBLE_USAR_CANAL_ALTERNATIVO'),'SISTEMA_LISTO').identity_ready,false);
});
