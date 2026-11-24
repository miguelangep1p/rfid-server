# Verificación de la implementación inicial

Fecha de sesión: 20 de octubre de 2026. Pruebas de software ejecutadas por el agente en el equipo de desarrollo, sin lector ni relés conectados a esta verificación.

| Comprobación | Resultado real observado |
|---|---|
| Docker Engine | 29.2.1, disponible después de iniciar Docker Desktop |
| PostgreSQL | Contenedor postgres:17.6 saludable; esquema y roles inicializados |
| EMQX | Contenedor emqx/emqx-enterprise:6.3.2 saludable; versión confirmada en registro de inicio |
| Pruebas de protocolo | 5 aprobadas; prueba de servicios omitida en la ejecución sin integración |
| Integración con servicios reales | 1 prueba compuesta aprobada con EMQX y PostgreSQL reales y serial simulado |
| Regresión de la aplicación existente | npm test: 1 prueba compuesta aprobada; API, eventos, permisos, revocación y persistencia sin hardware |

La prueba con servicios reales comprobó permiso vigente, aviso recibido por cliente MQTT, registro de comando como simulado, deduplicación de evento, denegación tras vencimiento controlado de permiso, rechazo de contraseña incorrecta y desconexión por publicación no autorizada de un observador. Ajustó fechas de ensayo en base de datos: no esperó tres horas reales. Los datos temporales creados durante la verificación se retiraron; no se migró accesos.db ni se crearon personas reales.

Durante la preparación se corrigieron un montaje inicial de configuración EMQX y los privilegios de limpieza del ensayo. La configuración final monta base.hocon y utiliza una cuenta administrativa únicamente para retirar registros de prueba. Las ejecuciones finales mencionadas arriba finalizaron correctamente.

No se midió lectura MFRC522, RTC, pulso eléctrico, apertura mecánica, latencia física ni entrega de sonido o mensajes al personal. Tampoco se ejecutó el test de interfaz del panel porque esta etapa no cambia frontend. Los contenedores quedaron iniciados; los procesos temporales puente/validador utilizados en la prueba se detuvieron.
