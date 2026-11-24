"""Generate independent academic reports from recorded software evidence.

Requires: python -m pip install python-docx pillow reportlab
Does not execute services, change credentials or generate test results.
"""
from pathlib import Path
import csv
import hashlib
import html
import json
import re
import zipfile
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image as PDFImage, Preformatted, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
DATE = '24 de octubre de 2026'
PROJECT = 'Sistema IoT de control de acceso con NFC para la asistencia a personas con discapacidad'
MEMBERS = ['Cabanillas Urbina Miguel Angel', 'Flores Rodríguez Marcelo Raúl', "Moreno Aguilar D’alessandro Zahit", 'Rodriguez Blas Elva', 'Villena Torres Bruno Julio Cesar']
LABS=[6,7]
E = {n: json.loads((BASE / f'laboratorio-{n}/evidencias/verificacion-software.json').read_text(encoding='utf-8')) for n in LABS}
assert all(e['status'] == 'APROBADO' for e in E.values()), 'No publicar resultados aprobados si la verificación falló'
assert len({e['run_id'] for e in E.values()}) == 1, 'Las evidencias deben corresponder a la misma ejecución'
panel_file=BASE/'laboratorio-7/evidencias/panel-verificacion.json'
PANEL=json.loads(panel_file.read_text(encoding='utf-8')) if panel_file.exists() else None
if PANEL:
    assert len(PANEL['cases'])==10 and all(c['status']=='APROBADO' for c in PANEL['cases'])
    E[7]['cases'].extend(PANEL['cases'])


def font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf', size)


def diagram(file, boxes, arrows, title, subtitle, size=(1600, 1000)):
    im = Image.new('RGB', size, '#f6f8fc')
    d = ImageDraw.Draw(im)
    d.text((55, 30), title, font=font(36, True), fill='#17305c')
    d.text((55, 86), subtitle, font=font(23), fill='#44516a')
    for source, target, label in arrows:
        a, b = boxes[source], boxes[target]
        x1, y1 = (a[0]+a[2])/2, a[3]
        x2, y2 = (b[0]+b[2])/2, b[1]
        if a[1] == b[1]:
            if b[0] > a[0]:
                x1, y1, x2, y2 = a[2], (a[1]+a[3])/2, b[0], (b[1]+b[3])/2
            else:
                x1, y1, x2, y2 = a[0], (a[1]+a[3])/2, b[2], (b[1]+b[3])/2
        d.line((x1,y1,x2,y2), fill='#7383a0', width=4)
        import math
        angle = math.atan2(y2-y1, x2-x1)
        d.polygon([(x2,y2),(x2-18*math.cos(angle-0.45),y2-18*math.sin(angle-0.45)),(x2-18*math.cos(angle+0.45),y2-18*math.sin(angle+0.45))], fill='#7383a0')
        if label in {'serial','MQTT','lectura / orden','SQL'}:
            d.polygon([(x1,y1),(x1+18*math.cos(angle-0.45),y1+18*math.sin(angle-0.45)),(x1+18*math.cos(angle+0.45),y1+18*math.sin(angle+0.45))], fill='#7383a0')
        if label:
            tx, ty = (x1+x2)/2, (y1+y2)/2
            rect = d.textbbox((0,0),label,font=font(20))
            w = rect[2]-rect[0]
            d.rectangle((tx-w/2-6,ty-14,tx+w/2+6,ty+16),fill='#f6f8fc')
            d.text((tx-w/2,ty-12),label,font=font(20),fill='#44516a')
    for key, (x1,y1,x2,y2,title_text,lines,kind) in boxes.items():
        fill = '#edf4ff' if kind == 'actual' else '#fff5df'
        d.rounded_rectangle((x1,y1,x2,y2),radius=16,fill=fill,outline='#3f689e' if kind == 'actual' else '#aa7f2e',width=3)
        d.text((x1+18,y1+14),title_text,font=font(25,True),fill='#17305c')
        for i, line in enumerate(lines):
            d.text((x1+18,y1+58+i*30),line,font=font(22),fill='#344258')
    d.text((55,size[1]-48),'Fuente: elaboración propia a partir del código. No representa una prueba física.',font=font(20),fill='#44516a')
    im.save(file)


for n in LABS:
    (BASE/f'laboratorio-{n}/figuras').mkdir(exist_ok=True)

architecture = {
    'a':(55,170,385,350,'Nodo de acceso',['MFRC522 + RTC + Arduino','Hardware: por verificar','Serial ACCESO,UID,fecha'], 'pending'),
    'b':(540,170,940,350,'Puente Node.js',['Serial simulado verificado','SerialPort para modo real','Traducción de comandos'], 'actual'),
    'c':(1100,170,1545,350,'EMQX 6.3.2',['MQTT TCP / WebSocket','Autenticación PostgreSQL','ACL por tópico'], 'actual'),
    'd':(1100,510,1545,710,'Validador Node.js',['Vigencia + estado de tarjeta','Decisión transaccional','Comando / aviso de apoyo'], 'actual'),
    'e':(540,510,940,710,'PostgreSQL 17.6',['access_control','mqtt_security','Registro y reglas'], 'actual'),
    'f':(55,510,385,710,'Observador de avisos',['Suscriptor MQTT en consola','Recepción técnica probada','Guardia: por verificar'], 'actual'),
    'g':(540,790,1200,930,'Panel Next.js y gateway',['/laboratorios: sesión y tarjetas','Avisos visuales / SSE y sonido opcional'], 'actual'),
}
diagram(BASE/'laboratorio-6/figuras/arquitectura.png',architecture,[('a','b','serial'),('b','c','MQTT'),('c','d','lectura / orden'),('d','e','SQL'),('c','f','aviso MQTT'),('e','g','SQL')], 'Arquitectura del proyecto y alcance verificado', 'Azul: software implementado. Ámbar: hardware o integración pendiente.')

