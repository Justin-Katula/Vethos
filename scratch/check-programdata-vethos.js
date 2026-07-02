const fs = require('fs');
const path = require('path');

const dir = 'C:\\ProgramData\\Vethos';
console.log('Exists:', fs.existsSync(dir));
if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir);
  console.log('Files:', files);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(dir, file);
      console.log(`--- Content of ${file} ---`);
      console.log(fs.readFileSync(filePath, 'utf8'));
    }
  }
}
