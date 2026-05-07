# bump. — Full Design Mandate
> Use this document as the master brief for every design and build session.
> Paste the relevant sections into your prompt before asking for any UI, copy, or code work.

---

## 1. The Golden Rule

**Never mention Claude, Anthropic, or any AI product brand anywhere in the product or marketing copy.**
The intelligence behind bump. is "bump." — full stop. If the AI needs a name in UI copy, call it **bump.** or **your bump. assistant**. Users should feel like bump. is a smart product, not a wrapper around someone else's tool.

---

## 2. Brand Identity

### Name & Punctuation
- Always written as **bump.** — lowercase, with the full stop. Never "Bump", "BUMP", or "bump" without the dot.
- Tagline: **"Your money, finally making sense."**
- Secondary tagline: **"Say it. Send it. Done."**

### Mission in one sentence
AI-powered budgeting built specifically for South Africa — plain English, real banks, real prices.

### Personality
- Warm but sharp. Like a financially savvy friend, not a bank.
- Confident, never arrogant.
- South African — uses Rands, references local banks, local retailers, local context.
- Never uses jargon. If a financial term must appear, explain it in the same sentence.

---

## 3. Colour System

| Token | Hex | Usage |
|---|---|---|
| Background | `#110A08` | Page background, nav background |
| Surface | `#2A1512` | Cards, panels, input backgrounds |
| Surface Deep | `#0D0705` | Footer bg, tagline section bg, modals |
| Coral (Primary) | `#FF6B6B` | CTAs, accents, left-borders, highlights, links on hover |
| Coral Muted | `rgba(255,107,107,0.12)` | Borders, dividers, subtle outlines |
| White | `#FFFFFF` | Headings, primary text |
| Muted Text | `#C4A49A` | Body copy, descriptions, secondary labels |
| Muted Faint | `rgba(196,164,154,0.4)` | Copyright, watermarks, disabled states |

**Never use**: pure black `#000`, generic grey, blue links, or any green/red for success/error that clashes with coral. Use `#4CAF50` for success and `rgba(255,107,107,0.8)` for errors.

---

## 4. Typography

### Fonts (both loaded via Google Fonts in index.html)
```html
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet">
```

| Role | Font | Weight | Usage |
|---|---|---|---|
| Display / Hero H1 | Syne | 800 | Hero titles, page headers |
| Section headings H2 | Syne | 800 | Section titles |
| Card titles | Syne | 700 | Feature titles, tier names |
| Body / UI | DM Sans | 300–500 | All body copy, labels, buttons, inputs |
| Button text | DM Sans | 700 | CTAs |
| Eyebrow labels | DM Sans | 500 | Uppercase small labels above headings |

### Type Scale
- Hero H1: `clamp(2.4rem, 6vw, 4rem)`, letter-spacing `-0.03em`, line-height `1.08`
- Section H2: `clamp(1.6rem, 3.5vw, 2.4rem)`, letter-spacing `-0.025em`
- Tagline H2: `clamp(2rem, 5vw, 3.5rem)`
- Body: `1rem` / `0.875rem`, line-height `1.6–1.65`
- Eyebrow: `0.7rem`, `letter-spacing: 0.14em`, `text-transform: uppercase`, color coral

---

## 5. Component Patterns

### Buttons
```
Primary (coral):     bg #FF6B6B, text #110A08, font-weight 700, border-radius 6–8px
Ghost (outline):     bg transparent, border rgba(255,255,255,0.2), text #C4A49A
                     hover → border #FF6B6B, text #fff
Sizes:               sm: padding 8px 20px, font 0.875rem
                     lg: padding 14px 32px, font 1rem
```

### Cards
```
Background:    #2A1512
Border-radius: 10px
Left accent:   border-left: 3px solid #FF6B6B
Padding:       28px 28px 28px 24px (feature) / 36px 32px (pricing)
Hover:         translateY(-3px) with transition 0.2s
```

### Section Layout
```
Max-width:   1080px, centered, padding 80px 48px
Label:       Coral eyebrow text above every heading
Heading:     Syne 800, white
Dividers:    border-top: 1px solid rgba(255,107,107,0.1), margin 0 48px
```

