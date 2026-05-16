import log from 'electron-log/node'

log.transports.file.fileName = 'nexus-service-spike.log'
log.info('[service] spike alive', { pid: process.pid })

setInterval(() => {
  log.info('[service] heartbeat', { uptimeMs: Math.round(process.uptime() * 1000) })
}, 5000)
