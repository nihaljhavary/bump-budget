# bump. Design Handoff — 03: Visual Design Direction

> Covers: visual design direction, colour system, typography, animation/motion philosophy,
> component patterns, icon direction.

---

## 19. Visual Design Direction

### Current state audit
The current app has an established aesthetic that should be evolved, not abandoned:
- **Dark background**: #110A08 — very dark brownish-black. Warm, not cold navy or pure black.
- **Primary accent**: coral/rust orange #e85d26 — used for buttons, the logo dot, AI indicators
- **Card backgrounds**: #1a1210 (slightly lighter than base), borders at #3a2e2a (warm brown)
- **Text hierarchy**: light warm #e8d5c4 (primary), #b09080 (secondary), #888 (muted)
- **Green accent**: #1D9E75 (income, surplus, positive metrics)
- **Red accent**: #DC2626 (overspend, deficit, negative metrics)
- **Blue accents**: per-category colors (Housing #378ADD, Analytics charts, etc.)

### Direction: premium warm intelligence
The visual direction should feel like what a South African premium fintech would look like
if Monzo's designers had grown up in Cape Town. Key attributes:

**Warm, not cold.** Avoid the cold steel greys and electric blues of generic fintech.
The warmth of the current palette (#110A08 base, earthy card backgrounds) is the app's
most distinctive visual asset. Preserve and refine it.

**Numbers as heroes.** Financial amounts should be the most prominent elements on every
screen. Large, bold, high-contrast numbers. Everything else is supporting context.
Typography scale should be extreme: the net position might be 48px while the label is 11px.

**Data as design.** Charts, category bars, and spend visualisations should be the dominant
visual elements — not decorative borders or background patterns. The intelligence is in
the data; the design should make that data beautiful.

**Intentional colour semantics.** Every colour in the system carries meaning:
- Coral/rust: primary brand, actions, AI indicators, brand moments
- Green: positive, surplus, income, on-track, growth
- Red/amber: deficit, over-budget, alert
- Blue spectrum: category-specific (Housing, Analytics)
- Warm grey: muted, secondary, locked, inactive
- Category colours: each of the 21 categories has a distinct colour — these are an
  important visual language and should be consistent throughout the app

**Premium feel signals:**
- Subtle shadows and gradients on financial cards (not flat, not garish)
- Consistent border radii (current mixes 8px, 12px, 16px — should be systematised)
- Visual weight hierarchy that guides the eye naturally
- Micro-animations that signal intelligence (typing indicator, number counting up, chart drawing)

---

## 20. Animation & Motion Philosophy

### When to animate (purposeful motion)
Motion in bump. should only exist when it communicates meaning.

**Legitimate motion moments:**
- Transaction added via Add Spend → animate the new item appearing in the transaction list
- AI analysis loading → the three-dot typing indicator communicates "something is thinking"
- Chart lines drawing on initial load → communicates data being revealed
- Number changing when month changes → count animation shows the number is live, not static
- Scenario switching in Projections → smooth transition between current and optimised paths
- Tab switch → subtle content fade/slide (not a full-page animation)
- Lock overlay → the blur should be a CSS blur transition, not a hard cut
- Upgrade celebration → confetti or pulse animation on first unlock (one-time only)
- Onboarding step advance → step cards should slide or fade between steps, not cut

**What motion should NOT do:**
- Animate on every render cycle (causes cognitive load)
- Use spring/bounce physics (feels toy-like in a financial context)
- Use long-duration animations (>300ms for most transitions, >600ms max for celebrations)
- Animate in a way that delays access to information
- Compensate for lack of design clarity (motion as distraction)

### Loading states
- AI calls: three-dot typing indicator (exists, keep it)
- Data loading: skeleton loaders for transaction lists and chart areas — not spinners
- Instant actions (recategorise, delete): optimistic UI — update immediately, roll back on error

### Specific animation targets
- **Category bars**: bar fill should animate from 0 to final width on first render
- **Metric cards**: on month change, numbers should count up/down to the new value
- **Projection chart**: line should draw from left to right on initial view
- **Grocery comparison reveal**: the results table should slide in, with the winner highlighted

---

## 21. Typography Direction

### Current state
DM Sans used throughout at various sizes, mostly ad-hoc. No systematic type scale.
Font is loaded from Google Fonts in index.css.

### Recommended system

**Font pairing:**
- Primary: DM Sans (keep — it's warm, readable, and SA-friendly)
- Numbers/data: DM Mono or Tabular numbers via `font-variant-numeric: tabular-nums`
  This is critical for financial data — numbers must be monospaced so they align in tables
  and comparisons. Currently they aren't.

**Type scale (suggested):**
- Hero metric (net position, total spend): 40–48px, weight 700
- Section metric (income, transaction count): 24–28px, weight 600
- Card heading: 16–18px, weight 600
- Body / label: 14px, weight 400–500
- Caption / metadata: 11–12px, weight 400, muted colour
- Navigation label: 12–13px, weight 500, uppercase or mixed case

**Hierarchy rules:**
- One dominant number per screen quadrant — the eye needs a single anchor point
- Labels are always smaller than their values, always in muted colour
- Currency symbol (R) should be slightly smaller than the number it precedes (optical sizing)
- Positive amounts: green. Negative: red. Neutral: primary text.

**Line height:**
- Body text: 1.5–1.6 (currently inconsistent)
- Metric numbers: 1.0–1.1 (tight — metrics are not prose)
- Card headings: 1.2–1.3

---

## 22. Colour System Direction

### Required CSS custom properties (centralise in :root)

**Foundation:**
```
--bg-base:       #110A08   /* very dark warm black — do not change */
--bg-card:       #1a1210   /* card backgrounds */
--bg-elevated:   #231816   /* input fields, elevated surfaces */
--border:        #3a2e2a   /* card borders */
--border-subtle: #2a1e1a   /* subtle dividers */
```

**Text:**
```
--text-primary:  #e8d5c4   /* primary text */
--text-secondary:#b09080   /* labels, secondary */
--text-muted:    #6b5a52   /* metadata, captions */
--text-disabled: #3a2e2a   /* locked/disabled states */
```

**Brand:**
```
--coral:         #e85d26   /* primary brand accent */
--coral-hover:   #d44f1a   /* button hover state */
--coral-dim:     #e85d2622  /* coral background for highlights */
```

**Semantic:**
```
--positive:      #1D9E75   /* income, surplus, on-track */
--positive-dim:  #1D9E7522 /* positive background */
--negative:      #DC2626   /* deficit, over-budget */
--negative-dim:  #DC262622 /* negative background */
--warning:       #D97706   /* near-limit, caution */
--warning-dim:   #D9770622 /* warning background */
```

**Category colours (21 categories — authoritative list):**
```
Housing:          #378ADD    /* blue */
Groceries:        #1D9E75    /* green */
Eating out:       #D85A30    /* rust */
Transport:        #BA7517    /* amber */
Entertainment:    #7F77DD    /* purple */
Health:           #D4537E    /* pink */
Clothing:         #639922    /* olive green */
Subscriptions:    #888780    /* grey */
Income:           #1a6b45    /* dark green */
Education:        #0891B2    /* teal */
Insurance:        #7C3AED    /* violet */
Savings:          #059669    /* emerald */
Fuel:             #D97706    /* amber-gold */
ATM / Cash:       #6B7280    /* slate */
Fees & Charges:   #DC2626    /* red */
Utilities:        #0D9488    /* teal-green */
Travel:           #2563EB    /* blue */
Gifts:            #EC4899    /* hot pink */
Transfer:         #94A3B8    /* slate-blue */
Home & Garden:    #65A30D    /* lime green */
Other:            #888888    /* neutral grey */
```

**Category colour design note:** the current palette was assembled incrementally and has
several conflicts (Utilities vs Groceries are both teal-green; Education and Utilities overlap).
A redesign should harmonise these into a more visually distinct system — perhaps a structured
colour wheel with no two adjacent categories in the same hue family.

### Dark mode as the only mode (for now)
The app is dark-mode only. No light mode exists. This is a valid creative choice for a
premium fintech but means contrast ratios must be carefully verified against WCAG AA.
The current palette should be audited for contrast — several secondary text colours
(#888780, #6B5A52) may fail at small sizes.

### Spatial system
Suggested 4px base unit:
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px

Border radii: standardise to 3 values:
- sm: 6px (small inline elements, badges, chips)
- md: 10px (cards, buttons, input fields)
- lg: 16px (modals, major cards, bottom sheets)
