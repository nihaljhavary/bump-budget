import { Component } from 'react'
import { supabase } from '../supabase'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorId: null }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  async componentDidCatch(error, info) {
    const errorId = Math.random().toString(36).slice(2, 9).toUpperCase()
    this.setState({ errorId })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await supabase.from("error_logs").insert({
        user_id: session?.user?.id || null,
        error_message: error?.message || String(error),
        stack_trace: info?.componentStack || error?.stack || null,
        url: window.location.href,
      })
    } catch {
      // Non-fatal — logging should never break the error page
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "var(--bg, #fdf6f0)",
        fontFamily: "DM Sans, sans-serif", padding: "24px", boxSizing: "border-box",
      }}>
        <div style={{
          maxWidth: 400, width: "100%", textAlign: "center",
          background: "var(--surface, #fff)", borderRadius: 16,
          padding: "40px 32px", border: "1px solid var(--border, #e8d5c4)",
        }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text, #1a1210)", marginBottom: 4 }}>
            bump<span style={{ color: "var(--coral, #e85d26)" }}>.</span>
          </div>
          <h2 style={{ color: "var(--text, #1a1210)", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Something went wrong
          </h2>
          <p style={{ color: "var(--muted, #888)", fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
            An unexpected error occurred. Your data is safe — this has been logged and we will look into it.
          </p>
          {this.state.errorId && (
            <p style={{ color: "var(--muted, #888)", fontSize: 12, marginBottom: 20 }}>
              Error ref: {this.state.errorId}
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "var(--coral, #e85d26)", color: "#fff", border: "none",
              borderRadius: 8, padding: "12px 28px", fontWeight: 600, fontSize: 15,
              cursor: "pointer", width: "100%",
            }}
          >
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
