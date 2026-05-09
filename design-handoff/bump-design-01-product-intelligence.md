# bump. Design Handoff — 01: Product Intelligence, Users & Architecture

> This document covers: product vision, core philosophy, user personas, emotional UX goals,
> brand positioning, feature inventory, tier system, information architecture, technical
> architecture, categorisation engine, and critical implementation constraints.
> Intended for direct use in Claude Design to redesign bump.

---

## 1. Product Vision

bump. is a South African personal financial intelligence platform — not a budgeting app.
The distinction matters for every design decision.

A budgeting app is a ledger with a UI. bump. is a financial thinking partner: it parses
language, categorises behaviour, surfaces patterns, and answers questions in plain English.
The goal is to give every South African with a smartphone the quality of financial insight
that wealthy people get from a private banker — at R0–R199/month.

The north star: a user should be able to open the app, look at one screen, and understand
their entire financial situation without reading a table or counting up numbers.

---

## 2. Core Philosophy

**Intelligence, not features.** The measure of the product is not how many things it can do
but how clearly it reveals financial truth. Every screen should reduce ambiguity, never add it.

**South African by default.** Every product assumption is SA-first: ZAR, SA banks (FNB,
Capitec, Absa, Nedbank, Standard Bank, Discovery Bank, TymeBank), SA retailers (Woolworths,
Checkers, Pick n Pay, Shoprite, Spar), SA payment rails (PayShap, Discovery Pay, SnapScan,
EFT), POPIA compliance, no open banking API (hence statement import rather than bank link).
This is not a US fintech with ZAR substituted in.

**Honest without shaming.** Money is emotional. bump. must not make users feel judged.
"You spent 40% of income on eating out" is a fact, not a verdict. The voice is that of a
smart, warm friend who knows finance — not an accountant, not a bank, not a gamified
wellbeing app.

**AI as infrastructure.** Claude API is not a chatbot feature — it is the engine beneath
the product: natural language parsing, bulk categorisation, insight generation, Q&A,
projection commentary, grocery comparison. The AI should be invisible where the output
speaks for itself, and explicit only when the user deliberately invites it.

**Friction-minimised data entry.** No tool dies faster than one that requires manual
effort. bump. has three entry modes: natural language ("Woolies R340"), bulk statement
import (CSV/Excel from any SA bank), and receipt paste (for grocery comparison). Every
UX decision should push toward zero-effort data capture.

---

## 3. User Personas

### Persona A — The Urban Professional (primary, highest value)
- Age 25–45, urban SA (Cape Town, Johannesburg, Durban)
- Net income R15,000–R80,000/month
- Banks at FNB, Capitec, Discovery, or Absa
- Financial state: earns well, spends unconsciously, rarely knows where money went
- Core pain: "I have a decent salary but I'm always almost out before month-end"
- Current solution: mental accounting, maybe a spreadsheet, possibly tried 22seven once
- Emotional state: background anxiety about money, avoidance behaviour, wants to feel in control without having to become an accountant
- Device: iPhone or flagship Android, lives in apps
- What they want: clarity without complexity. Tell me where my money goes. Is this okay?
- Session pattern: monthly importer, occasional question-asker, annual reflection

### Persona B — The Household Manager (secondary)
- Age 30–50, managing shared household finances
- Context: rent, groceries, school fees, insurance, utilities all mixed in one account
- Pain: can't separate personal from household, no joint visibility
- What they want: consolidated view, category discipline, household budget against actuals

### Persona C — The Side Hustler / Sole Prop (secondary)
- Age 25–40, freelancer or small business owner
- Context: personal and business income mixed in one account
- Pain: tax confusion, unclear real take-home, business expenses mixed with life expenses
- What they want: clean income/expense separation, net position clarity, simple category discipline

### Persona D — The Financially Anxious First-Timer (edge, high churn risk)
- Context: minimal savings, may have debt, never properly tracked money
- Emotional state: shame, avoidance, low financial self-efficacy
- Needs: non-judgmental first impression, immediate small wins, no overwhelming data dump
- Risk: this persona churns if the first-run experience feels complex or accusing
- Design note: the empty state and first-import experience must feel welcoming, not clinical

