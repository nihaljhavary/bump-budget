# Architecture

## High-level system overview

bump. is a single-page React application deployed on Netlify. The frontend communicates with Supabase directly for data reads/writes and with Netlify Functions for all AI and payment operations. Netlify Functions act as a secure proxy to the Anthropic Claude API and Paystack, keeping secret keys off the client.

```
Browser (React SPA)
  |-- Supabase JS client  --> Supabase (Postgres + Auth + RLS)
  |-- fetch()             --> Netlify Functions
                                |-- Anthropic Claude API
                                |-- Paystack API
                                |-- Supabase (service role, bypasses RLS)
```

---

## Frontend architecture

The app is a Vite + React 18 SPA using React Router 6. There are four routes:

| Route | Component | Purpose |
|---|---|---|
| `/` | `LandingPage` | Public marketing page |
| `/auth` | `Auth` | Sign in / sign up (magic link or password) |
| `/app` | `ProtectedApp` | Authenticated shell — renders Dashboard, Onboarding, Admin, or BookConsult |
| `*` | Redirect to `/` | Catch-all |

`ProtectedApp` (in `App.jsx`) is the gatekeeper. It checks in order:
1. If loading, show spinner
2. If no user, redirect to `/`
3. If user has no `terms_accepted_at`, render `<Auth termsOnly />`
4. If `onboarding_complete` is false, render `<Onboarding />`
5. If page state is `admin` and user is admin, render `<AdminDashboard />`
6. If page state is `book-consult`, render `<BookConsult />`
7. Otherwise render `<Dashboard />`

Page transitions inside the app are handled via a local `page` state in `ProtectedApp` — not via URL routing. `Dashboard` calls `onNavigate('admin')` or `onNavigate('book-consult')` to switch pages.

---

## Auth and profile lifecycle

1. User lands on `/auth` and submits email
2. Supabase sends a magic link (or password auth is used)
3. Magic link redirects to `window.location.origin + '/app'` via `emailRedirectTo`
4. Supabase fires a database trigger `on_auth_user_created` which inserts a row into `public.profiles` with just the user `id`
5. `AuthContext` detects the session via `onAuthStateChange` and fetches the full profile row
6. `ProtectedApp` checks `terms_accepted_at` and `onboarding_complete` to route the user appropriately
7. Onboarding collects: usage type (personal/household/side_hustle/sole_prop), gross/net income, debit orders, savings goal, bank, and sets `onboarding_complete = true`
8. Profile saves always use `.upsert({ id: user.id, ...fields }, { onConflict: 'id' })` — the `id` field must be present or Supabase will attempt an INSERT and fail with a null primary key error

`AuthContext` exposes: `{ user, profile, loading, refreshProfile, updateProfile }`

`updateProfile(updates)` upserts to `profiles` with `{ id: user.id, ...updates }` and refreshes the local profile state. Components should use this rather than calling `supabase.from('profiles')` directly.

---

## Tier and subscription system

Tiers are managed in `TierContext.jsx`. The four plans are:

| Plan | Price | History | Analytics | Projections | Groceries | Rules | Consult |
|---|---|---|---|---|---|---|---|
| Free | R0 | 30 days | No | No | No | No | No |
| Starter | R49/mo | 90 days | Yes | No | No | No | No |
| Growth | R99/mo | 365 days | Yes | Yes | Yes | Yes | No |
| Pro | R199/mo | Unlimited | Yes | Yes | Yes | Yes | Yes |

`TierProvider` wraps the entire app (inside `AuthProvider`). It reads `profile.subscription_plan` and `profile.subscription_status`. If status is not `active`, the user is treated as `free` regardless of plan.

Admins (`profile.is_admin = true` or `profile.role = 'admin'`) bypass all restrictions.

The context exposes: `plan`, `isAdmin`, `canAnalytics`, `canProjections`, `canGroceries`, `canRules`, `canConsult`, `cutoffDate`, `simulatedPlan`, `setSimulatedPlan`, `simulating`.

