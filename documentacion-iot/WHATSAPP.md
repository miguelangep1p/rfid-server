# Avisos de asistencia por WhatsApp

## Demostración con enlace directo (configuración predeterminada)

No requiere cuenta de Meta ni tokens. Iniciar la infraestructura con `npm run iot:up` y la aplicación con `npm run dev`. Abrir http://127.0.0.1:3000 y acceder con el agente y la contraseña local del panel.

1. En **Asistencia**, escribir el **WhatsApp de seguridad**, con código de país. Para Perú: `+51` seguido de los nueve dígitos del número real que recibirá el aviso.
2. Registrar una solicitud con **Solicitar ayuda sin tarjeta**, o recibir una lectura del nodo. En **Acceso**, **Simular solicitud de ayuda** permite ensayar la lectura sin abrir el relé.
3. Pulsar **Abrir WhatsApp** en la solicitud. Se abre otra pestaña o la aplicación de WhatsApp con el punto, identificador y estado preparados.
4. Revisar el destinatario y pulsar **Enviar** dentro de WhatsApp. Para una demostración sin envío, basta con mostrar el texto preparado y cerrar el chat.
5. Continuar recepción, aceptación, llegada y cierre en Umbral cuando ocurran esos hitos.

El número permanece en memoria mientras la pantalla esté abierta. El sistema registra `link_prepared` con fecha y agente cuando se usa el enlace; no registra falsamente envío, entrega ni lectura. La bitácora del enlace es independiente del estado de asistencia. No se envían nombres ni diagnósticos en el texto preparado. El formato utilizado es el oficial [click to chat de WhatsApp](https://faq.whatsapp.com/5913398998672934).

## Automatización opcional para una fase posterior

La integración con WhatsApp Business Cloud API queda disponible en `laboratorio-7/src/whatsapp.cjs`, pero no se activa en el modo de enlaces. Las credenciales se escriben únicamente en `laboratorio-6/.env.local`. El archivo de ejemplo del mismo directorio enumera las variables sin secretos.

Para habilitarla, configurar `WHATSAPP_MODE=cloud`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_TO`, `WHATSAPP_TEMPLATE_NAME` y `WHATSAPP_TEMPLATE_LANGUAGE`. Usar la versión admitida que indique la cuenta de Meta y un destinatario de seguridad acordado para el piloto. La versión no se supone ni se obtiene del navegador.

La plantilla aprobada debe contener tres parámetros posicionales en el cuerpo, en este orden: punto, identificador de solicitud y motivo del aviso. Ejemplo de cuerpo para solicitar aprobación:

```text
Umbral UNT: se requiere apoyo en {{1}}.
Solicitud: {{2}}.
Aviso: {{3}}.
Confirma la atención en el panel de seguridad.
```

La [guía oficial de plantillas de WhatsApp](https://whatsappbusiness.com/blog/manage-message-templates-whatsapp-business-api/) describe la creación y el envío de este tipo de mensajes. El software utiliza una petición HTTPS con Bearer token al endpoint de mensajes de Meta; las credenciales nunca se incluyen en la respuesta del panel.

La tarea del servidor revisa solicitudes cada dos segundos. Registra una intención de envío persistente antes de llamar a la API, envía un aviso inicial y un recordatorio único a partir de los 60 segundos si la solicitud sigue solicitada o recibida. `WHATSAPP_ALTERNATE_TO` permite dirigir el recordatorio a otro responsable; si no se configura utiliza el destinatario principal. Las solicitudes aceptadas, en atención, atendidas o canceladas no generan nuevos envíos automáticos. Por defecto no se envían avisos que tengan más de 300 segundos; el límite es configurable entre 60 y 3600 segundos mediante `WHATSAPP_MAX_AGE_SECONDS`.

Se conservan los resultados `submitted`, `sent`, `delivered`, `read`, `failed`, `unknown` y `simulated`. Un resultado aceptado por Meta no acredita entrega. Los errores inciertos y los envíos interrumpidos no se reintentan automáticamente, porque podrían haber llegado al destinatario. Verificar antes de repetir. La coordinación humana sigue siendo necesaria.

Para recibir confirmaciones de entrega, configurar `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN`, y publicar de forma controlada la ruta HTTPS `/api/whatsapp/webhook` mediante el proxy autorizado del proyecto. El servidor escucha localmente y no crea túneles ni publica el panel. Configurar la suscripción `messages` en Meta. La verificación GET comprueba el token y los POST comprueban HMAC SHA-256 sobre el cuerpo original, según el [contrato de webhooks documentado por Meta](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/). Los callbacks solo actualizan la bitácora de WhatsApp, nunca la llegada o el cierre de la asistencia.

`WHATSAPP_MODE=simulated` permite comprobar la cola automática sin acceder a la API. Para mantener únicamente los enlaces, dejar `WHATSAPP_MODE=manual` o no definir la variable.

## Pruebas

```powershell
npm run test:whatsapp
npm run test:whatsapp:live
npm run test:iot:panel
```

Las pruebas utilizan datos temporales. El HTTP de Meta se sustituye por respuestas controladas y el enlace `wa.me` se intercepta en el navegador. No envían mensajes ni contactan un número de WhatsApp. El extremo serial también se simula.
