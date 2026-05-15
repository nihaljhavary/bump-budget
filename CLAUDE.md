# bump. — Claude Context File

Read this before doing anything. It saves tokens and prevents known errors.

---

## Project

React + Vite SPA. Netlify for hosting + serverless functions. Supabase (Postgres + Auth). Paystack for payments. Claude API (Haiku for chat/support, Sonnet for analysis).

**Repo:** `https://github.com/nihaljhavary/bump-budget`
**Active branch:** `dev` — never touch `main`
**Dev site:** `https://dev--bump-budget.netlify.app`

---

## CRITICAL: Linux/Windows filesystem bridge

The sandbox Linux shell and the Windows file tools (Read/Write/Edit) see the same files via a mount, but writes from the Windows Edit tool often produce truncated files or null bytes on the Linux side. This causes build errors.

**Rules:**
1. Always use `Read` tool (Windows) to read files — it shows the true content
2. Always write/rewrite files via Python in bash: `open(path, 'w').write(content)`
3. Never use the Edit tool on files longer than ~100 lines — use Python rewrite instead
4. To fix null bytes: `open(path,'rb').read().replace(b'\x00',b'')` then write back
5. After any file change, check Linux line count: `wc -l <file>` — if it's less than expected, the file is truncated, append missing lines
6. **After editing ANY netlify function, run `node --check` on ALL function files** — truncation in one file (e.g. sa-categorise.js) crashes any function that imports it, causing 502s with no useful error message. Run: `for f in netlify/functions/*.js; do node --check "$f" || echo "BROKEN: $f"; done`

