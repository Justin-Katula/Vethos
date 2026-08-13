import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertOctagon, RefreshCw } from 'lucide-react'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log structuré, exploitable plus tard pour télémétrie locale
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error.message, info.componentStack)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-5 px-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded bg-signal/15 text-signal">
            <AlertOctagon size={28} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-ink">{'Quelque chose a planté.'}</h1>
            <p className="mt-2 max-w-md text-sm text-ink-2">
              {
                "L'app a rencontré une erreur inattendue. Tes données sont en sécurité. Recharge pour continuer."
              }
            </p>
          </div>
          <pre className="max-w-lg overflow-auto rounded border border-rail bg-hall px-3 py-2 text-left font-mono text-xs text-ink-3">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 rounded bg-ink px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white"
          >
            <RefreshCw size={16} />
            Recharger
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
