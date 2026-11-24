# Interfaz de peticiones y avisos

El panel también incluye **Rastreo · DEMO**, con recorrido interactivo del personal, pausa, reinicio y velocidades de presentación. Consulta [Rastreo simulado](RASTREO_SIMULADO.md). No utiliza GPS ni modifica los estados reales de atención.

Actualización del 27/10/2026. La aplicación principal permanece en http://127.0.0.1:3000, conectada al Uno de COM3 en modo físico. No se cambió el firmware ni se habilitaron relés en esta actualización.

## Demostrar una petición

1. Actualizar la página e iniciar sesión.
2. Pulsar **Activar sonido**. Se reproduce una melodía de comprobación; los navegadores requieren una acción del usuario para activar audio.
3. Acercar una tarjeta compatible al lector. Una nueva solicitud produce una notificación flotante, un aviso en el centro de notificaciones y un modal **Alguien necesita tu apoyo** con el punto y el tiempo transcurrido. Con sonido habilitado se reproduce la melodía de nueva petición.
4. Elegir **Ver en el panel** para localizar la tarjeta, o **Confirmar recepción** para registrar que se vio el aviso. Abrir o cerrar el modal no cambia el estado por sí solo.
5. Recorrer aceptación, llegada y cierre mediante los modales de confirmación correspondientes. La aceptación registra al responsable; la llegada y la finalización se confirman por separado.

La vista inicial muestra solicitudes activas. Los filtros permiten consultar también las finalizadas y las que requieren seguimiento. Cada tarjeta incluye un resumen de la petición, origen, estado, responsable, tiempo y etapas, con acceso a un modal de historial.

## Modales y notificaciones

- Creación de ayuda sin tarjeta, sin registrar una nueva petición hasta confirmar.
- Recepción, aceptación, llegada y finalización con explicación de cada hito.
- Cancelación con motivo obligatorio, persistido en el historial.
- Detalle con marcas temporales y actores.
- Centro de avisos de la sesión. Marcar un aviso como leído no acepta ni cierra una solicitud.
- Preferencias de audio, volumen, reproducción de prueba y notificaciones de escritorio.

Los modales son diálogos nativos con foco contenido y cierre por Escape cuando no se está guardando. Una nueva petición no sustituye un modal de trabajo ya abierto: sigue visible en las notificaciones. Los errores de la API se muestran dentro del modal de acción, sin afirmar que una operación fallida se completó.

Las notificaciones flotantes se pueden cerrar y desaparecen automáticamente. El centro conserva los últimos 40 avisos de la sesión; la bitácora persistente de las solicitudes sigue en PostgreSQL.

## Sonidos y escritorio

Las nuevas peticiones tienen una melodía distinta del recordatorio. Mientras la solicitud permanezca solicitada o recibida durante al menos 60 segundos, el panel puede recordar su revisión, como máximo una vez por minuto por solicitud. Las solicitudes aceptadas o terminales no generan estos recordatorios. El aviso no declara una emergencia médica.

En **Configurar avisos** se ajusta el volumen o se solicita explícitamente permiso para notificaciones de escritorio. Si el navegador no admite la función o deniega el permiso, el panel explica la situación y conserva los avisos internos. El panel debe permanecer abierto para recibir sonidos y notificaciones; no se implementó un servicio de notificaciones push con la aplicación cerrada.

El diseño adapta navegación, tarjetas y modales a móviles y respeta la preferencia de movimiento reducido. WhatsApp conserva su envío manual mediante `wa.me`; los sonidos y las notificaciones de escritorio no envían mensajes externos al personal.

## Verificación

Compilación de producción correcta y 29 pruebas generales aprobadas. La prueba integrada en Edge completó 17 verificaciones, incluyendo melodías mediante Web Audio, solicitud de permiso de escritorio simulada, modal de nueva petición, volumen, cambios de estado, historial, creación, cancelación y cierre con Escape. Se comprobó que el recordatorio no se reproduce en cada actualización.

Las pruebas utilizaron solicitudes temporales, retiradas al terminar. El enlace de WhatsApp y las notificaciones del sistema se interceptaron para no enviar mensajes ni generar notificaciones reales durante la prueba. La activación de osciladores de audio se comprobó en el navegador; la audibilidad del equipo depende de su volumen y salida de sonido.

Las capturas están en `laboratorio-7/evidencias/panel-web-desktop.png`, `panel-web-mobile.png`, `panel-nueva-solicitud.png` y `panel-cancelar-solicitud.png`. El detalle de las verificaciones está en `panel-verificacion.json` de ese mismo directorio.