**Path mapping:**
- Windows: `C:\Users\nihal\Downloads\Bump Budget\` → Linux: `/sessions/*/mnt/Bump Budget/`
- Outputs dir: `/sessions/*/mnt/outputs/`

---

## Build

```bash
cd "/sessions/zen-beautiful-feynman/mnt/Bump Budget"
npx vite build --emptyOutDir false
```

`--emptyOutDir false` is required — avoids EPERM error on the dist folder.

---

## Git workflow

The git index is often corrupt from the Linux side. Use this pattern to commit:

```bash
GIT_INDEX_FILE=/tmp/git_idx_N git read-tree HEAD
GIT_INDEX_FILE=/tmp/git_idx_N git add <files>
GIT_INDEX_FILE=/tmp/git_idx_N git commit -m "message"
```

Increment N each session (git_idx1, git_idx2, etc.) to avoid reusing a stale index.

**Push always fails from Linux** (no credentials). After committing, tell the user:
> "Run `git push origin dev` in Git Bash"

If the branch has diverged, user runs: `git push --force origin dev`

---

## Architecture

### src/components/
| File | What it does |
|------|-------------|
| `Auth.jsx` | Magic link login. `emailRedirectTo: window.location.origin + '/app'` |
| `Dashboard.jsx` | Main app shell. Tabs: overview, income statement, analytics, projections, groceries, budget, add spend, import, transactions. Profile dropdown → My Profile modal, Support, FAQs, Sign out. Simulation banner when admin is simulating a tier. |
| `Onboarding.jsx` | 4-step flow: welcome → declaration (personal/household/side_hustle/sole_prop) → income → bank → done. Uses `supabase.from('profiles').upsert({...}, { onConflict: 'id' })` |
| `Analytics.jsx` | Spend analytics charts |
| `Projections.jsx` | DCF financial projections with AI commentary |
| `GroceryComparison.jsx` | Price comparison across SA retailers |
| `IncomeStatement.jsx` | Rolling income statement. Period buttons (1m/3m/6m/12m/custom). Comparison columns. AI interpretation via `/.netlify/functions/analyse` |
| `AdminDashboard.jsx` | Access requests, bookings, view user budgets. **Tier simulation dropdown** in nav (Admin/Free/Starter/Growth/Pro) |
| `SupportChat.jsx` | Support chatbot. Calls `/.netlify/functions/support-chat`. Quick suggestion buttons. |
| `FAQ.jsx` | Static accordion. 4 sections: Getting started, Plans & billing, AI & analysis, Privacy & data |
| `LandingPage.jsx` | Public landing page with features + pricing |
| `LockedFeature.jsx` | Blur + lock overlay for gated features. `<LockedFeature locked feature="analytics">` |
| `Recommendations.jsx` | Budget recommendations |
| `ImportTransactions.jsx` | CSV/Excel statement import. Banks: FNB, Nedbank, ABSA, Standard, Capitec, Discovery, TymeBank, Investec, Generic. |
| `AccountCentre.jsx` | Account Centre modal (extracted from Dashboard.jsx). Sections: Profile, Subscription, Uploads, Export, Data/Account. Opened via avatar menu. |
| `BookConsult.jsx` | Consultation booking |

### src/context/
| File | What it does |
|------|-------------|
| `AuthContext.jsx` | `useAuth()` → `{ user, profile, updateProfile }`. Profile loaded from `profiles` table. |
| `TierContext.jsx` | `useTier()` → `{ plan, isAdmin, canAnalytics, canProjections, canGroceries, canRules, canConsult, simulatedPlan, setSimulatedPlan, simulating }`. Plans: free/starter/growth/pro. Admin simulation stored in localStorage key `bumpSimPlan`. |

### src/services/
- `transactions.js` — `fetchTransactions`, `fetchTransactionsByMonth`, `fetchTransactionsByRange`, `addTransaction`, `updateTransaction`, `deleteTransaction`, `recategorizeMatchingTransactions`
- `ai.js` — `parseTransaction`, `analyseSpending`, `recategoriseAll`, `enrichMerchant`
- `src/utils/recurring.js` — `detectRecurring(transactions)`: finds recurring payments by merchant across 2+ months. `recurringToContext(recurring, {income})`: compact string for AI context.

### netlify/functions/
| File | Purpose |
|------|---------|
| `analyse.js` | Main AI analysis. Has FORMAT_RULES. Imports `_context.js`. |
| `budget-chat.js` | AI budget Q&A. Rate limited: 10/month free, unlimited paid. Has FORMAT_RULES. |
| `support-chat.js` | Support chatbot using Haiku. Has FORMAT_RULES. |
| `parse-transaction.js` | Single SMS/text transaction parser |
| `parse-bulk-transactions.js` | Bulk statement import parser. Uses `ai_usage` table for rate limiting. |
| `compare-groceries.js` | Grocery price comparison |
| `get-recommendations.js` | Budget recommendations |
| `admin-data.js` | Admin: get_dashboard, update_access_status, get_user_transactions |
| `manage-rules.js` | Budget rules CRUD |
| `create-booking.js` | Consultation booking |
| `create-subscription.js` | Paystack subscription |
| `verify-payment.js` | Payment verification |
| `paystack-webhook.js` | Paystack webhook handler |
| `recategorise-all.js` | Bulk AI recategorisation. Rules pass first, then Claude only for "Other". Imports `sa-categorise.js`. |
| `sa-categorise.js` | Shared SA merchant rules + `saPreCategory()`, `cleanForAI()`, `isSpendTransaction()`. Imported by recategorise-all + parse functions. |
| `_context.js` | Shared AI context builder. Imported by analyse.js. Prefixed `_` so Netlify ignores it as an endpoint. |
| `enrich-merchant.js` | Single merchant AI enrichment fallback. |
| `manage-uploads.js` | GET: list import batches grouped by import_batch_id. POST {action:'delete',batchId}: cascade-deletes all transactions for a batch. |
| `manage-subscription.js` | POST {action:'cancel'\|'downgrade'\|'reactivate'}: self-service Paystack subscription management. Calls Paystack disable endpoint + writes cancel_at_period_end + scheduled_plan to profiles. |
| `delete-account.js` | POST {confirmation:'DELETE'}: cascade-deletes all user data (transactions, rules, profile) then removes auth.users entry. Irreversible. |

---

## Key conventions

- **Claude model:** use `claude-haiku-4-5-20251001` for all functions. `claude-sonnet-4-6` is NOT a valid direct API model string — it causes silent failures.
- **Amounts:** stored as integer cents in Supabase. Divide by 100 for display. `fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')`
- **Dates:** ISO string `YYYY-MM-DD`. Display via `fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', ...)`  — the `T12:00:00` prevents timezone off-by-one
- **Profile save:** always use `.upsert({...}, { onConflict: 'id' })` not `.update()` — avoids "no rows updated" errors
- **AI FORMAT_RULES:** "Never use em dashes (—). Never use tilde (~). Never use markdown bold (**text**). Write in plain prose." — added to SYSTEM_PROMPT in analyse.js, budget-chat.js, support-chat.js
- **Tier locking:** Analytics → starter+, Projections → growth+, Groceries → growth+, Consult → pro only
- **Free plan limits:** 30 days history, 10 AI budget questions/month (tracked in `budget_chat_usage` table)
- **Emoji in JSX:** always use the actual emoji character (paste it directly) or the JS escape `\u{1f9e0}`. Never use Python-style `\U0001f9e0` (uppercase U, 8 hex digits) — JavaScript treats this as a literal backslash + U + digits and renders broken text in the UI.

