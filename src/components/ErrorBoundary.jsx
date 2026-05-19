import { Component } from 'react'
import { observe } from '../utils/observe'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorId: null }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    const errorId = Math.random().toString(36).slice(2, 9).toUpperCase()
    this.setState({ errorId })
    // observe.frontendError writes to error_logs via the observe module (best-effort, non-blocking)
    observe.frontendError(error, {
      componentStack: info?.componentStack,
      errorId,
      url: typeof window !== 'undefined' ? window.location.href : null,
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg, #fdf6f0)',
        fontFamily: 'DM Sans, sans-serif', padding: '24px', boxSizing: 'border-box',
      }}>
        <div style={{
          maxWidth: 400, width: '100%', textAlign: 'center',
          background: 'var(--surface, #fff)', borderRadius: 16,
          padding: '40px 32px', border: '1px solid var(--border, #e8d5c4)',
        }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text, #1a1210)', marginBottom: 4 }}>
            bump<span style={{ color: 'var(--coral, #C0766B)' }}>.</span>
          </div>
          <h2 style={{ color: 'var(--text, #1a1210)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Something went wrong
          </h2>
          <p style={{ color: 'var(--muted, #8C7E76)', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
            An unexpected error occurred. Your data is safe. We have automatically logged this issue and will look into it.
          </p>
          {this.state.errorId && (
            <p style={{ color: 'var(--muted, #8C7E76)', fontSize: 12, marginBottom: 20 }}>
              Reference: {this.state.errorId}
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'var(--coral, #C0766B)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '12px 28px', fontWeight: 600, fontSize: 15,
              cursor: 'pointer', width: '100%',
            }}
          >
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
