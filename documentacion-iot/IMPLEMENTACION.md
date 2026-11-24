# Implementación inicial de los laboratorios

Alcance vigente: trabajar solo laboratorios 6 y 7. El laboratorio 8 queda para otro integrante. La vista Next.js ya está conectada al gateway en http://127.0.0.1:3100/laboratorios; ver [ENTREGA_6_7.md](ENTREGA_6_7.md) y [guía del panel](laboratorio-7/PANEL.md). El comando `npm run iot:panel` supervisa puente y validador. La configuración usa el contrato de datos de `laboratorio-6/infra`, sin cargar archivos desde laboratorio-8. Los párrafos siguientes describen la etapa inicial y se conservan como historial técnico.

Actualización del 24 de octubre de 2026: los informes independientes y la nueva verificación de 21 comprobaciones de software se encuentran en [ENTREGA.md](ENTREGA.md). Se agregaron los clientes separados `iot:publish` e `iot:subscribe`, prueba de WebSocket y capturas del Dashboard. Este documento conserva las instrucciones de la implementación inicial.

Esta primera etapa implementa un entorno separado del panel original: EMQX y PostgreSQL en Docker, un puente serial–MQTT, un validador y un suscriptor de avisos en consola. Los archivos `server.js`, `app/page.js` y `accesos.db` conservan su funcionamiento anterior. Next.js se mantiene como frontend del proyecto; su conexión a estos nuevos servicios es una siguiente etapa, no una migración ya realizada.

## Archivos por laboratorio

| Laboratorio | Implementación |
|---|---|
| 6 | `compose.yaml`, `setup.cjs`, credenciales locales generadas, EMQX Enterprise 6.3.2 y PostgreSQL 17.6 con volúmenes propios y digests fijados |
| 7 | `src/protocol.cjs`, `bridge.cjs`, `validator.cjs`, `repository.cjs`, `observer.cjs`: mensajes, puente, reglas, registro transaccional y observación de avisos |
| 8 | `schema.sql`, `create-card.cjs`: separación entre credenciales MQTT y permisos físicos; usuarios y ACL generados por el setup |

Las credenciales del bróker se verifican contra PostgreSQL. El rol `mqtt_reader` solo consulta el esquema `mqtt_security`; `iot_app` puede consultar, insertar y actualizar los datos de control de acceso, sin borrar registros. Bridge, validator y observer tienen credenciales MQTT distintas y solo los tópicos necesarios. El observador no puede publicar órdenes.

## Arranque desde la raíz del repositorio

Requiere Node.js 22, Docker Desktop con motor Linux activo y las dependencias de npm instaladas.

```powershell
npm install
npm run iot:setup
npm run iot:up
```

`iot:setup` se ejecuta una sola vez: genera contraseñas aleatorias y se niega a sobrescribir archivos existentes. En este equipo ya se ejecutó y los contenedores se iniciaron. Para volver a arrancar, basta `npm run iot:up`. No eliminar configuración ni volúmenes para repetir una prueba; el SQL de inicialización solo se ejecuta al crear un volumen PostgreSQL vacío.

El Dashboard está en http://127.0.0.1:18083; usuario `admin` y contraseña generada en `laboratorio-6/.env.local` (`EMQX_DASHBOARD_PASSWORD`). No compartir ese archivo. Puerto MQTT local: 1883. PostgreSQL local: 55432, base `asistencia`. Las conexiones están publicadas únicamente en loopback; este montaje es un laboratorio local sin TLS en MQTT. Para otro equipo se requiere TLS y configuración de red correspondiente. El cliente rechaza MQTT sin TLS fuera de localhost.

En tres terminales independientes:

```powershell
npm run iot:observer
```

```powershell
npm run iot:validator
```

```powershell
npm run iot:bridge
```

El modo inicial es `SERIAL_SIMULATED=1`: escribir en la terminal del puente una línea como `ACCESO,A1B2C3D4,2026-10-20 09:00:00`. El UID es ilustrativo. Sin un permiso creado para esa tarjeta, la decisión registrada es DENEGADO y no se emite orden. La fecha del dispositivo se conserva como texto y no determina la autorización.

Para crear un permiso de ensayo, seleccionar explícitamente el comienzo y usar el formato:

