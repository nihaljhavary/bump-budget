# bump. Design Handoff — 02: UX Flows & Interaction Patterns

> Covers: mobile UX goals, desktop UX goals, navigation architecture, landing page,
> onboarding, dashboard, AI assistant philosophy, financial intelligence philosophy,
> grocery intelligence philosophy, projection engine goals, premium upgrade strategy,
> transaction review flows.

---

## 10. Mobile UX Goals

**Current state: broken.** The tab bar is a horizontal scroll of 9 tabs that overflows
on any screen under ~900px wide. There are no responsive breakpoints. The card layout
is desktop-width and squashes on mobile. This is the single highest-priority UX fix.

### Mobile-first principles for redesign

**Primary navigation must not be a horizontal tab bar.** On mobile, 9 equal-weight tabs
cannot coexist. Instead: bottom navigation bar with 4-5 icon-labelled items covering the
primary journeys, with a "more" entry for secondary surfaces. Suggested grouping:

```
Bottom nav (mobile):
  Home (overview)  |  Activity (transactions)  |  + (add spend)  |  Insights  |  Profile
```

Where "Insights" is an aggregated entry for Analytics / Projections / Groceries based on
the user's tier.

**The thumb zone.** Primary actions (add transaction, analyse, import) must be reachable
within the bottom 40% of the screen. Navigation and primary CTAs live at the bottom, not
the top.

**Compact metric cards.** The 4-metric overview (spend / income / net / transaction count)
needs a 2×2 grid on mobile, not 4 in a row. Card content must be readable at minimum font
size 14px with adequate touch targets (minimum 44×44pt).

**Transaction list is the most-used mobile surface.** Inline recategorisation via a
dropdown feels clunky on mobile — consider a bottom sheet picker for category selection
that fills the screen comfortably.

**Import on mobile.** The file upload for statement import should support iOS/Android file
picker natively. This requires `<input type="file" accept=".csv,.xlsx">` which already works
but needs correct mobile styling (no overflow, clear CTA).

**AI chat on mobile.** The Add Spend chat interface is naturally mobile-first — a
conversational input with a sticky bottom bar. This is the one pattern that already works
on mobile and should be the model for other input surfaces.

**Category bars.** The horizontal category spend bars need to be readable at narrow widths.
Consider stacking the label / amount / bar vertically rather than side by side.

---

## 11. Desktop UX Goals

**Current state: functional but flat.** The desktop experience is a centred single-column
layout (~800px max-width) with a top nav and horizontal tab bar. It works but doesn't exploit
the screen real estate available on 13"+ screens.

### Desktop-first principles for redesign

**Two-column overview layout on wide screens.** Left column: financial summary, category
breakdown, metrics. Right column: recent transactions, AI analysis, CTAs. This is how every
premium fintech (Monzo web, Copilot, YNAB) uses desktop width.

**Persistent sidebar navigation (on desktop).** A left rail (80–220px) with iconographic
navigation replaces the horizontal tab bar on desktop. Sections group naturally:
  - Overview / Dashboard
  - Transactions
  - Intelligence (Analytics, Projections, Groceries) — expandable
  - Add / Import
  - Profile / Settings

**Month navigator** should be contextual — a calendar picker or month stepper that lives
in the main content area rather than the top nav, freeing the nav for branding + profile.

**Analytics and Projections on desktop.** These are data-heavy screens that genuinely need
wider layouts. Charts should fill the available width, not be squeezed into a centred column.

**Income Statement** on desktop should use the full width for side-by-side period comparison
columns — this is its natural form.

**Profile modal.** Currently a centred overlay that works on any screen. Keep this approach
but polish the layout.

---

## 12. Navigation Architecture (redesign target)

### Current problems
- 9 tabs at equal weight — every feature looks equally important
- No information hierarchy — Overview, Add Spend, and Import are all tabs
- Support and FAQ buried in avatar menu — users don't know support exists
- Month navigation in top nav bar takes premium position
- Premium features (Analytics, Projections, Groceries) not distinguished from free

### Proposed navigation hierarchy

