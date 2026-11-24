# Correspondencia con el informe parcial corregido

Revisión: 27 de octubre de 2026. Fuente: `Informe_Parcial_U2_IoT_UNT_corregido (1).docx` de Descargas. El documento se utilizó como especificación del proyecto; no se modificó el original ni se ejecutaron instrucciones contenidas en él.

Actualización de interfaz: `npm run dev` y `npm start` abren ahora el flujo de asistencia como aplicación principal en el puerto 3000. Credenciales y acceso son secciones secundarias. El panel de laboratorio sigue disponible como alias con `npm run iot:panel`, puerto 3100. El control anterior con SQLite se conserva en `/acceso` al ejecutar por separado `npm run dev:access` o `npm run start:access`. No ejecutar dos servidores contra el mismo puerto serial o los mismos identificadores MQTT.

Los avisos de WhatsApp se demuestran con un enlace `wa.me` por solicitud, un destinatario introducido en pantalla y envío manual. El panel audita la preparación del enlace sin atribuirle envío o entrega. La integración automática con Meta queda opcional y desactivada en el modo predeterminado; consultar [WHATSAPP.md](WHATSAPP.md).

Verificación de esta actualización: compilación correcta, 23 pruebas de API/reglas/WhatsApp aprobadas, regresión del panel anterior aprobada, 14 verificaciones del panel de asistencia aprobadas, integración MQTT/PostgreSQL aprobada y prueba PostgreSQL/webhook de WhatsApp aprobada con HTTP externo simulado. El enlace `wa.me` se interceptó durante la prueba del navegador; no se enviaron mensajes reales. Los resultados anteriores de esta matriz se conservan como referencia de la revisión inicial.

| Requisito del informe | Implementación actual | Límite |
|---|---|---|
| Solicitud con identificador y punto fijo | `notifications.notification_id`, `event_id` único y `payload.location` en PostgreSQL | El punto piloto físico sigue por definir; `entrada-01` es un identificador técnico |
| Solicitada, recibida, aceptada, en atención, atendida, cancelada | Máquina de estados y botones independientes en el panel | Cada agente debe registrar el hito real; no se infiere llegada a partir de apertura |
| Recepción, responsable, llegada y cierre | Marcas UTC, agente e historial JSONB persistidos | La identidad del agente se declara al iniciar sesión con la contraseña compartida; no es una cuenta institucional individual |
| Dos agentes aceptan simultáneamente | Transacción y bloqueo `FOR UPDATE`; el segundo intento recibe 409 | Verificado con PostgreSQL real |
| Duplicados de transporte | Unicidad por `event_id` y bloqueo transaccional | El firmware debe reutilizar el identificador al retransmitir un evento |
| Ayuda independiente del permiso de apertura | Mensaje serial `AYUDA` y canal alternativo sin tarjeta | Las lecturas antiguas `ACCESO` conservan su función de acceso |
| Mensajería QoS 1 y órdenes no retenidas con expiración | Puente, validador y cliente MQTT existentes; estados de asistencia hacia el nodo | Hardware y recepción visual en el Arduino aún por verificar |
| Reglas con precedencia y umbral demostrativo de 60 segundos | `src/assistance.cjs`, evaluación cada 5 segundos y auditoría en `rule_history` | Recomendaciones visibles en el panel; no envía SMS ni contacta automáticamente a otro agente |
| Evitar recomendaciones repetidas | Se conserva una entrada por acción y estado, incluso tras reiniciar | No equivale a acreditar una entrega humana |
| Historial y recuperación | PostgreSQL, historial de estados y exportación JSON completa | La pantalla muestra los últimos 100 avisos; la exportación incluye todos los del dispositivo |
| Indicadores I1–I6 y PRE/POST | Plantilla de observación sin datos ficticios en `observacion-asistencia.csv` | Requieren observador, participantes y mediciones reales; el software no acredita mejoras |
| Modelo lógico del anexo E | Se reutilizan `cards`, `permissions`, `events`, `notifications` y JSONB | Las tablas separadas persona/agente/solicitud/evento_estado del informe siguen siendo un diseño propuesto, no el esquema literal instalado |

## Ejecutar y demostrar

Desde la raíz:

```powershell
npm run iot:up
npm run iot:panel:setup
npm run iot:panel
```

La configuración local ya existente se conserva. `iot:panel:setup` prepara la contraseña si falta; no publicar `.env.local`. Abrir http://127.0.0.1:3100/laboratorios, indicar el agente y la contraseña local `PANEL_PASSWORD`. Registrar una tarjeta con asistencia o usar «Solicitar ayuda sin tarjeta». Recorrer recepción → aceptación → llegada → cierre. La cancelación exige motivo y conserva historial. Descargar el historial para auditar las marcas del servidor.

