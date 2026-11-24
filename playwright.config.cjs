const { defineConfig } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rfid-ui-'));

module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'ui.spec.cjs',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3199', channel: 'msedge', viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3199/api/estado',
    reuseExistingServer: false,
    env: { SERIAL_DISABLED: '1', PORT: '3199', HOST: '127.0.0.1', DB_PATH: path.join(testDir, 'test.db') },
  },
});