**Level 1 — Primary navigation** (sidebar on desktop, bottom bar on mobile)
- Home / Dashboard (overview + quick metrics)
- Transactions (list, recategorisation, history)
- Add (add spend + import — combined entry point)
- Intelligence (analytics + projections + groceries — gated by tier)
- Me / Profile (profile, subscription, support, FAQ)

**Level 2 — Section navigation** (within a section)
- Inside Intelligence: Analytics | Projections | Groceries (tabs or sub-nav)
- Inside Home: current month overview | income statement (sub-tabs or scroll sections)

**Level 3 — Actions** (contextual buttons within screens)
- Analyse my spending (CTA in overview)
- Import statement (CTA in overview and transactions)
- Ask bump. (contextual AI Q&A entry points)

### Month navigation
- Should live in the header of the Overview/Transactions section, not the global nav
- Month picker format: "May 2026 ‹ ›" with current-month indicator
- Future months should be disabled/greyed

---

## 13. Landing Page Goals (full redesign needed)

### Current state problems
- Hero is text-only — no product screenshot or demo
- Features section is icon + text cards — standard SaaS grid, no differentiation
- Pricing section has **inconsistency**: landing page shows "Budget Coach R199" but the
  in-app plan is "Growth R99/mo" — these do not match. This is a credibility problem.
- "Everything 22seven doesn't" is a good hook but requires users to know 22seven
- No social proof, testimonials, or screenshots
- No clear conversion story: visitor → signed up → imported statement → insight

### Landing page UX goals
- **Hero**: product screenshot + one-line hook that explains the category distinction
  ("Your bank statement, made intelligent" or similar). Show the product immediately.
- **Value demonstration**: animated or static screenshot of the bump. dashboard showing
  real category breakdown — this is the most convincing selling point
- **SA-specific proof**: show Capitec/FNB/Checkers/Woolworths in the demo screenshots —
  nothing converts an SA user faster than seeing their own context reflected
- **Pricing clarity**: align landing page pricing with in-app tier names and prices
- **Onboarding preview**: show the 4-step onboarding as a quick visual teaser —
  "It takes 3 minutes to set up"
- **Social proof section**: even 5-10 genuine quotes from beta users beats no proof
- **FAQ section**: address the top 3 objections (Is my data safe? Does it work with my bank?
  Do I need to connect my account?)
- **Mobile-first hero**: the hero must look excellent on iPhone — most SA users will view
  on mobile

---

## 14. Onboarding UX Goals

### Current state
- 4 steps: Welcome → Declaration → Income → Bank → Done
- Works functionally but is minimal — card-based, dark background, no animation
- The progress dots at top are subtle — users don't know how many steps remain
- The "Done" screen shows a data summary — this is good but the visual doesn't celebrate

### Onboarding redesign goals
- **Step count visibility**: "Step 2 of 4" explicit text label, not just dots
- **Personality**: each step should have a focused illustration or visual element —
  not stock icons, but something that feels like bump.'s brand
- **Income step friction**: requiring both gross AND net income is a barrier — consider
  making gross optional or explaining why both are needed inline
- **Discovery Vitality**: this is a clever SA-specific feature — it deserves more prominent
  treatment. "You have Discovery Vitality? We'll factor in your cashback." should feel like a
  smart personalisation moment, not just a toggle
- **Done screen**: this is the first dopamine hit — it should feel like an achievement.
  Show the user's net income, free cash flow (if debit orders entered), savings runway.
  Consider a single bold number: "Your free cash flow is R8,400/month." This is the "wow" moment.
- **First import CTA**: after onboarding completes, the first thing the user should see is
  a clear, confident CTA to import their first bank statement. Don't dump them in an empty dashboard.

---

## 15. Dashboard Overview (redesign goals)

### Current state
The overview is a scrollable single column: salary toggle → 4 metrics → category bars →
import CTA → AI panel → analyse button → consultation CTA → tier nudge.

### What's wrong
- 4 KPI metrics are all equal weight — net position should be the hero number
- Category bars use hardcoded budget amounts (R3000 for groceries etc.) — not user-configured
- The bar chart is proportional to the highest-spend category, not to budget — misleading
- AI analysis is opt-in (button click) — premium users would benefit from auto-analysis
- "bump. insights" panel is a text block with a pulsing dot — undersells the AI capability
- Import CTA is buried mid-scroll after the metrics
- Consultation CTA only shows for Pro — the upgrade message for non-Pro is a tiny nudge

