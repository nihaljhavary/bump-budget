import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import './BookConsult.css'
import './BookPublic.css'

// ── Constants ─────────────────────────────────────────────────────────────────
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

const CONSULT_TYPES = {
  budget: {
    label:  '60-min Budget Session',
    price:  'R500',
    desc:   'One-on-one with a financial expert — your numbers, a plan built around your life.',
    includes: [
      'Deep-dive into your spending',
      'A budget you can actually stick to',
      'Debt, savings, and investment priorities',
      'Written notes emailed after the session',
    ],
  },
  property: {
    label:  'Property Purchase Consult',
    price:  'R650',
    desc:   'A Chartered Accountant CA(SA) reviews the property data and tells you whether it is worth what they are asking. Individuals and SMEs, purchases only.',
    includes: [
      'Independent view on the asking price',
      'Property data report & area price trends included',
      'House, sectional title, or land',
      'Clear written summary after the session',
    ],
  },
}

const PROPERTY_TYPES = [
  { id: 'house',      label: 'Freestanding house' },
  { id: 'sectional',  label: 'Sectional title (flat / complex / estate unit)' },
  { id: 'land',       label: 'Vacant land / plot' },
  { id: 'commercial', label: 'Commercial / SME premises' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysInMonth(y, m)    { return new Date(y, m + 1, 0).getDate() }
function firstDayOffset(y, m) {
  const d = new Date(y, m, 1).getDay()
  return d === 0 ? 6 : d - 1
}
function isPast(y, m, d)       { const t = new Date(); t.setHours(0,0,0,0); return new Date(y, m, d) < t }
function isWeekendDay(y, m, d) { const w = new Date(y, m, d).getDay(); return w === 0 || w === 6 }
function toISO(y, m, d)        { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` }

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

// ── Calendar ──────────────────────────────────────────────────────────────────
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
export default function BookPublic() {
  const [searchParams] = useSearchParams()
  const initialType = searchParams.get('type') === 'property' ? 'property' : 'budget'

  const [consultType,  setConsultType]  = useState(initialType)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [takenSlots,   setTakenSlots]   = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  const [form, setForm] = useState({
    name: '', email: '', phone: '', goal: '',
    propertyType: 'house', address: '', suburb: '', askingPrice: '',
    listingLink: '', erfNumber: '', sectionalTitleNumber: '', notes: '',
    docsPending: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')
  const [bookingRef, setBookingRef] = useState('')
  const [done,       setDone]       = useState(false)

  const cfg        = CONSULT_TYPES[consultType]
  const isProperty = consultType === 'property'
  const isSectional = form.propertyType === 'sectional'

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

  function set(field) {
    return e => {
      const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
      setForm(f => ({ ...f, [field]: v }))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedDate || !selectedSlot) { setError('Please select a date and time.'); return }
    if (!form.name.trim())  { setError('Please enter your name.'); return }
    if (!form.email.trim()) { setError('Please enter your email address.'); return }
    if (!form.phone.trim()) { setError('Please enter your phone number.'); return }
    if (isProperty && !form.docsPending && !form.address.trim()) {
      setError('Please enter the property address, or tick "I don’t have all the details yet".')
      return
    }
    setSubmitting(true); setError('')

    try {
      const res = await fetch('/.netlify/functions/book-public', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultType,
          bookingDate: selectedDate,
          bookingTime: selectedSlot,
          name:  form.name,
          email: form.email,
          phone: form.phone,
          goal:  form.goal,
          propertyType:         isProperty ? form.propertyType : undefined,
          address:              isProperty ? form.address : undefined,
          suburb:               isProperty ? form.suburb : undefined,
          askingPrice:          isProperty ? form.askingPrice : undefined,
          listingLink:          isProperty ? form.listingLink : undefined,
          erfNumber:            isProperty && !isSectional ? form.erfNumber : undefined,
          sectionalTitleNumber: isProperty && isSectional ? form.sectionalTitleNumber : undefined,
          notes:                isProperty ? form.notes : undefined,
          docsPending:          isProperty ? form.docsPending : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking failed. Please try again.')
      setBookingRef(data.reference)
      setDone(true)
      window.scrollTo(0, 0)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Confirmation screen ─────────────────────────────────────────────────
  if (done) {
    return (
      <div className="book-shell pb-shell">
        <PublicNav />
        <div className="book-confirm-screen">
          <div className="pb-tick">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2>Booking received</h2>
          <p className="confirm-sub">
            {cfg.label} &middot; <strong>{fmtDateLong(selectedDate)}</strong> at <strong>{fmtSlot(selectedSlot)}</strong>
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
            <div className="book-eft-amount">{cfg.price}</div>
          </div>
          <p className="confirm-sub" style={{ fontSize: '0.82rem' }}>
            Use <strong>{bookingRef}</strong> as your EFT reference so we can match your payment.
          </p>
          <p className="confirm-sub book-pop-prompt">
            Once paid, email your proof of payment to{' '}
            <a href="mailto:bumpbudgetservice@gmail.com">bumpbudgetservice@gmail.com</a>{' '}
            with <strong>{bookingRef}</strong> in the subject line.
          </p>
          {isProperty && (
            <div className="pb-docs-reminder">
              <p className="pb-docs-title">Property documents{form.docsPending ? ' — still needed' : ''}</p>
              <p className="pb-docs-text">
                {form.docsPending
                  ? 'You indicated some details are outstanding. Please email these with your proof of payment:'
                  : 'If anything changes or you have more documents, email them with your proof of payment:'}
              </p>
              <ul className="pb-docs-list">
                <li>Property address</li>
                <li>{isSectional ? 'Sectional title scheme name & unit number' : 'ERF number'}</li>
                <li>Asking price</li>
                <li>Listing link or photos of the property</li>
              </ul>
            </div>
          )}
          <Link to="/" className="book-back-btn" style={{ textDecoration: 'none', display: 'inline-block', textAlign: 'center' }}>
            Back to bump.
          </Link>
        </div>
      </div>
    )
  }

  const availableSlots = slotsForDate(selectedDate)

  return (
    <div className="book-shell pb-shell">
      <PublicNav />

      <div className="book-header">
        <h1>Book a consultation</h1>
        <p>60 minutes &middot; Pay via EFT after booking &middot; No account needed.</p>
      </div>

      {/* ── Step 1: Consult type ── */}
      <div className="book-section-lbl">1. Choose your session</div>
      <div className="pb-type-grid">
        {Object.entries(CONSULT_TYPES).map(([id, t]) => (
          <button
            key={id}
            type="button"
            className={`pb-type-card${consultType === id ? ' sel' : ''}`}
            onClick={() => setConsultType(id)}
          >
            <span className="pb-type-label">{t.label}</span>
            <span className="pb-type-price">{t.price}</span>
            <span className="pb-type-desc">{t.desc}</span>
          </button>
        ))}
      </div>
      <ul className="book-session-includes pb-includes">
        {cfg.includes.map(item => <li key={item}>{item}</li>)}
      </ul>

      {/* ── Step 2: Pick date ── */}
      <div className="book-section-lbl">2. Pick a date</div>
      <Calendar selectedDate={selectedDate} onSelect={setSelectedDate} />

      {/* ── Step 3: Pick time ── */}
      {selectedDate && (
        <div className="book-slots-block">
          <div className="book-section-lbl">3. Pick a time — {fmtDateLong(selectedDate)}</div>
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

      {/* ── Step 4: Details ── */}
      {selectedDate && selectedSlot && (
        <form className="book-form" onSubmit={handleSubmit}>
          <div className="book-section-lbl">4. Your details</div>
          <div className="book-sel-summary">
            {cfg.label} &nbsp;&middot;&nbsp; {fmtDateLong(selectedDate)} &nbsp;&middot;&nbsp; {fmtSlot(selectedSlot)} &nbsp;&middot;&nbsp; {cfg.price}
          </div>

          <div className="book-field">
            <label>Full name</label>
            <input value={form.name} onChange={set('name')} placeholder="Your name and surname" required />
          </div>
          <div className="book-field">
            <label>Email address</label>
            <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
          </div>
          <div className="book-field">
            <label>Phone number</label>
            <input value={form.phone} onChange={set('phone')} placeholder="071 234 5678" required />
          </div>

          {!isProperty && (
            <div className="book-field">
              <label>What do you want to work on?</label>
              <textarea
                value={form.goal} onChange={set('goal')}
                placeholder="e.g. I want to clear my debt and start saving for a house deposit..."
                rows={4}
              />
            </div>
          )}

          {isProperty && (
            <>
              <div className="pb-docs-note">
                <p className="pb-docs-title">About the property</p>
                <p className="pb-docs-text">
                  These details let us pull the property&apos;s data report and area price trends before your
                  session. Don&apos;t have everything? Tick the box below and email the rest later.
                </p>
              </div>

              <div className="book-field">
                <label>Property type</label>
                <select className="pb-select" value={form.propertyType} onChange={set('propertyType')}>
                  {PROPERTY_TYPES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div className="book-field">
                <label>Property address</label>
                <input value={form.address} onChange={set('address')} placeholder="Street address of the property" />
              </div>
              <div className="book-field">
                <label>Suburb & city</label>
                <input value={form.suburb} onChange={set('suburb')} placeholder="e.g. Greenside, Johannesburg" />
              </div>
              <div className="book-field">
                <label>Asking price</label>
                <input value={form.askingPrice} onChange={set('askingPrice')} placeholder="e.g. R1 850 000" />
              </div>
              {isSectional ? (
                <div className="book-field">
                  <label>Sectional title scheme & unit number <span className="book-optional">if known</span></label>
                  <input value={form.sectionalTitleNumber} onChange={set('sectionalTitleNumber')} placeholder="e.g. SS Waterford Estate, Unit 12" />
                </div>
              ) : (
                <div className="book-field">
                  <label>ERF number <span className="book-optional">if known</span></label>
                  <input value={form.erfNumber} onChange={set('erfNumber')} placeholder="e.g. ERF 1234 Greenside" />
                </div>
              )}
              <div className="book-field">
                <label>Listing link <span className="book-optional">optional</span></label>
                <input value={form.listingLink} onChange={set('listingLink')} placeholder="Property24 / Private Property link" />
              </div>
              <div className="book-field">
                <label>Anything else we should know? <span className="book-optional">optional</span></label>
                <textarea
                  value={form.notes} onChange={set('notes')}
                  placeholder="Condition, urgency, your budget, photos you can share later..."
                  rows={3}
                />
              </div>
              <label className="pb-check">
                <input type="checkbox" checked={form.docsPending} onChange={set('docsPending')} />
                <span>
                  I don&apos;t have all the property details yet — I&apos;ll email them to{' '}
                  <strong>bumpbudgetservice@gmail.com</strong> with my proof of payment.
                </span>
              </label>
            </>
          )}

          {error && <div className="book-error">{error}</div>}
          <button type="submit" className="book-pay-btn" disabled={submitting}>
            {submitting ? 'Submitting...' : `Confirm booking — ${cfg.price} →`}
          </button>
          <p className="book-trust">We&apos;ll confirm within 24 hours of receiving your EFT payment.</p>
          {isProperty && (
            <p className="pb-disclaimer">
              Property consults are an independent, informational opinion from a Chartered Accountant CA(SA).
              bump. is not an authorised financial services provider — this is not regulated financial advice
              or a formal valuation.
            </p>
          )}
        </form>
      )}
    </div>
  )
}

function PublicNav() {
  return (
    <div className="pb-nav">
      <Link to="/" className="pb-nav-logo">bump<span>.</span></Link>
      <Link to="/" className="book-back">&larr; Back to site</Link>
    </div>
  )
}
