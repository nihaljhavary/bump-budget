import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import './BookConsult.css'

const BANKING = {
  bank:          'Investec Bank Limited',
  accountName:   'Mr NS Jhavary',
  accountNumber: '10012347504',
  branchCode:    '580105',
  accountType:   'Cheque / Current',
}

const WEEKDAY_SLOTS = ['18:00', '19:00', '20:00', '21:00']
const WEEKEND_SLOTS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

const SESSION_INCLUDES = [
  'Deep-dive into your spending using your bump. data',
  'A budget plan you can actually stick to',
  'Debt, savings, and investment priorities',
  'Written notes emailed to you after the session',
]

// ── Helpers ────────────────────────────────────────────────────────────────────
function daysInMonth(y, m)   { return new Date(y, m + 1, 0).getDate() }
function firstDayOffset(y, m) {
  const d = new Date(y, m, 1).getDay()
  return d === 0 ? 6 : d - 1  // 0=Mon…6=Sun
}
function isPast(y, m, d)      { const t = new Date(); t.setHours(0,0,0,0); return new Date(y, m, d) < t }
function isWeekendDay(y, m, d) { const w = new Date(y, m, d).getDay(); return w === 0 || w === 6 }
function toISO(y, m, d)       { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` }

function fmtSlot(t) {
  const [h] = (t || '').split(':').map(Number)
  if (isNaN(h)) return t
  return h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h-12}:00 PM`
}
function fmtDateLong(s) {
  if (!s) return ''
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}
function slotsForDate(iso) {
  if (!iso) return []
  const [y, m, d] = iso.split('-').map(Number)
  return isWeekendDay(y, m - 1, d) ? WEEKEND_SLOTS : WEEKDAY_SLOTS
}

