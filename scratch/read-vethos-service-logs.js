const fs = require('fs');
const path = require('path');

const logFilePath = 'C:\\ProgramData\\Vethos\\logs\\vethos-service.log';
console.log('Log file path:', logFilePath);

if (fs.existsSync(logFilePath)) {
  const content = fs.readFileSync(logFilePath, 'utf8');
  const lines = content.split('\n');
  console.log('--- Last 100 service log lines ---');
  console.log(lines.slice(-100).join('\n'));
} else {
  console.log('Log file does not exist.');
}
