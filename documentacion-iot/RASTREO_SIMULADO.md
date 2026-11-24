# Rastreo de demostración

La pestaña **Rastreo · DEMO** muestra un croquis ficticio y el movimiento simulado de personal de apoyo hacia el punto de ayuda. También se abre desde **Ver rastreo simulado** en una solicitud.

Permite iniciar, pausar, continuar, reiniciar, ajustar la velocidad y explorar el recorrido con un deslizador. El escenario dura 45 segundos a velocidad normal. Al terminar muestra un aviso y reproduce el sonido de confirmación si el usuario habilitó audio.

El ejemplo funciona sin una solicitud real. Opcionalmente, una solicitud aporta su identificador, punto y estado como referencia de lectura. Completar el recorrido no registra llegada, no cierra solicitudes ni añade eventos al historial. La atención real se confirma en los modales habituales.

El mapa no representa un plano oficial, no usa GPS y no consulta servicios de geolocalización. Las posiciones, el agente y los tiempos son ficticios. El Uno identifica la lectura en un punto fijo; este montaje no mide el desplazamiento de una persona. Un seguimiento real necesitaría una fuente de posición adicional.

La simulación se pausa al ocultar la pestaña y se reinicia al cambiar la solicitud de referencia. Se verificaron sus límites mediante pruebas unitarias y sus controles y adaptación móvil en Edge.