---

## 4. Emotional UX Goals

### At first-run (after first import or first month of use)
- Wonder: "I didn't know it could understand all of that automatically"
- Clarity: "I finally see where my money actually goes"
- Control: "I can see the problem now. I know what to do."

### At steady state (returning monthly user)
- Calm confidence: money is under control, not a source of dread
- Curiosity: "How does this month compare to last?"
- Agency: "I know exactly what to change"

### What the UX must never feel like
- Judged or shamed about spending choices
- Overwhelmed by numbers, charts, or jargon
- Like a bank portal (cold, transactional, compliance-forward)
- Like a US fintech (wrong currency, wrong banks, gamified streaks)
- Like an accountant's spreadsheet exported to a screen

---

## 5. Brand Positioning

**Name:** bump. — lowercase with full stop. Approachable, decisive, South African informality.
The full stop signals finality: you made a decision, you understand your money, done.

**Current tagline:** "Your money, finally making sense." — serviceable but generic.
Better directions: "Financial clarity, South African." / "Know your money. Really know it."
/ "The smartest thing you'll do with your bank statement."

**Visual personality:** Warm dark mode. Premium but not cold. Earthy, confident, intelligent.
Not the sterile white of a bank. Not the candy-coloured gamification of a US savings app.
Think: the warmth of SA design aesthetics combined with the product polish of Monzo or Revolut.

**Voice:** Direct, conversational, never condescending. Short sentences. Plain English.
SA idiom where natural but never forced. "Here's what I see" not "Based on our analysis
of your transactional data patterns." First person plural (we/our) avoided — bump. speaks
as itself, not as a committee.

**Competing on:** Intelligence depth, SA-specificity, genuine financial insight quality,
emotional UX quality. Not competing on feature count, UI novelty, or aggressive growth mechanics.

---

## 6. Feature Inventory (complete, as-built)

### Authentication & Access
- Magic link sign-in (primary, no password required)
- Email + password sign-in and sign-up
- Forgot password / password reset via email
- Terms & conditions acceptance gate (POPIA-compliant)
- Auth is Supabase-managed; no OAuth integrations currently

### Onboarding (4-step, collects profile data)
- Step 1 Welcome: name capture
- Step 2 Declaration: usage type (personal / household / side hustle / sole prop)
- Step 3 Income: gross salary, net salary, monthly debit orders, savings goal
- Step 4 Bank: bank selection (7 SA banks), Discovery Vitality toggle + cashback %
- Data saved to: profiles table via Supabase upsert
- Admin bypass: admins skip onboarding without a flag block

### Dashboard (main app shell — 9 tabs)
- Overview tab: salary toggle (declared vs transaction-logged), 4 KPI metrics, category spend bars with budget indicators, import CTA, AI analysis panel, booking CTA
- Income Statement tab: rolling period income statement (1m/3m/6m/12m/custom), comparison columns, AI interpretation
- Analytics tab (Starter+): multi-month spend trends, category breakdowns over time
- Projections tab (Growth+): 12-month DCF cash flow model, current vs optimised paths, SVG line chart, savings goal countdown
- Groceries tab (Growth+): grocery price comparison across Woolworths/Checkers/PnP/Shoprite/Spar, receipt text paste or manual entry, Vitality cashback factored in
- Budget tab: AI-driven recommendations quiz, category budget suggestions
- Add Spend tab: conversational AI entry ("Woolies R340" → parsed confirmation → saved)
- Import tab: CSV/Excel statement upload, SheetJS parsing, layered AI categorisation, preview table, bulk insert
- Transactions tab: monthly list with inline recategorisation, save-as-rule prompt, tier-gated history, delete

### Profile & Settings
- Profile modal: name, gross/net income, debit orders, savings goal, bank
- Avatar menu: My Profile, Support, FAQs, Sign out
- Month picker in nav: navigate any month's transactions