### Nav
```
Height:       64px, sticky top-0, z-index 100
Background:   #110A08
Border:       border-bottom 1px solid rgba(255,107,107,0.12)
Logo:         "bump" white + "." coral, Syne 800 1.5rem
Actions:      ghost Login + coral Get Started
```

### Inputs / Forms
```
Background:    #2A1512
Border:        1px solid rgba(255,107,107,0.2)
Border focus:  1px solid #FF6B6B
Text:          #fff
Placeholder:   #C4A49A
Border-radius: 8px
Padding:       12px 16px
```

---

## 6. Website Pages & Tabs

### Public (pre-login)

#### `/` — Landing Page
The marketing homepage. Sections in order:
1. **Sticky Nav** — logo + Login + Get Started
2. **Hero** — headline, subheading, two CTAs (Get Started Free / Log in)
3. **Bank logos strip** — "Works with every SA bank" + logos: Absa, Capitec, FNB, Nedbank, Standard Bank, TymeBank, Discovery Bank
4. **How it works** — 3 numbered steps with coral step numbers
5. **Features grid** — 6 feature cards (2×3 on desktop, 1-col mobile)
6. **Stats bar** — e.g. "10 banks · 50+ categories · R0 to start"
7. **Product preview** — stylised dashboard screenshot or UI mock
8. **Pricing** — 3 tiers: Free / Budget Coach R199/mo / Consultations R150+
9. **Privacy/security strip** — 3 trust points (data safety, no bank linking, SA-built)
10. **FAQ** — 6 questions, accordion style
11. **Tagline CTA** — "Say it. Send it. Done." + Start for free button
12. **Footer** — logo, links, copyright

#### `/auth` — Login / Sign Up
Single page, toggle between Login and Sign Up. Terms & Conditions acceptance on sign-up.

---

### Authenticated App (`/app`)

#### Dashboard (default tab)
- Month picker (browse historical months)
- Income vs Expenses summary cards
- Transaction list with categories
- Quick SMS/email paste input
- CSV/PDF import button

#### Analytics tab
- Spending trend chart (line, monthly)
- Category donut chart
- Actual vs Budget bar chart
- bump. suggestions panel ("You spent 40% more on food this month")

#### Budget tab
- Set budget targets per category
- Progress bars showing actual vs target
- Recommendations from bump.

#### Grocery Prices tab *(Budget Coach tier)*
- Search a product
- Price comparison across Checkers, Pick n Pay, Woolworths, Shoprite
- Weekly deals highlight

#### Projections tab *(Budget Coach tier)*
- Savings goal modeller
- Debt payoff calculator
- Investment growth over 1/5/10 years

#### Consultations tab
- Book 30-min (R150) or 60-min (R400) with a certified consultant
- Calendar/slot picker
- Past sessions list

#### Settings tab
- Profile (name, email)
- Subscription plan + upgrade CTA
- Notification preferences
- Delete account

#### Admin tab *(admin role only)*
- User list
- AI usage stats
- Consultation requests management

---

## 7. Website Copy Guidelines

### Tone rules
- Write like a smart friend explaining money, not a bank's T&C document.
- Use "you" and "your" everywhere. Never "the user" or "our clients".
- Contractions are fine: "you'll", "it's", "doesn't".
- Short sentences. If a sentence has more than two clauses, split it.
- South African context: always Rands (R), reference local banks and retailers by name.

### What to avoid
- Never say "AI-powered" more than once per page — it sounds like marketing fluff.
- Never say "leverage", "synergies", "seamless experience", "game-changer", "revolutionary".
- Never mention Claude, Anthropic, GPT, OpenAI, or any AI product name.
- Never say "our algorithm" — say "bump." does it.
- Don't over-promise. "bump. helps you understand your spending" not "bump. will make you rich".

### CTA copy that works
- Primary: "Get Started Free" / "Start for free"
- Auth: "Log in" / "Create account"
- Upgrade: "Unlock this feature" / "Start coaching"
- Consult: "Book a session"
- Avoid generic: "Click here", "Learn more", "Submit"

---

## 8. Content — Key Sections (Ready to Use)

### Hero
```
Eyebrow:    AI-powered budgeting for South Africa
H1:         Your money, finally making sense.
Sub:        Ask questions. Import statements. Track groceries.
            Book a real consultant. bump. brings everything you need
            to take control of your finances — in plain English.
CTA1:       Get Started Free
CTA2:       Log in
```

