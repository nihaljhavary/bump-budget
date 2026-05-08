# bump.

South Africa's AI-powered personal finance app. Paste an SMS, import a bank statement, or ask a question in plain English — bump. categorises your spending, tracks your finances, and gives you actionable insights.

> **Before making any changes to this repo, read `CLAUDE.md` in the project root.**

---

## Core functionality

- Transaction parsing via typed text or SMS paste (Claude Haiku)
- Bank statement import (CSV / Excel) with automatic categorisation
- Monthly overview with category breakdowns and budget tracking
- Income statement with period comparison and AI interpretation
- Spend analytics, financial projections (DCF), and grocery price comparison
- AI budget Q&A with conversation history
- AI support chatbot
- Consultation booking with human financial advisors
- Tiered subscription model (Free / Starter / Growth / Pro) via Paystack
- Admin dashboard with access management and tier simulation

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, React Router 6 |
| Backend | Netlify Functions (Node/ESM serverless) |
| Database + Auth | Supabase (Postgres, Row Level Security, Auth) |
| AI | Anthropic Claude API (Haiku for chat/parse, Sonnet for analysis) |
| Payments | Paystack (subscriptions + webhooks) |
| Hosting | Netlify (auto-deploy from GitHub) |
| Spreadsheet parsing | SheetJS (xlsx) |

---

## Local setup

```bash
git clone https://github.com/nihaljhavary/bump-budget.git
cd bump-budget
git checkout dev
npm install
```

Create a `.env` file in the project root (Netlify reads this locally via the CLI):

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
ANTHROPIC_API_KEY=...
PAYSTACK_SECRET_KEY=...
```

Start the local dev server:

```bash
npm run dev
```

To test Netlify Functions locally, use the Netlify CLI:

```bash
npx netlify dev
```

---

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend + Functions | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend + Functions | Public anon key for client queries |
| `SUPABASE_SERVICE_KEY` | Functions only | Bypasses RLS for rate limiting and admin operations |
| `ANTHROPIC_API_KEY` | Functions only | Claude API access |
| `PAYSTACK_SECRET_KEY` | Functions only | Paystack payment and webhook operations |

---

## Build

```bash
npx vite build --emptyOutDir false
```

The `--emptyOutDir false` flag is required. Without it, Vite throws an EPERM error when trying to clean the `dist/` folder on this Windows/Linux shared filesystem.

Output goes to `dist/`. Netlify runs `npm install && npm run build` automatically on push.

---

## Deployment

Netlify is connected to the GitHub repo and deploys automatically:

- Pushes to `main` deploy to `https://bump-budget.netlify.app` (production)
- Pushes to `dev` deploy to `https://dev--bump-budget.netlify.app` (staging)

The `netlify.toml` configures the build command, publish directory, functions directory, and a catch-all SPA redirect rule.

---

## Git workflow

All development happens on the `dev` branch. Never commit directly to `main`.

```bash
# Always work on dev
git checkout dev

# Commit pattern from Linux sandbox (git index is often corrupt)
GIT_INDEX_FILE=/tmp/git_idx_N git read-tree HEAD
GIT_INDEX_FILE=/tmp/git_idx_N git add <files>
GIT_INDEX_FILE=/tmp/git_idx_N git commit -m "message"

# Push from Windows Git Bash (Linux has no credentials)
git push origin dev
```

When ready to release: merge `dev` into `main` via GitHub PR or a force push.

---

## Important conventions

- All monetary amounts are stored as **integer cents** in Supabase. Divide by 100 for display.
- Dates are stored as ISO `YYYY-MM-DD`. Always append `T12:00:00` when constructing a `Date` object to avoid timezone off-by-one errors.
- Profile saves must use `.upsert({...}, { onConflict: 'id' })`, never `.update()`.
- AI responses across all functions follow FORMAT_RULES: no em dashes, no tilde, no markdown bold.
- Feature gating is handled by `TierContext` — check `tier.canAnalytics`, `tier.canProjections`, etc. before rendering premium components.

See `docs/conventions.md` for the full conventions reference.

---

## Documentation

| File | Contents |
|---|---|
| `CLAUDE.md` | Operational rules for AI agents — read before touching code |
| `docs/architecture.md` | System design, component map, auth lifecycle, AI flows |
| `docs/conventions.md` | Naming, formatting, currency, date, Supabase, and git conventions |
| `docs/known-issues.md` | Filesystem quirks, build gotchas, fragile systems |
| `docs/current-focus.md` | Pending work, recommended improvements, areas to avoid |