---

## Supabase tables (key ones)

- `profiles` — id, full_name, gross_income, net_income, monthly_debit_orders, savings_goal, bank, subscription_plan, subscription_status, is_admin, role, usage_type
- `transactions` — id, user_id, name, amount, category, date, created_at (**no `description` column** — selecting it causes a Supabase fetch error)
- `consultant_access` — id, user_id, status, granted_at, podcast_consent
- `budget_chat_usage` — id, user_id, question_preview, created_at
- `bookings` — consultation bookings
- `transactions` columns that matter: `import_batch_id` (UUID, nullable) — links transactions to an upload batch; `raw_merchant` — original bank description; `transaction_hash` — dedup fingerprint; `detected_bank` (text, nullable) — bank ID written at import time ('fnb', 'nedbank', etc.).
- `profiles` subscription columns: `paystack_sub_code`, `paystack_cust_code`, `next_billing_date`, `billing_cycle_start`, `billing_cycle_end`, `cancel_at_period_end` (bool), `scheduled_plan` (text) — plan to apply when current sub disables.
- `subscription_events` — log of all Paystack events and manual subscription changes.

---

## Pending / not yet built

- Error/support logging system (log errors to Supabase or external service)
- Admin Excel export of user data
- Admin analytics dashboards (user growth, revenue, AI usage stats)
- Free tier: more explicit upgrade prompts on budget/recommendations tabs
- ~~parse-bulk-transactions.js / ImportTransactions.jsx data.results mismatch~~ — **Fixed**: client now reads `data.transactions`.

---

## UI & Interaction architecture (2026-05 stabilisation session)

### CSS variables
All components must use only defined CSS variables. Aliases defined in `index.css :root`:
- `--card`, `--card-bg` → alias for `--surface` (white)
- `--accent` → alias for `--coral`
- `--hover-bg` → alias for `--bg-alt`
- `--input-bg` → alias for `--bg`
- `--green` → `#16a34a`
Never use undefined variable names — they silently fall through to browser defaults.

### Desktop avatar dropdown: stacking context bug
On desktop, `.nav` (z-index: 10) and `.tabs` (z-index: 11) are siblings. A `.profile-dropdown` inside `.nav` inherits the nav's stacking context, so it renders BELOW `.tabs` regardless of its own z-index.
**Fix:** `.nav` must have `z-index: 20` (higher than tabs) in the desktop media query. Dropdown must use `left: 0; right: auto` (not `right: 0`) on desktop because `.avatar-wrap` is only 32px wide — right-anchoring causes the menu to render off-screen to the left. `.avatar-wrap` must be `width: 100%` on desktop so the dropdown has a sensible anchor.

### Mobile bottom nav
Primary tabs: Overview, Analytics, Groceries, Budget (id: 'budget'), Transactions. Keep labels ≤ 8 chars for mobile. Secondary actions (Support, FAQs, Privacy, Sign out) live behind the avatar/profile dropdown.

