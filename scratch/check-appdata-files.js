const fs = require('fs');
const path = require('path');
const os = require('os');

const dir = path.join(os.homedir(), 'AppData', 'Roaming', 'vethos');
console.log('Dir:', dir);
if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir);
  console.log('Files:', files);
} else {
  console.log('Dir does not exist.');
}
