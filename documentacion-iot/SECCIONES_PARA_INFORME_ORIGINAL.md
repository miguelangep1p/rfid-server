# Secciones para incorporar al primer informe

Base: Informe IOT 1 Unidad.docx de Descargas. Estas sustituciones conservan su organización y actualizan el propósito. Las secciones técnicas ampliadas, matriz de laboratorios y pruebas se encuentran en INFORME_ACTUALIZADO.md.

## Título

Sistema IoT de control de acceso con NFC para la asistencia a personas con discapacidad.

## 1.2. Descripción del problema

El control de acceso requiere atender tanto la autorización de ingreso como las necesidades de asistencia de las personas usuarias. Un registro de credenciales, por sí solo, no comunica al personal de seguridad cuándo se requiere apoyo. Se propone asociar las tarjetas a un perfil mínimo de asistencia y generar avisos al personal responsable. El lugar de implementación, las barreras observadas y la frecuencia de incidencias están por confirmar mediante levantamiento de información; no se atribuyen problemas medidos a una institución sin evidencia.

## 1.3. Hipótesis

La integración de identificación mediante tarjeta, validación centralizada y avisos de asistencia podría facilitar la coordinación del personal de seguridad durante el ingreso de personas con discapacidad. Esta hipótesis se evaluará mediante pruebas de lectura, decisiones, apertura y entrega de notificaciones. No se presenta como resultado demostrado.

## 1.4. Justificación

**Teórica.** Se conserva la aplicación de identificación por radiofrecuencia, actuadores y validación centralizada descrita en el primer informe. Se incorpora comunicación MQTT mediante un servicio puente y automatización basada en reglas. Los antecedentes del documento original sirven como referencias de trabajo; sus resultados no se transfieren al prototipo.

**Práctica.** La propuesta busca comunicar oportunamente una solicitud de asistencia al guardia y facilitar un ingreso autorizado. La gestión de credenciales y permisos temporales complementa esta función. No se presume que todas las personas con discapacidad requieran la misma asistencia.

**Ambiental.** El registro digital podría disminuir el uso de formatos impresos. Los posibles efectos sobre duplicación de llaves, consumo energético y residuos electrónicos requieren evaluación; no se declara una reducción comprobada.

**Económica.** La administración de credenciales podría reducir tareas de reposición de llaves y coordinación manual. El beneficio económico depende del contexto y deberá contrastarse con adquisición, mantenimiento y operación reales.

## 1.5.1. Objetivo general

Desarrollar y evaluar un sistema IoT de control de acceso con NFC, validación centralizada y avisos al personal de seguridad para facilitar el ingreso y la asistencia a personas con discapacidad.

## 1.5.2. Objetivos específicos

1. Integrar la lectura de tarjetas y la fecha del RTC con la comunicación serial del Arduino.
2. Validar credenciales y permisos permanentes o temporales, manteniendo trazabilidad de las decisiones.
3. Proponer e implementar, en una etapa pendiente, un puente serial–MQTT con EMQX que transporte lecturas y órdenes a los dos relés.
4. Mantener Next.js e incorporar PostgreSQL como persistencia objetivo, migrando el almacenamiento SQLite observado.
5. Asociar las solicitudes de asistencia con avisos visuales, sonido complementario y un canal de mensajería por confirmar.
6. Medir lecturas correctas, errores, latencia de activación, entrega de avisos y vencimiento de permisos.

## 1.6. Población beneficiada

Las personas con discapacidad que soliciten asistencia constituyen la población beneficiaria principal. El personal de seguridad recibe avisos y coordina el apoyo; la administración gestiona credenciales y permisos. Institución, cantidad de personas, participantes de pruebas y criterios de selección: por confirmar.

## 2. Solución tecnológica actual

El primer informe describe un escenario de llaves físicas, coordinación con el propietario y vigilancia eventual. Se conserva como descripción de referencia, pendiente de validar en la institución seleccionada. No debe presentarse como observación de campo realizada si no existe evidencia.

En el prototipo de software disponible, Next.js presenta usuarios y accesos; Node.js/Express consulta SQLite mediante sql.js, recibe lecturas seriales y envía comandos al Arduino. La incorporación efectiva de PostgreSQL y MQTT permanece pendiente. El avance académico adicional ya plantea asistencia y virtualización; se conserva como propuesta.

## 3.1. Esquema explicativo propuesto

La solución comprende un nodo Arduino con lector MFRC522, RTC DS3231 y dos relés, un equipo conectado por serial, un servicio de validación, PostgreSQL y una interfaz Next.js para el personal de seguridad. En la ampliación MQTT, el equipo ejecutará un puente que publique lecturas en EMQX y traduzca las órdenes recibidas a comandos seriales. Arduino no se describe como cliente MQTT ni como dispositivo Wi-Fi con la evidencia disponible.

## 3.2. Montaje y lectura RFID/NFC en Arduino

Se conservan SPI para el lector e I2C para el RTC como esquema de integración descrito originalmente, sujeto a verificar el montaje. El modelo de placa, las conexiones y los pines de ambos relés están por confirmar. La lectura genera `ACCESO,UID,fecha_hora`; la recepción de `CONCEDIDO,n` o `ABRIR,n` activa el relé correspondiente durante los tres segundos reportados. El sketch no fue localizado y esta descripción no sustituye su revisión ni la prueba física.