### Budget mode toggle (Overview)
State: `budgetMode` ('personal' | 'ai'). `activeBudgets` = userBudgets when personal, `aiBudgets` state when 'ai'. Toggle renders above category cards.
- `aiBudgets` is loaded async via `loadAiBudgets()` using `fetchRecentMonths(uid, 12)` + `buildLedgerSummary`. It computes 85% of the rolling 12-month average per category.
- Triggered on mount (user?.id, profile?.net_income deps) and on every `importSignal` bump.
- This is the correct rolling average — NOT a single-month snapshot.

### AI interpretation: canonical context wiring
`runAnalysis()` in Dashboard.jsx MUST pass: `topMerchants` (from `buildTopMerchants(spendTxns, 15)`), `effectiveIncome` (from ledger), `incomeResolutionMode` (from ledger), `periodLabel`. Without these, the AI receives no merchant data and produces generic analysis.

### AI budget recommendation month count
`get-recommendations.js` accepts `monthCount` from the client. `Recommendations.jsx` tracks `monthCount` in state from `ledger.monthCount`. Always divide historical category totals by the ACTUAL uploaded month count, not a fixed 12. Cap at 12 months via `fetchRecentMonths(uid, 12)`.

### Income Statement and Projections: tab integration
Both components are self-contained (load their own data). They are embedded as expandable sections:
- `IncomeStatement` → expandable at the bottom of `Analytics.jsx` (controlled by `showIncomeStatement` state, toggle class `.a-section-toggle`)
- `Projections` → expandable at the bottom of `Recommendations.jsx` (controlled by `showProjections` state, toggle class `.rec-section-toggle`). Wrapped in `canProjections` tier check — non-growth users see `<LockedFeature>`.

### Dark-mode CSS rule (session 2026-05)
`IncomeStatement.css` and `Projections.css` were written for a dark ember theme. They used hardcoded dark colors (`#1A1008`, `#120C07`, `#D4C4B8`) and rgba-white borders (`rgba(255,255,255,0.04)`). All fixed to use CSS variables: `var(--surface)`, `var(--input-bg)`, `var(--border)`, `var(--text)`, `var(--muted)`, `var(--bg-alt)`. Never reintroduce hardcoded dark colors — this app uses a light peach theme only.

### AI prompt design (merchant-aware)
`buildInsightPrompt` in `_context.js` now instructs the AI to name specific merchants and exact rand amounts. Generic statements ("you spent a lot on dining") are anti-patterns. The context string includes `MERCHANT BREAKDOWN BY CATEGORY` with per-merchant totals for Eating out, Groceries, Entertainment, Clothing, Transport, Health — so the AI can produce outputs like "Uber Eats at R1 200, Vida e Caffe at R800".
---

## Auth edge cases (2026-05)
- **`acceptTerms` in Auth.jsx** uses `.upsert()` (not `.update()`) so new users with no profile row still get `terms_accepted_at` saved. `.update()` on a non-existent row is a silent no-op.
- **Legacy user onboarding bypass in App.jsx** — `onboarding_complete` was added with `default false`, so all pre-migration profiles have it as false. `ProtectedApp` detects "legacy users" (has `terms_accepted_at` + `full_name` but `onboarding_complete = false`) and routes them straight to Dashboard, then silently calls `updateProfile({ onboarding_complete: true })` to heal the DB. Genuinely new users (no `full_name`) still go through Onboarding correctly.

---

## Account Centre architecture (2026-05)

### Navigation
Avatar menu → `setShowAccountCentre(true)` → renders `<AccountCentre />` modal over content.
AccountCentre is a standalone component (`src/components/AccountCentre.jsx`) — not inline in Dashboard.jsx.