model = {
 'cards':(55,160,460,340,'cards',['PK uid','name, active','assistance_requested'],'actual'),
 'perms':(590,160,1020,340,'permissions',['PK id; FK uid -> cards','device_id, relay (1 o 2)','valid_from / until, revoked_at'],'actual'),
 'events':(1140,160,1550,370,'events',['PK event_id (UUID)','FK permission_id nullable','uid observado (sin FK)','decision y marcas de tiempo'],'actual'),
 'commands':(1140,515,1550,700,'commands',['PK command_id','FK event_id UNIQUE','payload, status, result'],'actual'),
 'notifs':(590,515,1020,700,'notifications',['PK notification_id','FK event_id UNIQUE','payload, status, created_at'],'actual'),
 'users':(55,515,460,735,'mqtt_user',['PK username','password_hash, salt','active, is_superuser=false'],'actual'),
 'acl':(55,850,650,1040,'mqtt_acl',['FK username -> mqtt_user','PK(username,action,topic)','permission, action, topic'],'actual'),
}
diagram(BASE/'laboratorio-6/figuras/modelo-relacional.png',model,[('cards','perms','1 : N'),('perms','events','1 : N'),('events','commands','1 : 0..1'),('events','notifs','1 : 0..1'),('users','acl','1 : N')],'Modelo relacional implementado','access_control: cinco tablas. mqtt_security: dos tablas. Relaciones según schema.sql.',size=(1600,1150))

