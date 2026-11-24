function normalizePhone(value){
 if(typeof value!=='string')return null;
 const digits=value.replace(/[\s()+-]/g,'');
 return /^[1-9]\d{7,14}$/.test(digits)?digits:null;
}
function manualLink(request,recipient){
 const phone=normalizePhone(recipient);
 if(!phone)throw new Error('Indica un número internacional con código de país, por ejemplo +51 y los 9 dígitos.');
 const text=[
  'Solicitud de asistencia · UNT',
  `Punto: ${request.location}`,
  `Solicitud: ${request.notification_id}`,
  `Estado: ${(request.assistance_state||'solicitada').replaceAll('_',' ')}`,
  'Se requiere apoyo en el punto indicado. Por favor, confirma la atención en el panel Umbral.',
 ].join('\n');
 return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
module.exports={normalizePhone,manualLink};
