/**
 * bump. — src/components/CookieBanner.jsx
 *
 * POPIA-compliant cookie consent banner.
 * - Shows on first visit to any page
 * - Persists choice to localStorage (bumpCookieConsent)
 * - Required under POPIA Act 4 of 2013 for SA users
 * - "Accept" allows all essential cookies (we use no tracking/ad cookies)
 * - "Decline" is not offered because we only use strictly necessary cookies;
 *   instead users can review what we use via the Privacy Policy link.
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const CONSENT_KEY = 'bumpCookieConsent'
const CONSENT_VERSION = '1'

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY)
      if (!stored || JSON.parse(stored).version !== CONSENT_VERSION) {
        setVisible(true)
      }
    } catch {
      setVisible(true)
    }
  }, [])

  function accept() {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ accepted: true, version: CONSENT_VERSION, at: new Date().toISOString() }))
    } catch { /* private browsing */ }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: '#1C1916',
      color: '#F4EFE9',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      padding: '16px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      flexWrap: 'wrap',
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      lineHeight: '1.5',
    }}>
      <div style={{ flex: 1, minWidth: '240px' }}>
        <strong style={{ color: '#E8A49A' }}>bump. uses cookies</strong>
        {' '}We use strictly necessary cookies to keep you signed in and remember your preferences. We do not use advertising or tracking cookies.{' '}
        <Link to="/privacy" style={{ color: '#E8A49A', textDecoration: 'underline' }}>Privacy Policy</Link>
        {' & '}
        <Link to="/terms" style={{ color: '#E8A49A', textDecoration: 'underline' }}>Terms</Link>
      </div>
      <button
        onClick={accept}
        style={{
          background: '#C0766B',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          padding: '10px 20px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Accept &amp; Continue
      </button>
    </div>
  )
}