model_doc = {
 'tarjetas': [{'_id':'tarjeta-ejemplo','uid':'A1B2C3D4','nombre':'Persona de prueba','activa':True,'asistencia_solicitada':True}],
 'permisos': [{'_id':'permiso-ejemplo','tarjeta_id':'tarjeta-ejemplo','dispositivo_id':'entrada-01','relay':1,'valido_desde':'2026-10-24T09:00:00-05:00','valido_hasta':'2026-10-24T12:00:00-05:00','revocado_en':None}],
 'eventos': [{'_id':'00000000-0000-4000-8000-000000000001','uid_observado':'A1B2C3D4','permiso_id':'permiso-ejemplo','decision':'CONCEDIDO','asistencia_solicitada':True}],
 'notificaciones': [{'_id':'aviso-ejemplo','evento_id':'00000000-0000-4000-8000-000000000001','canal':'por_confirmar','estado':'pendiente'}],
 '_nota':'Alternativa académica no implementada; documentos y fechas ilustrativos, no resultados.'
}
(BASE/'laboratorio-6/modelo-no-relacional.json').write_text(json.dumps(model_doc,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')


def results(n):
    if n not in E:return 'Fuera del alcance de esta entrega.'
    lines=['| ID | Comprobación ejecutada | Resultado |','|---|---|---|']
    for c in E[n]['cases']:
        lines.append(f"| {c['id']} | {c['description']} | {c['status']} |")
    return '\n'.join(lines)


COMMON = f'''## 1. Identificación y alcance

Proyecto: {PROJECT}. Institución académica: Universidad Nacional de Trujillo, Facultad de Ingeniería, Escuela Profesional de Ingeniería de Sistemas. Curso: Internet de las Cosas. Docente: Dr. Ing. Gómez Avila José. Fecha de elaboración: {DATE}.

Se presenta el desarrollo aplicado al proyecto, con código fuente, procedimientos reproducibles y evidencias de software. La validación utiliza EMQX y PostgreSQL reales, y un extremo serial simulado. No participaron personas en estos ensayos ni se conectaron lector, RTC o relés para comprobarlos. Los resultados no demuestran apertura mecánica ni asistencia efectiva a un usuario.

Se diferencia entre implementado y comprobado en software, reportado sin comprobación física, y propuesto. Next.js se conserva en la aplicación original; su backend actual usa SQLite. Los servicios de laboratorio utilizan PostgreSQL de forma separada. No se presenta esa separación como una migración del panel ya concluida.
'''
REFS = '''## Referencias

- Guía original del laboratorio, incluida en GUIA_ORIGINAL.pdf. Las páginas citadas corresponden a ese archivo.
- Informe IOT 1 Unidad.docx, proporcionado por el equipo; utilizado para conservar el contexto del proyecto.
- EMQX. Instalación con Docker: https://docs.emqx.com/en/emqx/latest/get-started/deploy/install-docker.html
- EMQX. Configuración y precedencia: https://docs.emqx.com/en/emqx/latest/guides/configuration/configuration.html
- EMQX. Autenticación PostgreSQL: https://docs.emqx.com/en/emqx/latest/guides/access-control/authn/postgresql.html
- EMQX. Autorización PostgreSQL: https://docs.emqx.com/en/emqx/latest/guides/access-control/authz/postgresql.html

La referencia a documentación actual sustenta la configuración utilizada; no se afirma que 6.3.2 sea la última versión disponible. La versión ejecutada se verifica en los registros y el Dashboard.
'''

LAB6 = f'''# Laboratorio 6

Infraestructura IoT con Docker, MQTT y modelos de datos

{COMMON}
## 2. Objetivos y correspondencia con la guía

Implementar un entorno reproducible de servicios IoT, integrar MQTT al flujo de control de acceso, describir la automatización inteligente y presentar los modelos relacional y no relacional asociados al proyecto.

El archivo recibido como Laboratorio_6 - 2026_II.pdf contiene el encabezado interno LABORATORIO 05. Se conserva la denominación del archivo recibido y se señala la discrepancia para aclaración docente. Las páginas 1–5 desarrollan la preparación de Linux, Docker y un stack EMQX/MySQL/phpMyAdmin; la página 6 solicita las tres actividades académicas.

| Requisito | Desarrollo realizado | Alcance |
|---|---|---|
| Linux y Docker | Docker Desktop con motor Linux y contenedores activos | Equivalencia técnica; no es una instalación nativa de Ubuntu |
| Servicios MQTT y base de datos | EMQX 6.3.2 y PostgreSQL 17.6 | Implementados y comprobados |
| MQTT en el proyecto | Puente serial–MQTT y validador | Serial simulado; hardware por verificar |
| Componente inteligente menor de 50 palabras | Texto de la sección 7 | Cumplido documentalmente |
| Modelos relacional y no relacional | Esquema implementado y alternativa documental | No exige operar ambas bases simultáneamente |

## 3. Fundamento técnico

Docker permite ejecutar servicios aislados con redes y volúmenes propios. MQTT desacopla la captura de lecturas, la validación y la observación de avisos mediante publicación y suscripción. EMQX distribuye los mensajes; el servicio de validación decide el permiso físico consultando PostgreSQL. El bróker no decide si una persona puede ingresar.

La configuración fija las imágenes por versión y digest, evitando que latest modifique silenciosamente el entorno. El Dashboard HTTP usa el puerto local 18083, MQTT TCP el 1883 y MQTT sobre WebSocket el 8083. El puerto 1883 no se utiliza como una página web de administración.

## 4. Materiales y arquitectura implementada

| Elemento | Uso |
|---|---|
| Windows anfitrión y Docker Desktop | Ejecución de contenedores Linux |
| Node.js y bibliotecas mqtt, pg y serialport | Puente, decisiones y persistencia |
| EMQX Enterprise 6.3.2, licencia Community de nodo único | Distribución y control de clientes MQTT |
| PostgreSQL 17.6 | Datos de acceso y seguridad MQTT en esquemas separados |
| Next.js | Interfaz existente; integración al nuevo servicio pendiente |
| Arduino, MFRC522, DS3231 y dos relés | Componentes reportados; comprobación física pendiente |

La Figura 1 diferencia lo implementado en software de las integraciones pendientes. El canal entre puente y EMQX es MQTT TCP local sin TLS en este ensayo, restringido al equipo; TLS se requiere al extenderlo a otros equipos.

![Figura 1. Arquitectura y alcance. Fuente: elaboración propia.](figuras/arquitectura.png)

Flujo desarrollado: lectura serial simulada → publicación MQTT → consulta de estado y permiso → registro transaccional → orden MQTT al puente → representación del comando serial. Cuando el perfil solicita asistencia se publica un aviso; el observador de consola permite comprobar recepción técnica. Los tres segundos corresponden a la duración nominal reportada del relé, no a la latencia del flujo.

## 5. Procedimiento reproducible

Todos los comandos se ejecutan desde la raíz del repositorio. En una copia nueva, instalar dependencias y generar la configuración local una sola vez:

```powershell
npm install
npm run iot:setup
npm run iot:up
```

setup.cjs genera contraseñas aleatorias y los archivos .env.local, emqx.generated.conf y bootstrap.generated.sql. Se niega a sobrescribir archivos existentes. No se publican esos archivos con secretos en el paquete de entrega: se regeneran en el equipo de evaluación. Las variables de PostgreSQL, cookie de EMQX y contraseña del Dashboard se toman de ese archivo local.

compose.yaml crea una red de laboratorio y volúmenes persistentes. PostgreSQL inicializa schema.sql y los roles; EMQX se inicia después de que la base esté saludable. El montaje usa base.hocon, conservando el archivo base de sistema emqx.conf. No se copian plugins de EMQX 4.3.

```powershell
docker version
docker info
docker run --rm hello-world
docker ps
npm run iot:verify
```

La consulta de versiones y hello-world se ejecutaron realmente; sus salidas están en evidencias/verificacion-software.json. El Dashboard también se comprobó mediante navegador y captura autenticada, sin mostrar contraseñas.

![Figura 2. Dashboard de la instancia de laboratorio. Fuente: captura real del entorno.](evidencias/emqx-dashboard.png)

Para detener los servicios conservando los datos:

```powershell
npm run iot:down
```

## 6. Modelo relacional y alternativa no relacional

El modelo relacional de la Figura 3 corresponde a schema.sql, no a tablas supuestas. La tabla cards agrupa nombre, estado y solicitud de asistencia en esta implementación inicial. Una futura normalización en persona y tarjeta sería una ampliación, no una tabla ya implementada.

![Figura 3. Modelo relacional implementado. Fuente: elaboración propia desde schema.sql.](figuras/modelo-relacional.png)

| Tabla | Clave y propósito |
|---|---|
| access_control.cards | PK uid; persona de prueba, estado y solicitud de asistencia |
| access_control.permissions | PK id, FK uid; dispositivo, relé, inicio, fin y revocación |
| access_control.events | PK UUID; UID observado, permiso opcional y decisión histórica |
| access_control.commands | PK command_id, event_id único; payload y estado del envío |
| access_control.notifications | PK notification_id, event_id único; aviso y estado |
| mqtt_security.mqtt_user | PK username; hash, salt y estado de cliente de servicio |
| mqtt_security.mqtt_acl | PK compuesta username/action/topic; autorización MQTT |

Las relaciones cards–permissions y permissions–events son 1:N. Cada evento puede tener como máximo un comando y un aviso en este esquema. El UID observado en events no es FK a cards para permitir registrar tarjetas desconocidas. mqtt_acl referencia a mqtt_user. La solicitud de asistencia es independiente del permiso de ingreso.

Se usan TIMESTAMPTZ, claves foráneas, relé restringido a 1 o 2 y un CHECK que exige tres horas para permisos temporales; los permanentes admiten fin nulo. El intervalo autorizado es [valid_from, valid_until). El inicio se suministra explícitamente para cada ensayo; su regla institucional sigue por confirmar.

Como alternativa académica no relacional se presenta modelo-no-relacional.json, con colecciones tarjetas, permisos, eventos y notificaciones. Las referencias se expresan mediante identificadores; el evento conserva una instantánea mínima de la decisión. Se proponen índices únicos para UID e identificador del evento, y búsquedas por tarjeta/dispositivo/vigencia. La aplicación debe comprobar integridad y vigencia; un borrado TTL no sustituye la validación de permisos.

| Criterio | Modelo relacional elegido | Alternativa documental |
|---|---|---|
| Consistencia | Transacciones y restricciones del motor | Validaciones e integridad gestionadas según el motor |
| Historial | Eventos y permisos separados | Documentos separados y referencias |
| Flexibilidad | Cambios mediante migraciones | Campos extensibles con esquema validado |
| Estado en el proyecto | Implementado en PostgreSQL | Diseño académico, no desplegado |

## 7. Componente inteligente: 43 palabras

El sistema aplica reglas para validar tarjetas y permisos vigentes, seleccionar el relé autorizado y generar avisos cuando una persona solicita asistencia. Registra las decisiones y señala incidencias al personal de seguridad. Esta automatización no utiliza inteligencia artificial ni modelos de aprendizaje automático.

## 8. Resultados observados

{results(6)}

Los resultados corresponden a esta ejecución identificada en los archivos de evidencia. El ensayo hello-world confirma capacidad de ejecutar contenedores y la consulta SQL confirma siete tablas en los dos esquemas. La validación del protocolo verifica formatos, fragmentación serial y rechazo de órdenes fuera de vigencia; no mide rendimiento físico.

## 9. Discusión, adaptación y conclusiones

Se obtuvo un entorno funcional de MQTT y PostgreSQL y se integró el flujo con un extremo serial simulado. El diseño separa acceso físico, autenticación del cliente MQTT y autorización por tópico. La automatización responde a reglas y conserva el enfoque de asistencia sin almacenar diagnósticos clínicos.

Se conserva PostgreSQL en lugar de MySQL; psql sustituye la administración utilizada en el ensayo, sin instalar phpMyAdmin. Docker sobre Windows proporciona el motor Linux, pero no demuestra instalación nativa de Ubuntu, SSH remoto ni una máquina Windows invitada. La aceptación formal de estas equivalencias y la discrepancia de numeración deben consultarse al docente.

La actividad documental queda desarrollada y los servicios están verificados en software. Falta la evidencia física de Arduino, la integración del panel al nuevo backend, la entrega humana de avisos y la medición real de permisos durante tres horas. Estos puntos no se presentan como aprobados.

## 10. Anexos y evidencias

- compose.yaml y setup.cjs: infraestructura y generación de configuración.
- ../laboratorio-8/schema.sql: DDL relacional ejecutado.
- modelo-no-relacional.json: alternativa documental ilustrativa.
- evidencias/verificacion-software.json: salidas y versión del ensayo.
- resultados_software.csv: resultados reales; resultados_pruebas.csv conserva plantilla para mediciones futuras.

{REFS}
'''

LAB7 = f'''# Laboratorio 7

Comunicación MQTT, publicación/suscripción y conexión serial con Arduino

{COMMON}
## 2. Objetivos y correspondencia con la guía

Configurar y verificar la comunicación con EMQX, diferenciar publicadores y suscriptores y conectar el protocolo serial reportado del Arduino mediante un servicio puente. La guía desarrolla Docker, Dashboard, listeners, WebSocket, archivos independientes de publicación/suscripción y el monitor del bróker (pp. 1–8); las actividades de la página 9 solicitan integrar MQTT con Arduino y documentar las configuraciones.

Los ejemplos PHP se adaptan a Node.js para aprovechar el backend del proyecto y mantener Next.js. Se incluyen publicacion.cjs y suscripcion.cjs como archivos independientes, equivalentes en función a los ejemplos de la guía. La sustitución de lenguaje debe aceptarla el docente.

## 3. Configuración y fundamentos

| Parámetro | Valor utilizado |
|---|---|
| Bróker | EMQX 6.3.2, instancia local con autenticación PostgreSQL |
| MQTT TCP | mqtt://127.0.0.1:1883 |
| MQTT sobre WebSocket | ws://127.0.0.1:8083/mqtt |
| Dashboard | http://127.0.0.1:18083 |
| Dispositivo lógico | entrada-01 |
| Puerto serial inicial | COM3 configurable; puerto físico por confirmar |
| Velocidad inicial | 9600 baudios; concordancia con firmware por confirmar |
| Modo verificado | SERIAL_SIMULATED=1 |
| Publicación | QoS 1, retain=false |

El listener WebSocket transporta MQTT para clientes compatibles. El Dashboard es una interfaz de administración HTTP distinta. Las sesiones de laboratorio son limpias; el cliente restablece las suscripciones tras reconectar. El QoS 1 puede repetir entregas, por lo que se utilizan identificadores y deduplicación. No se equipara un acuse MQTT con apertura de puerta.

La Figura 1 muestra los listeners de la instancia realmente utilizada.

![Figura 1. Listeners de EMQX en el entorno verificado. Fuente: captura real.](evidencias/emqx-listeners.png)

## 4. Publicadores, suscriptores y mensajes

Todos los tópicos de dispositivo usan el prefijo asistencia/v1/dispositivos/entrada-01/.

| Sufijo o tópico completo | Publicador | Suscriptor |
|---|---|---|
| lecturas | Puente | Validador |
| comandos | Validador | Puente |
| resultados | Puente | Validador |
| estado | Puente | Supervisión futura; no consumido por el validador actual |
| asistencia/v1/seguridad/avisos | Validador | Observador de consola |

El tópico de confirmación del guardia no está implementado. No se incluye como una capacidad verificada.

La lectura serial acepta exactamente tres campos: ACCESO,UID,fecha_hora. El puente normaliza el UID y publica un JSON con schema=1, event_id UUID, device_id, uid, device_time_raw y received_at. La fecha recibida del Arduino se conserva; los permisos se evalúan con la hora del servidor.

Ejemplo de estructura ilustrativa compatible con el formato implementado, no medición experimental:

```json
{{"schema":1,"event_id":"00000000-0000-4000-8000-000000000001","device_id":"entrada-01","uid":"A1B2C3D4","device_time_raw":"2026-10-24 09:00:00","received_at":"2026-10-24T14:00:00Z"}}
```

La orden incluye command_id, event_id, device_id, action, relay, issued_at y expires_at. El puente solo acepta CONCEDIDO o ABRIR, relés numéricos 1 o 2 y vigencia no superior a cinco segundos. El ejemplo anterior no debe reutilizarse como lectura vigente durante una prueba posterior: las fechas y UUID deben generarse en tiempo de ejecución.

El resultado serial tiene estado simulated o serial_write_completed y physical_open=null. El aviso contiene notification_id, event_id, ubicación, tipo de solicitud y decisión. channel=mqtt_console identifica el canal técnico actual; no representa SMS, WhatsApp, correo ni notificación entregada al guardia.

## 5. Implementación y flujo completo

1. El lector y el RTC forman el nodo reportado. Para esta verificación el texto serial se introduce en un proceso simulado.
2. El puente valida tamaño, cantidad de campos y UID. Descarta lecturas si aún no puede recibir órdenes por MQTT.
3. El validador recibe la lectura, verifica dispositivo y antigüedad, y consulta la tarjeta activa y el permiso vigente para esa entrada.
4. Una transacción registra el evento y, si procede, el comando y el aviso. El identificador del evento evita crear una nueva orden por repetición.
5. El validador publica la orden. El puente comprueba formato, vigencia, retención y duplicados antes de escribir CONCEDIDO,n al serial. ABRIR,n está soportado por el parser del puente; una API de apertura manual con operador autenticado aún no forma parte de estos servicios.
6. En modo simulado se imprime la orden y se registra simulated. El modo real utiliza SerialPort; la recepción del comando por el firmware y la apertura física requieren ensayo posterior.
7. Si la tarjeta tiene assistance_requested=true se publica un aviso, incluso si el permiso es denegado. El personal puede necesitar apoyar a una persona sin que el sistema autorice automáticamente el ingreso.

Se implementó un búfer serial limitado con recuperación tras líneas sobredimensionadas. Las órdenes retenidas, vencidas y anteriores al arranque se descartan. El puente mantiene una exclusión de tres segundos entre órdenes para evitar sobrecargar un firmware posiblemente bloqueante; esto no certifica el pulso eléctrico de tres segundos. Un sketch con delay(3000) bloquearía el ciclo principal durante ese intervalo; sin el archivo Arduino no se afirma que ese delay exista ni se inventan pines.

## 6. Procedimiento de ejecución

Iniciar infraestructura desde la raíz del proyecto. En una instalación nueva ejecutar setup una vez; en este entorno ya existe configuración:

```powershell
npm install
npm run iot:up
```

Abrir tres terminales independientes y ejecutar un servicio en cada una:

```powershell
npm run iot:subscribe
```

```powershell
npm run iot:validator
```

```powershell
npm run iot:bridge
```

Crear un permiso de ensayo suministrando un inicio explícito. El uso del instante actual es una elección del ensayo, no una confirmación de la regla institucional:

```powershell
$inicioEnsayo = (Get-Date).ToUniversalTime().ToString('o')
npm run iot:card -- A1B2C3D4 "Persona de prueba" 2 true $inicioEnsayo
```

En la terminal del puente simulado introducir:

```text
ACCESO,A1B2C3D4,fecha_de_ensayo
```

Como alternativa al ingreso por consola, el publicador independiente genera una lectura con UUID y fecha actual de recepción:

```powershell
npm run iot:publish -- A1B2C3D4
```

El publicador usa un clientId único para no desconectar al puente. La publicación requiere al validador para producir una decisión. El monitor del Dashboard permite observar los clientes; las capturas adjuntas muestran dos clientes técnicos de demostración, no dispositivos físicos ni personas conectadas.

![Figura 2. Clientes MQTT de demostración en el Dashboard. Fuente: captura real.](evidencias/emqx-clients.png)

Para repetir la verificación completa y generar evidencias independientes:

```powershell
npm run iot:verify
```

## 7. Resultados reales de software

{results(7)}

La prueba WebSocket publicó y recibió un mensaje de ensayo en el tópico de avisos, con dos clientes autenticados. El flujo de control utilizó otro ensayo con serial simulado, servicios reales y registros PostgreSQL. La orden para relé 2 quedó registrada como simulated y physical_open=null. La repetición del mismo evento mantuvo un único comando; una tarjeta desconocida produjo DENEGADO.

El registro JSON adjunto conserva identificadores de los ensayos y el aviso recibido. No se calculan porcentajes de lectura ni latencias de apertura porque no se dispone de mediciones físicas. El vencimiento del comando se verifica por software; no prueba la reacción del mecanismo de acceso.

## 8. Plan de validación física y accesibilidad

| Medición pendiente | Procedimiento propuesto | Registro |
|---|---|---|
| Lecturas correctas y errores | Comparar cada presentación física con UID esperado y eventos generados | Intentos, aciertos, no lecturas y duplicados |
| Lectura hasta activación | Medir inicio de lectura y activación eléctrica con reloj/instrumento común | Diferencia por intento y método |
| Pulso de cada relé | Medir inicio y fin eléctricos | Duración; no confundir con latencia |
| Avisos al guardia | Comprobar pantalla, sonido y canal acordado, más confirmación humana | Generación, recepción y asistencia por separado |
| Accesibilidad | Recorrer interfaz por teclado y lector de pantalla; revisar mensajes | Barreras observadas, sin presumir certificación |

La tabla resultados_pruebas.csv permanece vacía para estas mediciones. No se completan datos con participantes, tiempos o porcentajes inventados.

## 9. Conclusiones y límites

Se implementaron la publicación/suscripción y el puente serial–MQTT en software, con control de vigencia, deduplicación y registro en PostgreSQL. También se comprobó MQTT sobre WebSocket. El flujo de avisos conserva la asistencia como finalidad y evita deducir una discapacidad únicamente del UID.

La integración física con Arduino está preparada, pero no puede certificarse sin sketch, placa y montaje. Los pines de los relés y su polaridad siguen por confirmar. El modo real debe usar un único propietario del puerto; detener el servidor antiguo que abra ese COM antes de iniciar el puente. El canal externo, el sonido y la recepción humana del guardia no se han comprobado. La equivalencia de los ejemplos PHP con los clientes Node.js queda para aceptación docente.

## 10. Anexos de código y evidencias

- publicacion.cjs y suscripcion.cjs: clientes independientes.
- src/bridge.cjs, src/validator.cjs y src/repository.cjs: flujo implementado.
- src/protocol.cjs y src/client.cjs: contrato y conexión.
- evidencias/verificacion-software.json y resultados_software.csv: observaciones reales.
- GUIA_ORIGINAL.pdf: guía usada y correspondencia de actividades.

{REFS}
'''


def clean(text):
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'\1 (\2)', text)
    return text.replace('**','').replace('`','')


def blocks(markdown):
    lines=markdown.splitlines(); i=0
    while i<len(lines):
        line=lines[i]
        if not line.strip(): i+=1; continue
        if line.startswith('```'):
            code=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'): code.append(lines[i]);i+=1
            yield 'code','\n'.join(code);i+=1;continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].startswith('|'):
                if not re.match(r'^\|[\s:|\-]+\|$',lines[i]): rows.append([clean(x.strip()) for x in lines[i].strip('|').split('|')])
                i+=1
            yield 'table',rows;continue
        m=re.match(r'!\[([^\]]+)\]\(([^)]+)\)',line)
        if m: yield 'image',m.groups();i+=1;continue
        if line.startswith('#'):
            level=len(line)-len(line.lstrip('#'));yield 'heading',(level,clean(line[level:].strip()));i+=1;continue
        if re.match(r'^[-*] ',line):yield 'bullet',clean(line[2:]);i+=1;continue
        yield 'text',clean(line);i+=1