// ── Calendar component ────────────────────────────────────────────────────────
function Calendar({ selectedDate, onSelect }) {
  const now = new Date()
  const [vy, setVy] = useState(now.getFullYear())
  const [vm, setVm] = useState(now.getMonth())

  const total  = daysInMonth(vy, vm)
  const offset = firstDayOffset(vy, vm)
  const cells  = Array.from({ length: offset }, () => null)
    .concat(Array.from({ length: total }, (_, i) => i + 1))

  function prevMonth() {
    const nm = vm === 0 ? 11 : vm - 1
    const ny = vm === 0 ? vy - 1 : vy
    if (ny * 12 + nm < now.getFullYear() * 12 + now.getMonth()) return
    setVm(nm); setVy(ny)
  }
  function nextMonth() {
    setVm(m => m === 11 ? 0 : m + 1)
    setVy(y => vm === 11 ? y + 1 : y)
  }

  return (
    <div className="book-cal">
      <div className="book-cal-hd">
        <button className="book-cal-nav" onClick={prevMonth} aria-label="Previous month">&#8249;</button>
        <span className="book-cal-month">{MONTHS[vm]} {vy}</span>
        <button className="book-cal-nav" onClick={nextMonth} aria-label="Next month">&#8250;</button>
      </div>
      <div className="book-cal-grid">
        {DAYS.map(n => <div key={n} className="book-cal-dn">{n}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={`_${i}`} />
          const past = isPast(vy, vm, day)
          const iso  = toISO(vy, vm, day)
          const sel  = selectedDate === iso
          return (
            <button
              key={day}
              className={`book-cal-day${past ? ' past' : ''}${sel ? ' sel' : ''}`}
              disabled={past}
              onClick={() => onSelect(iso)}
            >
              {day}
            </button>
          )
        })}
      </div>
      <p className="book-cal-hint">Weekdays: 6 PM – 10 PM &nbsp;&#183;&nbsp; Weekends: 10 AM – 6 PM</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BookConsult({ onBack }) {
  const { user, profile } = useAuth()

  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [takenSlots,   setTakenSlots]   = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  const [form,       setForm]       = useState({ phone: '', goal: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')
  const [bookingRef, setBookingRef] = useState('')
  const [done,       setDone]       = useState(false)

  // Fetch taken slots when date selected
  useEffect(() => {
    if (!selectedDate) return
    setSelectedSlot(null)
    setTakenSlots([])
    setLoadingSlots(true)
    fetch(`/.netlify/functions/get-slots?date=${selectedDate}`)
      .then(r => r.json())
      .then(d => setTakenSlots(d.takenSlots || []))
      .catch(() => setTakenSlots([]))
      .finally(() => setLoadingSlots(false))
  }, [selectedDate])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedDate || !selectedSlot) { setError('Please select a date and time.'); return }
    if (!form.phone.trim()) { setError('Please enter your phone number.'); return }
    if (!form.goal.trim())  { setError('Please tell us what you want to work on.'); return }
    setSubmitting(true); setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/.netlify/functions/book-consult', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          phone:       form.phone,
          goal:        form.goal,
          bookingDate: selectedDate,
          bookingTime: selectedSlot,
          fullName:    profile?.full_name || '',
          email:       user?.email || '',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking failed. Please try again.')
      setBookingRef(data.reference)
      setDone(true)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Confirmation screen ──────────────────────────────────────────────────
  if (done) {
    return (
      <div className="book-shell">
        <div className="book-confirm-screen">
          <div className="confirm-circle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2>Session booked!</h2>
          <p className="confirm-sub">
            <strong>{fmtDateLong(selectedDate)}</strong><br />
            <strong>{fmtSlot(selectedSlot)}</strong>
          </p>
          <p className="confirm-sub" style={{ marginTop: 0 }}>
            Complete the EFT below to lock in your slot. We&apos;ll confirm within 24 hours of receiving payment.
          </p>
          <div className="book-eft-card">
            <p className="book-eft-title">EFT Payment Details</p>
            <div className="book-eft-row"><span>Bank</span><strong>{BANKING.bank}</strong></div>
            <div className="book-eft-row"><span>Account name</span><strong>{BANKING.accountName}</strong></div>
            <div className="book-eft-row"><span>Account no.</span><strong>{BANKING.accountNumber}</strong></div>
            <div className="book-eft-row"><span>Branch code</span><strong>{BANKING.branchCode}</strong></div>
            <div className="book-eft-row book-eft-ref"><span>Reference</span><strong>{bookingRef}</strong></div>
            <div className="book-eft-amount">R500</div>
          </div>
          <p className="confirm-sub" style={{ fontSize: '0.82rem' }}>
            Use <strong>{bookingRef}</strong> as your EFT reference so we can match your payment.
          </p>
          <button className="book-back-btn" onClick={onBack}>Back to dashboard</button>
        </div>
      </div>
    )
  }

  // ── Booking flow ─────────────────────────────────────────────────────────
  const availableSlots = slotsForDate(selectedDate)

  return (
    <div className="book-shell">
      <button className="book-back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      <div className="book-header">
        <h1>Book a session</h1>
        <p>60 minutes &middot; R500 &middot; Pay via EFT after booking.</p>
      </div>

      <div className="book-session-card">
        <div className="book-session-top">
          <div>
            <div className="book-session-label">60-minute Expert Consultation</div>
            <div className="book-session-price">R500</div>
          </div>
          <div className="book-session-tick">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
        <ul className="book-session-includes">
          {SESSION_INCLUDES.map(item => <li key={item}>{item}</li>)}
        </ul>
      </div>

      {/* ── Step 1: Pick date ── */}
      <div className="book-section-lbl">1. Pick a date</div>
      <Calendar selectedDate={selectedDate} onSelect={setSelectedDate} />

      {/* ── Step 2: Pick time ── */}
      {selectedDate && (
        <div className="book-slots-block">
          <div className="book-section-lbl">2. Pick a time — {fmtDateLong(selectedDate)}</div>
          {loadingSlots
            ? <p className="book-slots-loading">Checking availability...</p>
            : <div className="book-slots-grid">
                {availableSlots.map(slot => {
                  const taken = takenSlots.includes(slot)
                  const sel   = selectedSlot === slot
                  return (
                    <button
                      key={slot}
                      className={`book-slot${taken ? ' taken' : ''}${sel ? ' sel' : ''}`}
                      disabled={taken}
                      onClick={() => !taken && setSelectedSlot(slot)}
                    >
                      {fmtSlot(slot)}
                      {taken && <span className="book-slot-x">Taken</span>}
                    </button>
                  )
                })}
              </div>
          }
        </div>
      )}

      {/* ── Step 3: Details form ── */}
      {selectedDate && selectedSlot && (
        <form className="book-form" onSubmit={handleSubmit}>
          <div className="book-section-lbl">3. Your details</div>
          <div className="book-sel-summary">
            {fmtDateLong(selectedDate)} &nbsp;&middot;&nbsp; {fmtSlot(selectedSlot)}
          </div>
          <div className="book-field">
            <label>Phone number</label>
            <input
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="071 234 5678"
              required
            />
          </div>
          <div className="book-field">
            <label>What do you want to work on?</label>
            <textarea
              value={form.goal}
              onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
              placeholder="e.g. I want to clear my debt and start saving for a house deposit..."
              rows={4}
              required
            />
          </div>
          {error && <div className="book-error">{error}</div>}
          <button type="submit" className="book-pay-btn" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Confirm booking →'}
          </button>
          <p className="book-trust">We&apos;ll confirm within 24 hours of receiving your EFT payment.</p>
        </form>
      )}
    </div>
  )
}
