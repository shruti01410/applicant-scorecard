// Detached backend launcher: spawns server.js fully detached (own process
// group, stdio ignored, unref'd) so it survives shell-job cleanup.
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  cwd: __dirname,
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
child.unref();
child.on('error', (e) => { console.error('launch error', e.message); process.exitCode = 1; });

function ready(port, tries) {
  const s = net.connect({ port, host: '127.0.0.1' });
  s.once('connect', () => { s.destroy(); console.log(`ready pid=${child.pid}`); });
  s.once('error', () => {
    s.destroy();
    if (tries <= 0) return console.error('not-ready after wait');
    setTimeout(() => ready(port, tries - 1), 300);
  });
}
setTimeout(() => ready(5000, 40), 1000);
