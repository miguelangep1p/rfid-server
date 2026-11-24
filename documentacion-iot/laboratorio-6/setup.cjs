// Generates local lab credentials once; never prints secrets or overwrites them.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const base = __dirname, security = path.join(base,'infra');
fs.mkdirSync(security,{recursive:true});
const envPath = path.join(base,'.env.local');
const configPath = path.join(base,'emqx.generated.conf');
const sqlPath = path.join(security,'bootstrap.generated.sql');
if ([envPath,configPath,sqlPath].some(p => fs.existsSync(p))) throw new Error('Ya existe configuración local. No se sobrescribe; conservar credenciales y volúmenes.');
const secret = () => randomBytes(24).toString('hex');
const owner = secret(), app = secret(), broker = secret(), dashboard = secret(), cookie = secret();
const users = { bridge:secret(), validator:secret(), observer:secret() };
const env = {
  POSTGRES_PASSWORD:owner, EMQX_NODE_COOKIE:cookie, EMQX_DASHBOARD_PASSWORD:dashboard,
  DATABASE_URL:`postgresql://iot_app:${app}@127.0.0.1:55432/asistencia`,
  MQTT_URL:'mqtt://127.0.0.1:1883', DEVICE_ID:'entrada-01', SERIAL_SIMULATED:'1', SERIAL_PATH:'COM3', SERIAL_BAUD_RATE:'9600',
};
for (const [role,password] of Object.entries(users)) {
  env[`${role.toUpperCase()}_MQTT_USERNAME`] = role === 'bridge' ? 'bridge-entrada-01' : role;
  env[`${role.toUpperCase()}_MQTT_PASSWORD`] = password;
}
const rules = {
  'bridge-entrada-01': { publish:['dispositivos/entrada-01/lecturas','dispositivos/entrada-01/resultados','dispositivos/entrada-01/estado'], subscribe:['dispositivos/entrada-01/comandos'] },
  validator: { publish:['dispositivos/entrada-01/comandos','seguridad/avisos'], subscribe:['dispositivos/entrada-01/lecturas','dispositivos/entrada-01/resultados'] },
  observer: { publish:[], subscribe:['seguridad/avisos'] },
};
let sql = `BEGIN;
CREATE ROLE iot_app LOGIN PASSWORD '${app}';
CREATE ROLE mqtt_reader LOGIN PASSWORD '${broker}';
GRANT CONNECT ON DATABASE asistencia TO iot_app, mqtt_reader;
GRANT USAGE ON SCHEMA access_control TO iot_app;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA access_control TO iot_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA access_control TO iot_app;
GRANT USAGE ON SCHEMA mqtt_security TO mqtt_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA mqtt_security TO mqtt_reader;
`;
for (const [role,password] of Object.entries(users)) {
  const username = env[`${role.toUpperCase()}_MQTT_USERNAME`], salt = secret();
  const hash = createHash('sha256').update(password+salt).digest('hex');
  sql += `INSERT INTO mqtt_security.mqtt_user(username,password_hash,salt) VALUES('${username}','${hash}','${salt}');\n`;
  for (const [action,topics] of Object.entries(rules[username])) for (const topic of topics) {
    sql += `INSERT INTO mqtt_security.mqtt_acl(username,permission,action,topic) VALUES('${username}','allow','${action}','asistencia/v1/${topic}');\n`;
  }
}
sql += 'COMMIT;\n';
const config = `# Local isolated lab, EMQX Enterprise 6.3.2. No legacy plugins.
listeners.tcp.default.bind = "0.0.0.0:1883"
listeners.ws.default.bind = "0.0.0.0:8083"
dashboard.listeners.http.bind = "0.0.0.0:18083"
authentication = [{
  mechanism = password_based
  backend = postgresql
  enable = true
  password_hash_algorithm { name = sha256, salt_position = suffix }
  server = "postgres:5432"
  database = "asistencia"
  username = "mqtt_reader"
  password = "${broker}"
  query = "SELECT password_hash,salt,is_superuser FROM mqtt_security.mqtt_user WHERE username = \${username} AND active = true LIMIT 1"
}]
authorization {
  no_match = deny
  deny_action = disconnect
  cache { enable = false }
  sources = [{
    type = postgresql
    enable = true
    server = "postgres:5432"
    database = "asistencia"
    username = "mqtt_reader"
    password = "${broker}"
    query = "SELECT permission,action,topic FROM mqtt_security.mqtt_acl WHERE username = \${username} ORDER BY permission ASC"
  }]
}
`;
fs.writeFileSync(envPath,Object.entries(env).map(([k,v]) => `${k}=${v}`).join('\n')+'\n',{ flag:'wx',mode:0o600 });
fs.writeFileSync(configPath,config,{ flag:'wx',mode:0o600 });
fs.writeFileSync(sqlPath,sql,{ flag:'wx',mode:0o600 });
console.log('Configuración local creada. Contraseñas solo en laboratorio-6/.env.local. Ninguna tarjeta o permiso fue creado.');