Se retiran como hechos demostrados el envío directo por Wi-Fi/HTTPS, la lista local de credenciales, las colas offline y las señales LED/buzzer. Tampoco se conservan alcances de lectura como mediciones del prototipo. Deben comprobarse con los componentes y tarjetas utilizados.

## 3.3. Validación centralizada e interfaz de gestión

El servidor disponible valida UID, estado activo y vencimiento; responde por serial y registra el resultado. El panel Next.js muestra los eventos mediante SSE y ofrece altas, revocación y apertura manual. Estas funciones están presentes en código, sin validación física en esta revisión.

La ampliación propuesta utiliza PostgreSQL para consultar permisos y perfiles mínimos de asistencia. Cuando corresponda, generará una solicitud de apoyo al personal de seguridad. Hay avisos visuales y notificaciones de navegador en el código; sonido, mensajería externa y confirmación del guardia requieren implementación o evidencia. Firebase Cloud Messaging aparece en el primer informe como tecnología propuesta, no como canal confirmado.

Los pases actuales se asocian a UID y vencen desde su creación según la hora del servidor; no existe evidencia de enlaces o códigos QR operativos. Su duración debe ajustarse al requisito de tres horas y confirmarse el instante de inicio acordado.

## 3.4. Procesos y procedimientos

Se conservan lectura, validación, registro, revocación, gestión temporal y apertura manual. Se actualiza el transporte a serial en el estado actual y a puente MQTT en la propuesta. No se asegura autenticación del operador, exportación CSV/PDF, ingreso mediante QR ni funcionamiento autónomo sin conexión, pues no se localizaron esas funciones en el código revisado. La tabla de resultados incluida en esta carpeta es una plantilla académica, no una exportación de la aplicación.

Ante una falla de comunicación, la propuesta evita nuevas aperturas automáticas sin validación y remite al procedimiento de asistencia manual. Esto no describe el estado mecánico de la cerradura al perder energía, que está por confirmar.

## 3.5. Personal responsable

Se conservan los roles de administración, integración IoT y mantenimiento. Se incorpora al personal de seguridad como receptor de avisos y responsable de confirmar el apoyo, conforme al procedimiento institucional por definir. Las personas usuarias indican la asistencia requerida; la tarjeta no permite inferir una discapacidad.

## 3.6. Tecnología propuesta

| Componente | Situación actual / objetivo |
|---|---|
| Arduino, MFRC522 y DS3231 | Reportados; placa y montaje por confirmar |
| Dos relés | Requisito reportado; pines, polaridad y actuador por confirmar |
| Next.js | Frontend implementado en código |
| Node.js/Express | Backend de esta copia; despliegue por confirmar |
| PostgreSQL | Objetivo; migración desde SQLite pendiente |
| EMQX y puente serial | Propuesta pendiente de implementación |
| Mensajería y sonido | Canal y funcionamiento por confirmar |

Se sustituyen las alternativas Android/Kotlin/Flutter y Mosquitto del primer informe por Next.js y EMQX en la propuesta actual. No se exige agregar un módulo Wi-Fi al Arduino para el esquema con puente serial.

## 3.7–3.8. Proveedores y presupuesto

Se conserva el listado original como antecedente de planificación, no como cotización vigente. Deben actualizarse cantidades para dos relés, equipo del puente, actuadores y servicios definitivos. El módulo de un canal y ESP8266 presupuestados originalmente no describen el montaje confirmado. La placa presupuestada como Mega no prueba qué placa se utiliza.

La comprobación aritmética del presupuesto original indica que sus partidas de hardware suman S/ 225; RRHH, S/ 1575; y un mes de servicios, S/ 25. Su suma es S/ 1825, coherente con el total escrito. Se mantiene únicamente como estimación histórica, sin atribuirle vigencia comercial. Firebase gratuito y licencias requieren revisión si finalmente se seleccionan esos servicios. Los costos actuales quedan por confirmar; no se han solicitado nuevas cotizaciones.

## 3.9. Calificación de innovación

Se conservan identificación electrónica, registro, revocación, permisos temporales y apertura manual como capacidades presentes en código o reportadas según la matriz. Se incorporan coordinación de asistencia, separación de permisos físicos y MQTT, y trazabilidad de notificaciones como mejoras propuestas. Modo offline, reportes exportables, push externo y escalabilidad demostrada no se califican como logros implementados. No se asigna una puntuación de innovación sin criterios y evidencia.

## 3.10. Comparativa de elementos electrónicos

Se conserva la selección del MFRC522 y la comparación conceptual con otras formas de identificación. Deben retirarse las etiquetas generales de seguridad media-alta, los alcances no medidos y la compatibilidad garantizada con teléfonos. La compatibilidad concreta depende del protocolo, tarjeta y aplicación y queda por verificar. Leer un UID no acredita autenticación criptográfica ni resistencia a clonación.

## 4. Referencias y antecedentes

Conservar la bibliografía original para revisión y evitar trasladar indicadores de estudios previos a los resultados propios. No se validaron externamente esas referencias en esta revisión. Antes de la entrega, comprobar correspondencia de autores, año, título y repositorio; algunas entradas están duplicadas y una referencia atribuida a UCV apunta a un dominio PUCP. No completar datos bibliográficos por inferencia.