### Sections
- **Profile** — financial profile fields (name, income, debit orders, savings goal, bank). Saves via `updateProfile()` from AuthContext.
- **Subscription** — reads tier from TierContext. Shows billing cycle dates (`billingCycleStart`, `billingCycleEnd` from TierContext subscription object). Paid users see self-service cancel/downgrade buttons that call `manage-subscription.js`. Pending cancel shows "Undo cancellation" link. Pending downgrade shows "Undo downgrade" link. Both call `reactivate` action. Free users see upgrade plan cards + "contact support".
- **Uploads** — calls `manage-uploads.js` (GET) to list batches grouped by `import_batch_id`. Delete calls POST with `{action:'delete',batchId}`. After delete, calls `onDataChange()` prop to reload Dashboard transactions + bump `importSignal`. Amounts stored as cents in DB — divide by 100 for display.
- **Export** — client-side CSV and XLSX export using the xlsx library + `detectRecurring`. Fetches transactions directly from Supabase with date/category filters. XLSX has **three sheets**: Transactions, Category Summary, Recurring (from `detectRecurring(rows)` — no separate fetch needed, runs on the same rows).
- **Data/Account** — 3-step account deletion: warn → I understand → type "DELETE" → call `delete-account.js`. Warning text explicitly mentions subscription cancellation and no refund.

### Subscription lifecycle
`manage-subscription.js` cancel/downgrade flow:
1. Calls Paystack `/subscription/{code}` to get `email_token`
2. Calls Paystack `POST /subscription/disable` with code + token
3. Writes `cancel_at_period_end=true` + `scheduled_plan` to profiles
4. TierContext reads `cancel_at_period_end` — keeps current plan active until billing cycle ends
5. When Paystack fires `subscription.disable` webhook, `paystack-webhook.js` reads `scheduled_plan` from profiles: if set (downgrade), applies that plan; otherwise reverts to free.

### Upload management
`manage-uploads.js` groups transactions by `import_batch_id` in the function (Supabase REST lacks GROUP BY).
Delete scopes to `user_id` + `import_batch_id` — safe, cannot delete other users' data.
Manual transactions (no `import_batch_id`) are never affected.
`onDataChange` prop on `<AccountCentre>` (passed from Dashboard): called after batch delete → `loadTransactions() + setImportSignal(s => s+1)`. Without this, Dashboard analytics don't refresh after upload deletion.

### Account deletion safety
`delete-account.js` requires `{ confirmation: 'DELETE' }` in POST body.
Deletes all tables in safe order, then `profiles`, then `auth.users`.
Cancels active Paystack subscription before deletion (best-effort, non-fatal if fails).

---

## Statement ingestion & merchant intelligence (2026-05)

### Upload source tracking
`detected_bank` column on `transactions` is written at import time from the user's bank selection. `manage-uploads.js` selects and groups it — the first transaction in each batch wins (they're all from the same upload). `AccountCentre.jsx` UploadsSection displays it as a coral badge next to the date range.

### Amount parsing
`parseSigned(val)` handles: standard minus signs, parentheses-negative accounting format `(1,234.00)`, comma/space thousand separators. `normaliseAmount(val)` wraps it and always returns absolute value. `normaliseDate` handles: ISO `YYYY-MM-DD`, `DD/MM/YYYY`, `DD MMM YYYY` (explicit month name lookup prevents JS Date timezone drift), `MMM DD, YYYY`.