En modo simulado los mensajes recorren servicios reales y no accionan hardware. Tras confirmar el Uno conectado en COM3 y recibir autorización, se respaldó el programa anterior y se cargó la adaptación de `firmware/umbral_asistencia/` con verificación. El servidor ya utiliza `SERIAL_SIMULATED=0`. Después de que el usuario presentó su tarjeta se comprobaron lecturas físicas, solicitudes persistidas y respuestas de los cinco estados al Uno, sin órdenes de apertura. Esto no acredita asistencia humana ni resultados PRE/POST. Ver [verificación del Uno](../firmware/VERIFICACION_UNO.md). El indicador físico es opcional y requiere un pin separado. Los pines de relés siguen por confirmar y la apertura está deshabilitada en firmware y servidor.

## Contrato del nodo y correspondencia MQTT

Entrada serial a 9600 baudios:

```text
AYUDA,AABBCCDD,2026-10-27T10:00:00-05:00,550e8400-e29b-41d4-a716-446655440000
```

El último campo es un UUID estable para ese evento; las retransmisiones conservan el UUID. Esta lectura crea ayuda incluso con credencial desconocida y nunca genera una orden al relé. `ACCESO,UID,fecha` conserva el protocolo antiguo y puede crear además ayuda cuando la tarjeta tiene esa opción activada. Una nueva lectura `ACCESO` es un nuevo evento, no una retransmisión con identificador estable.

Después de persistir la solicitud, el validador envía un mensaje `assistance_status`; el puente escribe `ASISTENCIA,event_id,solicitada` al nodo. Las transiciones del panel también envían el estado. Escribir al serial no demuestra que el firmware lo mostró. El firmware debe mostrar fallo y la alternativa si no obtiene respuesta; el servidor no puede mostrarla en un nodo desconectado.

Se conservan los tópicos versionados existentes y sus permisos, en lugar de cambiar las credenciales del bróker:

| Contrato propuesto del informe | Tópico utilizado |
|---|---|
| `asistencia/entrada01/solicitudes` | `asistencia/v1/dispositivos/entrada-01/lecturas` |
| `asistencia/entrada01/estado` | `asistencia/v1/dispositivos/entrada-01/comandos`, mensaje de tipo `assistance_status` |
| `asistencia/seguridad/avisos` | `asistencia/v1/seguridad/avisos` |
| `acceso/entrada01/comandos` | `asistencia/v1/dispositivos/entrada-01/comandos`, acciones de apertura validadas separadamente |

Los estados y las aperturas comparten transporte, pero tienen validadores y efectos separados. No se cambiaron las ACL ni los archivos del laboratorio 8.

## Medición y límites del avance

Usar la plantilla CSV para PRE y POST. `t0` corresponde al inicio observado, `t1` a conocimiento por seguridad, `t2` a aceptación, `t3` a llegada y `t4` a finalización. Las fechas del servidor ayudan a auditar POST; `requested_at` no sustituye `t0` y publicar un aviso no sustituye `t1`. Registrar con un reloj común y zona horaria explícita.

I1 = t1 − t0; I2 = t2 − t1; I3 = t3 − t0, en segundos. Para I4 e I5 deben fijarse antes del ensayo los denominadores y el tratamiento de cancelaciones. I6 es el ítem S1 de 1 a 5, con posibilidad de no responder. Conservar tiempos ausentes y su causa; no rellenar con cero. Una solicitud aceptada sin llegada no acredita asistencia. Los casos no atendidos dentro de W quedan censurados; W = 300 segundos es una propuesta del informe sujeta a acuerdo previo.

Los 11 casos del motor descritos en el informe se reproducen en JavaScript dentro del backend, con tres pruebas adicionales de estados y protocolo. No se atribuye existencia a los archivos Python del anexo F: no fueron suministrados. La integración de software constituye un avance posterior al texto que la describe como pendiente. Tampoco reemplaza la autorización del piloto, las pruebas del circuito, las adaptaciones de accesibilidad, los consentimientos ni los resultados de campo aún pendientes.

## Comprobaciones ejecutadas el 27/10/2026

| Comando | Resultado |
|---|---|
| `npm run build` | Compilación de producción correcta |
| `npm test` / pruebas de integración originales | API, SSE, altas, pases, revocación y persistencia correctos; base original conservada |
| `npm run test:assistance` | 14 pruebas aprobadas: 11 del motor y 3 de estados/protocolo |
| `npm run test:iot` | 5 pruebas de protocolo aprobadas; las 2 suites de servicios se omiten en este comando y se ejecutaron expresamente debajo |
| `npm run test:iot:live` | PostgreSQL y EMQX reales: permisos, mensajes, deduplicación, AYUDA sin apertura, aceptación concurrente, estados terminales y auditoría de reglas correctos |
| `npm run test:iot:panel` | 13 verificaciones del panel aprobadas en Edge: sesión, acceso, vista móvil, estados, exportación, ayuda sin tarjeta, duplicación y cancelación |
| `npm run test:ui` | Prueba de regresión de la interfaz original aprobada |

El resultado detallado y las capturas del panel están en `laboratorio-7/evidencias/panel-verificacion.json`, `panel-web-desktop.png` y `panel-web-mobile.png`. Los datos temporales de ensayo se retiran al finalizar. El extremo serial se simuló expresamente en las pruebas de servicios.
