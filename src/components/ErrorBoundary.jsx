import { Component } from 'react'
import { Warning, ArrowsClockwise } from '@phosphor-icons/react'

// top-level error boundary. catches any uncaught render-time error in a child
// React tree and shows a recoverable fallback instead of going to white screen.
//
// react requires class components for error boundaries — there is no hook
// equivalent yet (as of react 19). keep this small and dependency-free.
//
// scope: place at the App root only. for finer-grained recovery (e.g. just
// SwapWidget while keeping the header alive), wrap the specific subtree.
//
// telemetry hook: when we wire a frontend log sink later (sentry, axiom),
// componentDidCatch is the place to forward errorInfo. for now we just
// console.error so devtools captures it.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught render error:', error, info?.componentStack)
  }

  reload = () => {
    // hard reload — drops cached React tree state along with the broken
    // module. simpler than trying to reset partial component trees.
    if (typeof window !== 'undefined') window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-surface text-on-surface">
        <div className="w-full max-w-md bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/15 dark:border-white/5 rounded-2xl p-6 sm:p-8 shadow-md shadow-black/5 dark:shadow-black/40">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-error/10 rounded-2xl flex items-center justify-center mb-4" aria-hidden="true">
              <Warning size={20} weight="bold" className="text-error" />
            </div>
            <h1 className="text-lg font-bold text-on-surface mb-1">Something went wrong</h1>
            <p className="text-sm text-secondary leading-relaxed mb-5">
              The page hit an unexpected error and stopped rendering. Reloading usually fixes it.
              If it keeps happening, please contact support.
            </p>
            <button
              type="button"
              onClick={this.reload}
              className="inline-flex items-center gap-1.5 bg-primary text-on-primary px-5 py-2.5 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <ArrowsClockwise size={14} weight="bold" aria-hidden="true" />
              Reload page
            </button>
            {/* compact dev hint — only useful while inspecting */}
            {import.meta.env.DEV && this.state.error?.message && (
              <pre className="mt-5 text-[10px] text-secondary/70 bg-black/5 dark:bg-white/5 p-2 rounded max-w-full overflow-x-auto whitespace-pre-wrap text-left">
                {String(this.state.error.message)}
              </pre>
            )}
          </div>
        </div>
      </div>
    )
  }
}
