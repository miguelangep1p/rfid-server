const {spawnSync}=require('node:child_process');
const run=spawnSync(process.execPath,['--test','tests/iot-panel.cjs'],{stdio:'inherit',env:{...process.env,IOT_PANEL_TEST:'1'}});
process.exitCode=run.status??1;
