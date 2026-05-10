# Known Issues

## Linux/Windows filesystem bridge corruption

The Cowork/Claude sandbox runs Linux but the project files live on Windows. They share the same folder via a mount. This causes two classes of corruption:

**Truncated files:** The Windows `Edit` tool writes cleanly from the Windows side, but the Linux mount sometimes only sees a partial version of the file. The symptom is a build error pointing to a line that appears complete in the Windows `Read` output but is cut off in the Linux `cat` output.

Detection: `wc -l <file>` on Linux returns fewer lines than `Read` shows on Windows.
Fix: Read the full Windows content, identify the cutoff point, and append the missing lines using Python in bash.

**Null bytes:** Some files accumulate null bytes (` `) in the Linux view, causing Vite to throw `Unexpected " "` during the build. This has affected `Dashboard.jsx`, `App.jsx`, `FAQ.jsx`, `Onboarding.jsx`, `Projections.jsx`, `SupportChat.jsx`, `AuthContext.jsx`, `TierContext.jsx`, and `analyse.js` at various points.

Detection: `grep -c $'\x00' <file>` returns a non-zero count.
Fix:
```python
raw = open(path, 'rb').read().replace(b'\x00', b'')
open(path, 'w').write(raw.decode('utf-8', errors='replace'))
```

The root cause is not fully understood. It appears related to how the Windows Edit tool flushes writes across the mount boundary. The safe pattern is to always write files via Python in bash.

---

## Null byte and truncation risk on large components