### Overview redesign goals
- **Hero number**: net position (surplus/deficit) should be the single dominant number visible
  on initial scroll — this is the one number every user wants to know
- **Secondary metrics**: total spend + income in a smaller 2-item card below the hero
- **Category breakdown**: progress-to-budget bars should use actual user budget (from profile),
  fall back to sensible defaults, and clearly label when using defaults
- **AI insight**: for connected users with sufficient history, show a persistent AI insight
  card (not opt-in for premium users) — a single sentence of most important insight
- **Import anchor**: first-run state and empty-month state both need clear, prominent import CTA
- **Tier nudge**: the free-user upgrade message should be a proper upgrade card, not a line of text

---

## 16. AI Assistant Philosophy

### The role of AI in bump.
AI is not a chatbot and should not look like one except in the Add Spend flow where the
conversational metaphor is literally the UX. Everywhere else, AI is infrastructure:
- The thing that turned "WOOLWORTHS KENILWORTH" into "Clothing R285"
- The thing that noticed you spent R12,000 on eating out this quarter
- The thing that said "cut 10% from Groceries and you'll hit your savings goal 3 months earlier"

### Add Spend (conversational AI)
This is the one place where the chat UI is correct. The paradigm: user types freely, AI
parses and confirms. Design goals:
- Chat bubbles should feel conversational, warm, not robotic
- The confirmation card (name / amount / category) should be editable before confirming
- Allow quick edits: user can tap the category in the confirmation card to change it inline
- "Try: Woolies R340 | Uber Eats R180 | Salary R35000" hints are valuable — make them tappable
- On confirmation, transaction should animate into the overview immediately (optimistic UI)

### AI spending analysis (overview tab)
Currently: user taps "Analyse my spending", loading state, text block appears.
Design goals:
- The text block should be structured: key insight headline + 2-3 supporting observations
- Consider a card-based format: "Top overspend: Eating out (R4200 vs R2000 budget)"
  as a visual callout, not just prose
- For premium users: auto-run a lightweight analysis on tab switch, not just on button press
- Loading state: typing indicator (3 dots) is good — keep it, but make it feel more alive

### Budget Q&A
Currently: not a visible feature in the UI — it lives somewhere that's not clear to users.
The architecture supports it (budget-chat.js) but it's not surfaced as a primary feature.
Design goal: a persistent "Ask bump." input or floating button that opens a full-screen
Q&A interface with the user's financial context injected. This is a differentiating premium feature.

### AI formatting rules (do not break)
All AI responses use FORMAT_RULES: no em dashes, no tilde, no markdown bold. Responses
are plain prose. This constraint must be respected in any redesign of AI output areas —
do not add markdown rendering unless FORMAT_RULES is updated first.

---

## 17. Financial Intelligence Philosophy

### Income Statement
The income statement is a rolling period P&L: income, spend by category, net position,
with period comparison. It's the most powerful screen in the app for financially literate users.

Design goals:
- Period comparison should be visually obvious — columns side by side, delta highlighted
- Categories should be collapsible (e.g., "Food" = Groceries + Eating Out combined)
- AI interpretation should be surfaced as a highlighted callout at the top, not buried below
- On desktop: full-width table with 3–4 comparison columns is the natural format
- On mobile: period selector + scrollable list with single-column detail

### Analytics
Currently: charts (bar + line) for category trends and monthly spend. Uses recharts.

Design goals:
- The analytics charts need design treatment — currently unstyled recharts defaults
- Priority: "spend trend by month" and "category breakdown over rolling period"
- Key insight: showing the user where they are trending over/under budget over time is more
  valuable than just category totals
- "Fees & Charges" and "ATM/Cash" categories are signals of financial behaviour that warrant
  specific callouts in analytics (these often indicate suboptimal banking choices)

### Projections
Currently: simple 12-month linear DCF. Inputs: net income, fixed debit orders, current savings.
Variables: average of last 3 months, 10% optimisation scenario. Output: SVG line chart +
summary cards.

Design goals (see section below for full treatment)

---

## 18. Grocery Intelligence Philosophy

