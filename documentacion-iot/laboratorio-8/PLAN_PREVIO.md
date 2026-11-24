# Laboratorio 8 — Autenticación y autorización MQTT con PostgreSQL

> Este desarrollo recoge la revisión previa. Para el código implementado y las comprobaciones posteriores, consultar [IMPLEMENTACION.md](../IMPLEMENTACION.md) y [VERIFICACION_IMPLEMENTACION.md](../VERIFICACION_IMPLEMENTACION.md).

## Alcance y estado de la entrega

Desarrollo documental aplicado al “Sistema IoT de control de acceso con NFC para la asistencia a personas con discapacidad”. No se ejecutaron instalaciones ni pruebas de hardware para esta entrega. Se distingue la implementación visible en código de las propuestas y de los requisitos sin evidencia. Se conserva Next.js y PostgreSQL como objetivo; esta copia del servidor utiliza Node.js/Express y SQLite. El sketch Arduino sigue sin localizarse.

## Objetivo y requisitos de la guía

La secuencia utiliza un entorno Windows virtualizado, administración remota de MySQL, una base laboratorio, tablas mqtt_user y mqtt_acl, y configuración de un plugin MySQL para EMQX. Finalmente modifica y comprueba publicador y suscriptor. La página 4 remite explícitamente a documentación de EMQX 4.3.

## Desarrollo aplicado al proyecto

1. Registrar entorno real, versión de PostgreSQL y versión/edición de EMQX. No trasladar automáticamente el plugin EMQX 4.3 a versiones actuales.
2. Solicitar equivalencia académica de PostgreSQL y pgAdmin/psql frente a MySQL/phpMyAdmin, así como del entorno de virtualización y los clientes Node.js.
3. Separar las tablas de personas, tarjetas y permisos físicos de las credenciales de clientes MQTT y sus reglas de tópicos.
4. Crear identidades distintas para puente, validador y notificador. No utilizar cuentas de administración como clientes operativos.
5. Configurar autenticación y autorización con la documentación correspondiente a la instancia seleccionada; comprobar consultas, formato del hash y comportamiento de denegación.
6. Verificar conexiones válidas e inválidas y operaciones permitidas y denegadas, conservando trazas sin contraseñas.

## 5. Integración propuesta con MQTT y EMQX

### Verificación de versión

La consulta a las notas oficiales el 20 de octubre de 2026 identificó **EMQX Enterprise 6.3.2**, publicado el 16 de octubre de 2026. Esto verifica una versión publicada, no la instalada en el proyecto. Versión, edición, modalidad de despliegue y licencia disponibles: **por confirmar**. Antes de configurar, registrar la versión mostrada por la instancia y revisar su documentación específica. No se entregan archivos antiguos de plugins ni una configuración ejecutable cuya compatibilidad no pueda verificarse.

