const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const file=path.join(__dirname,'../laboratorio-6/.env.local');
if(!fs.existsSync(file))throw new Error('Ejecuta iot:setup primero.');
const text=fs.readFileSync(file,'utf8');
if(!/^PANEL_PASSWORD=.+$/m.test(text))fs.appendFileSync(file,`\nPANEL_PASSWORD=${randomBytes(24).toString('hex')}\n`);
console.log('Acceso al panel preparado. Consulta PANEL_PASSWORD en laboratorio-6/.env.local; no se imprime la contraseña.');
