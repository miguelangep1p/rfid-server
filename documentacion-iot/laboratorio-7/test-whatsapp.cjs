const {spawnSync}=require('node:child_process');
const result=spawnSync(process.execPath,['--test','tests/whatsapp-live.cjs'],{stdio:'inherit',env:{...process.env,IOT_WHATSAPP_TEST:'1'}});
process.exitCode=result.status??1;
