import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { bootTheme } from './lib/use-theme'
import './styles/globals.css'

// Avant le premier rendu, jamais après : les réglages arrivent par IPC, donc
// trop tard pour éviter un éclair de la mauvaise couleur. `bootTheme` lit le
// miroir synchrone laissé par la session précédente.
bootTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
