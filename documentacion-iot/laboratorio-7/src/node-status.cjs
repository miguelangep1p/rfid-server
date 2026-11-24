function initialNode(){return {booted:false,reader_connected:null,rtc_valid:null,identity_ready:null,last_message:null};}
function updateNode(node,line){
 if(line==='SISTEMA_LISTO')return {...node,booted:true,reader_connected:node.reader_connected??true,rtc_valid:node.rtc_valid??true,identity_ready:node.identity_ready??true,last_message:line};
 if(line==='ERROR:RFID_NO_ENCONTRADO')return {...node,reader_connected:false,last_message:line};
 if(line==='AVISO:RTC_NO_VALIDO_SE_USARA_HORA_DEL_SERVIDOR')return {...node,rtc_valid:false,last_message:line};
 if(line.startsWith('ERROR:EEPROM_NO_DISPONIBLE'))return {...node,identity_ready:false,last_message:line};
 if(line.startsWith('ERROR:SIN_CONFIRMACION_')||line.startsWith('ERROR:COLA_LOCAL_LLENA_'))return {...node,last_message:line};
 return null;
}
module.exports={initialNode,updateNode};