### Admin tier simulation

Admins can simulate any plan from the `AdminDashboard` nav dropdown. The selected plan is stored in `localStorage` under key `bumpSimPlan` and in `TierProvider` React state. When a simulated plan is active, `Dashboard` shows an orange banner with an "Exit simulation" button. The simulation modifies the entire tier context — `canAnalytics`, `canProjections`, `canGroceries`, `canRules`, `canConsult`, `cutoffDate` — as if the admin were a user on that plan. The `setSimulatedPlan` function is exposed via the tier context so both `AdminDashboard` (nav dropdown) and `Dashboard` (banner exit button) can control it.

### Feature gating

The `LockedFeature` component wraps gated UI with a blur overlay and upgrade prompt. Usage:

```jsx
<LockedFeature locked={!tier.canAnalytics} feature="analytics">
  <Analytics />
</LockedFeature>
```

`LockedRow` is a lighter version used for individual transaction rows when history is outside the tier window.

---

## AI architecture and Netlify function responsibilities

All AI calls go through Netlify Functions. The frontend never calls the Anthropic API directly.

| Function | Model | Purpose | Rate limited |
|---|---|---|---|
| `analyse.js` | Claude Sonnet | Spending analysis, income statement interpretation | Yes (tracked separately) |
| `budget-chat.js` | Claude Haiku | Conversational budget Q&A with transaction context | Yes (10/month free, tracked in `budget_chat_usage`) |
| `support-chat.js` | Claude Haiku | App support chatbot (no transaction context) | No |
| `parse-transaction.js` | Claude Haiku | Parses a single SMS/text into name, amount, category | No |
| `parse-bulk-transactions.js` | Claude Haiku | Parses a full CSV/Excel statement in batches | No |
| `compare-groceries.js` | Claude Haiku | Grocery price comparison across SA retailers | No |
| `get-recommendations.js` | Claude Sonnet | Budget recommendations based on spending patterns | No |

All AI-facing functions include `FORMAT_RULES` in the system prompt:
> Never use em dashes. Never use tilde. Never use markdown bold. Write in plain prose.

All functions authenticate the caller by extracting the Supabase JWT from the `Authorization: Bearer` header and calling `supabase.auth.getUser(token)` with the anon client.

---

## Transaction and import flow

### Manual entry (Add Spend tab)
1. User types free text (e.g. "Woolies R340")
2. Frontend calls `src/services/ai.js` -> `parseTransaction()` -> `/.netlify/functions/parse-transaction`
3. Claude Haiku returns `{ name, amount, category, parsed: true }`
4. User confirms or cancels
5. On confirm, `addTransaction()` inserts into Supabase `transactions` table

### Bank statement import (Import tab)
1. User uploads CSV or Excel file
2. `ImportTransactions.jsx` reads the file via SheetJS
3. Rows are sent in batches to `/.netlify/functions/parse-bulk-transactions`
4. **Layered categorisation pipeline** runs for each transaction (see below)
5. Parsed transactions are previewed, then bulk-inserted into Supabase

### Layered categorisation pipeline (both import and manual entry)

Every transaction passes through this priority order — each layer only runs if the previous produced no result:

1. **User-defined rules** (`categorization_rules` table) — merchant_pattern substring match, case-insensitive. Highest priority, always override AI.
2. **SA merchant rules** (`sa-categorise.js` → `saPreCategory()`) — 300+ patterns across 21 categories. Pure string matching, no API call.
3. **Claude Haiku fallback** — only for transactions unresolved by layers 1–2. Bulk import sends in chunks of 150. Single entry uses a single call.
4. **"Other"** — absolute last resort only.

This pipeline is shared. `parse-transaction.js` and `parse-bulk-transactions.js` both import from `sa-categorise.js`. No AI call is made for any transaction that matches a rule.

### User recategorisation and rule memory

