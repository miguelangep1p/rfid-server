# Entrega y ejecución de los laboratorios 6 y 7

El laboratorio 8 queda a cargo de otro integrante. No se modificaron sus archivos.

| Laboratorio | Informe PDF | Word editable |
|---|---|---|
| 6 | [Informe](laboratorio-6/INFORME_LABORATORIO_6.pdf) | [Word](laboratorio-6/INFORME_LABORATORIO_6.docx) |
| 7 | [Informe](laboratorio-7/INFORME_LABORATORIO_7.pdf) | [Word](laboratorio-7/INFORME_LABORATORIO_7.docx) |

## Demostración desde el panel

Desde la raíz del repositorio, en una copia nueva ejecutar npm install y npm run iot:setup una vez. En este equipo la configuración ya existe.

```powershell
npm run iot:up
npm run iot:panel:setup
npm run iot:panel
```

Abrir http://127.0.0.1:3100/laboratorios. Usar PANEL_PASSWORD de laboratorio-6/.env.local. El panel inicia y supervisa el puente y el validador; no ejecutar paralelamente iot:bridge ni iot:validator con los mismos clientes.

Registrar una tarjeta hexadecimal de ensayo, elegir inicio, relé y asistencia, y pulsar Simular lectura. Observar decisión, resultado simulado y aviso. El panel permite activar sonido opcional, confirmar recepción, revocar la tarjeta y enviar una apertura manual simulada. La prueba no acciona relés físicos.

## Verificación

```powershell
npm run iot:verify
npm run test:iot:panel
```

Se aprobaron 12 comprobaciones de infraestructura/MQTT de labs 6 y 7 y diez comprobaciones agrupadas de la vista web. Los registros y capturas están en las carpetas evidencias. El esquema compartido se mantiene como prerrequisito en laboratorio-6/infra; no depende de la carpeta de trabajo del laboratorio 8.

La entrega contiene código, diagramas, informes Word/PDF y capturas. No contiene secretos ni datos de personas reales. Las pruebas físicas de Arduino, la audibilidad, mensajería externa y aceptación docente de equivalencias permanecen por verificar. Los datos SQLite originales no se migraron ni modificaron.
