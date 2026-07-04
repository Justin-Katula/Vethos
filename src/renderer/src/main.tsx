import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/react'
import App from './App'
import { clerkAppearance, clerkPublishableKey } from './lib/clerk'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {clerkPublishableKey ? (
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        appearance={clerkAppearance}
      >
        <HashRouter>
          <App />
        </HashRouter>
      </ClerkProvider>
    ) : (
      <MissingClerkConfig />
    )}
  </React.StrictMode>,
)

function MissingClerkConfig(): JSX.Element {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg-base px-6 text-text-primary">
      <div className="info-panel max-w-lg rounded-lg p-6 shadow-elevated">
        <p className="text-xs font-medium uppercase text-text-muted">Vethos</p>
        <h1 className="mt-2 text-2xl font-semibold">Clerk n&apos;est pas configuré</h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Ajoute ta clé publique Clerk dans le fichier .env.local puis redémarre l&apos;app.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md border border-border-subtle bg-black px-3 py-2 text-xs text-text-primary">
          VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
        </pre>
      </div>
    </div>
  )
}
