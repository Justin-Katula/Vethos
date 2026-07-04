const net = require('net');

const pipePath = '\\\\.\\pipe\\VethosDevServiceBridge';
console.log('Attempting to connect to named pipe:', pipePath);

const socket = net.createConnection(pipePath);

socket.on('connect', () => {
  console.log('SUCCESS: Successfully connected to the dev named pipe!');
  socket.destroy();
  process.exit(0);
});

socket.on('error', (err) => {
  console.error('ERROR: Failed to connect to the dev named pipe:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('TIMEOUT: Connection attempt timed out.');
  socket.destroy();
  process.exit(1);
}, 2000);
