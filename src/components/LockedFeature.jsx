import './LockedFeature.css'
import { PLAN_PRICES, FEATURE_UNLOCKED_BY } from '../context/TierContext'

/**
 * Wraps any content with a blur + lock overlay when the user doesn't have access.
 *
 * Props:
 *  locked      – boolean, show the overlay when true
 *  feature     – string key from FEATURE_UNLOCKED_BY (for upgrade copy)
 *  label       – override the lock label text
 *  blurOnly    – if true, just blurs without showing children (for row-level blur)
 *  onUpgrade   – optional fn(plan) — called when user taps the upgrade button.
 *                When not provided, the lock is display-only (no action).
 *  children    – the feature UI to show/blur
 */
export default function LockedFeature({ locked, feature, label, blurOnly = false, onUpgrade, children }) {
  if (!locked) return children

  const requiredPlan = feature ? FEATURE_UNLOCKED_BY[feature] : 'starter'
  const price = PLAN_PRICES[requiredPlan] || 'R49/mo'
  const planLabel = requiredPlan
    ? requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)
    : 'Starter'

  return (
    <div className="locked-feature-wrap">
      <div className={`locked-feature-content ${blurOnly ? 'blur-only' : ''}`}>
        {children}
      </div>
      <div className="locked-feature-overlay">
        <div className="locked-badge">
          <span className="locked-icon">🔒</span>
          <span className="locked-label">{label || `Upgrade to ${planLabel}`}</span>
          <span className="locked-price">from {price}</span>
          {onUpgrade && (
            <button
              className="locked-upgrade-btn"
              onClick={() => onUpgrade(requiredPlan)}
            >
              Start free trial &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * LockedRow — lightweight blur for individual table/list rows
 * No overlay badge, just a CSS blur mask
 */
export function LockedRow({ locked, children }) {
  if (!locked) return children
  return (
    <div className="locked-row" title="Upgrade to see more history">
      {children}
    </div>
  )
}