Fuente: [Notas oficiales de EMQX Enterprise 6](https://docs.emqx.com/en/emqx/latest/release-notes/changes-ee-v6.html).

La documentación actual describe integración PostgreSQL para autenticación y autorización; deben verificarse disponibilidad y opciones en la edición seleccionada. No basta con sustituir el nombre MySQL en una configuración previa. Fuentes: [Autenticación PostgreSQL](https://docs.emqx.com/en/emqx/latest/guides/access-control/authn/postgresql.html) y [Autorización PostgreSQL](https://docs.emqx.com/en/emqx/latest/guides/access-control/authz/postgresql.html).

### Roles y tópicos propuestos

El puente será el único proceso propietario del puerto serial. El manejador serial actual deberá trasladarse o desactivarse para evitar dos procesos leyendo el mismo puerto o dos decisiones de apertura. El servicio de validación puede reutilizar el backend Node.js/Express observado; su uso definitivo en despliegue está por confirmar.

| Tópico | Publicador | Suscriptor | Finalidad |
|---|---|---|---|
| `asistencia/v1/dispositivos/entrada-01/lecturas` | Puente | Servicio de validación | UID y fecha de lectura |
| `asistencia/v1/dispositivos/entrada-01/comandos` | Servicio de validación | Puente de entrada-01 | Orden de apertura autorizada |
| `asistencia/v1/dispositivos/entrada-01/resultados` | Puente | Servicio de validación | Estado del envío serial, sin atribuir apertura física |
| `asistencia/v1/dispositivos/entrada-01/estado` | Puente | Servicio de supervisión | Conectividad del puente y serial |
| `asistencia/v1/seguridad/avisos` | Servicio de validación | Servicio de notificación | Solicitud de asistencia |
| `asistencia/v1/seguridad/confirmaciones` | Servicio de notificación | Servicio de validación | Recepción confirmada por guardia, cuando exista |

El panel recibe eventos mediante API/SSE del backend; no necesita credenciales del bróker. Si se exige un cliente web MQTT, su implementación y alcance se consultarán con el docente.

Ejemplos ilustrativos; identificadores y tiempos no constituyen resultados de pruebas:

```json
{"schema":1,"event_id":"evt-ejemplo-001","device_id":"entrada-01","uid":"A1B2C3D4","device_time_raw":"2026-10-20 09:00:00","received_at":"2026-10-20T14:00:00Z"}
```

```json
{"command_id":"cmd-ejemplo-001","event_id":"evt-ejemplo-001","action":"CONCEDIDO","relay":1,"issued_at":"2026-10-20T14:00:00Z","expires_at":"2026-10-20T14:00:05Z"}
```

```json
{"command_id":"cmd-ejemplo-001","status":"serial_write_completed","physical_open":null}
```

```json
{"notification_id":"aviso-ejemplo-001","event_id":"evt-ejemplo-001","location":"entrada-01","type":"asistencia_solicitada","message":"Se requiere apoyo en el ingreso","channel":"por_confirmar"}
```

El vencimiento de cinco segundos del ejemplo es una propuesta de vigencia del comando, distinta de la duración del relé y del permiso personal; deberá ajustarse y verificarse mediante pruebas.

Se propone QoS 1 con deduplicación por identificador, comandos sin retención y descarte de órdenes vencidas. Tras una reconexión no deben ejecutarse aperturas atrasadas. Las retransmisiones no deben producir nuevas aperturas. La deduplicación en el puente reduce duplicados MQTT, pero el protocolo serial actual no transporta identificadores ni confirmaciones: no garantiza ejecución exactamente una vez ante un reinicio. Una confirmación del firmware y un identificador serial serían extensiones propuestas, no funciones actuales. La indisponibilidad del servicio debe impedir nuevas aperturas automáticas y activar asistencia manual; no se enviarán comandos de apertura acumulados al recuperar conexión.

### Tres controles independientes

- **Acceso físico:** determina si una persona puede usar un acceso durante un intervalo y qué relé corresponde.
- **Autenticación MQTT:** identifica al puente o servicio que establece conexión; no autentica a la persona portadora de la tarjeta.
- **Autorización MQTT:** limita qué tópicos puede publicar o suscribir cada cliente. El puente solo publica lecturas/resultados/estado de su dispositivo y se suscribe a sus comandos; el validador tiene permisos inversos y publica avisos. El notificador no publica comandos de apertura.

Se propone TLS con validación del certificado, credenciales independientes por servicio y denegación de operaciones no autorizadas. Las credenciales del guardia para administrar el panel constituyen otro control de aplicación; la API local disponible no muestra autenticación. No exponerla como panel remoto de producción sin implementar ese control. El UID identifica una tarjeta; no debe describirse como prueba criptográfica de identidad ni de discapacidad.

## 6. Conservación de Next.js y PostgreSQL; adaptación desde MySQL

Next.js se mantiene como interfaz. PostgreSQL se mantiene como base objetivo sin presentar la copia SQLite actual como PostgreSQL. Se propone sustituir la capa `sql.js` por un controlador PostgreSQL, parametrizar consultas, migrar datos con respaldo y verificar transacciones y fechas. Este documento no realiza esa migración.

| Ejercicio o construcción MySQL | Adaptación PostgreSQL propuesta |
|---|---|
| `AUTO_INCREMENT` | `GENERATED ALWAYS AS IDENTITY` |
| Identificadores entre backticks | Nombres sin comillas o comillas dobles cuando sea necesario |
| `TINYINT(1)` para estado | `BOOLEAN` |
| `DATETIME` y `DATE_ADD(... INTERVAL 3 HOUR)` | `TIMESTAMPTZ` y `inicio + INTERVAL '3 hours'` |
| Marcadores `?` | Parámetros `$1`, `$2`, según el controlador |
| `ON DUPLICATE KEY UPDATE` | `ON CONFLICT ... DO UPDATE`, con restricción única explícita |
| Usuarios y privilegios MySQL | Roles y privilegios PostgreSQL con alcance equivalente |

La guía 8 cita EMQX 4.3 (p. 4) y utiliza plugins de esa generación. No copiar esa configuración en la versión actual: reconstruir autenticación y autorización según la instancia elegida. El usuario del Dashboard es distinto de un cliente MQTT y de un permiso físico.

phpMyAdmin no administra PostgreSQL; se propone pgAdmin o psql como equivalente, previa aceptación docente. No trasladar literalmente el acceso general de Apache ni `bind-address=0.0.0.0`: definir conectividad restringida, `listen_addresses` y `pg_hba.conf` según versión y despliegue. La secuencia se adapta para demostrar conectividad y permisos.

La copia actual también requiere sustituir `INSERT OR REPLACE`, `datetime('now','localtime',...)` y la exportación del archivo SQLite. La regla propuesta es almacenar instantes con zona horaria, evaluar vigencias en el servidor y presentar fechas en `America/Lima`. No utilizar la hora no verificada del RTC como única autoridad para permisos.

Debe consultarse al docente si el laboratorio admite PostgreSQL en lugar de MySQL, si exige un conector EMQX específico, una versión determinada, capturas o comandos del motor original, y si la alternativa no relacional requiere solo diseño o implementación. La equivalencia conceptual no prueba cumplimiento formal de la rúbrica.

Para permisos de tres horas se propone `valido_hasta = valido_desde + INTERVAL '3 hours'` y validez en el intervalo semiabierto `[valido_desde, valido_hasta)`. Inicio desde emisión, aprobación o primer uso: **por confirmar**. Si se adopta emisión, coincide conceptualmente con el código disponible; primer uso exigiría registrar ese instante de manera atómica. Renovar no debe borrar la historia del permiso anterior.

## Modelo académico de control de clientes MQTT

| Conjunto separado de permisos físicos | Campos conceptuales | Finalidad |
|---|---|---|
| mqtt_user | username único, password_hash, salt si corresponde al algoritmo, activo | Identidad del cliente de servicio |
| mqtt_acl | cliente, permission, action, topic | Reglas de publicación y suscripción |

Es un diseño conceptual: nombres, consulta de autenticación, algoritmos y campos exactos se ajustarán a la versión instalada. No se proporcionan contraseñas de ejemplo utilizables ni se afirma que estas tablas ya existan.

| Cliente | Publicación permitida | Suscripción permitida |
|---|---|---|
| Puente entrada-01 | Lecturas, resultados y estado de entrada-01 | Comandos de entrada-01 |
| Validador | Comandos y avisos de asistencia | Lecturas, resultados y confirmaciones |
| Notificador | Confirmaciones | Avisos de asistencia |

Denegar operaciones restantes. Las cuentas del panel de seguridad y del Dashboard de EMQX pertenecen a controles distintos. Un cliente MQTT autenticado no recibe por ello permiso físico para una persona.

## Pruebas de autenticación y autorización

| Caso | Resultado esperado, no ejecutado |
|---|---|
| Credencial de cliente válida | Conexión aceptada según política |
| Contraseña incorrecta o cliente deshabilitado | Conexión rechazada |
| Puente publica lectura de su entrada | Operación permitida |
| Puente publica una orden de apertura | Operación denegada |
| Puente intenta comandos de otro dispositivo | Suscripción denegada |
| Notificador intenta abrir un acceso | Publicación denegada |
| Credencial revocada tras reconexión | Nueva conexión rechazada; revisar caché y sesiones según configuración |
| Autorización no disponible | Comprobar que ninguna otra fuente o política permite operaciones inesperadas |

## Estado de cumplimiento y evidencias pendientes

No se encontró configuración EMQX ni autenticación MQTT en el repositorio. Adaptación, tablas y pruebas están propuestas. Faltan aprobación docente, versión exacta, configuración efectiva, acceso restringido a PostgreSQL y trazas de aceptación/denegación. Ningún registro de entrega del laboratorio debe inventarse.