def write_docx(n, title, markdown):
    folder=BASE/f'laboratorio-{n}'; doc=Document()
    sec=doc.sections[0];sec.top_margin=Inches(.8);sec.bottom_margin=Inches(.75);sec.left_margin=Inches(.85);sec.right_margin=Inches(.85)
    normal=doc.styles['Normal'];normal.font.name='Calibri';normal.font.size=Pt(11);normal.paragraph_format.space_after=Pt(7)
    for name in ['Title','Heading 1','Heading 2','Heading 3']:
        doc.styles[name].font.name='Calibri';doc.styles[name].font.color.rgb=RGBColor.from_string('17305C')
    for text in ['UNIVERSIDAD NACIONAL DE TRUJILLO','FACULTAD DE INGENIERÍA','ESCUELA PROFESIONAL DE INGENIERÍA DE SISTEMAS']:
        p=doc.add_paragraph(text);p.alignment=1
    doc.add_paragraph('INTERNET DE LAS COSAS',style='Title').alignment=1
    doc.add_paragraph(f'LABORATORIO {n}',style='Title').alignment=1
    doc.add_paragraph(title,style='Subtitle').alignment=1
    doc.add_paragraph(PROJECT,style='Heading 2').alignment=1
    doc.add_paragraph('Docente: Dr. Ing. Gómez Avila José')
    doc.add_paragraph('Integrantes:')
    for member in MEMBERS:doc.add_paragraph(member)
    doc.add_paragraph(f'TRUJILLO – PERÚ\n{DATE}').alignment=1
    doc.add_page_break()
    for kind,data in blocks(markdown):
        if kind=='heading':
            level,text=data
            if level==1: continue
            doc.add_heading(text,level=min(level-1,3))
        elif kind=='text':doc.add_paragraph(data)
        elif kind=='bullet':doc.add_paragraph(data,style='List Bullet')
        elif kind=='code':
            for line in data.splitlines():
                p=doc.add_paragraph();p.paragraph_format.space_after=Pt(0)
                run=p.add_run(line);run.font.name='Consolas';run.font.size=Pt(8)
        elif kind=='table':
            table=doc.add_table(rows=1,cols=len(data[0]));table.style='Light Shading Accent 1'
            header=OxmlElement('w:tblHeader');table.rows[0]._tr.get_or_add_trPr().append(header)
            for j,cell in enumerate(data[0]):table.rows[0].cells[j].text=cell
            for row in data[1:]:
                cells=table.add_row().cells
                for j,cell in enumerate(row):cells[j].text=cell
            for row in table.rows:
                for cell in row.cells:
                    for p in cell.paragraphs:
                        for run in p.runs:run.font.size=Pt(9)
            doc.add_paragraph()
        elif kind=='image':
            caption,file=data
            doc.add_picture(str(folder/file),width=Inches(6.4));doc.paragraphs[-1].paragraph_format.keep_with_next=True
            doc.add_paragraph(caption,style='Caption')
    footer=sec.footer.paragraphs[0];footer.alignment=2
    footer.add_run(f'Laboratorio {n} · ')
    field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');footer._p.append(field)
    doc.save(folder/f'INFORME_LABORATORIO_{n}.docx')


