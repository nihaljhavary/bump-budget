# bump. Design Handoff — Master Index

> Complete design intelligence package for Claude Design.
> Four documents covering all 27 required handoff items.
> Read the index first, then the document most relevant to your current design task.

---

## Document Map

| File | Contents | Sections |
|------|----------|---------|
| `bump-design-01-product-intelligence.md` | Vision, users, features, architecture | 1–11 |
| `bump-design-02-ux-flows.md` | All UX surfaces, navigation, AI, upgrade | 10–20 |
| `bump-design-03-visual-direction.md` | Visual, colour, typography, motion | 19–22 |
| `bump-design-04-competitive-gaps.md` | Competitive, weaknesses, wow, risks | 23–27 |

---

## Quick Reference — All 27 Items

1. Product vision → doc 1, section 1
2. Core philosophy → doc 1, section 2
3. User personas → doc 1, section 3
4. Emotional UX goals → doc 1, section 4
5. Brand positioning → doc 1, section 5
6. Feature inventory → doc 1, section 6
7. Tier system → doc 1, section 7
8. Information architecture → doc 1, section 8
9. Technical architecture → doc 1, section 9
10. Mobile UX goals → doc 2, section 10
11. Desktop UX goals → doc 2, section 11
12. Navigation architecture → doc 2, section 12
13. AI assistant philosophy → doc 2, section 16
14. Financial intelligence philosophy → doc 2, section 17
15. Grocery intelligence philosophy → doc 2, section 18
16. Transaction categorisation engine → doc 1, section 10
17. Projection engine goals → doc 2, section 19
18. Premium upgrade strategy → doc 2, section 20
19. Visual design direction → doc 3, section 19
20. Animation/motion philosophy → doc 3, section 20
21. Typography direction → doc 3, section 21
22. Colour system direction → doc 3, section 22
23. Competitive positioning → doc 4, section 23
24. What currently feels weak → doc 4, section 24
25. What should feel "wow" → doc 4, section 25
26. Premium fintech patterns to emulate → doc 4, section 26
27. Critical implementation constraints → doc 1, section 11 + doc 4, section 27

---

## Key Facts (instant reference)

**Stack:** React 18 + Vite 5 SPA + Netlify Functions + Supabase + Paystack + Claude API

**Plans:** Free (R0) | Starter R49 | Growth R99 | Pro R199

**Tier gates:**
- Analytics: Starter+
- Projections: Growth+
- Groceries: Growth+
- Consultation booking: Pro only
- Transaction history: 30d / 90d / 365d / Unlimited

**21 categories:** Income, Transfer, Housing, Groceries, Eating out, Transport, Entertainment,
Health, Clothing, Subscriptions, Education, Insurance, Savings, Fuel, ATM/Cash,
Fees & Charges, Utilities, Travel, Gifts, Home & Garden, Other

**Current tabs (9):** overview | income statement | analytics | projections | groceries |
budget | add spend | import | transactions

**Colour anchors:** base #110A08 | coral #e85d26 | positive #1D9E75 | negative #DC2626

**Font:** DM Sans (Google Fonts)

**SA banks supported:** FNB, Capitec, Absa, Nedbank, Standard Bank, Discovery Bank, TymeBank

**AI models:** Claude Haiku (parsing, chat, grocery, support) | Claude Sonnet (analysis, recommendations)

---

## Top 5 Redesign Priorities

1. **Mobile navigation** — horizontal 9-tab bar is completely broken on mobile. Bottom nav required.
2. **Landing page** — text-only, no product screenshot, pricing mismatches in-app pricing.
3. **Net position as hero** — the one number every user wants is buried in a 4-metric row.
4. **Budget Q&A visibility** — the most powerful AI feature has no prominent UI entry point.
5. **Locked feature previews** — blur real content (not placeholders) so users see what they're missing.

---

## Known Non-Negotiable Constraints

- Amounts in transactions are **rands**; profile fields (income, savings goal, etc.) are **cents × 100**
- AI responses use FORMAT_RULES: no em dashes, no tilde, no markdown bold
- Category list is canonical in `netlify/functions/sa-categorise.js`
- Write files via Python `open(path,'w').write(content)` — not Edit tool on files >100 lines
- Build command: `npx vite build --emptyOutDir false` (EPERM without the flag)
- Push from Windows Git Bash (Linux sandbox has no credentials)
