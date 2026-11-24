# Firmware de asistencia Umbral

Adaptación del programa Arduino compartido por el usuario el 27/10/2026. Abrir `umbral_asistencia/umbral_asistencia.ino` junto con `config.h` en Arduino IDE.

## Configuración inicial

- MFRC522: SS en D10 y RST en D9, conservados del programa original. Las demás conexiones SPI y las del RTC corresponden a la placa utilizada; no se presume un cableado nuevo.
- Serial: 9600 baudios, con salto de línea al final de cada trama.
- Lectura de tarjeta: crea una solicitud de ayuda, sin ordenar apertura.
- Relés: deshabilitados. Los pines originalmente estaban vacíos; no se asignaron pines de tu circuito sin conocerlo.
- LED de estado: opcional y deshabilitado. El programa conserva los estados y los reporta por serial; para señalización física hace falta conectar y configurar un indicador independiente.
- Objetivo de compilación: placas AVR Uno, Nano clásico o Mega. Las placas de otras familias requieren adaptar la EEPROM.

Instalar desde el gestor de bibliotecas **MFRC522**, **RTClib de Adafruit** y su dependencia **Adafruit BusIO**. Para verificar localmente se utilizaron MFRC522 1.4.12, RTClib 2.1.4 y Adafruit BusIO 1.17.4; sus copias de compilación están en `.arduino-user/libraries` y no se incluyen en la entrega.

## Relés y señalización

Editar `config.h` después de confirmar los pines reales:

1. Definir `UMBRAL_RELAY1_PIN` y `UMBRAL_RELAY2_PIN` con los valores de tu circuito.
2. Establecer `UMBRAL_ENABLE_RELAYS` en `1` si se necesita apertura.
3. Confirmar que el módulo usa LOW para activar y HIGH para desactivar, como en el programa original. Si el módulo funciona al revés, ajustar las dos constantes de nivel.
4. Si se añade un LED, definir `UMBRAL_STATUS_LED_PIN` con un pin separado. El programa rechaza conflictos con los relés, UART, lector, SPI e I2C. No usar D13 en Uno para el indicador: forma parte del bus SPI utilizado por el lector.

Los comandos válidos son exactamente `ABRIR,1`, `ABRIR,2`, `CONCEDIDO,1` y `CONCEDIDO,2`. Otros valores no se convierten en apertura del relé 1. La salida vuelve al nivel inactivo después de 3000 ms usando `millis()`, mientras el programa continúa leyendo mensajes y tarjetas. Si el mismo relé ya está activo, otro comando no prolonga su activación. Esto acredita programación de la salida, no apertura mecánica de la cerradura.

Con el LED opcional configurado: pulso lento para espera/solicitada, pulso más rápido para recibida, encendido continuo para aceptada/en atención, apagado para cierre/cancelación y parpadeo rápido ante falta de confirmación. El LED se refiere a la última tarjeta presentada; los detalles de todas las solicitudes se consultan en el panel.

## Flujo con el servidor

Ejemplo de salida al presentar una tarjeta:

```text
AYUDA,74D81506,2026-10-27 10:30:00,554e5401-0000-4000-8000-000100000001
```

El servidor persiste la solicitud y responde:

```text
ASISTENCIA,554e5401-0000-4000-8000-000100000001,solicitada
```

Después recibe `recibida`, `aceptada`, `en_atencion`, `atendida` o `cancelada` cuando el personal registra esos hitos. El firmware correlaciona cada respuesta por identificador y evita retroceder a un estado anterior por una repetición de mensajes. No acciona los relés al recibir estados de asistencia.

Se conservan hasta cuatro solicitudes activas de tarjetas distintas en RAM. Volver a presentar una tarjeta activa reutiliza su identificador; no crea otra solicitud mientras siga en uno de esos cuatro espacios. Una tarjeta cuyo apoyo ya terminó puede crear una solicitud nueva. Ante una quinta tarjeta sin espacio se informa `COLA_LOCAL_LLENA_USAR_CANAL_ALTERNATIVO`; no se borra una solicitud existente. El panel permite pedir ayuda sin tarjeta por la vía alternativa.

