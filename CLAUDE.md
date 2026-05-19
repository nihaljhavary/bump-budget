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
| `schema-infer.js` | AI schema inference fallback. Called ONLY when `parseRowsDeterministic()` has low confidence (descCol or amount col missing). Accepts `{ headers, sampleRows (max 5), bankHint }`. Returns `{ mapping: { dateCol, descCol, amtCol, debitCol, creditCol, balanceCol, structureType } }`. Uses Haiku. Auth required, no separate rate limit. |
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

## Schema resilience & optional column handling (2026-05 hardening)

### detected_bank root cause & fix

**Problem:** `ImportTransactions.jsx` inserts four optional metadata columns into `transactions`:
- `detected_bank` — bank ID at import time
- `raw_merchant` — raw statement description  
- `transaction_hash` — dedup fingerprint
- `import_batch_id` — batch grouping UUID

If the migration `supabase/migrations/20260517_add_upload_tracking_columns.sql` has NOT been run (or PostgREST's schema cache is momentarily stale after running it), Supabase throws:
> "Could not find the 'detected_bank' column of 'transactions' in the schema cache"

The existing fallback at line ~779 only stripped `transaction_hash`. It did not catch `detected_bank` errors, so the error propagated to users.

**Fix applied (2026-05):**
- `ImportTransactions.jsx` INSERT fallback now checks for ANY of the four optional columns in the error message and strips them all, retrying with core fields only.
- SELECT fallback similarly expanded to handle both `raw_merchant` and `transaction_hash` errors.
- Neither `manage-uploads.js` (already had probe pattern) nor any other file needed changes.

**Migration required in Supabase SQL editor:**
Run `supabase/migrations/20260517_add_upload_tracking_columns.sql` — uses `ADD COLUMN IF NOT EXISTS` on all four columns. Safe to re-run. After running, PostgREST auto-refreshes its schema cache within ~30s.

**Schema column history:**
- v7 schema (`supabase-schema-v7.sql`): added `raw_merchant TEXT`, `import_batch_id TEXT`, `transaction_hash TEXT`
- v8 schema: NO new transaction columns
- `20260517_add_upload_tracking_columns.sql`: adds `detected_bank TEXT` (+ re-declares others with IF NOT EXISTS, import_batch_id as UUID)

**Graceful degradation rule:**
Any column inserted into `transactions` that is NOT in the original base schema must be treated as optional. The insert fallback strips all four optional metadata columns on any schema error. Uploads always succeed; metadata persists only when columns exist.

**manage-uploads.js probe pattern (already in place):**
Before the paginated fetch, probes for `detected_bank` with a single-row query. If missing, falls back to a query without it (`detectedBank: null` for all batches). Never hard-fails on missing optional columns.


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

### Theme evolution — v3 warm coral (2026-05)
Bump has gone through three palette evolutions. All previous palettes are recoverable:
- **v1 recovery**: copy `:root` from `src/theme-legacy-v1.css` into `index.css`
- **v2 recovery**: copy `:root` blocks from `src/theme-legacy-v2.css` (also covers LandingPage.css)
- **v3 is current** (the palette values below)

**Brand direction (v3):** v2 used deep emerald (`#1D7A5A`) as the primary accent — this drifted toward generic dark-fintech / crypto aesthetics. v3 returns to Bump's warm identity: muted terracotta coral as primary, with sage/forest green reserved purely for positive financial states (income, surpluses). The result is calm, warm, premium — not fintech-cold.

**Key v3 palette values (index.css):**
- `--coral: #C0766B` — primary accent: **muted warm terracotta coral** (was emerald `#1D7A5A` in v2, bright coral `#FF6B6B` in v1)
- `--coral-deep: #A46058` — hover / active
- `--coral-light: rgba(192, 118, 107, 0.10)` — tinted backgrounds
- `--bg: #F8F5F0` — warm ivory (slightly lighter than v2 linen)
- `--bg-alt: #EDE8E1` — warm stone secondary
- `--border: #E4DDD6` — warm stone border
- `--text: #1A1410` — deep espresso
- `--muted: #8C7E76` — warm stone muted
- `--success: #16A34A` — calm forest green (positive indicators)
- `--green: #16a34a` — income / surplus labels
- `--red: #DC2626`, `--red-light: #FEF2F2`
- `--amber: #C48530` — warm amber for warnings
- `--shadow: 0 1px 3px rgba(26, 20, 16, 0.07), 0 2px 8px rgba(26, 20, 16, 0.04)`

**Landing page (LandingPage.css):** Uses its own dark-mode palette via `:root` override with `--lp-*` variables. Landing accent is `#E8A49A` (warm salmon coral on dark — matches Bump's warm identity) — NOT a cold emerald. Background is `#100E0B` (warm espresso charcoal — not cold fintech dark). Think premium editorial / high-end hospitality, not crypto exchange.

**Key landing page v3 values:**
- `--lp-accent: #E8A49A` — warm salmon coral
- `--lp-bg: #100E0B` — warm espresso dark
- `--lp-surface: #1C1916`, `--lp-surface2: #241F1B` — warm dark surfaces
- `--lp-text: #F4EFE9` — warm ivory
- `--lp-muted: #9A8C83` — warm stone muted

**Hardcoded rgba in component CSS:** When using `var(--coral)` opacity variants in CSS (focus rings, hover states, selected pills), the hardcoded rgba must use `rgba(192, 118, 107, ...)` — updated in Dashboard.css, Projections.css, BookConsult.css, Onboarding.css. Do NOT use the old `rgba(29, 122, 90, ...)` (v2 emerald) or `rgba(255, 107, 107, ...)` (v1 coral).

**Semantic color rules (critical):**
- Negative/expense values: always use `var(--red)` — NEVER `var(--coral)` (it was previously abused for both accent and negative states)
- Positive/income values: always use `var(--green)` or `var(--success)`
- SVG `stroke`/`fill` attributes cannot use `var()` — use `#DC2626` for red, `#1D9E75` for chart series green
- Inline React `style` props CAN use `'var(--red)'` syntax

**Mobile bottom nav:** Now uses SVG icons (not emoji). Defined inline in Dashboard.jsx nav array. `mbn-icon` class sized to 20×20px, renders SVG with `currentColor`.

**Card border pattern (v2):** Metric cards use `border-top: 2px solid var(--coral)` (top accent bar). Category cards use plain `border: 1px solid var(--border)` — no colored left border. AI panel uses plain border + `box-shadow: var(--shadow)`.

**CSS file integrity rule:** After any `sed` or Edit-tool modification of CSS files, always run the brace balance check: `python3 -c "css=open('file.css').read(); print(css.count('{'), css.count('}'))"`. Truncation is common. Fix with Python append, not Edit tool.

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
`IncomeStatement.css` and `Projections.css` were written for a dark ember theme. They used hardcoded dark colors (`#1A1008`, `#120C07`, `#D4C4B8`) and rgba-white borders (`rgba(255,255,255,0.04)`). All fixed to use CSS variables: `var(--surface)`, `var(--input-bg)`, `var(--border)`, `var(--text)`, `var(--muted)`, `var(--bg-alt)`. Never reintroduce hardcoded dark colors — the app shell uses a light warm-linen theme only. The dark theme lives exclusively in `LandingPage.css` via `--lp-*` variables.

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
`Recommendations.jsx` now imports `detectRecurring` fr

---

## Financial integrity & observability (2026-05 hardening session)

### src/utils/integrity.js (NEW)
Pure validation module — no imports from React/Supabase. Four exports:
- `anomalyFlags(txns)` — detects: identical amounts (>90%), extreme amounts (>R500k), all-same dates, all-same descriptions, future dates. Used by both client and server.
- `validateIngestionBatch(txns)` — full client-side pre-send validation. Returns `{ valid, errors, warnings, stats }`. Errors block submission; warnings show in UI non-blocking.
- `detectBatchOverlap(incoming, existingFPs)` — computes overlap % between incoming and existing fingerprint set. `isDuplicate = true` when ≥70% match. Called in `handleSave()` before insert.
- `validateLedgerSummary(ledger)` — checks: NaN fields, negative spend, catTotals drift from totalSpend (tolerance R1), impossible spend-to-income ratios. Re-exported from `ledger.js` for single import point.
- `validateProjectionInputs(ledger, inputs)` — checks projection base income vs canonical ledger resolvedMonthlyIncome (≥50% drift flagged), combined fixed+variable >200% income.

### AI schema inference fallback (2026-05)

**Problem solved:** Some bank statements use irregular or unknown column names. Previously they hard-failed with "Couldn't find transaction columns". Now they recover automatically.

**Architecture — two-stage parsing in ImportTransactions.jsx:**
1. `parseRowsDeterministic(rows, bankId)` — unchanged bank-specific switch-case + auto-detect. Returns `{ txns, confidence: 'high'|'low', columns }`. Confidence is HIGH when `descCol` AND at least one amount col found; LOW otherwise.
2. If confidence is LOW (or txns.length === 0): call `inferSchema(headers, sampleRows, bankHint)` → `/.netlify/functions/schema-infer`. Shows "Analysing statement format..." in the upload step UI.
3. If schema-infer returns a mapping: call `parseWithMapping(rows, mapping)` — feeds mapping into the shared `extractRows()` normalisation engine.
4. If inference also fails or returns 0 rows: show improved error message.

**`extractRows(rows, { dateCol, descCol, amtCol, debitCol, creditCol, typeCol })`** — canonical single normalisation function shared by BOTH paths. Not duplicated. Used by `parseRowsDeterministic` and `parseWithMapping`.

**schema-infer.js contract:**
- Input: `{ headers: string[], sampleRows: object[] (max 5), bankHint?: string }`
- Output: `{ mapping: { dateCol, descCol, amtCol, debitCol, creditCol, balanceCol, structureType } | null }`
- All column references validated against actual headers (`validateMapping()`) before returning — no hallucinated column names.
- Returns `{ mapping: null }` with reason if descCol cannot be identified.
- Uses Haiku (cheap: ~150 input tokens, 50 output tokens per call).

**Performance:** Existing supported bank uploads are NEVER affected — AI fallback only fires when `confidence === 'low'`. No additional latency for FNB/Nedbank/ABSA/etc. statements.

**UX:** `inferring` state boolean drives a "Analysing statement format..." indicator in the upload step. On success, batchWarnings includes "Statement format was auto-detected — verify before importing."

**What is NOT changed:** `parse-bulk-transactions.js`, `sa-categorise.js`, ledger, analytics, budgeting, projections, recurring obligations — all untouched.

### Ingestion validation flow
1. `handleFile()` in `ImportTransactions.jsx` calls `parseRowsDeterministic()` first. If confidence is low, triggers schema inference before `validateIngestionBatch()`.
2. `parse-bulk-transactions.js` runs `detectIngestionAnomalies()` (inline mirror of `anomalyFlags`) before Claude call. Returns `{ transactions, warnings? }` — client surfaces backend warnings in preview UI.
3. `handleSave()` calls `detectBatchOverlap()` after fetching existing fingerprints. If `isDuplicate`, shows orange overlap warning (non-blocking — user can still save).

### Reconciliation guarantees
- `catTotals` and `totalSpend` are both derived from `filterSpend()` in `buildLedgerSummary()`. `validateLedgerSummary()` asserts their sum matches within R1 — any drift indicates a code regression.
- `Projections.jsx` computes `_projIssues` via `validateProjectionInputs()` in a `useMemo`. Shows yellow notice above the forecast tabs when inputs drift >50% from canonical ledger income. Non-blocking.
- Integrity re-exported from `ledger.js`: `import { validateLedgerSummary, validateProjectionInputs } from '../utils/ledger'`.

### Duplicate upload detection
`txnFingerprint()` + `buildFingerprintSet()` in `ledger.js` remain the canonical dedup mechanism. `detectBatchOverlap()` adds a *batch-level* signal on top: it warns before save rather than silently skipping. Both mechanisms coexist — fingerprint-based skip prevents double-inserts; overlap warning educates the user.

### What was deliberately NOT added
- No new Supabase tables — `error_logs` (v8) is sufficient; integrity issues are non-fatal and client-logged.
- No blocking reconciliation UI — all checks are advisory warnings, never hard blocks (except invalid batches at upload).
- No rewrite of `buildLedgerSummary()` or ingestion pipeline — existing architecture is correct; only validation layer added on top.

---

## Production hardening (2026-05)

### Deployment consistency
- `netlify.toml` has `[[headers]]` blocks mirroring `public/_headers` as belt-and-suspenders. Both must be kept in sync. `public/_headers` is the canonical source; `netlify.toml` is a fallback in case `_headers` is not copied to `dist`.
- `public/_headers` rules: `index.html` → `no-cache, no-store`; `/assets/*` → `immutable, max-age=31536000`; `/version.json` → `no-cache, no-store`.
- Vite content-hashes all `/assets/*` filenames by default — stale JS/CSS references are automatically invalidated on deploy.

### Build version awareness
- `vite.config.js` injects `__BUMP_BUILD_ID__` and `__BUMP_BUILD_TIME__` at build time. `DEPLOY_ID` from Netlify CI is used as build ID; local fallback is `Date.now().toString(36)`.
- `src/hooks/useVersionCheck.js` polls `/version.json?_=<timestamp>` on focus + every 5 minutes. Polling is skipped in local dev (build ID is not a Netlify DEPLOY_ID).
- `UpdateBanner` in `App.jsx` shows a dismissible coral banner when `updateAvailable = true`.
- `/version.json` is emitted by a Vite plugin in `vite.config.js` during every build.

### Observability (src/utils/observe.js)
- Lightweight structured event logger. Never throws, never blocks. Always logs to console; persists WARN/ERROR events to Supabase `error_logs` table (best-effort, auth-gated).
- `observe.info / warn / error(domain, message, context)` — raw API.
- Typed helpers: `observe.ingestionBatch`, `ingestionWarning`, `ingestionError`, `categorizationError`, `categorizationMismatch`, `duplicateOverlap`, `reconciliationMismatch`, `ledgerIssues`, `enrichmentError`, `staleBundle`.
- Domains: `DOMAIN.INGESTION`, `CATEGORISATION`, `RECONCILIATION`, `ENRICHMENT`, `DUPLICATE`, `LEDGER`, `DEPLOYMENT`.
- Uses dynamic `import('../supabase')` (not `require`) to avoid circular deps — lazy-loads on first WARN/ERROR only.

### Integrity (src/utils/integrity.js — extended)
- `batchTxnFingerprint(t)` — canonical fingerprint for incoming batch transactions. **Field priority: `description → raw_merchant → name`** — matches `txnFingerprint()` in `ledger.js` exactly. Must stay in sync.
- `detectBatchOverlap()` — now returns `{ overlapCount, overlapPct, isDuplicate, isPartialDuplicate }`. Tiers: ≥70% = `isDuplicate` (full re-upload); ≥30% = `isPartialDuplicate` (partial — surfaces to user); <30% = clean. Also checks legacy fingerprints (raw_merchant-first) for backwards compat with rows imported before this fix.
- `reconcileTabTotals(overviewLedger, analyticsLedger)` — checks totalSpend, income, monthCount match within R1 between tabs.
- `reconcileRecurring(recurring, totalSpend, monthCount)` — checks recurring obligations monthly total does not exceed monthly spend (10% buffer).
- `reconcileAiContext(aiContext, ledger)` — checks AI context income/spend within 5% of canonical ledger.

### Reconciliation wiring in Dashboard.jsx
`useEffect` after `ledger` + `recurring` useMemos runs `validateLedgerSummary()` and `reconcileRecurring()` on every ledger change. Issues surface via `observe.ledgerIssues()` and `observe.reconciliationMismatch()` — never block UI.

### Async enrichment resilience (src/services/ai.js)
- All exported functions (`analyseSpending`, `recategoriseAll`, `enrichMerchant`, `parseTransaction`) accept an optional `{ signal }` parameter and add a 55s hard timeout via `timeoutSignal()`.
- `timeoutSignal(ms, callerSignal)` chains caller + timeout into a single `AbortSignal`. Timer is cleared in `finally` to prevent leaks.
- `runAnalysis()` in Dashboard.jsx, `handleAI()` in Analytics.jsx, `generateAI()` in IncomeStatement.jsx, `categoriseWithClaude()` in ImportTransactions.jsx — all use `AbortController` refs, cancel in-flight requests when called again, and guard state setters with `!signal.aborted`.
- Components abort in-flight AI calls on unmount via `useEffect` cleanup.
- `categoriseWithClaude` in ImportTransactions.jsx has a 55s client-side timeout in addition to the server's Netlify limit. On timeout, falls back to "Other" categories so the user is never stuck on a spinner.

### Fingerprint alignment (critical)
The `detectBatchOverlap` fingerprint in `integrity.js` previously used `raw_merchant → description → name` (opposite priority from `txnFingerprint` in `ledger.js`). Now aligned: both use `description → raw_merchant → name`. Legacy fingerprints (old priority) are also checked to avoid false negatives on rows imported before this fix.

---

## Export architecture (2026-05 Session 2)

### AccountCentre.jsx — ExportSection
- Fetches transactions directly from Supabase with date/category filters (not from Dashboard state).
- **Amounts in DB are cents** — divide by `100` for display and export. Failure to do this gives 100x inflated numbers.
- CSV: simple transactions export (date, name, amount, category). No income/transfer rows are excluded — users can filter in Excel.
- XLSX has **4 sheets**: Transactions, Category Summary (spend-only, % of spend column), Analytics Overview (income/spend/net/monthly avg + category breakdown), Recurring (from `detectRecurring` called with `amount / 100` — cents must be converted to rands before passing or recurring amounts are 100x wrong).
- **Export presets**: 1m, 3m, 12m, YTD, All-time. `applyPreset()` sets `exportFrom`/`exportTo` date inputs. Active preset is tracked in `activePreset` state; custom date entry clears it.
- Category Summary excludes Income, Transfer, Savings rows to match Analytics tab logic.

### detectRecurring cents/rands contract
`detectRecurring(txns)` expects amounts in **rands**. DB rows have amounts in **cents**. Always convert before calling: `rows.map(r => ({ ...r, amount: r.amount / 100 }))`.

---

## Upload management UX (2026-05 Session 2)

### AccountCentre.jsx — UploadsSection
- **Bank name display**: `BANK_LABELS` constant maps raw bank IDs (`fnb`, `nedbank`, etc.) to human-readable names (`FNB`, `Nedbank`, etc.). Used in coral badge and search filter.
- **Search**: filters by bank label text (case-insensitive). `filtered` derived from `batches` state based on `search` state.
- **Inline delete confirmation** replaces dialog-based confirm. When `confirmingId === b.batchId`, the row gains `acc-upload-row--confirming` class and shows `acc-upload-confirm-inline` block with transaction count + date range context: "Remove X transactions from DATE to DATE? This cannot be undone."
- `onDataChange` prop (passed from Dashboard) is called after batch delete → triggers `loadTransactions()` + `setImportSignal(s => s+1)`. Without this, Dashboard analytics don't refresh.

---

## Subscription lifecycle (2026-05 Session 2)

### Downgrade vs cancel detection
`cancel_at_period_end` is set for BOTH cancels AND downgrades by `manage-subscription.js`. Previously both showed "Cancellation scheduled". Distinguish by:
```js
const isDowngrade = sub.cancelAtPeriodEnd && sub.scheduledTier && sub.scheduledTier !== 'free'
const isCancel    = sub.cancelAtPeriodEnd && (!sub.scheduledTier || sub.scheduledTier === 'free')
```
- `isDowngrade` → shows "Downgrade scheduled to {tier} on {date}"
- `isCancel` → shows "Cancellation scheduled — access until {date}"
- Both show "Undo" link that calls `reactivate` action on `manage-subscription.js`.

### Billing end date styling
`acc-billing-value--end` class: muted color + normal weight. Used for the billing-end date row to visually distinguish it from the renewal date (which uses full `acc-billing-value` weight/color).

---

## AccountCentre.css patterns (2026-05)

New CSS classes added in Session 2:
- `.acc-billing-value--end` — muted variant for end dates
- `.acc-upload-search-wrap` / `.acc-upload-search` — upload search input
- `.acc-upload-row--confirming` — red-tinted row when inline delete confirmation is shown
- `.acc-upload-confirm-inline` / `.acc-upload-confirm-text` — inline delete confirmation block
- `.acc-export-presets` / `.acc-preset-btns` / `.acc-preset-btn` — export date presets
- `.acc-preset-btn.active` — coral highlight for the currently selected preset

**CSS rewrite rule for AccountCentre.css**: This file must be written via Python (`open(path, 'w').write(content)`) not the Edit tool. The Edit tool truncates it at the Linux side, causing build CSS syntax errors. Always verify with `python3 -c "... brace depth check ..."` after writing.

---

## Scenario Planning v2 (2026-05 Session 3)

### Architecture overview
`Projections.jsx` is now a full interactive Scenario Planning engine with AI-assisted event extraction.

### buildYearModel() — granular field expansion
The deterministic engine now tracks 12 row fields per year beyond the original aggregates:
- Income: `bonusIncome`, `salaryEventIncome`, `vehicleSaleIncome`, `debtPayoffSaving`, `otherEventIncome`
- Expense: `vehicleCosts`, `schoolFees`, `childCosts`, `investmentContrib`, `bondPayments`, `otherEventExpense`
- Aggregate fields preserved for compatibility: `eventIncome`, `eventExpense`, `freeCashFlow`, `netWorth`
- **No AI involved** comment at top of function is intentional and permanent.

### YearlyTable -- dynamic row rendering
`ALL_TABLE_ROWS` defines all 16 possible rows. `ALWAYS_SHOW` set marks 6 core rows that always render. All other rows render only when at least one year has a non-zero value. This keeps the table clean for users with no custom events and detailed for those who do.

### EVENT_TEMPLATES expanded
New types: `vehicle_sell` (income), `bond_payment` (monthly expense), `children` (monthly expense), `investment` (monthly expense). Total: 12 event types. Each has `icon`, `income`, `monthly` fields. Icons use actual emoji characters (not Python \U escapes — CLAUDE.md rule).

### scenario-interpret.js (NEW netlify function)
- Endpoint: `POST /.netlify/functions/scenario-interpret`
- Accepts: `{ prompt, currentYear, netIncome, debitOrders, variableSpend }`
- Returns: `{ events: [...], explanation: "..." }`
- Uses Haiku. Validates + sanitises all returned events before sending to client.
- System prompt forbids inventing financial math — extracts structured intent only.
- `validTypes` set server-side rejects any unknown event type.

### AI interpretation flow in Projections.jsx
1. User types natural language in `proj-ai-prompt-input` (inside Custom Scenario panel)
2. `interpretScenario()` calls `scenario-interpret.js` with user context (income, debitOrders, variableSpend)
3. Returned events are merged into `customEvents` state with random IDs
4. `aiExplanation` state shows what was extracted (green confirmation box)
5. `forecastMode` switches to 'custom' automatically
6. All calculations remain deterministic — AI only shapes the event list

### ScenarioComparisonPanel
Collapsible panel (`.proj-compare-section`) below the net worth chart. Shows Current/Optimised/Custom side by side. Metrics: net worth at horizon, yr-1 free cash flow, yr-1 investment growth, yr-5 net worth. Uses `fmtK()` for compact display. Mobile: columns stack vertically, metrics wrap in flex row.

### Recommendations integration
`Recommendations.jsx` now computes `projectionContext` via a lightweight inline `computeProjectionContext()` function (mirrors `buildYearModel` arithmetic without importing it). Passes to `get-recommendations.js` as: `{ monthlyFreeCashFlow, netWorth1yr, netWorth5yr, netWorth10yr, optimisedNetWorth10yr, salaryGrowth, investmentReturn }`. Also passes `recurringMonthly`. The function injects a LONG-TERM PROJECTIONS block into the AI prompt so recommendations are forward-looking.

### git commit workaround (2026-05 Session 3)
The `/tmp` git index files from prior sessions are owned by `nobody` (different user). Use `/sessions/blissful-compassionate-cray/git_idx_*` paths instead of `/tmp/git_idx_*` for `GIT_INDEX_FILE`. HEAD.lock and index.lock owned by `nobody` cannot be removed — must ask user to `git add` and `git push` manually from Git Bash.

---

## Shared financial calculation utilities (2026-05 consolidation)

### Canonical architecture: one formula, one location

All shared financial math must live in `src/utils/`. Components import from these modules -- never duplicate formulas inline.

### src/utils/projection.js (NEW)
- `DEFAULT_PROJECTION_ASSUMPTIONS` -- `{ salaryGrowth: 5, inflation: 6, investmentReturn: 8 }`. Canonical defaults used by both Projections.jsx and Recommendations.jsx.
- `computeBaselineProj
---

## Persistence, schema alignment, and continuity (2026-05 Session 4)

### Upload schema: defensive detected_bank handling (manage-uploads.js)
`detected_bank` on the `transactions` table may not exist for all deployments (it was added later). `manage-uploads.js` now probes for the column with a cheap single-row query before the full paginated fetch. If the column doesn't exist, it falls back to a query without it (all `detectedBank` values return as `null`). This makes the Uploads section work correctly even before running the migration.

**SQL migration file**: `supabase/migrations/20260517_add_upload_tracking_columns.sql` — run this in the Supabase SQL editor to add `detected_bank`, `raw_merchant`, `transaction_hash`, `import_batch_id` columns (all `ADD COLUMN IF NOT EXISTS`, safe to run on existing data). Also creates the `idx_transactions_import_batch_id` index.

**Columns used by upload tracking (all nullable for backwards compat)**:
- `detected_bank TEXT` — bank ID at import time ('fnb', 'nedbank', etc.)
- `raw_merchant TEXT` — original bank statement description
- `transaction_hash TEXT` — dedup fingerprint (date+amount+description hash)
- `import_batch_id UUID` — groups transactions from one upload together

**Pattern** (same as ImportTransactions.jsx uses for `transaction_hash`): probe first, fall back without column if error contains 'detected_bank'.

### Scenario planning persistence (Projections.jsx)
Four state variables are now persisted to `localStorage` across refreshes, sessions, and deployments:
- `bumpScenario_forecastMode` — 'current' | 'optimised' | 'custom'
- `bumpScenario_assumptions` — `{ salaryGrowth, inflation, investmentReturn }`
- `bumpScenario_horizonYears` — 5 | 10 | 15
- `bumpScenario_customEvents` — array of life event objects

**Implementation**: `lsGet(key, fallback)` / `lsSet(key, value)` helpers in `Projections.jsx`. State initialised via lazy initialisers (`useState(() => lsGet(...))`). Four `useEffect` hooks persist each state on change. Reads/writes are silent no-ops on error (private browsing, quota exceeded, etc.). Input fields (netIncomeInput, debitOrdersInput, currentSavingsInput) are deliberately NOT persisted — they're re-derived from the user profile and ledger on each load.

**Not persisted** (intentionally): AI prompt, AI explanation, form draft, view toggle, UI expansion state (showAssumptions, showCompare, etc.).

### Shared calculation consolidation: verified clean (no drift)
All shared financial math confirmed in canonical locations:
- `buildAiBudgets()` in `src/utils/budgets.js` — used by Dashboard.jsx (12-month rolling) and Analytics.jsx (selected period). No inline 0.85 logic in components.
- `DEFAULT_PROJECTION_ASSUMPTIONS` in `src/utils/projection.js` — used by Projections.jsx (full engine) and implicitly by Recommendations.jsx (via `computeBaselineProjection` defaults).
- `computeBaselineProjection()` in `src/utils/projection.js` — used by Recommendations.jsx for AI context. Projections.jsx owns the full `buildYearModel()` engine independently.
- Reconciliation guarantee preserved: base-case Recommendations projection (no events, no varReduction) is arithmetically identical to Projections tab base case within rounding.
---

## Scenario Planning v3 (2026-05 Session 5)

### Persistence extended
All five planning inputs now survive refreshes/navigation/redeployments via `localStorage` (`bumpScenario_` prefix):
- `forecastMode`, `assumptions`, `horizonYears`, `customEvents` (from Session 4)
- `currentSavings` (NEW) — starting savings input. Seeded once from `profile.savings_balance` when no LS value exists; thereafter user-owned. `netIncomeInput` and `debitOrdersInput` are deliberately NOT persisted — they re-derive from profile to stay fresh.

### LongTermMetricsPanel (NEW component in Projections.jsx)
Compact always-visible panel above the annual strip. Surfaces 5–6 metrics from `buildYearModel()` output — no AI, pure arithmetic:
- Net worth at the selected horizon (5/10/15yr)
- Accumulated investment growth over horizon
- Year-1 annual free cash flow
- Obligation burden % (fixed + recurring / net income) — amber >45%, red >65%
- Savings runway in months (only when FCF is negative and currentSavings > 0)
- 5yr net worth milestone (when horizon > 5yr)

### Custom scenario lifecycle improvements
- **Event count badge** on the Custom Scenario mode tab — shows count when events exist, white on active coral background, coral-tinted when inactive.
- **Saved events hint** — when user is in Current/Optimised mode with saved custom events, a purple hint bar with "N life events saved in Custom Scenario + View & edit" button keeps the scenario visible without cluttering the main view.
- **Inline event edit** — each event item now has a pencil (✎) button. Clicking opens an inline edit form (amount, year, label) without removing and re-adding. `editingId` + `editDraft` state manages the edit lifecycle.
- `startEdit(ev)` / `saveEdit(id)` functions in Projections.jsx.

### Year-grid CSS improvements (Projections.css)
- Sticky left column now has a subtle box-shadow (`2px 0 4px`) to hint scrollability
- Section separators: `border-top: 2px solid var(--border)` on first expense row and net-worth rows for visual grouping
- Mobile: `min-width` reduced to 480px, tighter cell padding, smaller label column (120px)
- Scroll gradient hint on mobile (::after pseudo-element on proj-table-wrap)

### Reconciliation safeguards preserved
- `buildYearModel()` engine untouched — all deterministic arithmetic identical
- `computeBaselineProjection()` in `projection.js` unchanged
- `DEFAULT_PROJECTION_ASSUMPTIONS` shared constant unchanged
- `LongTermMetricsPanel` reads exclusively from `yearModels.current` rows — no separate computation

---

## Authenticated cross-device planning persistence (2026-05 Session 6)

### Architecture: two new JSONB columns on profiles

`planning_profile JSONB` — owned by Recommendations.jsx.
Stores: `{ answers, result, answersUpdatedAt, analysisRunAt }`.

`scenario_state JSONB` — owned by Projections.jsx.
Stores: `{ forecastMode, assumptions, horizonYears, customEvents, currentSavings, updatedAt }`.

**SQL migration:** `supabase/migrations/20260517_add_planning_profile_columns.sql`
Run in the Supabase SQL editor. Uses `ADD COLUMN IF NOT EXISTS` — safe to re-run.
No new tables, no new RLS policies — inherits existing profiles row-level security.
AuthContext `fetchProfile()` uses `*` selector so new columns are automatically included.

### Recommendations.jsx persistence

### Recommendations.jsx persistence layers

Two-layer model:
1. **localStorage** (fast): `loadSaved(uid)` / `persist(uid, ...)` / `clearSaved(uid)`. Keyed `bump_rec_v2_{uid}`. Hydrates immediately on mount (before profile is available).
2. **Supabase** (authoritative): `profiles.planning_profile`. Hydrates on `profile?.planning_profile` availability via a second useEffect. Freshness is compared by `analysisRunAt` timestamp — the newer source wins.

Timestamps used for comparison (`dbTs`, `lsTs`) are read from the STORED data objects, not generated fresh on mount. This means the comparison is always valid — there is no "fresh Date.now() on mount" corruption risk in Recommendations.jsx.

### Projections.jsx persistence layers

Same two-layer model with a 3-second debounce to avoid Supabase write storms during active scenario editing. See Session 7 for the critical bug fix in timestamp handling.

Refs:
- `scenarioHydrated` (`useRef(false)`): armed to `true` once profile hydration resolves. Guards the debounced save effect so it does not fire during initial hydration.
- `saveScenarioTimer` (`useRef(null)`): debounce handle for 3s Supabase writes.
- `scenarioInitialized` (`useRef(false)`): armed to `true` after the first run of the updatedAt tracking effect. Guards against writing `Date.now()` on mount (see Session 7 bug fix).

---

## Persistence hardening (2026-05 Session 7)

### Critical bug fixed: useRef not imported in Projections.jsx

`Projections.jsx` used `useRef` on two refs (`scenarioHydrated`, `saveScenarioTimer`) but had not added `useRef` to the React import. The import was:
```js
import { useState, useEffect, useMemo } from 'react'
```
Fixed to:
```js
import { useState, useEffect, useMemo, useRef } from 'react'
```
Without this fix, the entire Projections component crashed at runtime with `ReferenceError: useRef is not defined`.

### Critical bug fixed: updatedAt LS write on mount corrupted cross-device sync

**Root cause:** React always fires `useEffect` after the very first render, even when deps equal their lazy-initialised values. The updatedAt tracking effect:
```js
useEffect(() => {
  lsSet('updatedAt', Date.now())
}, [forecastMode, assumptions, horizonYears, customEvents, currentSavingsInput])
```
...fired on mount and wrote `Date.now()` to localStorage as `bumpScenario_updatedAt`. This fired BEFORE the Supabase hydration effect (effect order is definition order). When hydration then read `lsTs = lsGet('updatedAt', 0)`, it saw a freshly-minted `Date.now()` — which is always >= any Supabase `db.updatedAt` from a prior session or device. So `db.updatedAt <= lsTs` was always true and the LS branch always "won", meaning Supabase cross-device state was NEVER hydrated on any device that had visited before.

**Fix:** Added `scenarioInitialized` ref (also `useRef(false)`) that guards the updatedAt effect:
```js
const scenarioInitialized = useRef(false) // armed after initial mount; guards updatedAt LS write

useEffect(() => {
  if (!scenarioInitialized.current) { scenarioInitialized.current = true; return }
  lsSet('updatedAt', Date.now())
}, [forecastMode, assumptions, horizonYears, customEvents, currentSavingsInput])
```
On the initial mount the effect arms the ref and returns early — no timestamp write. On subsequent runs (genuine user-driven state changes) it writes `Date.now()` correctly.

**Why Recommendations.jsx does not have this bug:** Its timestamp comparison uses `lsData?.analysisRunAt` and `db?.analysisRunAt` — values from inside the stored data objects, not a standalone LS key written on mount. So there is no fresh-Date.now()-on-mount corruption risk in that component.

### State separation summary (canonical architecture)

| State | Owner | Persistence | Reset trigger |
|-------|-------|-------------|---------------|
| Forecast mode | Projections.jsx | LS + Supabase `scenario_state` | User explicit reset |
| Assumptions | Projections.jsx | LS + Supabase `scenario_state` | User "Reset to defaults" |
| Horizon years | Projections.jsx | LS + Supabase `scenario_state` | User explicit reset |
| Custom events | Projections.jsx | LS + Supabase `scenario_state` | User clears events |
| Starting savings | Projections.jsx | LS + Supabase `scenario_state` | Never (user-owned) |
| Planning answers | Recommendations.jsx | LS + Supabase `planning_profile` | User "Start fresh" |
| AI result | Recommendations.jsx | LS + Supabase `planning_profile` | User "Start fresh" |
| Canonical ledger | Dashboard.jsx | None (recomputed from txns) | Uploads, tab changes |

Normal uploads never wipe planning continuity — only explicit "Start fresh" or "Reset to defaults" user actions do.

### Lifecycle safeguards
- Uploads (`importSignal` bump) trigger `loadData()` re-fetch in Recommendations.jsx and `needsReanalysis = true` if results exist. Planning state (answers, result) is NOT cleared.
- `buildYearModel()` remains the sole deterministic financial engine. AI only shapes the `customEvents` list via `scenario-interpret.js` — it never generates financial numbers.
- `scenarioHydrated` ref prevents re-hydration on every profile refetch (which happens after billing webhooks etc.). Hydration runs exactly once per component mount.

---

## Planning continuity & auth maturity (2026-05 refinement session)

### SQL migration
`supabase/migrations/20260518_add_planning_completed.sql`
Run in the Supabase SQL editor. Adds:
- `planning_completed BOOLEAN DEFAULT FALSE` — canonical Smart Money Analysis completion flag
- `has_password_set BOOLEAN DEFAULT FALSE` — tracks whether user has a password credential
Back-fills `planning_completed = TRUE` for any profile that already has `planning_profile.result`.

### Canonical planning completion state
`profiles.planning_completed` is the authoritative boolean for whether a user has completed Smart Money Analysis.
- Set to `true` in `getRecommendations()` on every successful analysis (included in the same Supabase upsert as `planning_profile` content)
- Set to `false` only by explicit user "Start fresh" action
- NEVER reset by uploads, refreshes, navigation, or billing webhook updates
- Back-filled for existing users via SQL migration

**Why this matters:** `planning_profile` content can fail to sync (fire-and-forget). `planning_completed` is a lighter boolean that has a better chance of persisting even when the content sync fails. On cross-device restore, if content is unavailable but `planning_completed = true`, the app shows a "Re-run analysis" state rather than the "Start analysis" intro.

### Planning hydration lifecycle (Recommendations.jsx)
Two-phase hydration:
1. **LS hydration** (fires on `[user?.id]`): fast same-device restore. Guard: only restores if `saved?.result` is truthy — prevents blank screen on partial LS saves.
2. **Supabase hydration** (fires on `[user?.id, profile?.planning_profile, profile?.planning_completed]`): authoritative cross-device sync. After resolving (either branch or neither), sets `hydrated = true`.

**Hydration gate:** `hydrated` state (lazy-initialised: `true` if LS already has a result, `false` otherwise). The intro screen is NOT rendered until `hydrated = true`. This prevents "Start analysis" from flashing on device B where LS is empty but Supabase may have data.

**Restore-failed state:** if `hydrated = true`, `result = null`, and `profile.planning_completed = true`, shows a "Re-run analysis" variant of the intro card with an amber notice. The user is not misled into thinking they're a first-time user.

**Fast-path (same device):** lazy `useState(() => !!LS_result)` means `hydrated` starts `true` → no loading flash → LS hydration sets step='results' → Supabase hydration may refine → seamless.

### LS→Supabase bootstrap
When LS has newer data than Supabase (e.g. user's first cross-device login), the Supabase hydration effect pushes the LS content to Supabase AND sets `planning_completed: true` in the same upsert. This heals the DB for all future devices.

### Authentication maturity (Auth.jsx + App.jsx)
**Password validation — strong rules enforced everywhere:**
```
validatePassword(pwd):
  - length >= 8
  - /[A-Z]/ (uppercase)
  - /[a-z]/ (lowercase)
  - /[0-9]/ (number)
  - /[^A-Za-z0-9]/ (special character)
```
Applied in: `Auth.jsx signUp()`, `App.jsx ResetPassword handleReset()`.

**Inline strength feedback:** When `authTab === 'signup'` and password field is non-empty, `pwdStrength()` renders a row of 5 mini-rules that turn green as the user types. CSS classes: `.auth-pwd-rules`, `.auth-pwd-rule`, `.auth-pwd-rule.ok`.

**Password mode vs magic link:** The Auth.jsx UI already supports both. Magic link is the default tab. Users switch to password mode via "Use password instead". The `signIn()` function uses `supabase.auth.signInWithPassword()`.

**ResetPassword (App.jsx):** Upgraded from hardcoded dark brand colors to CSS variables (`var(--bg)`, `var(--coral)`, etc.) + same strong password rules + inline strength indicators. No more `#e85d26` / `#110A08` hardcoded.

### Post-magic-link password creation (AccountCentre.jsx)
`PasswordSection` component appended to `ProfileSection` in AccountCentre.
- Only shows "Set password" button when `!profile?.has_password_set`
- Shows "Change password" button when `profile?.has_password_set`
- On save: calls `supabase.auth.updateUser({ password })` + `updateProfile({ has_password_set: true })`
- Inline strength rules (`.acc-pwd-rules` / `.acc-pwd-rule.ok`)
- Non-blocking: users can ignore it entirely; magic links always work
- `has_password_set` requires the `20260518_add_planning_completed.sql` migration


---

## Scenario Planning Session 8 (2026-05 — structured expansion)

### What was added (surgical, not a rewrite)

**src/utils/projection.js**
- `DEFAULT_PROJECTION_ASSUMPTIONS` extended with two new fields:
  - `schoolFeeInflation: 8` — SA school fees inflate ~8%/yr, applied to `school_fees` events in multi-year scenarios
  - `childCostInflation: 7` — applied to `children` events in multi-year scenarios
- These are SA-realistic defaults. General `inflation` (CPI) stays at 6%.

**buildYearModel() — three targeted changes (no rewrite)**

1. **Separate inflation rates for school_fees and children events**
   - `yearsIntoEvent = year - Number(ev.year)` computed per event
   - For `school_fees` events: `amt *= (1 + schoolFeeInflation/100)^yearsIntoEvent`
   - For `children` events: `amt *= (1 + childCostInflation/100)^yearsIntoEvent`
   - Applies only when `yearsIntoEvent > 0` (base year unchanged)
   - This means a R50k school fee event in 2027–2032 shows: 50k, 54k, 58.3k, 62.9k, 67.9k, 73.3k

2. **Cumulative wealth decomposition tracking**
   - `cumulFCF` (running sum of `freeCashFlow`) and `cumulGrowth` (running sum of `investmentGrowth`) maintained outside the loop
   - Each row now includes `cumulativeFCF` and `cumulativeGrowth`
   - **Invariant (verified numerically):** `startingSavings + cumulativeFCF + cumulativeGrowth == netWorth` for every year, delta ≤ R1 (rounding only)

3. **Bug fix: `otherEventIncome` was tracked but never shown**
   - `property` purchase events now correctly accumulate to `vehicleCosts` (not `otherEventExpense`)
   - `otherEventIncome` was computed in the engine but was missing from `ALL_TABLE_ROWS` — now added

**ALL_TABLE_ROWS — three new rows**
- `otherEventIncome`: "Other event income" (type: income) — was missing, bug fixed
- `cumulativeGrowth`: "Cumulative inv. growth" (type: income) — shows compound return accumulation
- `cumulativeFCF`: "Cumulative savings (FCF)" (type: net) — shows discipline-driven wealth accumulation

**ALWAYS_SHOW set — expanded**
- Added `cumulativeGrowth` and `cumulativeFCF` to the always-visible set (alongside annualIncome, annualFixed, annualVariable, investmentGrowth, freeCashFlow, netWorth)

**LongTermMetricsPanel — wealth decomposition added**
- "From discipline" metric: `cumulativeFCF` at horizon (how much of net worth came from saving discipline)
- "From growth" metric: `cumulativeGrowth` at horizon (how much came from compound returns)
- Panel now consistently uses `lastRow.cumulativeGrowth` instead of recalculating `reduce` sum

**Assumptions panel — expanded to 5 inputs**
- Added `schoolFeeInflation` and `childCostInflation` fields (always shown, not gated on event type)
- Assumption reset button resets all 5 fields

**State initialization — migration-safe merge**
- `assumptions` useState now uses `{ ...DEFAULT_ASSUMPTIONS, ...lsGet('assumptions', {}) }` pattern
- Existing users with old 3-field LS schema get `schoolFeeInflation` and `childCostInflation` defaults automatically on next load
- Same merge applied in Supabase hydration path

**showYearTable — LS persistence added**
- `useState(() => lsGet('showYearTable', false))` with `useEffect` to persist on change
- Users who expand the year table don't need to re-expand on every visit

### What was deliberately NOT changed
- `buildYearModel` core loop arithmetic — identical to Session 7
- `ProjectionChart`, `YearChart`, `ScenarioComparisonPanel` — unchanged
- `computeBaselineProjection` in projection.js — unchanged (baseline for Recommendations reconciliation)
- All persistence refs (`scenarioHydrated`, `saveScenarioTimer`, `scenarioInitialized`) — unchanged
- Event editing, AI interpreter, mode tabs, saved events hint — unchanged
- CSS — no changes required

### Reconciliation guarantee (Session 8)
All 4 check suites pass with zero delta:
1. Wealth decomposition invariant: `startingSavings + cumulativeFCF + cumulativeGrowth == netWorth` for all years
2. School fee inflation: `schoolFees_year = base * (1 + 0.08)^yearsIntoEvent` exactly
3. Children cost inflation: `childCosts_year = base * (1 + 0.07)^yearsIntoEvent` exactly
4. Optimised path always >= current path in every year (zero-event base case)

---

## AI schema inference fallback — hardened lifecycle (2026-05 debug session)

### What was broken (and why users saw "Couldn't find transaction columns" too early)

The fallback flow was architecturally correct (fallback DID run before the hard-stop), but had four silent failure modes that made it appear as if the hard-stop fired prematurely:

1. **`inferSchema` swallowed all HTTP errors silently** — a 401 (expired session), 404 (function not deployed), or 502 (Claude API error) all returned `null` with no log entry. The outer `catch` block in `handleFile` was never reached because `inferSchema` caught its own errors internally. Result: user always saw the generic "Couldn't find transaction columns" message.

2. **No timeout on the schema-infer fetch** — if the Netlify function cold-started or the Claude API was slow, the `inferring` state would stay `true` indefinitely, leaving the user stuck on "Analysing statement format…".

3. **`schema-infer.js` returned unusable mappings** — if Claude identified a description column but no amount columns (e.g. a balance-ledger style statement), `validateMapping()` passed the mapping through with all amount fields null. `parseWithMapping` → `extractRows` then returned 0 rows silently, hitting the hard-stop with no useful diagnostics.

4. **No distinction in the error message between failure modes** — the same error string appeared whether inference was never attempted, returned null, or returned a mapping that produced 0 rows.

### What was fixed

**`ImportTransactions.jsx` — `inferSchema` function:**
- Added 30 s `AbortController` timeout — clears in `finally` to prevent leaks
- On HTTP error (non-2xx): `observe.warn(DOMAIN.INGESTION, 'Schema inference HTTP error', { status, bank })`
- On null mapping from server: `observe.warn(..., 'Schema inference returned null mapping', { reason, headers })`
- On timeout: `observe.warn(..., 'Schema inference timed out after 30 s')`
- On network/fetch error: `observe.warn(..., 'Schema inference fetch error', { error })`
- Function still never throws — all failures observed internally, `null` returned

**`ImportTransactions.jsx` — `handleFile` Step 2 block:**
- Added `inferenceAttempted` and `mappingFound` booleans to track fallback outcome
- When mapping is found but `parseWithMapping` returns 0 rows: `observe.warn` with sample values from the mapped columns (descCol, amtCol, debitCol, creditCol) for debugging
- The `mapping === null` case is now logged *inside* `inferSchema` (not in the outer catch)

**`ImportTransactions.jsx` — Step 3 hard-stop error message:**
Three distinct messages based on outcome:
- `!inferenceAttempted`: "The file appears to have no transaction rows" (parser found columns but data empty)
- `mappingFound && txns.length === 0`: "The column structure was identified but no transactions could be extracted — amount column may be formatted unexpectedly"
- `!mappingFound` (inference ran but returned null): "The statement format could not be recognised"

**`schema-infer.js` — amount column guard:**
After `validateMapping()`, added check: `const hasAmountCol = !!(safe.amtCol || safe.debitCol || safe.creditCol)`.
If false, returns `{ mapping: null, reason: '...' }` immediately — either "Statement uses a running-balance format" (balance_ledger) or "Could not identify a transaction amount column". This prevents the client from attempting `parseWithMapping` with a mapping that has no amount data.

### Canonical execution lifecycle (post-fix)

```
Upload file
  → parseRowsDeterministic()
    → confidence 'high' + txns.length > 0 → continue to categorisation  [happy path]
    → confidence 'low' OR txns.length === 0 → schema inference fallback
        → inferSchema() [30s timeout, full observability]
            → HTTP error         → observe.warn → mapping = null
            → null mapping       → observe.warn(reason) → mapping = null
            → valid mapping      → parseWithMapping() → extractRows()
                → txns.length > 0  → add auto-detect warning → continue  [fallback success]
                → txns.length === 0 → observe.warn(sample values) → hard-stop with specific msg
            → mapping = null     → hard-stop with "format not recognised" msg
  → integrity validation → categorisation → preview
```

### What was NOT changed
- `parseRowsDeterministic`, `extractRows`, `parseWithMapping` — logic unchanged
- `categoriseWithClaude` / `parse-bulk-transactions.js` — unchanged
- Ledger, analytics, budgeting, projections, recurring obligations — unchanged
- Upload success path — existing supported bank uploads unaffected (inference only fires on low confidence)

---

## Subscription conversion & trial lifecycle (2026-05 Session)

### Landing page auto-scroll fix
Root cause: `<SupportChat />` was rendered globally in `App.jsx` (outside all routes), so it mounted on the landing page. Its `useEffect` called `endRef.current?.scrollIntoView()` with the initial welcome message, hijacking the page scroll on load.

**Fix — two parts:**
1. **Removed `<SupportChat />` from `App.jsx`** — it was redundant there; Dashboard already renders it when the `support` tab is active.
2. **Added `mountedRef` guard in `SupportChat.jsx`** — the scroll effect now skips the initial render and only fires when new messages are added after mount.

### Upgrade / payment CTA flows — all wired up

All upgrade CTAs previously pointed nowhere (`href="#upgrade"`, "Contact support" dead-ends, LockedFeature overlays with no action). Now all route through a central `UpgradeModal`:

**New: `src/components/UpgradeModal.jsx` + `UpgradeModal.css`**
- Shows plan cards (Starter / Growth / Pro) with feature lists
- "Start 30-day free trial →" CTA
- Flow: server initialises Paystack transaction with `start_date` = 30 days out → client opens PaystackPop via `access_code` (no charge today) → on success, server activates with `trialing` status
- Simulation-mode guard: when admin is simulating a tier, shows an informational panel instead of opening real checkout
- Props: `{ isOpen, onClose, defaultPlan, onSuccess, simulating }`

**Wiring in `Dashboard.jsx`:**
- `openUpgrade(plan)` convenience function sets `upgradePlanHint` + `showUpgradeModal`
- `UpgradeModal` rendered once in Dashboard, controlled centrally
- All LockedFeature instances now receive `onUpgrade={openUpgrade}`
- Tier-nudge "Upgrade from R49/mo" `<a href="#upgrade">` → `<button onClick>` calling `openUpgrade`
- Transaction locked banner: same fix
- AccountCentre gets `onUpgrade={(plan) => openUpgrade(plan)}` prop

**Wiring in `AccountCentre.jsx` (SubscriptionSection):**
- Free-plan upgrade block: replaced "Contact support" dead-end with real plan cards (clickable, each calls `onUpgrade(planId)`) and a "Start 30-day free trial →" primary button
- Plan cards show Popular badge on Growth (featured)
- Trial banner: when `sub.isTrialing === true`, shows green alert with `trial_ends_at` date
- `onUpgrade` threaded: `AccountCentre` → `SubscriptionSection` → plan card clicks / CTA

**Wiring in `LockedFeature.jsx`:**
- Optional `onUpgrade` prop — when provided, shows "Start free trial →" button inside the lock overlay badge

### 30-day free trial lifecycle

**Flow:** Free → tap Upgrade → select plan → PaystackPop opens (card entry) → no charge today → Pro/Growth/Starter features unlock immediately → first charge in 30 days → auto-billing begins.

**create-subscription.js — new `initialize` action:**
```
POST { plan, action: 'initialize', trial: true }
→ calls Paystack /transaction/initialize with start_date = now + 30 days
→ returns { access_code, reference, email }
```
Client uses `access_code` with `PaystackPop.setup()` — defers first charge to `start_date`.

**Activation (POST { plan, reference, trial: true }):**
- Sets `subscription_status: 'trialing'`, `trial_ends_at: now + 30 days`
- Logs `event_type: 'trial_started'` in `subscription_events`

**paystack-webhook.js updates:**
- `subscription.create`: preserves `trialing` status if already set by create-subscription.js (doesn't overwrite with `active`)
- `charge.success`: detects `wasTrialing` → clears `trial_ends_at`, sets status `active` (trial → active transition on first real charge)

**Supabase migration:** `supabase/migrations/20260518_add_trial_columns.sql`
- `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`
- Index on `trial_ends_at` for admin queries

### Structured subscription lifecycle states

**New `LIFECYCLE_STATES` export in `TierContext.jsx`:**
```
free | trialing | active | downgrade_pending | cancel_pending | payment_failed | expired
```

**`buildSubscriptionLifecycle()` now returns:**
- `lifecycleState` — the clean enum value above
- `isTrialing` — boolean
- `trialEndsAt` — Date | null

**`effectivePlan` logic extended:**
```js
const effectivePlan = (
  status === 'active' || status === 'trialing' || status === 'payment_failed' ||
  profile.cancel_at_period_end
) ? plan : 'free'
```
`trialing` and `payment_failed` both preserve feature access.

### Simulation-mode upgrade flow

Admins simulating a tier (via the `bumpSimPlan` localStorage key) see


---

## Signup hardening, tester access, and payment resilience (2026-05 stability pass)

### Auth.jsx hardening

**`friendlyError(err)` helper added** — maps raw Supabase/network error strings to human-readable messages:
- "User already registered" → "An account already exists with this email. Try signing in instead."
- "Invalid login credentials" → "Email or password is incorrect. Please check your details and try again."
- "Email not confirmed" → "Check your inbox — you need to confirm your email before signing in."
- Rate-limit errors → "Too many attempts. Please wait a minute before trying again."
- Network/fetch errors → "Connection error. Check your internet and try again."
- Default: raw message with first letter capitalised.

**`isValidEmail(email)` helper added** — basic regex format check (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) applied before every submit (sendMagicLink, signIn, signUp, sendForgotPassword). Returns friendly error before touching Supabase.

**`submittingRef` guard** was already present in all submit handlers (sendMagicLink, signIn, signUp, sendForgotPassword) — confirmed intact. Prevents duplicate submissions between first click and React re-render.

All `setError(err.message)` calls replaced with `setError(friendlyError(err))` — no raw Supabase error strings reach the user.

### UpgradeModal.jsx hardening

**`submittingRef` guard added** to `handleStartTrial` — prevents double-tapping "Start trial" from firing two server requests or two PaystackPop instances.

**`VITE_PAYSTACK_PUBLIC_KEY` validation added** at the start of `handleStartTrial`:
```js
const paystackKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY
if (!paystackKey || paystackKey === 'undefined' || paystackKey.length < 10) {
  // Shows friendly error: "Payment is not yet configured. Please contact support..."
}
```
Previously: `PaystackPop.setup()` would silently crash or give a confusing Paystack error if the env var was missing. Now: shows a clear message immediately.

`submittingRef` is released in the `finally` block of handleStartTrial — cannot get stuck in a blocking state if the function throws early.

### App.jsx styling fixes

- **Loader component**: replaced hardcoded `background: '#110A08'` + `color: '#888'` with `background: 'var(--bg)'` + `color: 'var(--muted)'`. Old dark color caused a flash of the wrong bg on load.
- **UpdateBanner**: replaced hardcoded `background: '#e85d26'` (v1 coral) with `background: 'var(--coral)'` and `color: '#e85d26'` with `color: 'var(--coral)'` for the button. Keeps banner consistent with theme changes.

### Admin-data.js: three new actions

**`list_all_profiles`** — returns all profiles enriched with email from `auth.admin.listUsers()`. Used by the AdminDashboard Tester Access tab.

**`grant_tier`** — admin-grants premium access to a specific user without Paystack:
- Takes `{ userId, plan }` where plan is 'starter', 'growth', or 'pro'
- Sets `subscription_plan=plan, subscription_status='active', cancel_at_period_end=false, scheduled_plan=null, trial_ends_at=null`
- Logs an `admin_grant` event to `subscription_events` table
- TierContext reads these fields directly → tier unlocks immediately on next profile load

**`revoke_tier`** — resets a user's tier to free:
- Takes `{ userId }`
- Sets `subscription_plan='free', subscription_status='active'`, clears cancel/scheduled/trial/paystack_sub_code fields
- Logs an `admin_revoke` event to `subscription_events`

**Admin check hardened**: was `role !== 'admin'` only — now checks both `role !== 'admin' && !is_admin` to be consistent with TierContext's check.

### AdminDashboard.jsx: Tester Access tab

New third tab "Tester Access" added alongside "Access Requests" and "Bookings".

**What it shows:**
- All user profiles with name, email (from auth.admin), current subscription plan (colour-coded), subscription status
- Search bar filters by name or email
- Per-user grant buttons: Starter / Growth / Pro (active plan is visually disabled)
- "Revoke" button (red outline) when user has a paid plan — resets to free
- Admin users are clearly tagged and have no grant/revoke buttons

**Loading behaviour:** profiles are loaded lazily when the tab is first activated (not on dashboard mount). Refreshes after each grant/revoke action.

**This is the canonical testing workflow:** Instead of going through Paystack for test accounts, use Admin Dashboard → Tester Access → select user → grant plan. TierContext picks it up on next profile refresh (user may need to reload).

### Tier architecture: unchanged

TierContext, buildTier(), effectivePlan logic, PLANS config, and all feature gates (canAnalytics, canProjections, canGroceries, canRules, canConsult) are untouched. Grant/revoke flows through the same Supabase columns TierContext already reads — no parallel tier system introduced.

---

## AI Financial Coach Continuity (2026-05 Session 9)

### Architecture: three-layer behavioural intelligence

Bump is now a continuity-aware financial companion — the AI references prior months, behavioural changes, recurring patterns, prior recommendations, and evolving goals. Canonical financial truth (numbers, amounts) remains exclusively in `buildLedgerSummary()` and `buildInsightContext()`. The continuity layer adds DIRECTION and TREND signals only.

### buildBehaviouralContext() — netlify/functions/_context.js

**New export** added to `_context.js`. Call signature:
```js
buildBehaviouralContext({ transactions, monthlyNetData, income })
```
- `transactions`: raw transaction array (same as passed to analyse.js)
- `monthlyNetData`: `{ 'YYYY-MM': { spend, income } }` from ledger
- `income`: monthly income in rands (for % calculations)

**What it computes (from raw transactions — no extra data needed):**
- `catMonthly`: per-category monthly totals, built from raw transactions
- Per-category trend deltas: `deltaVsAvg` = (recent - avg) / avg × 100
- Signal labels: 'lifestyle creep', 'obligation creep', 'spend creep', 'deteriorating', 'strong improvement', 'improving', 'slight shift', 'stable'
- Lifestyle inflation signal: discretionary % of income trending UP over last 3-4 months
- Recurring obligation creep: fixed cost % growing vs income over 3 months
- Savings momentum: from `monthlyNetData` (positive/recovering/pressure signals)
- Returns `''` if < 2 months of data (graceful degradation, no crash)

**buildInsightPrompt() signature extended:**
```js
buildInsightPrompt({ mode, question, contextBlock, behaviouralBlock = '', priorSummary = '' })
```
- `behaviouralBlock`: injected before the instruction block when present
- `priorSummary`: reserved for future prior-analysis injection in overview/analytics mode

### analyse.js — wired with behavioural context

Import added: `import { buildInsightContext, buildInsightPrompt, buildBehaviouralContext } from './_context.js'`

New step 7 (before prompt build):
```js
const behaviouralBlock = buildBehaviouralContext({
  transactions,
  monthlyNetData: monthlyData || null,
  income,
})
```
Passed into `buildInsightPrompt({ ..., behaviouralBlock })`. No new ALLOWED_FIELDS needed — behavioural context is computed server-side from the existing `transactions` array.

### get-recommendations.js — evolution-aware analysis

**New body fields accepted:**
- `categoryTrends`: `{ category: { recent, avg, deltaVsAvg, months } }` — per-category trajectory
- `priorResult`: previous analysis result object (same JSON shape as the response)

**New blocks injected into prompt:**
1. `CATEGORY TRENDS` block: sorts by absolute magnitude, labels signals (spend creep / improving / etc.)
2. `PRIOR ANALYSIS CONTEXT` block (only when `priorResult` present):
   - Previous health score
   - Categories already improving since last analysis (do NOT repeat same cuts advice)
   - Categories still deteriorating (reinforce with fresh angle)
   - Prior quick win (do NOT repeat, choose different action)
   - EVOLUTION INSTRUCTION: compare score, acknowledge progress, avoid repeating identical advice

**Prompt instructions enhanced for re-analysis:**
- Health score paragraph: include comparison to prior score
- Key insights: at least one must reference behavioural progress/regression
- Where to cut: skip categories already improving; show them as wins in insights instead
- Quick win: must differ from prior run

### Recommendations.jsx — coaching memory wiring

**New state:** `categoryTrends` / `setCategoryTrends` — computed from 12-month raw transactions.

**In loadData()** — after `setDataLoaded(true)`, computes `catMonthly` from raw txns, then for each category with avg >= R100/mo:
```js
computed[cat] = { recent, avg, deltaVsAvg, months: trendMonths.length }
```
Requires >= 2 months to compute (gracefully returns empty object otherwise).

**In getRecommendations() fetch body:**
```js
categoryTrends: Object.keys(categoryTrends).length > 0 ? categoryTrends : undefined,
priorResult:    result || undefined,
```
`priorResult` = the current `result` state (the previous run's output). Passed on ALL calls (new goals OR re-analysis) — the server handles it gracefully when present.

### What was deliberately NOT changed
- `buildLedgerSummary()` — canonical financial engine, untouched
- `buildInsightContext()` — canonical context builder, untouched (only prompt builder extended)
- `Projections.jsx` engine — untouched
- `budget-chat.js` — not wired to frontend; left for future session
- All tier gating — untouched
- Auth, onboarding, Paystack flows — untouched

---

## Operational visibility & error logging (2026-05 Session B)

### Architecture overview
Bump now has a full operational observability stack: structured error logging, user-submitted support tickets, admin visibility into both, and graceful production error UX. All wiring uses the EXISTING admin profile (nihal1995@gmail.com) — no new admin architecture was introduced.

### Supabase tables (new)
Migration: `supabase/migrations/20260519_add_operational_tables.sql` — run in Supabase SQL editor.

**`error_logs`** — structured application error/warn events.
Columns: `id, user_id, severity ('info'|'warn'|'error'), domain, message, metadata (JSONB), error_message, stack_trace, url, created_at`.
- `severity/domain/message/metadata` — written by `observe.js`
- `error_message/stack_trace/url` — legacy columns (kept for ErrorBoundary compat, now also via observe.js)
- RLS: users can INSERT own rows (including `user_id = NULL` for unauthenticated). No SELECT for users — admin reads via service role.

**`support_requests`** — user-submitted tickets.
Columns: `id, user_id, email, full_name, category, message, status ('open'|'in_progress'|'resolved'), created_at`.
- `email` and `full_name` are denormalized for admin convenience (no joins needed)
- RLS: users can INSERT + SELECT own rows. Admin reads/updates via service role.

### observe.js — new domains and helpers (2026-05)
Five new `DOMAIN` constants added: `AUTH`, `AI`, `UPLOAD`, `FRONTEND`, `SUBSCRIPTION`.

Seven new typed helpers on the `observe` object:
- `observe.authError(err, context)` — auth sign-in/sign-up/magic-link failures → `DOMAIN.AUTH`
- `observe.authWarn(message, context)` — recoverable auth anomalies (rate limit, unconfirmed)
- `observe.aiError(err, context)` — Claude API failures, timeouts, parse errors → `DOMAIN.AI`
- `observe.uploadError(err, context)` — batch save failures → `DOMAIN.UPLOAD`
- `observe.uploadWarning(message, context)` — partial upload issues
- `observe.frontendError(err, context)` — runtime JS errors from ErrorBoundary → `DOMAIN.FRONTEND`
- `observe.subscriptionError(err, context)` — Paystack / subscription lifecycle failures

All helpers are fire-and-forget. Never await observe calls in UI code.

### ErrorBoundary.jsx
Now uses `observe.frontendError(error, { componentStack, errorId, url })` instead of a direct Supabase insert. This ensures consistent column schema (severity/domain/message/metadata) rather than the legacy `error_message/stack_trace` columns. Shows a user-facing error card with a randomly generated `errorId` for support reference.

### submit-support.js (new netlify function)
`POST /.netlify/functions/submit-support { category, message }`
- Auth required (Bearer token)
- Valid categories: 'Technical issue', 'Billing', 'Feature request', 'Data / Privacy', 'Other'
- Validates: message >= 10 chars, <= 2000 chars
- Rate limit: 5 submissions per user per 24h (checked via adminClient COUNT query)
- Denormalizes email from `auth.users` and `full_name` from `profiles` for admin convenience
- Returns `{ success: true, id }`

### admin-data.js — new actions
**`get_error_logs`**: fetches latest 150 error_log rows (severity/domain filters supported), enriches each with email via `auth.admin.listUsers()`, computes `topErrors` grouping by domain+message (count, affectedUsers, lastSeen).

**`get_support_requests`**: fetches support_requests with optional status filter (`open|in_progress|resolved|all`).

**`update_support_status`**: updates `status` on a support_request row. Validates status is one of `['open','in_progress','resolved']`.

### AdminDashboard.jsx — Errors + Support tabs
Two new tabs added (tabs 4 and 5):

**Errors tab:**
- Domain filter (All / ingestion / categorisation / reconciliation / auth / ai / upload / frontend / subscription) + Severity filter (All / error / warn / info)
- "Recurring errors" panel: groups events by domain+message, sorted by count, color-coded by severity (red=error, amber=warn)
- "Recent events" panel: last 150 events in a grid layout (timestamp, domain badge, severity chip, message, user email)
- Reload button to refresh

**Support tab:**
- Badge on tab showing open ticket count
- Status filter buttons: All / Open / In progress / Resolved
- Ticket cards with: status chip (color-coded), category, message text, user info, timestamp
- Inline status management: "In Progress" / "Resolve" / "Reopen" buttons depending on current status

### SupportChat.jsx — ticket submission panel
New "Still need help? Submit a ticket" toggle below the chat body (above input bar).
- Expands inline: category dropdown (5 categories) + message textarea + Submit button
- Calls `/.netlify/functions/submit-support` with auth token
- Shows success confirmation: "Ticket submitted. Our team will follow up via email."
- Shows inline error message on failure or rate-limit hit
- Ticket form state: `showTicket, ticketCategory, ticketMessage, ticketSubmitting, ticketSuccess, ticketError`

### Auth.jsx — auth failure logging
`import { observe } from '../utils/observe'` added. In all four auth functions, when `err` is truthy, fires `observe.authError(err, { action, email })` after `setError(friendlyError(err))`. Fire-and-forget — never blocks the auth flow.

Functions wired: `sendMagicLink`, `signIn`, `signUp`, `sendForgotPassword`.

### What was deliberately NOT changed
- Admin auth architecture — existing `is_admin` / `role` check in admin-data.js preserved
- TierContext, plans, feature gates — untouched
- All upload, budgeting, projections, recommendations, canonical ledger systems — untouched
- observe.js core `emit()` function and existing typed helpers — untouched (only additive)
