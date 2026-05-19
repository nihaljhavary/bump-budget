import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabase'
import './SupportChat.css'

const SUGGESTIONS = [
  'How do I import transactions?',
  'What is the free plan limit?',
  'How does the AI analysis work?',
  'How do I change my subscription?',
]

const TICKET_CATEGORIES = [
  'Technical issue',
  'Billing',
  'Feature request',
  'Data / Privacy',
  'Other',
]

export default function SupportChat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm bump.'s support assistant. Ask me anything about using the app." }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)
  // Guard: don't scroll on the very first render (initial welcome message).
  // Only scroll when the user or bot adds a new message after mount.
  const mountedRef = useRef(false)

  // Ticket form state
  const [showTicket, setShowTicket] = useState(false)
  const [ticketCategory, setTicketCategory] = useState('Technical issue')
  const [ticketMessage, setTicketMessage] = useState('')
  const [ticketSubmitting, setTicketSubmitting] = useState(false)
  const [ticketSuccess, setTicketSuccess] = useState(false)
  const [ticketError, setTicketError] = useState('')

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text) {
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const history = messages.filter(m => m.role !== 'system').slice(-6)
      const res = await fetch('/.netlify/functions/support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ question: q, conversationHistory: history })
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'Sorry, something went wrong.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Could not reach support. Please try again.' }])
    }
    setLoading(false)
  }

  async function submitTicket() {
    if (ticketMessage.trim().length < 10) {
      setTicketError('Message must be at least 10 characters.')
      return
    }
    setTicketSubmitting(true)
    setTicketError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/submit-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ category: ticketCategory, message: ticketMessage.trim() })
      })
      const data = await res.json()
      if (!res.ok) {
        setTicketError(data.error || 'Could not submit ticket. Please try again.')
      } else {
        setTicketSuccess(true)
        setTicketMessage('')
      }
    } catch {
      setTicketError('Network error. Please check your connection and try again.')
    }
    setTicketSubmitting(false)
  }

  function openTicket() {
    setShowTicket(s => !s)
    setTicketSuccess(false)
    setTicketError('')
  }

  return (
    <div className="support-shell">
      <div className="support-header">
        <h2 className="support-title">Support</h2>
        <p className="support-sub">Ask anything about bump.</p>
      </div>

      {messages.length === 1 && (
        <div className="support-suggestions">
          {SUGGESTIONS.map(s => (
            <button key={s} className="support-suggestion" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}

      <div className="support-body">
        {messages.map((m, i) => (
          <div key={i} className={`support-bubble ${m.role === 'user' ? 'user' : 'bot'}`}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="support-bubble bot">
            <div className="typing"><span/><span/><span/></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Ticket submission panel */}
      <div className="support-ticket-wrap">
        <button
          className={`support-ticket-toggle ${showTicket ? 'open' : ''}`}
          onClick={openTicket}
        >
          {showTicket ? 'Close ticket form' : 'Still need help? Submit a ticket'}
        </button>

        {showTicket && (
          <div className="support-ticket-form">
            {ticketSuccess ? (
              <div className="support-ticket-success">
                <span className="support-ticket-check">&#10003;</span>
                Ticket submitted. Our team will follow up via email.
              </div>
            ) : (
              <>
                <select
                  className="support-ticket-select"
                  value={ticketCategory}
                  onChange={e => setTicketCategory(e.target.value)}
                >
                  {TICKET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <textarea
                  className="support-ticket-textarea"
                  placeholder="Describe your issue in detail (minimum 10 characters)..."
                  value={ticketMessage}
                  onChange={e => { setTicketMessage(e.target.value); if (ticketError) setTicketError('') }}
                  rows={4}
                />
                {ticketError && <div className="support-ticket-error">{ticketError}</div>}
                <button
                  className="support-ticket-submit"
                  onClick={submitTicket}
                  disabled={ticketSubmitting || ticketMessage.trim().length < 10}
                >
                  {ticketSubmitting ? 'Submitting...' : 'Submit ticket'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="support-input-bar">
        <textarea
          className="support-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask a question..."
          rows={1}
        />
        <button className="support-send-btn" onClick={() => send()} disabled={loading || !input.trim()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
