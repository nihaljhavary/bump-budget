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
| `ImportTransactions.jsx` | CSV/Excel statement import |
| `BookConsult.jsx` | Consultation booking |

### src/context/
| File | What it does |
|------|-------------|
| `AuthContext.jsx` | `useAuth()` → `{ user, profile, updateProfile }`. Profile loaded from `profiles` table. |
| `TierContext.jsx` | `useTier()` → `{ plan, isAdmin, canAnalytics, canProjections, canGroceries, canRules, canConsult, simulatedPlan, setSimulatedPlan, simulating }`. Plans: free/starter/growth/pro. Admin simulation stored in localStorage key `bumpSimPlan`. |

### src/services/
- `transactions.js` — `fetchTransactions`, `fetchTransactionsByMonth`, `fetchTransactionsByRange`, `addTransaction`, `updateTransaction`, `deleteTransaction`, `recategorizeMatchingTransactions`
- `ai.js` — `parseTransaction`, `analyseSpending`, `recategoriseAll`, `enrichMerchant`

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

---

## Key conventions

- **Claude model:** use `claude-haiku-4-5-20251001` for all functions. `claude-sonnet-4-6` is NOT a valid direct API model string — it causes silent failures.
- **Amounts:** stored as integer cents in Supabase. Divide by 100 for display. `fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')`
- **Dates:** ISO string `YYYY-MM-DD`. Display via `fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', ...)`  — the `T12:00:00` prevents timezone off-by-one
- **Profile save:** always use `.upsert({...}, { onConflict: 'id' })` not `.update()` — avoids "no rows updated" errors
- **AI FORMAT_RULES:** "Never use em dashes (—). Never use tilde (~). 