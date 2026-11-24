# Demostración de laboratorios 6 y 7

La aplicación principal también se abre ahora con `npm run dev` en http://127.0.0.1:3000. La asistencia es la vista inicial; **Credenciales**, **Acceso** y **WhatsApp** son secciones del mismo panel. Para demostrar el aviso sin cuenta Business, indicar el número de seguridad y utilizar **Abrir WhatsApp** en una solicitud: el texto queda preparado y el envío se hace manualmente. Ver [WHATSAPP.md](../WHATSAPP.md).

Desde la raíz del repositorio:

```powershell
npm run iot:up
npm run iot:panel:setup
npm run iot:panel
```

Abrir http://127.0.0.1:3100/laboratorios. Contraseña: valor local de `PANEL_PASSWORD` en `laboratorio-6/.env.local`. No compartir ese archivo.

1. Iniciar sesión en la vista de Next.js indicando el agente responsable y la contraseña local.
2. Registrar una tarjeta de ensayo: UID hexadecimal, nombre, relé, inicio explícito y solicitud de asistencia. Elegir permiso temporal de tres horas o permanente.
3. Introducir el UID en «Simular lectura». La petición atraviesa el puente, EMQX, el validador y PostgreSQL.
4. Revisar autorización y estado de comando por separado. En el modo inicial todo envío al relé es simulado.
5. Ver el aviso y, si se desea, activar el sonido del navegador. Recorrer «Confirmar recepción», «Aceptar atención», «Registrar llegada» y «Constatar asistencia y cerrar» solo cuando ocurra cada hito. Cancelar requiere motivo. El historial conserva agente y fechas. «Solicitar ayuda sin tarjeta» registra el canal alternativo sin enviar apertura. Descargar el historial completo para auditarlo.
6. Probar orden manual y revocación. Esperar al menos tres segundos entre lecturas y órdenes de ensayo.

El comando del panel supervisa puente y validador. No ejecutarlos paralelamente por separado con los mismos identificadores MQTT. El panel inicial utiliza `SERIAL_SIMULATED=1`; no cambiar a modo real sin revisar placa, pines y firmware. El servicio antiguo que abre el mismo puerto debe detenerse antes del modo real.

`npm run test:iot:panel` verifica el flujo con navegador Edge, servicios reales y serial simulado, y retira solo sus datos de ensayo. `npm run iot:verify` comprueba infraestructura y MQTT de los labs 6 y 7. No escribe evidencias del laboratorio 8.

El laboratorio 6 conserva una instantánea del contrato de datos en `infra/schema.sql` y la configuración local correspondiente. La evolución de seguridad y bases del laboratorio 8 se coordinará con el integrante responsable; no se modificó su carpeta.

El backend evalúa las reglas del informe cada cinco segundos. El umbral de 60 segundos es demostrativo. Las recomendaciones y su auditoría se guardan en PostgreSQL; un aviso al responsable alterno aparece en el panel y no envía mensajes externos. La correspondencia y el contrato `AYUDA` del firmware se detallan en [CORRESPONDENCIA_INFORME.md](../CORRESPONDENCIA_INFORME.md).