In the Transactions tab, users can click any category label to open an inline dropdown. On change:
- The transaction is immediately updated in Supabase (`transactions.category`)
- A prompt offers "Save rule" (future-only) or "Save + reclassify all" (applies pattern to all loaded transactions)
- Rules are saved to the `categorization_rules` table via `/.netlify/functions/manage-rules`
- Next import automatically applies saved rules before consulting SA rules or AI

### Data model
Transactions are stored with: `id`, `user_id`, `name`, `amount` (rands, not cents — see conventions), `category`, `date` (ISO string), `created_at`. The `transactions` table has RLS — users can only read/write their own rows.

**Spend filtering convention:** everywhere spend totals are calculated, filter with `isSpendTransaction(t)` (or manually: `t.category !== 'Income' && t.category !== 'Transfer'`). The `Transfer` category exists to isolate internal account moves and person-to-person payments from lifestyle spend analytics. Using only `!== 'Income'` is incorrect and will inflate spend figures.

---

## Admin systems and simulation flow

`AdminDashboard.jsx` calls `/.netlify/functions/admin-data` with an `action` field:

| Action | What it does |
|---|---|
| `get_dashboard` | Returns pending/approved/denied access requests and all bookings |
| `update_access_status` | Approves or denies a consultant access request |
| `get_user_transactions` | Returns transactions for a specific user (approved access only) |

Consultant access is stored in `consultant_access` table. Users grant or deny access from their own dashboard. The admin can view a user's full transaction list once access is approved.

---

## Context and provider structure

```
<AuthProvider>           -- user, profile, loading, refreshProfile
  <TierProvider>         -- plan, feature flags, simulation controls
    <BrowserRouter>
      <Routes>
        /app -> <ProtectedApp>  -- gating logic
```

Both contexts are read-only from children's perspective except for `setSimulatedPlan` (admin only) and `refreshProfile`.

---

## Key services and utilities

`src/services/transactions.js` exports:
- `fetchTransactions(userId)` — current month
- `fetchTransactionsByMonth(userId, 'YYYY-MM')` — specific month
- `fetchTransactionsByRange(userId, fromDate, toDate)` — arbitrary range
- `fetchRecentMonths(userId, months)` — last N months (fetches `date, amount, category, name`)
- `addTransaction(userId, { name, amount, category, date })`
- `updateTransaction(id, updates)` — used for inline recategorisation
- `recategorizeMatchingTransactions(userId, pattern, category)` — bulk reclassify by merchant pattern
- `deleteTransaction(id)`
- `EXCLUDED_FROM_SPEND` — `Set(['Income', 'Transfer'])` — use for consistent spend filtering
- `isSpendTransaction(txn)` — returns `true` if category is not in `EXCLUDED_FROM_SPEND`

`src/services/ai.js` exports:
- `parseTransaction(message)` — single text parser
- `analyseSpending(transactions, budgets, income, profileContext)` — spending analysis

`src/services/recurring.js` exports (client-side, no API):
- `detectRecurring(transactions)` — returns ranked recurring items with confidence, type, frequency
- `committedMonthlySpend(recurringItems)` — sum of fixed monthly obligations
- `recurringToContext(recurringItems)` — formats recurring data as AI prompt context

Both service files get the Supabase JWT token and attach it as `Authorization: Bearer` on every function call.

---

## Deployment architecture

```
GitHub (dev branch)
  --> Netlify (branch deploy)
        --> https://dev--bump-budget.netlify.app
        --> Netlify Functions at /.netlify/functions/*

GitHub (main branch)
  --> Netlify (production deploy)
        --> https://bump-budget.netlify.app
```

Environment variables are set in the Netlify dashboard under Site configuration > Environment variables. The `netlify.toml` sets the build command (`rm -f package-lock.json && npm install && npm run build`), publish directory (`dist`), and functions directory (`netlify/functions`). A catch-all redirect rule sends all unknown paths to `index.html` to support client-side routing.
