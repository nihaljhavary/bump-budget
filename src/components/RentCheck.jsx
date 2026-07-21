import { useState, useEffect } from 'react'

const BEDROOM_LABELS = { 0: 'Studio', 1: '1 Bed', 2: '2 Bed', 3: '3 Bed', 4: '4+ Bed' }

const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')

function getVerdict(userRent, benchmark, community) {
  // Use community median if enough data, else benchmark median
  const median = (community && community.count >= 5) ? community.median : (benchmark ? benchmark.median_rent : null)
  const high = benchmark ? benchmark.range_high : (community ? community.high : null)
  const low = benchmark ? benchmark.range_low : (community ? community.low : null)
  if (!median) return null

  const pct = ((userRent - median) / median) * 100

  if (pct <= -15) return { label: 'Great deal', color: '#16a34a', emoji: '\u{1f389}', pct, median, detail: 'Well below market. You\'re getting excellent value for this area.' }
  if (pct <= -5) return { label: 'Below market', color: '#16a34a', emoji: '\u{2705}', pct, median, detail: 'Slightly below the area median. Competitive rent.' }
  if (pct <= 8) return { label: 'Fair rent', color: '#E8A49A', emoji: '\u{1f44d}', pct, median, detail: 'In line with what others pay in this area.' }
  if (pct <= 20) return { label: 'Above market', color: '#C48530', emoji: '\u{26a0}\u{fe0f}', pct, median, detail: 'Above the area median. Worth checking comparable listings or negotiating at renewal.' }
  return { label: 'Well above market', color: '#DC2626', emoji: '\u{1f6a8}', pct, median, detail: 'Significantly above market. Consider reviewing your lease or exploring alternatives.' }
}

