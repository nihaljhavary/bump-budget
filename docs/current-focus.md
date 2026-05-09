# Current Focus

## What is complete and working

- Magic link and password authentication via Supabase
- 4-step onboarding flow (usage declaration, income, bank, done)
- Monthly transaction overview with category breakdowns and budget bars
- Add-spend chat with Claude Haiku parsing
- CSV and Excel bank statement import with bulk categorisation
- Income statement with period comparison and AI interpretation
- Spend analytics charts
- DCF financial projections with AI commentary
- Grocery price comparison across SA retailers
- AI budget Q&A with rate limiting (10/month free, tracked in `budget_chat_usage`)
- AI spending analysis with rate limiting (10/month free, tracked in `budget_chat_usage`)
- Onboarding profile upsert (id field present, correct conflict handling)
- Bank step validation correctly gated to the bank screen (step 3)
- `updateProfile` in AuthContext — ProfileModal saves now persist correctly
- Overview income toggle wired to `profile.net_income` (declared salary vs logged transactions)
- Income Statement shows hint when no income transactions but profile salary is set
- Support chatbot
- FAQ accordion
- Profile modal (name, income, debit orders, savings goal, bank)
- Tiered subscription model with feature gating (Free / Starter / Growth / Pro)
- `LockedFeature` and `LockedRow` components for locked content UI
- Admin dashboard (access requests, bookings, user budget view)
- Admin tier simulation (dropdown in admin nav, persisted in localStorage)
- Paystack subscription creation and webhook handler
- Consultation booking flow
- FORMAT_RULES enforced across all AI functions

---

## Pending and incomplete systems

**Error and support logging**
There is no error logging system. Netlify Function errors are console-logged and disappear. There is no Sentry integration, no Supabase error table, and no alerting. This makes debugging production issues very difficult. A minimal logging table in Supabase or a free Sentry project would significantly improve observability.

**Admin analytics dashboard**
The admin dashboard only shows access requests and bookings. There are no usage stats: no user growth chart, no revenue tracking, no AI call volume, no active subscriber count. These would be high-value for operating the product.

**Admin Excel export**
Admins cannot export user data. A simple server-side export from `admin-data.js` generating a CSV or XLSX would cover this.

**Free tier upgrade prompts**
The budget recommendations tab (`Recommendations.jsx`) and budget rules tab have no locked state or upgrade nudge for free users. These tabs render or error silently rather than showing a clear "upgrade to unlock" message.

**Paystack webhook robustness**
`paystack-webhook.js` updates subscription state but has no retry logic, no dead-letter handling, and no logging if an event fails to process. A failed webhook silently leaves billing state out of sync.

**`manage-rules.js` frontend integration**
The `manage-rules.js` Netlify Function exists for budget rules CRUD, but it is unclear whether the frontend fully uses it or whether rules are partially hardcoded.

**Mobile nav and responsive polish**
The top navigation bar compresses poorly on small screens. The tab row overflows horizontally. Both are CSS-only fixes that do not require logic changes.

---

## Recommended next improvements

In rough priority order:

1. **Error logging** -- add a Supabase `error_logs` table and a shared `logError(context, message, detail)` helper used by all Netlify Functions. Low effort, high value.

2. **Explicit free tier upgrade prompts on Budget and Recommendations tabs** -- wrap those tab bodies with a `LockedFeature` or an inline upgrade card, consistent with how Analytics/Projections/Groceries are handled.

3. **Mobile nav and responsive polish** -- the top navigation bar compresses poorly on small screens. CSS-only fix, no logic changes required.

4. **Admin stats panel** -- add a third tab to `AdminDashboard` showing: total users, users by plan, AI calls this month, bookings this month. Data comes from a new `get_stats` action in `admin-data.js`.

6. **Paystack webhook logging** -- log each incoming webhook event and its outcome to Supabase before processing. Allows replay and debugging.

7. **Admin Excel export** -- add a `download_user_data` action to `admin-data.js` that returns all transactions for a user as a base64-encoded XLSX.

---

## Areas to avoid unnecessary refactoring

- **`App.jsx` routing logic** -- the if/return chain in `ProtectedApp` is intentional and order-sensitive. Do not convert it to a declarative route structure without understanding the gating order.
- **`TierContext.jsx` plan config** -- the `PLANS` object is the single source of truth for all feature gating. Do not duplicate plan logic into individual components.
- **`transactions.js` service layer** -- this file is small and correct. There is no benefit to splitting it or abstracting it further.
- **CSS architecture** -- the project uses per-component CSS files. Do not introduce a CSS-in-JS library or utility framework without a clear reason. The existing approach is consistent and working.
- **Netlify Function structure** -- each function is a single self-contained file. Do not introduce shared modules between functions without testing that Netlify's function bundler picks them up correctly.

---

## Suggested technical debt cleanup

- The `vite.config.js.js` double-extension file still exists alongside `vite.config.js`. Safe to delete `vite.config.js.js` — Vite now reliably loads `vite.config.js`.
- The multiple `supabase-schema-vN.sql` files (v1 through v6) in the root are migration history but are not organised. Consider moving them into a `supabase/migrations/` folder for clarity.
- `Dashboard.jsx` at ~745 lines is a strong candidate for splitting. The `ProfileModal` and `ConsultRequestCard` sub-components at the bottom could be extracted into their own files without changing any logic.
- `AuthContext.jsx` exports `useAuth` but does not export `updateProfile` -- components call `supabase.from('profiles').upsert(...)` directly. Centralising profile updates in `AuthContext` would reduce duplication.
- Several components import `supabase` directly alongside the context hooks. A consistent rule (always use the service layer or context, never import supabase directly in components) would improve testability.

---

## High-risk areas requiring caution

- Any change to `TierContext.jsx` affects all feature gating across the entire app. Always test the admin simulation for all four plans after changes here.
- Any change to `AuthContext.jsx` affects the entire auth flow including terms gating and onboarding routing. Test sign-in, sign-up, and the onboarding completion path after changes.
- Any change to `paystack-webhook.js` affects subscription billing state. Test with Paystack's webhook simulator before deploying.
- Any change to the `on_auth_user_created` Supabase trigger affects new user registration. Test with a fresh email after changes.
- Adding new columns to `profiles` with NOT NULL constraints and no defaults will break the `on_auth_user_created` trigger and prevent all new signups until fixed.