### AI Features
- Add Spend: natural language parsing via Claude Haiku ("Woolies R340" → name, amount, category)
- Bulk Import Categorisation: 300+ SA merchant rules → Claude Haiku fallback for unmatched
- AI Spending Analysis: Claude Sonnet analysis of current month spending with insight text
- Income Statement AI: Claude Sonnet interpretation of income statement periods
- Budget Q&A: Claude Haiku conversational Q&A with full transaction context (10/month free)
- Grocery Comparison: Claude Haiku price comparison across SA retailers
- Budget Recommendations: Claude Sonnet quiz-based recommendations
- Support Chat: Claude Haiku support bot (no transaction context)

### Subscription & Billing
- Paystack subscription integration (monthly billing)
- 4 plans: Free / Starter (R49) / Growth (R99) / Pro (R199)
- Subscription state tracked in profiles.subscription_plan + subscription_status
- Paystack webhook updates subscription state on lifecycle events

### Admin
- Admin dashboard: access request management, booking management, user budget view
- Admin tier simulation: simulate any plan, see app as that user would
- Consultant access: user grants/denies data access per consultant request
- Podcast consent: optional consent for anonymised session use

---

## 7. Tier System (exact feature gate matrix)

| Feature               | Free    | Starter (R49) | Growth (R99) | Pro (R199) |
|----------------------|---------|---------------|--------------|------------|
| Transaction history  | 30 days | 90 days       | 365 days     | Unlimited  |
| Analytics tab        | Locked  | Unlocked      | Unlocked     | Unlocked   |
| Projections tab      | Locked  | Locked        | Unlocked     | Unlocked   |
| Groceries tab        | Locked  | Locked        | Unlocked     | Unlocked   |
| Category rules       | No      | No            | Yes          | Yes        |
| Book consultation    | No      | No            | No           | Yes        |
| AI budget Q&A        | 10/mo   | 10/mo*        | Unlimited    | Unlimited  |
| Statement import     | Yes     | Yes           | Yes          | Yes        |
| Add Spend (AI parse) | Yes     | Yes           | Yes          | Yes        |

*Note: free_consult_used flag exists in profiles for tracking one-time free consult.

**LockedFeature component:** blur overlay + lock icon + upgrade prompt. Used for Analytics,
Projections, Groceries, and Consultation booking. Budget and Recommendations tabs have no
gating UI yet (identified as a gap).

**LockedRow component:** individual transaction rows that fall outside the history window
are dimmed/locked rather than hidden.

---

## 8. Information Architecture (current)

### Navigation structure
```
bump. [logo] — [month nav ‹ May 2026 ›] — [plan badge] — [admin gear] — [avatar menu]
         |
    [tab bar: overview | income | analytics | projections | groceries | budget | add spend | import | transactions]
         |
    [tab body — full-width, scrollable]
```

### Avatar menu (secondary navigation)
- My Profile → profile modal overlay
- Support → support tab (SupportChat)
- FAQs → faq tab (FAQ accordion)
- Sign out

### Tab naming issues (design problem)
- "income statement" rendered as "📋 income" — truncated and misleading
- "add spend" feels like a utility, not a primary action
- "import" with ↑ icon is discoverable but not elegant
- 9 tabs is too many for a single horizontal scrollable bar — mobile users miss tabs

### IA problems to solve in redesign
1. Tab bar is the only navigation — no hierarchy, no grouping
2. Support and FAQ live inside avatar menu — low discoverability
3. "Budget" tab (recommendations) and "Overview" both offer budget guidance — confusing
4. No home/dashboard concept — "overview" is the de facto home but isn't distinguished
5. Projections and Analytics are premium but live at same visual level as free tabs
6. No clear path from "I need help" to "book a consultation"

---

## 9. Technical Architecture (constraints for Claude Design)

