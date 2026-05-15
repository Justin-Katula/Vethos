/**
 * motivation-server.ts
 *
 * Mini serveur HTTP local qui affiche une page motivationnelle
 * quand l'utilisateur essaie d'accéder à un site bloqué.
 * Le hosts file redirige vers 127.0.0.1, ce serveur intercepte la requête.
 */

import * as http from 'node:http'

const MOTIVATION_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nexus — Retourne travailler</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      background: #0B0F14;
      color: #fff;
      font-family: 'Segoe UI', Inter, system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .container {
      text-align: center;
      max-width: 480px;
      padding: 48px 32px;
    }
    .circle {
      width: 80px; height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3BA3FF, #00D1FF);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 32px;
      font-size: 36px;
      font-weight: 900;
      color: white;
      box-shadow: 0 0 40px rgba(59, 163, 255, 0.3);
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 16px;
      letter-spacing: -0.5px;
    }
    .subtitle {
      color: #8E9BAE;
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 32px;
    }
    .quote {
      background: #0F141B;
      border: 1px solid #1E2530;
      border-radius: 12px;
      padding: 20px 24px;
      font-style: italic;
      color: #FFD54F;
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .blocked-info {
      color: #FF8A00;
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .glow {
      position: fixed;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle at center, rgba(59,163,255,0.05) 0%, transparent 50%);
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="glow"></div>
  <div class="container">
    <div class="circle">N</div>
    <h1>Ce site est bloqué.</h1>
    <p class="subtitle">
      Tu as décidé de te concentrer. Nexus protège ton attention.<br>
      Retourne à ton travail — chaque minute compte.
    </p>
    <div class="quote">
      "La discipline est de se rappeler ce que l'on veut vraiment."
    </div>
    <div class="blocked-info">🔒 Session Nexus active</div>
  </div>
</body>
</html>`

let server: http.Server | null = null

/**
 * Démarre le serveur HTTP motivationnel sur le port 80.
 * Les sites bloqués via hosts redirigent vers 127.0.0.1:80.
 */
export function startMotivationServer(): void {
  if (server) return

  server = http.createServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(MOTIVATION_HTML)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
      // Port 80 occupé ou pas assez de droits — essayer port 8080
      try {
        server?.listen(8080, '127.0.0.1')
      } catch {
        // Abandon silencieux
      }
    }
  })

  try {
    server.listen(80, '127.0.0.1')
  } catch {
    // Essayer port 8080 en fallback
    try {
      server.listen(8080, '127.0.0.1')
    } catch {
      // Abandon
    }
  }
}

export function stopMotivationServer(): void {
  if (server) {
    server.close()
    server = null
  }
}