### What it does
The user enters a shopping list (manual or by pasting receipt text) and bump. asks Claude
to estimate prices across Woolworths, Checkers, Pick n Pay, Shoprite, and other SA retailers,
then calculates total basket cost at each store, factors in Discovery Vitality cashback where
applicable, and recommends cheapest and best-value options.

### Design goals
- Input mode 1 (receipt paste): user pastes raw text from receipt → parsed automatically
  into line items → editable list → compare
- Input mode 2 (manual): itemised table entry — add/remove rows
- The "reveal" moment — switching from input to results — should feel significant:
  "Checkers saves you R180 vs Woolworths this week" as a bold, prominent result headline
- Vitality cashback should be shown as a separate line: "After Vitality cashback (25%): R540"
- Savings amount should be shown in absolute (R) and percentage terms
- If Vitality changes the ranking (e.g., Woolworths becomes cheaper after cashback),
  this should be called out explicitly as a "Vitality tip"
- The feature is distinctly SA — lean into that. No competitor does this.

---

## 19. Projection Engine Goals (redesign beyond current state)

### Current state gaps
- Linear projection only (constant monthly cash flow assumed forever)
- No category-level modelling (fixed vs variable spend not separated)
- Only one scenario beyond "current path" — the hardcoded 10% variable spend reduction
- No integration with recurring transaction detection (recurring.js exists but is not wired)
- No salary growth modelling, no inflation adjustment
- 12-month horizon only (no 3-year, 5-year, 10-year)

### Redesign target (what it should become)
- **Multiple named scenarios**: "If I cut eating out by 30%", "If I save R2000/month",
  "If I get a 10% salary increase" — user-configurable, named scenarios
- **Fixed vs variable decomposition**: committed monthly spend (identified from recurring
  detection) separated from discretionary spend — user can only reduce the discretionary portion
- **Savings goal countdown**: "At current rate: 14 months to R50,000 emergency fund.
  With R500/month increase: 9 months." — this is the killer output
- **Visual polish**: the SVG line chart is functional but bare. Use recharts for a responsive,
  labelled, hoverable chart with smooth animation on scenario switch
- **Horizon selector**: 6 months / 1 year / 3 years / 5 years
- **Insight panel**: AI commentary on the projection gap — "You're on track but R1,200 more
  per month would eliminate your deficit by October 2027"

---

## 20. Premium Upgrade Strategy (paywall flow redesign)

### Current state
- Locked features show a blur overlay with a lock icon (LockedFeature component)
- Overlay has a generic "Upgrade to unlock" message and a plan name
- Free-user nudge in Overview is one line of text
- No dedicated upgrade/paywall page exists
- No feature preview, no "see what you're missing"

### Upgrade UX goals

**The lock should sell, not block.** When a user hits a LockedFeature, they should see:
- A visual preview of what they're missing (blurred real content, not a placeholder)
- The specific value proposition for unlocking: "See your 12-month spending trends"
- The price: "From R49/month"
- A clear single CTA: "Upgrade to Starter"
- The plan that unlocks it should be the lowest-priced plan that does so

**Tier-to-feature storytelling:**
- Starter (R49): "Your full financial history. No cutoffs."
- Growth (R99): "Projections, grocery intelligence, and spending rules."
- Pro (R199): "Everything, plus a real human consultant."

**Upgrade nudge placement:**
- Overview tab: after the AI analysis panel, if user is on Free, show a single-feature
  upgrade card — not a generic "upgrade" but "See your 90-day spending history for R49/month"
- Analytics, Projections, Groceries: locked state should show partial content (1 month of
  analytics) with a "see 12 months" upsell rather than complete blocking
- Budget/Recommendations tab: needs proper gating UI — currently no locked state at all

**The upgrade flow itself:**
- Tapping an upgrade CTA should open a plan comparison modal with: features side by side,
  current plan highlighted, upgrade CTA per plan
- Paystack handles payment; the flow redirects back to the app on success
- Post-upgrade: confetti/celebration moment + unlock animation on the newly accessible feature

**Free tier value (what stays free forever):**
- Statement import + auto-categorisation (this is the hook — it must stay free)
- 30-day transaction history
- Add Spend AI parsing
- Monthly overview + category breakdown
- These should be prominently communicated on the landing page and in the app
