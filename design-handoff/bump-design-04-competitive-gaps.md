# bump. Design Handoff — 04: Competitive Positioning, Gaps & Goals

> Covers: competitive positioning, what currently feels weak or problematic,
> what should feel "wow", premium fintech UX patterns worth emulating,
> existing unresolved architectural risks.

---

## 23. Competitive Positioning

### Direct SA competitors

**22seven (Old Mutual)**
- Status: declining, limited updates
- Strengths: bank connectivity (auto-import), established brand, multi-account view
- Weaknesses: no AI, dated UI, no conversational features, no SA-specific grocery/vitality features
- bump. advantage: AI categorisation, natural language entry, conversational insights, modern UX, grocery comparison
- bump. gap: 22seven has bank connectivity (OAuth) — bump. requires manual import. This is the single biggest competitive disadvantage to acknowledge honestly on the landing page.

**Monefy, Money Manager, Wallet apps**
- Status: category tracker apps, no SA specificity
- Strengths: simple, fast, works offline
- Weaknesses: purely manual, no intelligence, no SA context
- bump. advantage: everything — bump. is in a different category

**Standard Bank / Capitec / FNB native apps**
- Status: all have some spending analytics now
- Strengths: automatic import, single source of truth
- Weaknesses: locked to one bank, basic categorisation, no cross-bank view, no AI
- bump. advantage: bank-agnostic, AI intelligence, conversational entry

**FinCheck, Sanlam Money Manager**
- Status: financial tool verticals
- Weaknesses: not personal finance management, no transaction-level intelligence
- bump. advantage: different category (intelligent tracking vs credit comparison)

### International reference products (for design emulation, not features)

**Monzo (UK)**
- What to emulate: card-based UI, instant transaction notifications, category design, the warmth in what could be a cold product
- Not applicable: open banking connectivity, UK-specific features

**Revolut (Global)**
- What to emulate: numbers as heroes, analytics charts, the premium dark aesthetic, stats as art
- Not applicable: multi-currency, crypto, trading features

**Copilot (iOS, US)**
- What to emulate: the best-in-class transaction review UX on mobile, category icons, the feeling of "this knows me"
- Not applicable: Plaid connectivity, US-only