```powershell
$inicioEnsayo = (Get-Date).ToUniversalTime().ToString('o')
npm run iot:card -- A1B2C3D4 "Persona de prueba" 1 true $inicioEnsayo
```

Este comando crea un permiso de tres horas desde el instante suministrado y marca la solicitud de asistencia. El ejemplo elige el instante actual para el ensayo; no resuelve la regla institucional sobre comienzo de vigencia. `false` desactiva la solicitud de asistencia. Renovar conserva la historia y revoca los permisos anteriores de esa tarjeta para ese dispositivo. No es una migración de datos de SQLite ni un registro de participantes reales.

En modo simulado se imprime `SIMULADO, sin apertura física`. El observador muestra avisos MQTT únicamente en consola. No se reproduce sonido ni se envía SMS/WhatsApp/correo; no hay confirmación del guardia. El estado `mqtt_published` significa acuse del bróker, no entrega humana. El estado `serial_write_completed` significa escritura serial, no apertura física.

## Uso posterior con Arduino

Revisar primero el sketch, placa, pines, polaridad y manejo de comandos. Después, detener la aplicación antigua que abra el mismo COM, establecer `SERIAL_SIMULATED=0` y `SERIAL_PATH` correcto en el archivo local y arrancar el puente. Solo un proceso puede poseer el puerto. El comando de configuración COM3 es un valor inicial, no una verificación del puerto real.

El puente acepta exclusivamente órdenes CONCEDIDO o ABRIR con relé numérico 1 o 2, identificadores UUID y vigencia máxima de cinco segundos. Descarta mensajes retenidos, órdenes anteriores a su arranque y duplicados aún vigentes. Aplica una exclusión de tres segundos entre órdenes para no saturar un firmware posiblemente bloqueante; no mide ni controla la duración eléctrica real del relé. El protocolo serial sigue careciendo de confirmación y de identificador de comando. No hay garantía de ejecución exactamente una vez ante reinicios o fallas eléctricas.

Las decisiones se guardan transaccionalmente antes de publicar. Una lectura duplicada no genera otra orden. Los envíos fallidos quedan registrados; esta etapa no incorpora un despachador de reintentos para avisos pendientes ni reabre con comandos guardados. Tras reconectar, las lecturas antiguas se descartan. Se requiere procedimiento manual de asistencia ante fallas.

## Verificación

```powershell
npm run test:iot
npm run test:iot:live
npm test
```

`test:iot` ejecuta validación del protocolo sin hardware y omite por defecto la prueba que requiere servicios. `test:iot:live` usa los contenedores reales y simula exclusivamente el extremo serial. La prueba utiliza tarjetas aleatorias, procesos temporales y limpia sus propios registros con la cuenta de administración del entorno de ensayo; el servicio de aplicación no recibe privilegios DELETE.

Los resultados de esta sesión constan en [VERIFICACION_IMPLEMENTACION.md](VERIFICACION_IMPLEMENTACION.md). No equivalen a la evaluación experimental de personas, alcance de lector, tiempos de apertura o entrega al guardia.

Para detener los contenedores conservando datos:

```powershell
npm run iot:down
```

## Pendiente para la siguiente etapa

- Conectar el panel Next.js al backend PostgreSQL/MQTT, con autenticación del operador y estado real del puente. El panel original sigue usando SQLite y serial.
- Migrar datos si se decide conservarlos, con respaldo y validación del esquema.
- Verificar sketch, puertos y apertura física; no se modificó firmware.
- Definir canal de mensajería, sonido, confirmación y tratamiento de avisos pendientes.
- Confirmar inicio de los permisos y equivalencias académicas de motores, clientes y virtualización.
- Ejecutar la prueba real de duración de tres horas y demás mediciones con hardware.

## Fuentes técnicas usadas

Configuración basada en documentación actual y comprobada en el contenedor instalado, sin plugins antiguos:

- [Docker e imagen EMQX 6.3.2](https://docs.emqx.com/en/emqx/latest/get-started/deploy/install-docker.html).
- [Precedencia y archivo base.hocon](https://docs.emqx.com/en/emqx/latest/guides/configuration/configuration.html).
- [Autenticador PostgreSQL](https://docs.emqx.com/en/emqx/latest/guides/access-control/authn/postgresql.html).
- [Autorizador PostgreSQL](https://docs.emqx.com/en/emqx/latest/guides/access-control/authz/postgresql.html).