Sin confirmación de persistencia hay hasta tres envíos, separados por tres segundos y con idéntico UID, fecha e identificador. A los diez segundos se informa `SIN_CONFIRMACION_USAR_CANAL_ALTERNATIVO`. No se da por entregada la ayuda. Una nueva presentación de esa tarjeta permite consultar/reintentar el mismo evento.

La cola local está en RAM: se pierde al reiniciar. Los registros ya persistidos permanecen en PostgreSQL y se consultan en el panel. Los identificadores nuevos combinan un espacio de nombres por nodo, un contador de arranques en EEPROM y una secuencia por arranque. Se reservan **los bytes 0 a 17 de EEPROM**, con dos registros alternados y comprobación de escritura. Cambiar `UMBRAL_DEVICE_NAMESPACE` en cada nodo físico y si se borra o reemplaza su EEPROM. Los identificadores sirven para deduplicación; no son credenciales de autenticación.

Si el DS3231 falta o indica pérdida de hora, la trama utiliza `RTC_NO_VALIDO`. El servidor registra su propia recepción y conserva esa advertencia como fecha bruta del dispositivo. No se ajusta el RTC automáticamente con la fecha de compilación: hay que ponerlo en hora con el procedimiento de RTClib y documentar la zona horaria utilizada.

Para conservar el modo de control de acceso anterior se puede establecer `UMBRAL_ASSISTANCE_ONLY=0`: las tarjetas enviarán `ACCESO,UID,fecha`. En ese modo se conservan las decisiones de acceso del backend, y una tarjeta puede generar también ayuda si tiene activada esa opción en el panel. El modo recomendado para el punto de ayuda es `1`.

## Carga y conexión física

1. Confirmar modelo de placa y cableado. Seleccionar la placa y el puerto en Arduino IDE.
2. Detener el servidor que usa el USB antes de cargar el programa.
3. Abrir el sketch y cargarlo. Cerrar el Monitor Serial antes de iniciar el servidor.
4. En `documentacion-iot/laboratorio-6/.env.local`, cambiar solo estas opciones:

```env
SERIAL_SIMULATED=0
SERIAL_PATH=COM3
SERIAL_BAUD_RATE=9600
```

`COM3` es únicamente el valor actual de configuración: sustituirlo por el puerto real. Mantener las credenciales existentes de PostgreSQL y MQTT.

5. Ejecutar `npm run iot:up` y `npm run dev` desde la raíz. Abrir http://127.0.0.1:3000 y presentar una tarjeta.
6. Comprobar una solicitud persistida, repetir lectura sin duplicación, recorrer todos los estados y ensayar desconexión. Si hay relés configurados, comprobarlos en banco antes de usar la cerradura.

WhatsApp sigue funcionando desde el panel con enlace `wa.me`; este sketch no necesita Internet ni envía mensajes de WhatsApp por su cuenta.

## Verificación y referencias

Se comprobó compilación con Arduino AVR Boards 1.8.8. Posteriormente, tras confirmar la placa y recibir autorización, se respaldó el programa previo y se cargó esta versión en el Uno de COM3 con verificación. El usuario presentó su tarjeta y se comprobaron las lecturas, su persistencia y las respuestas de estados al Uno, sin apertura. Ver [VERIFICACION_UNO.md](VERIFICACION_UNO.md). Los valores de pines usados en una compilación de prueba con relés son datos de ensayo, no una asignación para tu circuito.

| Comprobación | Resultado |
|---|---|
| Uno, configuración entregada | Compila: 12 844 bytes de programa y 1187 bytes de variables globales |
| Mega 2560, configuración entregada | Compila: 13 632 bytes de programa y 1187 bytes de variables globales |
| Uno, relés e indicador habilitados con pines de prueba | Compila; no se cargó ni se asignaron esos pines en `config.h` |
| Relés habilitados sin pines definidos | Rechazado por el compilador, como corresponde |
| `npm run test:assistance` | 15 pruebas aprobadas; incluye tramas fragmentadas del firmware con RTC no válido |

Referencias de las bibliotecas y API utilizadas: [MFRC522](https://github.com/miguelbalboa/rfid), [RTClib](https://github.com/adafruit/RTClib), [millis](https://docs.arduino.cc/language-reference/en/functions/time/millis/) y [EEPROM](https://docs.arduino.cc/learn/built-in-libraries/eeprom/).