### sa-categorise.js expansion (2026-05)
Patterns added this session — insert BEFORE running: online grocery ordering (`pnp online`, `spar online`, `checkers online`, `woolworths online`), more streaming subscriptions (Amazon Prime, Disney+, Apple.com/bill, YouTube Premium, Canva, Adobe), more SA eating-out chains (KFC, Steers, Wimpy, Spur, Ocean Basket, Doppio Zero, Tasha's, Bootlegger, Truth Coffee), Takealot/online shopping block before catch-all. Contextual ordering rule: online grocery patterns MUST precede broad Woolworths→Clothing rule.

### Recurring obligations UI (2026-05)
`recurring` is computed as a `useMemo` from `allowedTransactions` in Dashboard.jsx (not re-computed in `runAnalysis`). Overview tab shows a **Recurring Obligations panel** above the AI panel — top 6 recurring merchants with category badge, burden % of income, and /mo amount. `isObligation` items (Housing, Insurance, Utilities, Fees & Charges, Subscriptions) shown first; `habitual` items (Groceries, Fuel, Transport, Education, Health) shown with reduced opacity. Total burden % displayed in panel header when income > 0.

---

## Scenario Planning engine (2026-05)

### Architecture overview
`Projections.jsx` evolved from a 12-month cash-flow chart into a full Scenario Planning engine. Three modes: **Current Path** (existing behaviour), **Optimised Path** (10% variable reduction), **Custom Scenario** (user life events). All three modes share the same deterministic `buildYearModel()` function — only the inputs differ. No AI touches any financial calculation.

### buildYearModel() — deterministic financial engine
Pure function in `Projections.jsx`. Inputs: `netIncomeMonthly`, `fixedMonthly`, `variableMonthly`, `startingSavings`, `assumptions`, `events[]`, `varReduction`, `horizonYears`. Per-year arithmetic:
- `annualIncome = netIncomeMonthly × 12 × (1 + salaryGrowth/100)^i`
- `annualFixed = fixedMonthly × 12 × (1 + inflation/100)^i`
- `annualVariable = variableMonthly × 12 × inflationFactor × varReduction`
- `investmentGrowth = max(balance, 0) × investmentReturn/100` (compound on running balance)
- `freeCashFlow = annualIncome + eventIncome − annualFixed − annualVariable − eventExpense`
- `balance += freeCashFlow + investmentGrowth`

Returns `rows[]` with: `year, annualIncome, eventIncome, investmentGrowth, annualFixed, annualVariable, eventExpense, freeCashFlow, netWorth`.

**Critical rule:** Never replace this engine with AI-generated numbers. The comment `// No AI involved` at the top of the function is intentional.

### Financial event architecture
Events are plain objects: `{ type, year, amount, income: bool, monthly: bool, description, id }`. `income: true` = adds to cash flow; `false` = subtracts. `monthly: true` = amount × 12 for the year. Events are filtered by `Number(e.year) === year` in the engine loop — they apply once in the named year only. Supported types: `salary_change`, `bonus`, `vehicle`, `property`, `school_fees`, `debt_payoff`, `expense`, `income`. Carry-forward salary changes (permanent raises) would require mutating the base `netIncomeMonthly` across subsequent years — not yet implemented; model as recurring yearly events for now.

### Assumption architecture
State: `{ salaryGrowth: 5, inflation: 6, investmentReturn: 8 }` (all percentages). Defaults are conservative SA-realistic values. User can override via collapsible panel. All three year models recompute on any assumption change via `useMemo`.

### What was preserved unchanged
- `loadTransactions()`, tier filtering, `fetchTransactionsByRange` — unchanged.
- `buildLedgerSummary` usage and `avgVariableSpend` / `monthlyIncome` derivation — unchanged.
- 12-month monthly savings balance chart (`ProjectionChart`) — extended to accept optional `customPath` third line (purple, dashed), but existing two-path rendering logic is identical.
- `projections.current` and `projections.optimised` monthly arrays — unchanged computation.
- Annual strip (annual savings + months-to-goal) — unchanged.
- `proj-cards`, `proj-annual-strip`, `proj-scenario-card` CSS classes — unchanged.

### Year-by-year table
`YearlyTable` component renders an 8-row × N-year table. Left column is `position: sticky; left: 0` so metric labels stay visible on horizontal scroll. Wrapper is `overflow-x: auto` with `-webkit-overflow-scrolling: touch` for mobile. `min-width: 560px` on the table forces scroll on narrow screens. Row types: `income` (no highlight), `expense` (faint red bg), `net` (faint green bg), `networth` (bold, faint coral bg). Zero-value income/expense rows show `—` to avoid noise.

### Charts
`YearChart` component: SVG line chart of net worth over years, same SVG rendering pattern as `ProjectionChart`. All three scenario paths rendered (current = coral solid, optimised = green dashed, custom = purple dashed). Labels use year integers not month strings.

### Recommendations integration
`Recommendations.jsx` now imports `detectRecurring` from `../utils/recurring`. After `buildLedgerSummary` in `loadData()`, it sums `isObligation` median amounts into `recurringMonthly` state. This is passed as `recurringMonthly` prop to `<Projections />`, which uses it to pre-fill the fixed obligations input (falls back to `profile.monthly_debit_orders` if no recurring detected). This wires real statement-detected obligations into the projection base.

### Component prop
`Projections` now accepts optional `recurringMonthly: number` prop (rands/month). When provided, it overrides the debit orders input pre-fill from profile. Backward-compatible — no prop = existing behaviour unchanged. Dashboard.jsx embeds `<Projections />` directly (no prop); Recommendations passes the detected obligation total.

---

## Grocery Intelligence (2026-05)

### Architecture overview
`GroceryComparison.jsx` evolved from a simple price comparison tool into a full grocery intelligence system. Three input modes: **Scan receipt** (photo upload → vision API), **Paste list** (text regex parser), **Enter items** (manual grid). Behavioural insights from transaction history are shown above the input tabs on every load.

### Receipt image parsing
`parse-grocery-receipt.js` (new Netlify function). POST `{ imageBase64, mediaType }` with Bearer token. Uses Claude Haiku vision API — multimodal message with base64-encoded image. Returns `{ store, items[], subtotal, discounts, deliveryFee, loyaltySavings }`. On success, items are populated into the manual grid and mode switches to 'manual' for review. Supports JPEG, PNG, WebP up to 10 MB. No OCR/technical language exposed to the user — loading state says "Reading your receipt...".

### SA retailer coverage (2026-05)
`STORES` array: Woolworths, Checkers, Checkers Sixty60, Pick n Pay, Pick n Pay ASAP, Shoprite, Spar, Clicks, Dis-Chem, Makro. `compare-groceries.js` has expanded knowledge: WRewards, Xtra Savings (up to 15%), Smart Shopper, Smart Price range (15-20% cheaper), Clicks ClubCard, Makro bulk pricing. Delivery fees: Sixty60 R25-35, Woolworths Dash R35-45, PnP ASAP R30, Spar2u R35.

### Behavioural grocery insights
`computeGroceryInsights(txns)` — pure client-side function, no AI. Runs on last 3 months of transactions from `fetchRecentMonths(user.id, 3)`. Computes: `monthlyAvg`, `deliveryPct`, `deliveryCount`, `deliveryPremiumPct`, `topRetailer`, `topRetailerPct`, `retailerTotals`. `InsightsPanel` component renders a 2-4 card grid above the input UI. Nudges fire when: delivery > 30% of grocery spend, or Woolworths > 60% of grocery spend.

### Delivery detection patterns
```js
const DELIVERY_PATTERNS = [
  'sixty60', 'sixty 60', 'checkers sixty', 'checkers online',
  'woolworths dash', 'woolies dash', 'woolworths delivery', 'woolies delivery', 'woolworths online', 'woolies online',
  'pick n pay asap', 'pnp asap', 'picknpay asap', 'pnp online', 'pick n pay online', 'picknpay online',
  'spar online', 'spar deliver', 'spar2u',
]
```
Same patterns used in both `GroceryComparison.jsx` (client-side `isDelivery()`) and `_context.js` (`GROCERY_DELIVERY_KW` array for AI context).

### AI context integration (_context.js)
After eating-out delivery split detection, `_context.js` now detects grocery delivery split: filters `merchantsToUse` by `category === 'Groceries'`, checks against `GROCERY_DELIVERY_KW`, outputs `"Grocery split: X% delivery services (Sixty60/Dash/ASAP) vs Y% in-store"` when delivery > 0.

### compare-groceries.js response schema
Now includes `groceryInsights: { loyaltyTip, savingsTip, deliveryNote }` — three optional AI-generated tips shown in the results area. `FORMAT_RULES` added (no em dashes, tilde, markdown bold). `max_tokens` bumped to 2500.

### CSS variables (GroceryComparison.css)
All hardcoded dark colors replaced with CSS variables. No `#1A1008`, `#120C07`, `#2C1F14`, `#5A3020`, `rgba(255,255,255,0.03)` anywhere. Uses `var(--surface)`, `var(--input-bg)`, `var(--border)`, `var(--coral)`, `var(--hover-bg)`, `var(--card-bg)`, `var(--bg-alt)`.

### Emoji in JSX (critical)
All emoji in JSX text content must be actual characters (paste directly). `\u{1f4f7}` syntax fails in JSX — esbuild throws "Syntax error". Valid: paste 📷 directly. Invalid: `\u{1f4f7}` in JSX text.
