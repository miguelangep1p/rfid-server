# Umbral · Asistencia UNT

La aplicación principal está orientada a solicitudes de ayuda: recepción, aceptación por un agente, llegada, cierre y cancelación. Credenciales y apertura de puertas se encuentran en secciones secundarias. La interfaz utiliza Next.js/React y el servidor integra PostgreSQL, MQTT y el puente serial.

Incluye avisos por enlace `wa.me`: indicar el número de seguridad y pulsar **Abrir WhatsApp** en una solicitud para mostrar el chat con el texto preparado. El envío se realiza manualmente en WhatsApp; abrir el enlace no acredita entrega ni atención. Ver [configuración y demostración de WhatsApp](documentacion-iot/WHATSAPP.md) y [correspondencia con el informe](documentacion-iot/CORRESPONDENCIA_INFORME.md).

## Ejecutar

Requiere Node.js 22 o superior y Docker Desktop en ejecución. Solo un puente debe usar el lector. No iniciar simultáneamente dos paneles con los mismos identificadores MQTT.

```sh
npm install
npm run iot:up
npm run iot:panel:setup
npm run dev
```

Abrir http://127.0.0.1:3000. Ingresar el agente responsable y la contraseña `PANEL_PASSWORD` guardada en `documentacion-iot/laboratorio-6/.env.local`. En una instalación nueva sin configuración, ejecutar primero `npm run iot:setup`; no repetirlo sobre archivos de credenciales ya existentes. Para producción:

```sh
npm run build
npm start
```

`npm run dev` y `npm start` utilizan el servidor de asistencia. `npm run iot:panel` conserva el alias de demostración en el puerto 3100; la ruta `/laboratorios` muestra el mismo panel. No usar `next start`, porque omite las API del servidor integrado.

## Configuración

La configuración del panel está en `documentacion-iot/laboratorio-6/.env.local`. No compartir credenciales. El ejemplo de ese directorio enumera las opciones de WhatsApp.

| Variable | Predeterminado | Uso |
| --- | --- | --- |
| SERIAL_PATH | COM3 | Puerto del lector |
| SERIAL_BAUD_RATE | 9600 | Velocidad serial |
| SERIAL_SIMULATED | 1 en la configuración de ensayo | Simula el extremo serial, sin apertura física |
| PORT / LAB_PORT | 3000 en la aplicación principal | Puerto HTTP; LAB_PORT tiene precedencia |
| WHATSAPP_MODE | manual | Enlaces a WhatsApp; cloud y simulated son opcionales |

El servidor escucha en el equipo local y requiere sesión para las API del panel. El modo serial real requiere comprobar el firmware y el contrato `AYUDA` antes de conectar el circuito.

El [firmware Arduino adaptado](firmware/README.md) está en `firmware/umbral_asistencia/`. Las lecturas solicitan ayuda por defecto. Los relés permanecen deshabilitados hasta definir los pines reales.

El Uno de este equipo ya fue programado y conectado en COM3, con el servidor en modo físico. Ver la [verificación del Uno](firmware/VERIFICACION_UNO.md). La interfaz muestra solicitudes por etapas, avisos de seguimiento, búsqueda, responsable y tiempos operativos de llegada; esos registros no sustituyen las mediciones PRE/POST.

La [interfaz de peticiones y avisos](documentacion-iot/INTERFAZ_Y_AVISOS.md) incorpora modales, notificaciones flotantes, centro de avisos y melodías con volumen ajustable. Pulsar **Activar sonido** al iniciar la demostración; las notificaciones de escritorio requieren permiso explícito y el panel abierto.

## Funciones

- Solicitudes activas primero, filtros, tiempos desde el registro y responsable.
- Estados con historial persistente, aceptación concurrente y deduplicación por evento.
- Ayuda sin tarjeta, sonido opcional y enlaces de WhatsApp con mensaje preparado.
- Reglas auditadas, exportación completa y seguimiento de conectividad.
- Credenciales, permisos temporales y apertura como funciones independientes.

Los contadores del panel corresponden a los últimos 100 avisos. La exportación conserva todos los del dispositivo. Las fechas se muestran en America/Lima. Una apertura o un WhatsApp no acredita asistencia recibida.

## Respaldo y pruebas

El control de acceso anterior y su base SQLite se conservan. Se ejecuta por separado con `npm run dev:access` o `npm run start:access` y se abre `/acceso`. Si la aplicación principal está activa, configurar otro `PORT` para el servidor antiguo. Su configuración serial utiliza el `.env.local` de la raíz y `SERIAL_DISABLED=1` permite probar sin hardware. No se migraron ni sustituyeron los registros de `accesos.db`.

```sh
npm run build
npm test
npm run test:ui
npm run test:iot:panel
npm run test:whatsapp:live
```

Las pruebas originales utilizan SQLite temporal. Las de asistencia y WhatsApp usan datos de ensayo en PostgreSQL y retiran sus registros al finalizar. Edge verifica la navegación, vista móvil, estados y enlace de WhatsApp interceptado: no envía mensajes reales. La comprobación física y los indicadores PRE/POST continúan pendientes de trabajo de campo.
