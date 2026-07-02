import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertOctagon, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'

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
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/15 text-red-300">
            <AlertOctagon size={28} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">
              {'Quelque chose a planté.'}
            </h1>
            <p className="mt-2 max-w-md text-sm text-text-secondary">
              {"L'app a rencontré une erreur inattendue. Tes données sont en sécurité — recharge pour continuer."}
            </p>
          </div>
          <pre className="max-w-lg overflow-auto rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-left font-mono text-xs text-text-muted">
            {this.state.error.message}
          </pre>
          <Button
            type="button"
            onClick={this.handleReload}
            variant="solid"
          >
            <RefreshCw size={16} />
            Recharger
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