### Stack
- React 18 + Vite 5 SPA, single-page, client-side routing via React Router 6
- Netlify (hosting + serverless functions at /.netlify/functions/*)
- Supabase (Postgres + Auth + Row Level Security)
- Paystack (subscription billing, webhook-driven state)
- Anthropic Claude API (Haiku for chat/parse, Sonnet for analysis)

### Key constraints for redesign
- **No backend changes required for UI redesign** — all data already exists
- **Per-component CSS files** — each component has a paired .css file (Dashboard.css etc)
- **No CSS framework** — pure CSS with kebab-case class names prefixed by component
- **Dark background as base** — current: #110A08 (very dark brownish black)
- **Single-file components** — JSX + CSS paired, no nested component directories
- **Mobile is currently broken** — tab bar overflows horizontally, no responsive breakpoints
- **No design system** — colors/spacing defined inline or in component CSS, not centralised
- **Fonts** — DM Sans used throughout (Google Fonts), loaded via index.css
- **No icon library** — icons are inline SVG or emoji; no Lucide, Heroicons, etc.
- **Vite build** — must run `npx vite build --emptyOutDir false` (EPERM issue on Windows)

### Data model (relevant to design)
- Transactions: id, user_id, name (merchant), amount (rands, NOT cents), category, date (YYYY-MM-DD)
- Profiles: gross/net income in integer cents (divide by 100 for display)
- 21 transaction categories: Income, Transfer, Housing, Groceries, Eating out, Transport, Entertainment, Health, Clothing, Subscriptions, Education, Insurance, Savings, Fuel, ATM/Cash, Fees & Charges, Utilities, Travel, Gifts, Home & Garden, Other
- Category colors already defined: Housing #378ADD, Groceries #1D9E75, Eating out #D85A30, Transport #BA7517, Entertainment #7F77DD, etc.

---

## 10. Transaction Categorisation Engine

### Pipeline (priority order — hardcoded)
1. **User-defined rules** (categorization_rules table) — merchant substring match, case-insensitive. Always wins.
2. **SA merchant rules** (sa-categorise.js) — 300+ patterns: Woolworths→Clothing, CHECKERS→Groceries, DISCOVERY PAY→Transfer, PNA→Stationery/Education, etc.
3. **Claude Haiku** — only fires for transactions not matched by layers 1-2. Bulk: chunks of 150.
4. **"Other"** — last resort. Never assigned proactively.

### Transfer category (special)
- Discovery Pay, PayShap, Capitec Pay, own-account transfers, EFT movements
- Excluded from ALL spend calculations (EXCLUDED_FROM_SPEND = Set(['Income', 'Transfer']))
- Visible in transaction list but invisible in analytics, overview, projections
- This is architecturally correct but visually confusing — users don't understand why these disappear from totals

### User recategorisation
- Click category label in Transactions tab → inline dropdown → select new category
- On change: "Save as rule?" prompt with two options: "Save rule" (future-only) or "Save + reclassify all"
- Rules stored in categorization_rules table, applied on next import

### Design implication
- The category system is the heart of the product's intelligence claim
- Visual design of categories (icon + color + name) should be more intentional
- Category colour palette was assembled ad-hoc — needs systematic redesign
- The recategorisation flow is good functionally but deserves a more polished interaction

---

## 11. Critical Implementation Constraints

1. **Linux/Windows filesystem bridge** — all file writes must use Python in bash, not the Edit tool on files >100 lines (causes null bytes / truncation). This is a dev environment issue, not a production issue.

2. **Git commit workaround** — git index is frequently corrupt from the Linux sandbox. Commits use: `GIT_INDEX_FILE=/tmp/git_idx_N git read-tree HEAD && git add && git write-tree → git commit-tree → write to .git/refs/heads/dev`. Push always from Windows Git Bash.

3. **Vite build flag** — always `npx vite build --emptyOutDir false`. Without this, EPERM error.

4. **No bank connectivity** — Supabase doesn't expose a banking API integration. Import is manual (user downloads CSV from their bank, uploads to bump.). This is a business constraint, not a technical choice. Any redesign must make manual import feel premium and frictionless, not like a workaround.

5. **Netlify function cold starts** — AI functions have ~500ms-1500ms cold starts. The UX must handle async AI loading states gracefully (typing indicators, loading skeletons).

6. **Supabase RLS** — all data is user-scoped. Admin bypass uses service role. No multi-user shared accounts currently.

7. **The BUDGETS object in Dashboard.jsx is hardcoded** — budget amounts (Housing R9500, Groceries R3000 etc.) are static, not per-user. The budget bar system needs this to become user-configurable for it to be genuinely useful.