pdfmetrics.registerFont(TTFont('Arial','C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('ArialBold','C:/Windows/Fonts/arialbd.ttf'))
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyES',fontName='Arial',fontSize=10,leading=14,spaceAfter=7,textColor=colors.HexColor('#24344d')))
styles.add(ParagraphStyle(name='HeadingES',fontName='ArialBold',fontSize=13,leading=17,spaceBefore=13,spaceAfter=8,textColor=colors.HexColor('#17305c'),keepWithNext=True))
styles.add(ParagraphStyle(name='CellES',fontName='Arial',fontSize=8,leading=10,spaceAfter=0))
styles.add(ParagraphStyle(name='CoverES',fontName='ArialBold',fontSize=20,leading=28,alignment=TA_CENTER,spaceAfter=18,textColor=colors.HexColor('#17305c')))
styles.add(ParagraphStyle(name='CaptionES',fontName='Arial',fontSize=8,leading=11,spaceAfter=10,textColor=colors.HexColor('#536077')))


def paragraph(text, style='BodyES'):
    return Paragraph(html.escape(text).replace('\n','<br/>'),styles[style])


def write_pdf(n,title,markdown):
    folder=BASE/f'laboratorio-{n}';story=[]
    for text in ['UNIVERSIDAD NACIONAL DE TRUJILLO','Facultad de Ingeniería','Escuela Profesional de Ingeniería de Sistemas']:
        p=paragraph(text);p.style=ParagraphStyle(name='center'+text,parent=styles['BodyES'],alignment=TA_CENTER);story.append(p)
    story.append(Spacer(1,35));story.append(paragraph(f'LABORATORIO {n}','CoverES'));story.append(paragraph(title,'CoverES'));story.append(paragraph(PROJECT,'HeadingES'))
    story.append(Spacer(1,20));story.append(paragraph('Curso: Internet de las Cosas\nDocente: Dr. Ing. Gómez Avila José'))
    story.append(paragraph('Integrantes:\n'+'\n'.join(MEMBERS)))
    story.append(Spacer(1,25));story.append(paragraph(f'TRUJILLO – PERÚ\n{DATE}'));story.append(PageBreak())
    for kind,data in blocks(markdown):
        if kind=='heading':
            level,text=data
            if level!=1:story.append(paragraph(text,'HeadingES'))
        elif kind=='text':story.append(paragraph(data))
        elif kind=='bullet':story.append(paragraph('• '+data))
        elif kind=='code':
            # Wrap long source lines so code remains inside the printable area.
            import textwrap
            wrapped='\n'.join('\n'.join(textwrap.wrap(line,95,replace_whitespace=False,drop_whitespace=False)) or ' ' for line in data.splitlines())
            story.append(Preformatted(wrapped,ParagraphStyle(name='CodeES',fontName='Courier',fontSize=8,leading=11,spaceAfter=10)))
        elif kind=='table':
            rows=[[paragraph(cell,'CellES') for cell in row] for row in data]
            width=475/len(rows[0]);table=Table(rows,colWidths=[width]*len(rows[0]),repeatRows=1,hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e7effb')),('GRID',(0,0),(-1,-1),.35,colors.HexColor('#ccd5e4')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
            story.extend([table,Spacer(1,10)])
        elif kind=='image':
            caption,file=data;im=Image.open(folder/file);w,h=im.size
            story.append(KeepTogether([PDFImage(str(folder/file),width=475,height=475*h/w),paragraph(caption,'CaptionES')]))
    def footer(canvas,doc):
        canvas.setFont('Arial',8);canvas.setFillColor(colors.HexColor('#536077'));canvas.drawString(60,30,f'Internet de las Cosas · Laboratorio {n}');canvas.drawRightString(A4[0]-60,30,str(doc.page))
    SimpleDocTemplate(str(folder/f'INFORME_LABORATORIO_{n}.pdf'),pagesize=A4,leftMargin=60,rightMargin=60,topMargin=50,bottomMargin=50,title=f'Laboratorio {n} - {title}',author='Equipo del proyecto IoT').build(story,onFirstPage=footer,onLaterPages=footer)


panel_development='''## 6.1. Demostración completa desde Next.js

Se incorporó la ruta /laboratorios en un servidor local que supervisa puente y validador. Desde esta vista se puede iniciar sesión, registrar credenciales, elegir el inicio del permiso, simular lecturas, enviar órdenes manuales y confirmar recepción de avisos. La regla de inicio se hace explícita en cada ensayo y no se presenta como una decisión institucional definitiva.

Iniciar esta alternativa desde la raíz del repositorio; no ejecutar al mismo tiempo los workers de consola con los mismos clientId:

```powershell
npm run iot:up
npm run iot:panel:setup
npm run iot:panel
```

Abrir http://127.0.0.1:3100/laboratorios. La contraseña del panel se consulta localmente en PANEL_PASSWORD dentro de laboratorio-6/.env.local. No se incluye en la entrega. El gateway mantiene la sesión mediante cookie HttpOnly y limita las operaciones a solicitudes originadas desde su propio panel local. El frontend no recibe credenciales MQTT ni de PostgreSQL.

El registro de tarjetas usa PostgreSQL y conserva el historial por revocación de permisos previos. La lectura simulada se envía por stdin al puente real del laboratorio; recorre MQTT y el validador, y vuelve al historial mediante API/SSE. La orden manual autenticada registra un evento y publica ABRIR,n. La interfaz separa autorización de estado del envío y declara expresamente la simulación.

El mensaje al guardia está implementado como aviso web en pantalla y un sonido opcional que el usuario habilita en el navegador. La confirmación de recepción se guarda mediante HTTP y PostgreSQL, sin añadir tablas ni alterar el esquema del laboratorio 8. No acredita asistencia efectiva. Mensajería externa y audibilidad física permanecen por verificar.

La Figura 3 corresponde a la prueba real de navegador con una tarjeta de ensayo y serial simulado. La evidencia completa conserva también una captura móvil.

![Figura 3. Panel Next.js con aviso de asistencia de ensayo. Fuente: captura real.](evidencias/panel-web-desktop.png)

Para repetir el ensayo automatizado:

```powershell
npm run test:iot:panel
```

Se comprobaron sesión, protección de origen, alta de tarjeta, vigencia de tres horas, flujo MQTT visible, aviso, activación del control de sonido, vista móvil, confirmación, orden manual y revocación. La prueba agrupó estas acciones en diez comprobaciones y limpió sus propios datos temporales. El control de sonido fue activado en navegador; no se midió audibilidad con altavoces.

'''
old_scope='Next.js se conserva en la aplicación original; su backend actual usa SQLite. Los servicios de laboratorio utilizan PostgreSQL de forma separada. No se presenta esa separación como una migración del panel ya concluida.'
new_scope='La ruta /laboratorios de Next.js está conectada a los servicios PostgreSQL/MQTT mediante un gateway local autenticado. La aplicación original conserva su ruta y SQLite; no se migraron sus datos. El desarrollo se limita a laboratorios 6 y 7. El laboratorio 8 queda a cargo de otro integrante y sus archivos no se modifican.'
LAB6=LAB6.replace(old_scope,new_scope).replace('Interfaz existente; integración al nuevo servicio pendiente','Vista /laboratorios conectada al gateway PostgreSQL/MQTT').replace('../laboratorio-8/schema.sql','infra/schema.sql').replace('Falta la evidencia física de Arduino, la integración del panel al nuevo backend, la entrega humana de avisos y la medición real de permisos durante tres horas.','Falta la evidencia física de Arduino, la entrega humana efectiva de asistencia y la medición real de permisos durante tres horas. El panel web ya está integrado y su prueba se documenta en el laboratorio 7.')
LAB6=LAB6.replace('## 5. Procedimiento reproducible','El archivo infra/schema.sql es una instantánea del contrato de datos ya existente, usada como prerrequisito de los laboratorios 6 y 7. La configuración de infraestructura ya no carga archivos desde la carpeta laboratorio-8. La evolución del laboratorio 8 queda a cargo del integrante responsable.\n\n## 5. Procedimiento reproducible')
LAB7=LAB7.replace(old_scope,new_scope).replace('El tópico de confirmación del guardia no está implementado. No se incluye como una capacidad verificada.','La confirmación de recepción del panel utiliza HTTP y PostgreSQL; no se implementó un tópico MQTT de confirmación del guardia.').replace('channel=mqtt_console identifica el canal técnico actual; no representa SMS, WhatsApp, correo ni notificación entregada al guardia.','channel=mqtt_y_panel_web identifica el mensaje técnico de MQTT y el aviso web. No se equipara a SMS, WhatsApp, correo ni a asistencia humana comprobada.').replace('una API de apertura manual con operador autenticado aún no forma parte de estos servicios.','el gateway del panel genera esa orden tras autenticar la sesión y registrar el evento.').replace('El canal externo, el sonido y la recepción humana del guardia no se han comprobado.','El panel incorpora sonido opcional y confirmación de recepción; su activación y persistencia se verificaron en navegador. El canal externo, la audibilidad física y la recepción por un guardia real no se han comprobado.').replace('## 7. Resultados reales de software',panel_development+'## 7. Resultados reales de software')
titles={6:'Infraestructura IoT con Docker, MQTT y modelos de datos',7:'Publicación, suscripción y comunicación con Arduino',8:'Autenticación y autorización MQTT con PostgreSQL'}
for n, content in [(6,LAB6),(7,LAB7)]:
    if n not in LABS:continue
    folder=BASE/f'laboratorio-{n}'
    # Keep a labeled history of the earlier planning text instead of mixing states.
    previous=folder/'DESARROLLO.md';history=folder/'PLAN_PREVIO.md'
    if previous.exists() and not history.exists():history.write_text(previous.read_text(encoding='utf-8'),encoding='utf-8')
    previous.write_text(content,encoding='utf-8')
    write_docx(n,titles[n],content);write_pdf(n,titles[n],content)
    with (folder/'resultados_software.csv').open('w',newline='',encoding='utf-8-sig') as stream:
        writer=csv.writer(stream);writer.writerow(['ID','Fecha','Comprobacion','Resultado','Tipo','Evidencia'])
        for case in E[n]['cases']:writer.writerow([case['id'],'2026-10-24',case['description'],case['status'],'Software; serial simulado','evidencias/verificacion-software.json'])
    (folder/'README.md').write_text(f'''# Laboratorio {n} — entrega

- [Informe PDF](INFORME_LABORATORIO_{n}.pdf): documento para revisar o entregar.
- [Informe Word editable](INFORME_LABORATORIO_{n}.docx).
- [Desarrollo en Markdown](DESARROLLO.md).
- [Guía original](GUIA_ORIGINAL.pdf).
- [Resultados reales de software](resultados_software.csv) y [registro detallado](evidencias/verificacion-software.json).
- figuras/ y evidencias/: diagramas y capturas reales.

El informe identifica las pruebas simuladas y los requisitos pendientes de evidencia física o aceptación docente. PLAN_PREVIO.md, si existe, conserva la planificación anterior y no forma parte del paquete. Los servicios comparten la infraestructura y contrato de datos de laboratorio-6/infra; ejecutar desde la raíz del repositorio. El laboratorio 8 queda a cargo de otro integrante, sin modificar sus archivos.

Consultar [ejecución](../IMPLEMENTACION.md). No entregar .env.local, emqx.generated.conf ni bootstrap.generated.sql con secretos. El paquete público permite generarlos de nuevo con npm run iot:setup.
''',encoding='utf-8')
    text='# Evidencias de laboratorio\n\nCapturas reales del Dashboard y registros de software. No acreditan apertura física ni entrega humana.\n\n'
    for file in sorted((folder/'evidencias').iterdir()):
        if file.name=='README.md':continue
        text+=f'- {file.name}: SHA-256 {hashlib.sha256(file.read_bytes()).hexdigest()}\n'
    (folder/'evidencias/README.md').write_text(text,encoding='utf-8')

index='''# Entrega y ejecución de los laboratorios 6 y 7

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
'''
(BASE/'ENTREGA_6_7.md').write_text(index,encoding='utf-8')

# One archive preserving the cross-lab paths needed by the implementation.
archive=BASE/'ENTREGA_LABORATORIOS_6_7.zip'
selected=[]
for n in LABS:
    selected.extend(p for p in (BASE/f'laboratorio-{n}').rglob('*') if p.is_file() and not p.name.startswith('.env') and '.generated.' not in p.name and p.name!='PLAN_PREVIO.md')
for name in ['ENTREGA_6_7.md','IMPLEMENTACION.md','verificar-laboratorios.cjs','capturar-emqx.cjs','generar_entregas.py']:
    selected.append(BASE/name)
selected.extend(ROOT/p for p in ['package.json','package-lock.json','.gitignore'])
selected.extend((ROOT/'tests').glob('iot*.cjs'))
selected.extend(p for p in (ROOT/'app').rglob('*') if p.is_file())
selected.extend(ROOT/p for p in ['server.js','next.config.js'])
manifest={'date_local':'2026-10-24','run_id':E[6]['run_id'],'scope':'Software real; serial simulado; sin verificación física','files':[]}
for file in selected:
    manifest['files'].append({'path':file.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(BASE/'MANIFIESTO_ENTREGA_6_7.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
selected.append(BASE/'MANIFIESTO_ENTREGA_6_7.json')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for file in selected:z.write(file,file.relative_to(ROOT).as_posix())
    z.writestr('LEER_PRIMERO.txt','Abrir documentacion-iot/ENTREGA_6_7.md. Solo laboratorios 6 y 7; el 8 queda para otro integrante. El panel Next.js se ejecuta con iot:panel. Generar credenciales con iot:setup e iot:panel:setup. Las pruebas usan serial simulado.\n')
print('Informes DOCX/PDF y paquete de entrega generados con evidencias existentes.')
