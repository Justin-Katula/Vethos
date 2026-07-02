const { exec } = require('child_process');
exec('powershell -NoProfile -NonInteractive -Command "[System.IO.Directory]::GetFiles(\'\\\\.\\pipe\\\') | Where-Object { $_ -like \'*Vethos*\' }"', (err, stdout, stderr) => {
  console.log('Pipes:', stdout.trim());
});
