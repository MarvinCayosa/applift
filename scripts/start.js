const { exec } = require('child_process');
const ip = require('ip');

const LAN_IP = ip.address();
console.log(`Network: http://${LAN_IP}:3000`);

const cmd = 'next start -H 0.0.0.0 -p 3000';
const child = exec(cmd);

child.stdout.on('data', (data) => process.stdout.write(data));
child.stderr.on('data', (data) => process.stderr.write(data));
