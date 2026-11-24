const {chromium}=require('@playwright/test');
const path=require('node:path');
const mqtt=require('mqtt');
process.loadEnvFile(path.join(__dirname,'laboratorio-6/.env.local'));
(async()=>{
 const clients=[];
 async function demo(role){
  const client=mqtt.connect(process.env.MQTT_URL,{clientId:`captura-${role.toLowerCase()}`,username:process.env[`${role}_MQTT_USERNAME`],password:process.env[`${role}_MQTT_PASSWORD`],reconnectPeriod:0,connectTimeout:5000});clients.push(client);
  await new Promise((resolve,reject)=>{client.once('connect',resolve);client.once('error',reject)});client.on('error',()=>{});return client;
 }
 const subscriber=await demo('OBSERVER');await subscriber.subscribeAsync('asistencia/v1/seguridad/avisos',{qos:1});
 const publisher=await demo('VALIDATOR');await publisher.publishAsync('asistencia/v1/seguridad/avisos',JSON.stringify({type:'ensayo_captura',simulated:true}),{qos:1,retain:false});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto('http://127.0.0.1:18083',{waitUntil:'networkidle'});
  await page.locator('input').nth(0).fill('admin');
  await page.locator('input[type=password]').first().fill(process.env.EMQX_DASHBOARD_PASSWORD);
  const button=page.locator('button').filter({hasText:/login|log in|sign in/i}).first();
  await button.click();
  await page.waitForTimeout(1800);
  const acknowledge=page.getByRole('button',{name:'Acknowledge',exact:true});
  if(await acknowledge.isVisible())await acknowledge.click();
  async function shot(lab,name){
   await page.mouse.move(700,200);await page.waitForTimeout(700);
   if(page.url().includes('login') || (await page.locator('body').innerText()).includes('Not-found'))throw new Error(`Ruta no válida: ${page.url()}`);
   const file=path.join(__dirname,`laboratorio-${lab}/evidencias/emqx-${name}.png`);
   const height={dashboard:800,clients:520,listeners:600,authentication:380,authorization:480}[name];
   await page.screenshot({path:file,clip:{x:0,y:0,width:1440,height}});console.log(`Captura verificada: ${name}, ${page.url()}`);
  }
  await shot(6,'dashboard');
  await page.goto('http://127.0.0.1:18083/#/clients',{waitUntil:'networkidle'});await shot(7,'clients');
  await page.getByText('Management',{exact:true}).hover();await page.waitForTimeout(500);
  await page.getByText('Listeners',{exact:true}).last().click();await page.waitForTimeout(700);await shot(7,'listeners');
  for(const [name,label] of (process.argv.includes('--include-8')?[['authentication','Authentication'],['authorization','Authorization']]:[])){
   await page.getByText('Access Control',{exact:true}).hover();await page.waitForTimeout(500);
   await page.getByText(label,{exact:true}).last().click();await page.waitForTimeout(700);await shot(8,name);
  }
 }finally{await browser.close();for(const c of clients)c.end(true)}
})().catch(error=>{console.error(error.message);process.exitCode=1});
