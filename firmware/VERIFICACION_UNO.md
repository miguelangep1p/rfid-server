# Conexión física del Uno — 27/10/2026

## Realizado

- Arduino Uno identificado por USB en COM3 (`arduino:avr:uno`).
- Respaldo previo de 32 768 bytes de flash y 1024 bytes de EEPROM, guardado localmente en `firmware/backups/uno-before-assistance-20261027/`. No forma parte de los archivos que se publican.
- Compilación del sketch de asistencia para Uno: 12 844 bytes de programa y 1187 bytes de variables globales.
- Carga ejecutada con `arduino-cli upload --verify`, terminada correctamente.
- Arranque por serial comprobado a 9600 baudios: `SISTEMA_LISTO`, sin diagnósticos de fallo de RFID, RTC o EEPROM.
- Servidor configurado con `SERIAL_SIMULATED=0`, `SERIAL_PATH=COM3`, `SERIAL_BAUD_RATE=9600` y `SERIAL_RELAYS_ENABLED=0`.
- Estado consultado mediante sesión autenticada: USB conectado, arranque recibido, lector disponible, RTC sin advertencia de hora perdida, identidad disponible, puente y validador preparados, MQTT conectado, `ready=true`.
- Se comprobó que `/api/labs/commands` devuelve HTTP 409 mientras la apertura está deshabilitada. No se activó ningún relé.

La señal de RTC disponible no prueba que su fecha o zona horaria estén correctamente ajustadas. Eso debe contrastarse con una lectura real y un reloj de referencia.

## Interfaz entregada

La pantalla principal muestra solicitudes con sus etapas, responsable, búsqueda y filtros, tiempo desde el registro y avisos de seguimiento a los 60 segundos sin aceptación. El resumen de llegada utiliza solo registros con marcas válidas y muestra ausencia de datos cuando no puede calcularse. El panel distingue conexión USB, lector RFID, reloj y disponibilidad de apertura.

WhatsApp mantiene el enlace `wa.me` con envío manual. No envía una emergencia automáticamente ni marca asistencia por abrir el chat.

## Comprobaciones de software

Compilación Next.js correcta. Las 29 pruebas de API, reglas, protocolo, WhatsApp, estadísticas y diagnóstico del nodo pasaron. También pasaron el recorrido del panel en Edge, su vista móvil, la regresión del panel antiguo y la integración de PostgreSQL/MQTT con extremo serial simulado.

## Lectura física confirmada por el usuario

Después de que el usuario acercó su tarjeta, se comprobaron cuatro eventos físicos de UID `74D81506`, con identificadores `554e5401-0000-4000-8000-000300000001` a `554e5401-0000-4000-8000-000300000004`. Cada uno tiene una solicitud persistida y cero órdenes de apertura. Los tres primeros recorrieron los estados de recepción, aceptación, llegada y cierre desde el panel; el log serial confirma que el Uno recibió los cinco estados, incluida `atendida`. El cuarto estaba solicitado al consultar los registros.

Las repeticiones del primer evento conservaron su identificador y una única solicitud. Las lecturas posteriores a un cierre crearon eventos nuevos, como corresponde a otra solicitud deliberada. La evidencia detallada quedó en el archivo local `firmware/backups/uno-before-assistance-20261027/live-verification.json`.

Esto confirma el recorrido físico tarjeta → Uno → serial → MQTT → PostgreSQL → panel y las respuestas al Uno. Los clics de prueba en llegada/cierre no acreditan que se prestó ayuda a una persona ni constituyen mediciones PRE/POST. Las fechas brutas del RTC aparecen aproximadamente 27–28 segundos antes de la recepción del servidor; falta ajustar y contrastar el reloj antes de las mediciones de campo.

## Repetir la demostración

Para repetir el recorrido ya comprobado:

1. Abrir http://127.0.0.1:3000 e ingresar al panel.
2. Acercar una tarjeta compatible al MFRC522; comprobar una solicitud nueva en `entrada-01`.
3. Repetir la presentación mientras siga activa; comprobar que conserva la solicitud.
4. Registrar recepción, aceptación, llegada y cierre en el panel cuando correspondan.
5. Configurar el número de seguridad y probar la apertura del chat de WhatsApp sin atribuirle envío automático.

Los relés siguen deshabilitados tanto en el firmware como en el servidor hasta conocer los pines reales. Cualquier señal física adicional requiere confirmar su componente y conexión.