**YNAB (You Need A Budget, US)**
- What to emulate: the clarity of the budget methodology communicated visually, the sense that the user is in control
- Not applicable: the age-of-money concept, envelope budgeting metaphor (too complex for bump.'s audience)

**N26 (European)**
- What to emulate: clean analytics, simple income/expense summary, the banking-grade polish on everyday financial data
- Not applicable: banking features, European regulatory context

**Plaid Link (SDK)**
- What to emulate: the two-step bank connection UX flow — bank picker → credentials (or in bump.'s case: bank picker → download CSV instructions). Even without OAuth, bump. should make the manual import feel as guided as Plaid's OAuth flow.

---

## 24. What Currently Feels Weak or Problematic

### Critical (affects core product promise)

**1. Mobile navigation is broken**
The 9-tab horizontal bar overflows on any screen under ~900px. There are no responsive
breakpoints anywhere in the app. This is the highest-priority fix. An SA product where
most users are mobile and the mobile experience is broken is a fundamental problem.

**2. The budget amounts are hardcoded**
BUDGETS in Dashboard.jsx has static values (Housing R9500, Groceries R3000, etc.) that
were almost certainly not set by each user. Budget bars showing "over budget" or "on track"
against a number the user never set feels wrong and erodes trust. Either make budgets
user-configurable or remove the budget comparison from category bars.

**3. Pricing mismatch between landing page and in-app**
Landing page shows "Budget Coach R199/month". In-app shows "Growth R99/month" and "Pro R199/month".
These do not correspond. Users who sign up from the landing page expecting R199 coaching will
find a R99 Growth plan instead. This breaks trust at the most critical conversion moment.

**4. No visible Budget Q&A entry point**
The budget Q&A feature (Claude Haiku with full transaction context) is architecturally complete
but has no prominent UI entry point. Users don't know it exists. This is arguably the most
differentiating feature in the product — AI that knows your actual spending data and can
answer real questions — and it's invisible.

**5. Empty first-run experience**
When a new user completes onboarding and lands on the Overview tab for the first time,
they see an empty state: "No transactions yet. Import a statement above." The import CTA
is mid-page and the page looks empty and lifeless. The first 60 seconds in the app must
be optimised for the user getting something valuable. The import flow needs to be the first
thing new users see, with clear steps ("Download your CSV from FNB/Capitec/etc., then upload it here").

**6. Projections is too shallow to justify Growth tier**
The projections tab shows a 12-month linear chart with a single 10% optimisation scenario.
For a feature that requires a R99/month upgrade, this needs to be genuinely impressive —
scenario modelling, savings goal visualisation, debt payoff calculator, integration with
recurring transaction detection. Currently it underdelivers on the promise.

### Significant (affects experience quality)

**7. Transaction list on mobile**
The transaction list is the most-used feature. On mobile it compresses poorly. The inline
category dropdown editor is awkward on small screens. Category labels are small and hard to tap.

**8. Analytics tab uses unstyled recharts defaults**
The charts look like a Vite starter template. No custom fills, no themed axis labels,
no interactive hover states, no animation. For a feature that's behind a paywall (Starter+),
it should look premium.

**9. Import preview table is overwhelming**
After uploading a CSV, users see a table of all parsed transactions with category dropdowns.
On a 100-transaction import this is a wall of data. Needs a summary view first ("87 transactions
found, 12 uncategorised") with a expand-for-details option, not every row shown immediately.

**10. AI analysis is a text block**
The "Analyse my spending" output is unformatted prose in a single text block.
There's no structure, no hierarchy, no visual callouts. A premium product that uses
Claude Sonnet should surface AI insights as structured cards with visual emphasis.

**11. The LockedFeature blur doesn't show what's behind it**
For Analytics, Projections, and Groceries, the locked state shows a placeholder text block
behind the blur ("Detailed category breakdowns...") rather than actual blurred product content.
Users can't see what they're missing. The unlock motivation is low.

**12. No skeleton loaders**
When switching tabs or loading a new month, the UI shows nothing (or a brief blank)
until data loads. Skeleton loaders would make the app feel faster and more polished.

**13. The "bump. insights" panel name is weak**
"bump. insights" with a pulsing dot is the AI analysis panel's title. This is fine but
undersells the capability. Consider: "bump. sees something" / "Monthly intelligence" /
or just surfacing the insight headline directly without branding the container.

---

## 25. What Should Feel "Wow"

These are the moments where design should create genuine delight or surprise:

**1. First transaction import reveal**
The moment after a user imports their first bank statement — 80+ transactions parsed,
categorised, and shown in a breakdown — should be the product's biggest "wow" moment.
Design should make this feel like the app is revealing a truth the user didn't know:
animated category bars filling up, total spend revealed, AI insight appearing.

**2. The net position number**
Every user wants to know one thing: "Am I okay this month?" The surplus or deficit
should be the single most prominent element on the dashboard. For a user who's R2,300
in surplus, seeing "+R2,300" in large green type at the top of their screen should feel
like genuine reassurance. For a deficit, it should feel honest but not punishing.

**3. Grocery comparison result**
The reveal of "Checkers saves you R240 this week" with Vitality cashback included —
this is a genuinely useful, SA-specific, actionable insight that no other product offers.
The reveal moment should be celebratory and specific.

**4. Category discovery**
Many users have never looked at a breakdown of their actual spending by category.
Seeing "You spent R4,200 on eating out this month" for the first time can be genuinely
revelatory. The category breakdown design should frame this as discovery, not accusation.

**5. Savings goal progress**
When a user has entered a savings goal and can see "You're 6 months from your R50,000
emergency fund target" — this is financial hope made concrete. The projections screen
should make this the hero metric, not an afterthought.

**6. AI understands "Woolies R340"**
The moment a user types "Woolies R340" and the app correctly identifies "Woolworths,
R340, Clothing" — the product has demonstrated intelligence that feels almost magical.
The confirmation card should feel satisfying, not clinical.

**7. Transfer category exclusion**
When a user notices that their internal account transfer didn't inflate their spending total,
and understands the product was smart enough to exclude it — this builds trust silently.
It's a "wow" that many users never consciously notice but subconsciously rely on.

---

## 26. Premium Fintech UX Patterns Worth Emulating

### Monzo: Transaction detail as design
Each transaction in Monzo is a mini-card with merchant branding, location context,
and category. The detail screen shows: merchant logo, amount, category, date, location
on a mini-map, and notes. bump. transactions are currently name + amount + category + date.
Adding merchant context (even a category-appropriate icon) would elevate every transaction.

### Copilot: The transaction review experience
Copilot (iOS) has the best mobile transaction review UX: swipe to categorise, smart
suggestions, category icons that make the list scannable instantly. The inline recategorisation
in bump. has the right function but needs the Copilot-level polish.

### Revolut: Numbers as the primary visual
Revolut's analytics screens make numbers the hero — large, animated, colour-coded.
The "I spent R12,450 this month" is displayed as large bold type on an accent background.
This approach should influence bump.'s metrics design.

### N26 Statistics: Simple, clear period comparison
N26's statistics view shows a bar chart of spending by category over a rolling period,
with percentage change from previous period. Clean, minimal, immediately useful. bump.'s
Analytics tab should aim for this clarity.

### YNAB: Teaching through UI
YNAB's onboarding teaches users to think about money differently through the product UX —
each step of onboarding introduces a mental model. bump.'s onboarding currently just
collects data. It should also be introducing the user to how to think about their finances
with bump.'s framework.

### Plaid Link: Guided data entry
Plaid's bank link flow is the gold standard for guided data entry: bank search with logos,
step-by-step instructions, progress indicators. bump.'s manual import should emulate this
level of guidance: "1. Log in to your FNB account. 2. Go to Statements. 3. Download CSV.
4. Upload here." With bank-specific screenshots or icons.

### Stripe's error handling
Not fintech UX but a standard to emulate: every error state in Stripe explains what went
wrong and what the user should do next. bump.'s error states are often silent or generic.
Every failure path needs a message that says: what happened, why, and next step.

---

## 27. Existing Unresolved Architectural Risks

These should inform Claude Design's constraints and inform what redesign can or cannot do:

**1. No design system or token system**
All styles are per-component CSS files with hardcoded values. A redesign must either:
(a) refactor to CSS custom properties in :root (low effort, high value), or
(b) introduce a design system file (design-tokens.css) referenced by component CSS files.
Option (a) is strongly recommended as the first step.

**2. Hardcoded BUDGETS in Dashboard.jsx**
The budget comparison system compares against static amounts (Housing R9500 etc.) that are
not user-configured. Any redesign of the budget bar system needs to either:
(a) add a budget-setting UI and store budgets in Supabase, or
(b) remove budget comparison from the bar and show pure spend-to-max-category ratio,
(c) or acknowledge this is aspirational and label bars as "suggested limit" not "your budget"

**3. Large component files**
Dashboard.jsx at ~846 lines is the highest-risk file in the repo. It handles tab routing,
all overview metrics, the add-spend chat, the profile dropdown, the consultation flow,
and the simulation banner. Any change here has the highest blast radius. A redesign
should plan for splitting this file into sub-components: OverviewTab.jsx, AddSpendTab.jsx,
TransactionsTab.jsx, ProfileModal.jsx.

**4. Category list is hardcoded in multiple places**
The 21-category list appears in: Dashboard.jsx (inline in JSX), ImportTransactions.jsx,
sa-categorise.js, manage-rules.js. Any addition of new categories requires updates in all
four files. The definitive source is sa-categorise.js.

**5. Analytics tab has two getSession() calls**
Analytics.jsx calls supabase.auth.getSession() in two separate useEffect functions.
This is a known code smell but not a blocking issue.

**6. Transaction amounts are rands, profile fields are cents**
A persistent source of bugs: transactions.amount is stored in rands (not cents) while
profiles.gross_income, net_income, monthly_debit_orders, savings_goal are stored as
integer cents. Any code that mixes these units must apply /100 to profile fields.
This inconsistency is intentional but fragile — future features must respect it.

**7. No error logging**
There is no error logging system. Netlify Function errors are console.error'd and lost.
Any production bugs are invisible unless the user reports them. This is a known gap
(listed in current-focus.md as first priority improvement).

**8. Paystack webhook has no retry logic**
If a Paystack webhook fails (e.g. during a database outage), the subscription state never
updates. Users could be in limbo between "paid" and "active" subscription states.
This is a billing reliability risk.

**9. Free tier budget/recommendations tabs have no gating**
Budget and Recommendations tabs are accessible on the free tier with no upgrade prompt.
The features aren't behind a paywall and show no "upgrade to unlock" message even though
they arguably should be. This is a revenue leakage and UX inconsistency.

**10. The LandingPage pricing section diverges from in-app pricing**
"Budget Coach R199/month" on the landing page does not correspond to any current plan name.
In-app plans are Free (R0), Starter (R49), Growth (R99), Pro (R199). This must be reconciled
before any marketing investment is made. Current risk: users bouncing from landing page
because they can't find the "Budget Coach" plan they signed up for.

---

## Summary: Redesign Priority Stack

In rough order for Claude Design to address:

1. **Mobile navigation** — bottom nav bar, responsive breakpoints across all views
2. **Design tokens** — centralise :root CSS variables for color/spacing/radius
3. **Landing page** — product demo screenshot, pricing alignment, conversion story
4. **Navigation hierarchy** — sidebar (desktop) + bottom nav (mobile), feature grouping
5. **Overview hero** — net position as dominant number, structured layout
6. **Budget Q&A entry point** — surface the most powerful feature
7. **Locked feature previews** — blur real content, not placeholder text
8. **First-run experience** — guided first import flow
9. **Analytics charts** — styled recharts, hover states, animation
10. **Projections** — multi-scenario, savings goal countdown, richer visualisation
11. **AI output design** — structured cards, not prose text blocks
12. **Import review flow** — summary-first, not overwhelming table-first
13. **Category system** — harmonised colour palette, consistent icons
14. **Upgrade flow** — plan comparison modal, unlock animation, celebration
15. **Error states** — every failure path has a message and next step