The largest components (`Dashboard.jsx` at ~745 lines, `Projections.jsx` at ~327 lines, `Analytics.jsx` at ~512 lines, `GroceryComparison.jsx` at ~297 lines`) are particularly prone to truncation because they are long and have been edited multiple times. When modifying these files:

- Always rewrite the full file via Python rather than using targeted edits
- Always verify line count after writing
- Always run a build to confirm the result before committing

`Dashboard.jsx` is the highest-risk file in the repo. It contains the entire app shell, all tab routing, the profile modal, and the consultation flow. Changes here have the highest blast radius.

---

## Git index corruption

The `.git/index` file frequently becomes corrupt when accessed from the Linux sandbox. Symptoms include:

- `fatal: unable to read <hash>` on `git status`
- `error: bad index file sha1 signature` on `git fsck`
- `git add` or `git commit` silently failing with exit code 1

The `.git/index` file cannot be deleted from the Linux sandbox due to file permission restrictions (`rm: cannot remove '.git/index': Operation not permitted`).

Workaround: use a separate index file for every commit operation:
```bash
GIT_INDEX_FILE=/tmp/git_idx_N git read-tree HEAD
GIT_INDEX_FILE=/tmp/git_idx_N git add <files>
GIT_INDEX_FILE=/tmp/git_idx_N git commit -m "message"
```

Increment `N` each session. If the commit still fails silently, the user must run `git add -A && git commit` from Windows Git Bash.

**HEAD.lock:** Git sometimes leaves a `.git/HEAD.lock` file that blocks commits from Linux. The lock cannot be deleted from Linux (`Operation not permitted`). If this happens, run `rm -f .git/HEAD.lock` from Windows Git Bash before committing.

**Bracketed paste in Git Bash:** Pasting commands into Git Bash can produce `^[[200~<command>~` instead of the command itself due to bracketed paste mode. Always type git commands directly rather than pasting from clipboard.

---

## Vite build quirks

- `npx vite build` without `--emptyOutDir false` throws an EPERM error when trying to clean `dist/`. Always include the flag.
- The built bundle is large (~830 KB JS, ~80 KB CSS uncompressed). The xlsx library contributes significantly to this. Vite warns about chunk size on every build. This is expected and non-blocking.
- A `vite.config.js` (standard name) now exists alongside the legacy `vite.config.js.js` (double extension). Vite loads `vite.config.js` reliably. The `.js.js` file can be deleted once this is confirmed stable across all environments. Both files contain identical content including the `@supabase/postgrest-js` and `@supabase/storage-js` CJS aliases that are required for the build to succeed -- without these aliases Vite fails with `Failed to resolve entry for package "@supabase/postgrest-js"`.

---

## Deployment quirks

- Netlify deploys `main` to production and `dev` to the branch preview URL. Changes on `dev` are not visible at the production URL until `dev` is merged into `main`.
- The Netlify build command includes `rm -f package-lock.json` to avoid stale lockfile conflicts.
- Supabase auth redirect URLs must be explicitly allowlisted in the Supabase dashboard (Auth > URL Configuration). The current allowlisted dev URL is `https://dev--bump-budget.netlify.app/app`. If the domain changes, magic links will silently fail.
- Password-based signup fails if the `on_auth_user_created` trigger on `auth.users` is missing or broken. The trigger must insert a row into `public.profiles` with just the user `id`. If profiles has any NOT NULL columns without defaults, the trigger will throw and Supabase returns "database error saving new user".

---

## Areas to change cautiously

**`Dashboard.jsx`** is the most complex file in the repo. It handles tab routing, all overview metrics, the add-spend chat, the profile dropdown, the consultation flow, and the simulation banner. Any change here should be followed immediately by a build and visual check.

**`TierContext.jsx`** controls all feature gating. A mistake here unlocks premium features for free users or locks them for paying users. Changes to the `PLANS` config or `buildTier` logic must be tested with the admin simulation tool across all four plans.

**`AuthContext.jsx`** is loaded before everything else. A runtime error here prevents the entire app from loading. Keep it minimal and always test login/logout after changes.

**Netlify Functions with `SUPABASE_SERVICE_KEY`** bypass Row Level Security entirely. Functions that use the service client (`analyse.js`, `budget-chat.js`, `admin-data.js`) have unrestricted database access. Be precise with queries in these files and never expose the service key to the frontend.

**`paystack-webhook.js`** handles payment lifecycle events (subscription activated, cancelled, etc.) and updates `profiles.subscription_plan` and `profiles.subscription_status`. Errors here cause billing state to drift silently. This function has no retry logic and no error logging currently.

---

## Fragile or tightly coupled systems

- The `ProtectedApp` routing logic in `App.jsx` is a chain of if/return statements. The order matters: terms check before onboarding check before admin check. Reordering these breaks the user flow.
- The admin simulation state lives in `localStorage` under key `bumpSimPlan`. If a non-admin user somehow sets this key, `TierContext` silently ignores it (because simulation only applies when `isAdmin` is true), but it is worth being aware of the dependency on localStorage.
- `IncomeStatement.jsx` calls `fetchTransactionsByRange` directly using `useAuth().user.id`. It does not go through the same `fetchTransactionsByMonth` path as `Dashboard.jsx`, so changes to transaction fetching logic need to be applied in both places.
- The FAQ content in `FAQ.jsx` is hardcoded. Any pricing or feature changes must be manually reflected there in addition to `LandingPage.jsx` and `TierContext.jsx`.
- There is no centralised error handling or logging. Errors in Netlify Functions are `console.error`'d and lost. There is no Sentry, no Supabase error log table, and no alerting.
- Both `analyse.js` and `budget-chat.js` log usage to `budget_chat_usage`. The entries from `analyse.js` use `question_preview: '[analysis]'` as a tag. Any query counting total AI usage for a user should include both entry types.
- The Overview income toggle defaults to "Declared" (`excludeSalary = true`), which uses `profile.net_income / 100` as the income figure. If a user has not completed onboarding or has not entered a salary, this defaults to R0 and the net position will show as a deficit equal to total spend. The toggle should be set to "Transactions" in that case. No automatic fallback exists.
- Transaction amounts are stored as **rands** (not cents) in the `transactions` table. Profile fields (`net_income`, `gross_income`, `monthly_debit_orders`, `savings_goal`) are stored as **integer cents**. These are different units. Any code that mixes them must apply `/100` to profile fields before comparison or display. `budget-chat.js` previously divided transaction amounts by 100 producing 100x underestimates — this was fixed. When editing any AI function that builds a spending summary, always verify units before dividing.
- Existing transactions categorised as "Other" before the Transfer category was introduced will continue to appear in spend analytics even if they represent internal transfers. There is no retroactive reclassification. Users can manually reclassify via the Transactions tab or import fresh statements.

---

## Categorisation gaps and parser fragility

- `parse-bulk-transactions.js` chunks unmatched transactions and sends them to Claude Haiku in groups of 150. There is no retry logic for malformed Claude responses — a bad JSON response silently defaults the entire chunk to "Other". No per-transaction fallback exists.
- The SA rules in `sa-categorise.js` match by substring (`lower.includes(pattern)`). Patterns ending in a space (e.g. `'spar '`) will miss merchant names at the end of a string with no trailing character. Most SA bank statement formats include branch codes or locations after the merchant name, so this rarely occurs in practice, but it is a known edge case.
- Yoco-prefixed transactions (`YOCO*<merchant>`) that do not match any pattern in `SA_RULES` are classified as "Other" by design. Claude Haiku is not called for these in single-entry mode. Bulk import does send them to Claude.
- The `paygate*` and `payfast*` patterns in `sa-categorise.js` match as "Other" rather than inferring category from context. These are online payment gateways and the real merchant is the text after the prefix. Improving this would require parsing the suffix separately.

---

## Recurring detection limitations

- `detectRecurring()` in `recurring.js` requires transactions to span at least 2 distinct calendar months to flag anything as recurring. Single-month imports will never produce recurring results.
- Weekly recurring items (e.g. weekly groceries) are detected but marked `frequency: 'weekly'` without amount-summing into a monthly equivalent. Callers that want a monthly committed cost should sum `avgAmount * 4.33` for weekly items.
- `detectRecurring()` is not yet wired into Projections or AI insights. It exists as a utility but has no consumer in the current UI.

---

## Admin simulation commit history note

`TierContext.jsx` was modified in multiple prior sessions but was never included in any `git add` until commit `7a4625f`. If the deployed simulation appears broken, confirm the deployed version includes `simulatedPlan` state, `setSimulatedPlan`, and `PLANS` with `analytics/projections/groceries` fields. The correct HEAD version is in `src/context/TierContext.jsx` on the `dev` branch.
