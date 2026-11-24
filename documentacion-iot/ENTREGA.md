# Entrega de laboratorios 6, 7 y 8

Fecha: 24 de octubre de 2026. Proyecto: Sistema IoT de control de acceso con NFC para la asistencia a personas con discapacidad.

Cada carpeta contiene un informe Word editable, PDF, desarrollo Markdown, guía, código y evidencias. Los tres informes están desarrollados y sus resultados de software se sustentan en una ejecución real con EMQX/PostgreSQL y serial simulado. Las 21 comprobaciones aprobadas se distribuyen en 5 del laboratorio 6, 7 del laboratorio 7 y 9 del laboratorio 8.

| Laboratorio | PDF | Word |
|---|---|---|
| 6 | [Informe](laboratorio-6/INFORME_LABORATORIO_6.pdf) | [Editable](laboratorio-6/INFORME_LABORATORIO_6.docx) |
| 7 | [Informe](laboratorio-7/INFORME_LABORATORIO_7.pdf) | [Editable](laboratorio-7/INFORME_LABORATORIO_7.docx) |
| 8 | [Informe](laboratorio-8/INFORME_LABORATORIO_8.pdf) | [Editable](laboratorio-8/INFORME_LABORATORIO_8.docx) |

No se certifica cumplimiento físico completo: sketch, placa, cableado, relés, lectura real, entrega al guardia y espera real de tres horas permanecen por verificar. También debe aceptarse la adaptación de MySQL/PHP/virtualización a PostgreSQL/Node.js/Docker. Los informes explican estas diferencias, sin inventar resultados.

Arranque público reproducible desde la raíz del paquete:

```powershell
npm install
npm run iot:setup
npm run iot:up
npm run iot:verify
```

En el equipo actual setup ya existe y no debe sobrescribirse. La nueva verificación limpia solo sus propios datos temporales. Consulte IMPLEMENTACION.md para iniciar puente, validador y suscriptor y para el protocolo de pruebas físicas. El paquete omite credenciales, volúmenes, node_modules, bases personales y archivos generados con secretos.
