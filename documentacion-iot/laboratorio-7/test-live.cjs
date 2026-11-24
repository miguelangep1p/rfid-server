const {spawnSync} = require('node:child_process');
const result=spawnSync(process.execPath,['--test','tests/iot-live.cjs'],{stdio:'inherit',env:{...process.env,IOT_INTEGRATION:'1'}});
if(result.error) console.error(result.error.message);
process.exitCode=result.status ?? 1;