### How it works (3 steps)
```
Step 1:  Import your statement
         Upload a PDF or CSV from any SA bank, or paste an SMS.
         bump. reads it in seconds.

Step 2:  Everything gets categorised
         Every transaction is sorted into spending categories —
         automatically. Edit anything you disagree with.

Step 3:  Ask anything
         "How much did I spend on food in March?"
         "Can I afford a R3,000 holiday?" Just type and get an answer.
```

### Bank logos strip
```
Label:   Works with every major South African bank
Logos:   Absa · Capitec · FNB · Nedbank · Standard Bank · TymeBank · Discovery Bank
```

### Stats bar
```
10+ SA banks supported  ·  50+ spending categories  ·  R0 to get started  ·  Human consultants on demand
```

### Privacy strip
```
1.  No bank linking required
    Upload a statement — bump. never connects directly to your bank account.

2.  Your data stays yours
    Transactions are processed to give you insights and never sold to third parties.

3.  Built for South Africa
    Designed from the ground up for SA banks, SA retailers, and SA Rands.
```

### FAQ
```
Q: Which banks are supported?
A: Absa, Capitec, FNB, Nedbank, Standard Bank, TymeBank, Discovery Bank, and more.
   If your bank exports CSV or PDF statements, bump. can read them.

Q: Do I need to link my bank account?
A: No. You upload a statement file or paste an SMS. bump. never connects
   directly to your bank — your credentials stay with you.

Q: Is my financial data safe?
A: Your data is encrypted and stored securely. We never sell your data
   or share it with third parties. You can delete your account and all
   data at any time.

Q: How does bump. categorise my transactions?
A: bump. reads each transaction description and assigns it to a category
   like Groceries, Transport, or Entertainment. You can correct any
   categorisation instantly.

Q: What's the difference between Free and Budget Coach?
A: Free gives you unlimited imports, categorisation, and 50 AI questions
   per month. Budget Coach (R199/mo) unlocks unlimited AI Q&A, financial
   projections, and grocery price comparison.

Q: How do I book a consultant?
A: Go to the Consultations tab in the app, pick a time slot, and pay.
   Sessions are 30 minutes (R150) or 60 minutes (R400) with a certified
   South African financial consultant.
```

---

## 9. Responsive Breakpoints

```css
/* Mobile first */
@media (max-width: 640px) {
  nav padding:     0 20px
  hero padding:    72px 24px 64px
  sections:        64px 24px
  tagline:         72px 24px
  footer:          column layout, aligned flex-start
  dividers:        margin 0 24px
  grids:           1 column
}

@media (min-width: 641px) and (max-width: 1024px) {
  grids:           2 columns where applicable
  section padding: 80px 40px
}
```

---

## 10. Prompt Template (copy-paste for new sessions)

```
I'm building bump. — an AI-powered budgeting app for South Africa.
IMPORTANT: Never mention Claude, AI product names, or any external AI brand anywhere.
The intelligence is "bump." — always refer to it as bump. or "your bump. assistant".

Brand spec:
- Background: #110A08 | Cards: #2A1512 | Deep bg: #0D0705
- Coral accent: #FF6B6B | Muted text: #C4A49A | White: #ffffff
- Headings: Syne 800 | Body: DM Sans 300–700
- Cards have border-left: 3px solid #FF6B6B and border-radius 10px
- Buttons: coral (#FF6B6B, dark text) or ghost (transparent, white border)
- Always use Rands (R), reference SA banks and retailers

Existing CSS class names I'm already using:
.lp, .lp-nav, .lp-hero, .lp-section, .lp-feature-card, .lp-pricing-card,
.lp-tagline, .lp-footer, .btn-coral, .btn-ghost, .btn-coral-lg, .btn-ghost-lg

Task: [DESCRIBE WHAT YOU WANT HERE]

Rules:
- Output JSX + CSS only. No explanation.
- Do not change anything outside the section I've asked about.
- Match the existing padding, label, and heading style exactly.
- Keep all existing class names intact.
```

---

*Last updated: May 2026 — bump. (Pty) Ltd*
