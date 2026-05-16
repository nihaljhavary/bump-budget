/**
 * bump. — src/utils/observe.js
 *
 * Lightweight structured observability for production issue diagnosis.
 * Captures: upload parsing failures, ingestion mismatches, categorisation
 * failures, reconciliation mismatches, and async enrichment errors.
 *
 * Design:
 *   - Always logs to console (structured, grouped).
 *   - In production, persists ERROR-level events to Supabase error_logs table
 *     (best-effort — never throws, never blocks the caller).
 *   - All functions are fire-and-forget. Never await observe calls in UI code.
 *
 * Usage:
 *   import { observe } from '../utils/observe'
 *   observe.warn('ingestion', 'Overlap detected', { overlapPct: 73 })
 *   observe.error('categorisation', 'Claude returned empty', { bank, rowCount })
 */

// ── Severity levels ───────────────────────────────────────────────────────────
export const SEV = {
  INFO:  'info',
  WARN:  'warn',
  ERROR: 'error',
}

// ── Domains (kept short for DB storage) ──────────────────────────────────────
export const DOMAIN = {
  INGESTION:       'ingestion',
  CATEGORISATION:  'categorisation',
  RECONCILIATION:  'reconciliation',
  ENRICHMENT:      'enrichment',
  DUPLICATE:       'duplicate',
  LEDGER:          'ledger',
  DEPLOYMENT:      'deployment',
}

// ── Build metadata injected by Vite ──────────────────────────────────────────
/* global __BUMP_BUILD_ID__ */
const BUILD_ID = typeof __BUMP_BUILD_ID__ !== 'undefined' ? __BUMP_BUILD_ID__ : 'dev'

// ── Supabase client (lazy dynamic import avoids circular deps) ───────────────
let _supabasePromise = null
async function getSupabase() {
  if (_supabasePromise) return _supabasePromise
  _supabasePromise = import('../supabase')
    .then(m => m.supabase)
    .catch(() => null)
  return _supabasePromise
}

// ── Core emit function ────────────────────────────────────────────────────────

/**
 * Emit a structured observation event.
 *
 * @param {string} severity  - SEV.INFO | SEV.WARN | SEV.ERROR
 * @param {string} domain    - DOMAIN.* constant
 * @param {string} message   - human-readable summary (≤200 chars)
 * @param {object} [context] - arbitrary key/value metadata (will be JSON-stored)
 */
async function emit(severity, domain, message, context = {}) {
  const event = {
    severity,
    domain,
    message: String(message).slice(0, 200),
    buildId: BUILD_ID,
    ts: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.pathname : null,
    ...context,
  }

  // Always log to console (structured)
  const logFn = severity === SEV.ERROR
    ? console.error
    : severity === SEV.WARN
      ? console.warn
      : console.info

  logFn(`[bump:${domain}]`, message, context)

  // Persist ERROR and WARN events to Supabase error_logs (best-effort)
  if (severity === SEV.ERROR || severity === SEV.WARN) {
    try {
      const sb = await getSupabase()
      if (!sb) return

      const { data: { session } } = await sb.auth.getSession()
      if (!session) return // Not logged in — skip DB write

      await sb.from('error_logs').insert({
        user_id:  session.user.id,
        severity,
        domain,
        message:  event.message,
        metadata: JSON.stringify({ buildId: BUILD_ID, url: event.url, ...context }),
        created_at: event.ts,
      })
    } catch {
      // DB write failed — silently ignore (never let observability break the app)
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const observe = {
  /**
   * Record a diagnostic/informational event (console only, not persisted).
   * Use for: normal milestones, stats, resolved conditions.
   */
  info(domain, message, context = {}) {
    emit(SEV.INFO, domain, message, context)
  },

  /**
   * Record a recoverable anomaly (console + Supabase error_logs).
   * Use for: overlap warnings, partial ingestion, reconciliation drift.
   */
  warn(domain, message, context = {}) {
    emit(SEV.WARN, domain, message, context)
  },

  /**
   * Record a failure that degrades the user experience (console + Supabase).
   * Use for: categorisation timeout, save failure, ledger NaN, API errors.
   */
  error(domain, message, context = {}) {
    emit(SEV.ERROR, domain, message, context)
  },

  // ── Typed helpers (preferred over raw calls) ────────────────────────────

  /** Ingestion: file parsed and sent to backend */
  ingestionBatch(stats) {
    observe.info(DOMAIN.INGESTION, 'Batch parsed', stats)
  },

  /** Ingestion: backend returned warnings or anomalies */
  ingestionWarning(warnings, context = {}) {
    observe.warn(DOMAIN.INGESTION, `Ingestion warnings: ${warnings.join('; ')}`, context)
  },

  /** Ingestion: batch save failed */
  ingestionError(err, context = {}) {
    observe.error(DOMAIN.INGESTION, `Ingestion failed: ${err?.message || err}`, context)
  },

  /** Categorisation: Claude call failed or returned empty */
  categorizationError(err, context = {}) {
    observe.error(DOMAIN.CATEGORISATION, `Categorisation failed: ${err?.message || err}`, context)
  },

  /** Categorisation: Claude returned unexpected shape */
  categorizationMismatch(received, context = {}) {
    observe.warn(DOMAIN.CATEGORISATION, `Categorisation response mismatch: ${received}`, context)
  },

  /** Duplicate: high overlap detected at save time */
  duplicateOverlap(result, context = {}) {
    observe.warn(DOMAIN.DUPLICATE, `Duplicate overlap: ${result.overlapPct}%`, {
      overlapCount: result.overlapCount,
      overlapPct: result.overlapPct,
      ...context,
    })
  },

  /** Reconciliation: cross-tab totals diverge */
  reconciliationMismatch(label, driftRands, context = {}) {
    observe.warn(DOMAIN.RECONCILIATION, `Reconciliation drift: ${label} R${Math.round(driftRands)}`, context)
  },

  /** Ledger: validateLedgerSummary returned issues */
  ledgerIssues(issues, context = {}) {
    if (!issues || issues.length === 0) return
    observe.warn(DOMAIN.LEDGER, `Ledger issues (${issues.length}): ${issues[0]}`, { issues, ...context })
  },

  /** Enrichment: async enrichment failed or timed out */
  enrichmentError(err, context = {}) {
    observe.error(DOMAIN.ENRICHMENT, `Enrichment failed: ${err?.message || err}`, context)
  },

  /** Deployment: version check detected stale bundle */
  staleBundle(deployedId, runningId) {
    observe.warn(DOMAIN.DEPLOYMENT, 'Stale bundle detected', { deployedId, runningId, buildId: BUILD_ID })
  },
}
