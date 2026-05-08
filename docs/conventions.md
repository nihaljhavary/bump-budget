# Conventions

## Naming conventions

- React components use PascalCase filenames: `Dashboard.jsx`, `IncomeStatement.jsx`
- Each component has a paired CSS file with the same stem: `Dashboard.css`, `IncomeStatement.css`
- Context files are suffixed with `Context`: `AuthContext.jsx`, `TierContext.jsx`
- Netlify function files use kebab-case: `budget-chat.js`, `parse-bulk-transactions.js`
- Service files use camelCase: `transactions.js`, `ai.js`
- CSS class names use kebab-case prefixed by the component abbreviation: `.is-table`, `.lp-hero`, `.support-bubble`
- Local state variables follow React convention: `[value, setValue]`

---

## Formatting conventions

- No semicolons in JSX/JS files (the codebase is consistent on this)
- Single quotes for strings throughout
- Arrow functions for component-internal helpers
- Async/await preferred over `.then()` chains
- `console.error()` used for caught errors — no custom error boundary yet
- Inline styles are used sparingly, mostly for dynamic values (colours from category maps, widths from percentages)
- All AI-facing system prompts include `FORMAT_RULES` — no em dashes, no tilde, no markdown bold

---

## Date handling conventions

Dates are stored in Supabase as ISO strings in `YYYY-MM-DD` format.

When constructing a JavaScript `Date` object from a stored date string, always append `T12:00:00`:

```js
new Date(d + 'T12:00:00')
```

Without this, JavaScript parses bare `YYYY-MM-DD` strings as UTC midnight, which shifts the displayed date back by one day in UTC+2 (SAST). The `T12:00:00` keeps the date stable across all South African timezones.

Display helper used throughout the codebase:

```js
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric'
})
```

Month strings for navigation and grouping use the format `YYYY-MM` (e.g. `2025-05`).

---

## Currency and amount conventions

All monetary amounts are stored as **integer cents** in Supabase (ZAR). Never store floats.

Display helper:

```js
const fmt = n => 'R' + Math.round(n).toLocaleString('en-ZA')
```

When reading from profile fields (gross_income, net_income, etc.) for display, divide by 100:

```js
Math.round(profile.gross_income / 100)
```

When saving from a text input back to Supabase, multiply by 100:

```js
const toC = v => v ? Math.round(parseFloat(v) * 100) : null
```

This convention applies to: `profiles.gross_income`, `profiles.net_income`, `profiles.monthly_debit_orders`, `profiles.savings_goal`, `transactions.amount`, `budgets.amount`, `budgets.monthly_amount`, and all Paystack amounts.

---

## Supabase usage conventions

**Profile saves must use upsert, not update:**

```js
supabase.from('profiles').upsert({ id: user.id, ...fields }, { onConflict: 'id' })
```

Using `.update().eq('id', userId)` fails silently when the row does not yet exist. Upsert is safe in all cases.

**Row Level Security is active on all tables.** The frontend anon client can only read/write rows belonging to the authenticated user. Netlify Functions that need to bypass RLS (e.g. for rate limiting checks or admin reads) use `SUPABASE_SERVICE_KEY` to create a second admin client.

**Auth token pattern in Netlify Functions:**

```js
const token = event.headers['authorization']?.slice(7)
const { data: { user } } = await anonClient.auth.getUser(token)
```

All functions validate the token before doing anything else. Unauthenticated requests return 401.

**The `budget_chat_usage` table** tracks AI Q&A calls per user per month. Free users are capped at 10. The count is checked at function entry using the service client (bypasses RLS). After a successful AI call, a usage row is inserted.

---

## AI response formatting conventions

All three AI-facing functions (`analyse.js`, `budget-chat.js`, `support-chat.js`) include this constant:

```js
const FORMAT_RULES = `Never use em dashes. Never use the tilde symbol (~).
Never use markdown bold (**text**). Write in plain prose.`
```

This is injected into the system prompt of every Claude API call. It exists because early Claude responses used em dashes and markdown formatting that rendered poorly in the app's plain-text UI elements.

Do not remove FORMAT_RULES or weaken it. If a new AI function is added, include FORMAT_RULES in its system prompt.

---

## Branch workflow

- `main` is production. Never commit directly to `main`.
- `dev` is the active development branch. All work goes here.
- Netlify auto-deploys `dev` to `https://dev--bump-budget.netlify.app`
- Netlify auto-deploys `main` to `https://bump-budget.netlify.app`
- To release: merge `dev` into `main` via GitHub (PR or force push)

---

## Build workflow

```bash
cd "/sessions/zen-beautiful-feynman/mnt/Bump Budget"
npx vite build --emptyOutDir false
```

The `--emptyOutDir false` flag must always be included. Without it, Vite attempts to delete the `dist/` folder before building, which throws an EPERM error on the shared Windows/Linux filesystem.

After any build, check the last few lines of output for errors. A clean build ends with `built in Xs`.

---

## File editing safety conventions

These rules exist because the Linux sandbox and Windows file tools share a mounted filesystem, and writes from the Windows side often corrupt files on the Linux side.

1. **Read files using the Windows `Read` tool** — it reflects the true file content. The Linux `cat` output may show truncated or null-byte-corrupted versions.

2. **Write files using Python in bash** — always use:
   ```bash
   python3 -c "open('path', 'w').write(content)"
   ```
   or a Python heredoc. Never use the Windows `Edit` tool on files longer than ~100 lines.

3. **After writing, verify line count on Linux:**
   ```bash
   wc -l /path/to/file
   ```
   If the count is lower than expected, the file is truncated. Read the Windows version and append the missing lines.

4. **To strip null bytes from a corrupted file:**
   ```python
   raw = open(path, 'rb').read().replace(b'\x00', b'')
   open(path, 'w').write(raw.decode('utf-8', errors='replace'))
   ```

5. **Git index is often corrupt from the Linux side.** Use the `GIT_INDEX_FILE` workaround:
   ```bash
   GIT_INDEX_FILE=/tmp/git_idx_N git read-tree HEAD
   GIT_INDEX_FILE=/tmp/git_idx_N git add <files>
   GIT_INDEX_FILE=/tmp/git_idx_N git commit -m "message"
   ```
   Increment N each session to avoid reusing a stale index file.

6. **Git push always fails from Linux** (no credentials). Tell the user to run `git push origin dev` from Windows Git Bash.