export default function RentCheck() {
  const [areas, setAreas] = useState([])
  const [selectedArea, setSelectedArea] = useState('')
  const [bedrooms, setBedrooms] = useState(2)
  const [availableBedrooms, setAvailableBedrooms] = useState([])
  const [userRent, setUserRent] = useState('')
  const [benchmark, setBenchmark] = useState(null)
  const [community, setCommunity] = useState(null)
  const [submissionCount, setSubmissionCount] = useState(0)
  const [verdict, setVerdict] = useState(null)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)

  // Contribute state
  const [showContribute, setShowContribute] = useState(false)
  const [contribRent, setContribRent] = useState('')
  const [contribSubmitting, setContribSubmitting] = useState(false)
  const [contribDone, setContribDone] = useState(false)
  const [contribError, setContribError] = useState('')

  // Load areas on mount
  useEffect(() => {
    fetch('/.netlify/functions/rent-check')
      .then(r => r.json())
      .then(d => { if (d.areas) setAreas(d.areas) })
      .catch(() => {})
  }, [])

  async function handleCheck() {
    if (!selectedArea || !userRent) return
    setLoading(true)
    setChecked(false)
    setVerdict(null)

    try {
      const res = await fetch(`/.netlify/functions/rent-check?area=${encodeURIComponent(selectedArea)}&bedrooms=${bedrooms}`)
      const data = await res.json()

      setBenchmark(data.benchmark)
      setCommunity(data.community)
      setSubmissionCount(data.submissionCount || 0)
      setAvailableBedrooms(data.availableBedrooms || [])

      const rent = parseInt(userRent, 10)
      if (rent > 0) {
        setVerdict(getVerdict(rent, data.benchmark, data.community))
      }
      setChecked(true)
    } catch {
      setVerdict(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleContribute() {
    if (!selectedArea || !contribRent) return
    setContribSubmitting(true)
    setContribError('')

    try {
      const res = await fetch('/.netlify/functions/rent-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area: selectedArea, bedrooms, monthly_rent: parseInt(contribRent, 10) }),
      })
      const data = await res.json()
      if (!res.ok) { setContribError(data.error || 'Could not submit'); return }
      setContribDone(true)
    } catch {
      setContribError('Connection error. Try again.')
    } finally {
      setContribSubmitting(false)
    }
  }

  function handleShare() {
    const rent = parseInt(userRent, 10)
    const text = verdict
      ? `I checked my rent on bump. — my ${BEDROOM_LABELS[bedrooms] || bedrooms + ' bed'} in ${selectedArea} is ${verdict.label.toLowerCase()} (${verdict.pct > 0 ? '+' : ''}${Math.round(verdict.pct)}% vs median). Check yours free:`
      : `Check if your Cape Town rent is fair — free tool by bump.:`
    const url = 'https://bump-budget.netlify.app'

    if (navigator.share) {
      navigator.share({ title: 'bump. Rent Check', text, url }).catch(() => {})
    } else {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text + ' ' + url)}`, '_blank')
    }
  }

  return (
    <section id="rent-check" className="lp-section lp-rc">
      <p className="lp-section-label">Free tool</p>
      <h2 className="lp-section-title">Is your Cape Town rent fair?</h2>
      <p className="lp-rc-sub">
        Compare your rent against real market data from PayProp, TPN, and community submissions.
        No signup required.
      </p>

      <div className="lp-rc-card">
        {/* Input form */}
        <div className="lp-rc-form">
          <div className="lp-rc-field">
            <label className="lp-rc-label">Area</label>
            <select
              className="lp-rc-select"
              value={selectedArea}
              onChange={e => { setSelectedArea(e.target.value); setChecked(false) }}
            >
              <option value="">Select your area</option>
              {areas.map(a => (
                <option key={a.area + a.region} value={a.area}>
                  {a.area}{a.region !== 'Cape Town' ? ` (${a.region})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="lp-rc-field">
            <label className="lp-rc-label">Bedrooms</label>
            <div className="lp-rc-pills">
              {[0, 1, 2, 3, 4].map(b => (
                <button
                  key={b}
                  className={'lp-rc-pill' + (bedrooms === b ? ' active' : '')}
                  onClick={() => { setBedrooms(b); setChecked(false) }}
                >
                  {BEDROOM_LABELS[b]}
                </button>
              ))}
            </div>
          </div>

          <div className="lp-rc-field">
            <label className="lp-rc-label">Your monthly rent (R)</label>
            <input
              type="number"
              className="lp-rc-input"
              placeholder="e.g. 12000"
              value={userRent}
              onChange={e => { setUserRent(e.target.value); setChecked(false) }}
              min="500"
              max="200000"
            />
          </div>

          <button
            className="btn-coral lp-rc-btn"
            onClick={handleCheck}
            disabled={loading || !selectedArea || !userRent}
          >
            {loading ? 'Checking...' : 'Check my rent'}
          </button>
        </div>

        {/* Results */}
        {checked && (
          <div className="lp-rc-results">
            {verdict ? (
              <>
                <div className="lp-rc-verdict" style={{ borderColor: verdict.color }}>
                  <span className="lp-rc-verdict-emoji">{verdict.emoji}</span>
                  <div>
                    <div className="lp-rc-verdict-label" style={{ color: verdict.color }}>{verdict.label}</div>
                    <div className="lp-rc-verdict-detail">{verdict.detail}</div>
                  </div>
                </div>

                <div className="lp-rc-stats">
                  <div className="lp-rc-stat">
                    <div className="lp-rc-stat-label">Your rent</div>
                    <div className="lp-rc-stat-value">{fmt(parseInt(userRent, 10))}/mo</div>
                  </div>
                  <div className="lp-rc-stat">
                    <div className="lp-rc-stat-label">Area median</div>
                    <div className="lp-rc-stat-value">{fmt(verdict.median)}/mo</div>
                  </div>
                  {benchmark && (
                    <div className="lp-rc-stat">
                      <div className="lp-rc-stat-label">Market range</div>
                      <div className="lp-rc-stat-value">{fmt(benchmark.range_low)} – {fmt(benchmark.range_high)}</div>
                    </div>
                  )}
                  {benchmark && benchmark.yoy_growth_pct && (
                    <div className="lp-rc-stat">
                      <div className="lp-rc-stat-label">YoY growth</div>
                      <div className="lp-rc-stat-value">+{benchmark.yoy_growth_pct}%</div>
                    </div>
                  )}
                </div>

                {submissionCount > 0 && (
                  <p className="lp-rc-community-note">
                    Based on market research data{community ? ` and ${community.count} community submissions` : ''}.
                  </p>
                )}

                {/* CTAs */}
                <div className="lp-rc-ctas">
                  <a href="/auth" className="btn-coral lp-rc-cta-btn">Start budgeting free</a>
                  <a href="/book" className="btn-ghost lp-rc-cta-btn">Book a consult</a>
                  <button className="btn-ghost lp-rc-cta-btn" onClick={handleShare}>Share result</button>
                </div>
              </>
            ) : (
              <div className="lp-rc-no-data">
                <p>We don't have enough data for {BEDROOM_LABELS[bedrooms] || bedrooms + ' bed'} in {selectedArea} yet.</p>
                <p className="lp-rc-no-data-sub">Help build the dataset by sharing your rent below.</p>
              </div>
            )}

            {/* Contribute section */}
            <div className="lp-rc-contribute">
              {!showContribute && !contribDone && (
                <button className="lp-rc-contribute-toggle" onClick={() => { setShowContribute(true); setContribRent(userRent) }}>
                  Help others — share your rent anonymously
                </button>
              )}
              {showContribute && !contribDone && (
                <div className="lp-rc-contribute-form">
                  <p className="lp-rc-contribute-note">Your submission is fully anonymous. No account needed.</p>
                  <div className="lp-rc-contribute-row">
                    <input
                      type="number"
                      className="lp-rc-input lp-rc-contribute-input"
                      placeholder="Your monthly rent (R)"
                      value={contribRent}
                      onChange={e => setContribRent(e.target.value)}
                    />
                    <button
                      className="btn-coral"
                      onClick={handleContribute}
                      disabled={contribSubmitting || !contribRent}
                    >
                      {contribSubmitting ? 'Submitting...' : 'Submit'}
                    </button>
                  </div>
                  {contribError && <p className="lp-rc-error">{contribError}</p>}
                </div>
              )}
              {contribDone && (
                <p className="lp-rc-contribute-thanks">Thanks for contributing! Your submission helps build better data for everyone.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="lp-rc-source">
        Data sourced from PayProp Rental Index, TPN Residential Rental Monitor, Indlu, and community submissions.
        Updated quarterly.
      </p>
    </section>
  )
}

