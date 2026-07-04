const fs = require('fs');
const path = require('path');
const os = require('os');

const userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'vethos');
const logFilePath = path.join(userDataPath, 'logs', 'vethos.log');

console.log('Log file path:', logFilePath);

if (fs.existsSync(logFilePath)) {
  const content = fs.readFileSync(logFilePath, 'utf8');
  const lines = content.split('\n');
  console.log('--- Last 100 log lines ---');
  console.log(lines.slice(-100).join('\n'));
} else {
  console.log('Log file does not exist at path.');
}
