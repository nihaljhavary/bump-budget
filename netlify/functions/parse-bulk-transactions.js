import { createClient } from '@supabase/supabase-js'

const SYSTEM_PROMPT = `You are a financial transaction categorisation engine for bump. (BumpBudget), a South African personal finance app. Your ONLY job is to assign categories to bank transactions. You must never do anything else.`

const ALLOWED_FIELDS = new Set(['transactions', 'bank'])

const CATEGORIES = [
  'Income', 'Housing', 'Groceries', 'Eating out', 'Transport',
  'Entertainment', 'Health', 'Clothing', 'Subscriptions',
  'Education', 'Insurance', 'Savings', 'Fuel', 'ATM / Cash',
  'Fees & Charges', 'Utilities', 'Travel', 'Gifts', 'Other'
]

// ── SA Merchant pre-categorisation rules ─────────────────────────────────────
// Each rule: { patterns: [...lowercase strings], category: 'Category' }
// Checked in ORDER — first match wins. Put more specific before general.
const SA_RULES = [
  // ── Income ──
  { patterns: ['salary', 'wages', 'payroll', 'dynamic interest cashback', 'interest cashback', 'cashback reward', 'refund'], category: 'Income' },

  // ── Fuel ── (before groceries/transport to catch "total" before other matches)
  { patterns: ['engen', 'bp ', '/bp/', 'shell ', 'sasol', 'total ', 'caltex', 'astron', 'petroport', 'fuel station', 'petrol station'], category: 'Fuel' },

  // ── Eating out ──
  { patterns: [
    'kauai', 'nandos', "nando's", 'kfc', 'mugg and bean', 'mugg & bean',
    'vida e caffe', 'vida caffe', 'yatai', 'mozambik', 'spur ', 'ocean basket',
    'steers', 'debonairs', 'wimpy', 'mcdonalds', "mcdonald's", 'burger king',
    'hungry lion', 'panarottis', "roman's pizza", 'roman pizza', 'fishaways',
    'barcelos', 'dineplan', 'uber eats', 'ubereats', 'flw*uber eats',
    'uber *eats', 'mrd food', 'mr d food', 'delivast', 'bolt food',
    'yoco*cafe', 'yoco*coffee', 'yoco*restaurant', 'yoco*bar', 'yoco*grill',
    'yoco*bistro', 'yoco*eatery', 'yoco*food', 'yoco*kitchen',
    'the creamery', 'the brasserie', 'pizzeria', 'sushi', 'tashas', "tasha's",
    'vida ', 'paul bakery', 'bakery', 'bagel', 'deli ', 'delizioso',
    'juicy lucy', 'chesa nyama', 'makro deli', 'roastery', 'coffee shop',
    'signature restaurant', 'the grillhouse', 'le coin', 'chef', 'braai',
    'wiesenhof', 'simply asia', 'thai wok', 'kung fu kitchen', 'doppio zero',
    'paul restaurant', 'mythos', 'primi piatti', 'the palms', 'pigalle',
    'salt restaurant', 'carne', 'cattle baron', 'hussar grill',
    'galito\'s', 'galitos', 'chicken licken', 'uncle chicken', 'popeyes'
  ], category: 'Eating out' },

  // ── Groceries ──
  { patterns: [
    'woolworths food', 'ww food', 'checkers ', 'checkerssuperstore',
    'pick n pay', 'picknpay', 'pnp ', 'spar ', 'shoprite', 'food lover',
    'food lovers', 'freshstop', 'superspar', 'usave', 'ok foods',
    'cambridge food', 'fruit & veg city', 'fruit and veg city',
    'montagu', 'kwikspar', 'tops ', 'liquorland', 'discount liquors'
  ], category: 'Groceries' },

  // ── Transport ──
  { patterns: [
    'uber trip', 'uber - trip', 'flw*uber trip', 'bolt ride', 'indriver',
    'taxify', 'gautrain', 'myciti', 'interpark', 'admyt', 'str parking',
    'wilson parking', 'ace parking', 'quick park', 'disability parking',
    'e-natis', 'aarto', 'traffic fine', 'licensing fee', 'motor vehicle reg'
  ], category: 'Transport' },

  // ── Subscriptions ──
  { patterns: [
    'netflix', 'spotify', 'dstv', 'showmax', 'google one', 'google play',
    'apple one', 'apple tv+', 'disney+', 'disney plus', 'amazon prime',
    'youtube premium', 'playstation network', 'psn*', 'microsoft 365',
    'office 365', 'dropbox', 'wix.com', 'wix ', 'canva', 'talk360',
    'adobe', 'openai', 'chatgpt', 'planet fitness', 'virgin active',
    'la fitness', 'anytime fitness', 'gymnastics', 'gym ', 'fitness club',
    'bark.com', 'bark ', 'absolute pets', 'newlands blue cross',
    'domain', 'hosting', 'cloud storage', 'antivirus', 'nordvpn', 'expressvpn'
  ], category: 'Subscriptions' },

  // ── Insurance ──
  { patterns: [
    'disclife', 'discovery life', 'discovery insure', 'vitality money premium',
    'vitality premium', 'momentum life', 'sanlam', 'old mutual insur',
    'outsurance', 'miway', 'hollard', 'santam', 'guardrisk', 'firstrand life',
    'liberty life', 'assupol', 'clientele', 'african life', 'king price',
    'pps insur', 'professional provident', 'nedgroup life', 'auto general',
    'budget insurance', 'vodacom insur', 'fnb insur'
  ], category: 'Insurance' },

  // ── Health ──
  { patterns: [
    'clicks', 'dis-chem', 'dischem', 'medirite', 'alpha pharm', 'pharmacy',
    'dr ', 'medical centre', 'medical aid', 'dentist', 'dental',
    'optometrist', 'physiotherap', 'psycholog', 'therapist', 'hospital',
    'mediclinic', 'netcare', 'life healthcare', 'intercare', 'medicross',
    'health4me', 'bonitas', 'fedhealth', 'momentum health', 'gems ',
    'newlands blue cross', 'vet clinic', 'veterinar', 'animal hospital',
    'animal welfare'
  ], category: 'Health' },

  // ── Entertainment ──
  { patterns: [
    'howler', 'computicket', 'ticketmaster', 'webtickets', 'nu metro',
    'ster-kinekor', 'sterkinekor', 'cinema', 'imax', 'teatro',
    'grand west casino', 'emperors palace', 'sunbet', 'hollywoodbets',
    'betway', 'sportingbet', 'superbalist', 'truworthsgames'
  ], category: 'Entertainment' },

  // ── Travel ──
  { patterns: [
    'airbnb', 'booking.com', 'expedia', 'hotels.com', 'kulula', 'flysafair',
    'safair', 'mango air', 'ba comair', 'british airways', 'ethiopian air',
    'emirates', 'lufthansa', 'qatar airways', 'airlink', 'federal air',
    'global travel', 'airport tax', 'departure tax', 'fastjet', 'rennies',
    'flight centre', 'club travel', 'holiday', 'resort '
  ], category: 'Travel' },

  // ── Fees & Charges ──
  { patterns: [
    'monthly account fee', 'account fee', 'bank charge', 'interest charged',
    'intl payment fee', 'international payment fee', 'transaction fee',
    'administration fee', 'admin fee', 'late payment fee', 'overlimit fee',
    'atm surcharge', 'cashsend fee', 'instant money fee', 'penalty fee',
    'overdraft fee', 'return fee', 'service charge', 'annual fee',
    'card fee', 'replacement card fee', 'sms notification fee'
  ], category: 'Fees & Charges' },

  // ── ATM / Cash ──
  { patterns: ['atm withdrawal', 'cash withdrawal', 'cash deposit', 'cash advance', 'cashsend', 'instant money'] },

  // ── Housing ──
  { patterns: [
    'rent ', 'bond repayment', 'bond payment', 'sectional title levy',
    'body corporate', 'hoa levy', 'homeowner', 'property management',
    're/max', 'pam golding', 'seeff', 'leapfrog'
  ], category: 'Housing' },

  // ── Utilities ──
  { patterns: [
    'eskom', 'city power', 'prepaid electricity', 'prepaid elec',
    'municipal ', 'city of johannesburg', 'city of cape town', 'city of ekurhuleni',
    'rates and taxes', 'telkom ', 'vodacom top', 'mtn ', 'cell c ',
    'rain ', 'fibre', 'openserve', 'vumatel', 'metrofibre', 'frogfoot',
    'linkup ', 'afrihost', 'webafrica', 'rsaweb', 'axxess', 'herotel'
  ], category: 'Utilities' },

  // ── Education ──
  { patterns: [
    'school fee', 'school fees', 'tuition', 'university fee', 'college fee',
    'varsity ', 'udemy', 'coursera', 'skillshare', 'linkedin learning',
    'van schaik', 'adams books', 'exclusive books', 'abet ', 'tvet '
  ], category: 'Education' },

  // ── Gifts ──
  { patterns: [
    'fresh flowers', 'paygate*fresh flowers', 'payfast*fresh flowers',
    'islamic relief', 'paygate*islamic', 'gifts ', 'gift card',
    'woolworths gift', 'takealot gift'
  ], category: 'Gifts' },

  // ── Clothing ──
  { patterns: [
    'mr price ', 'mrp ', 'h&m', 'zara ', 'cotton on', 'edgars', 'truworths',
    'jet ', 'ackermans', 'pep ', 'sportscene', 'totalsports', 'nike store',
    'adidas store', 'exact ', 'dunns ', 'identity ', 'queenspark', 'foschini',
    'cape union mart', 'sportsmans warehouse', 'golfers club', 'american swiss',
    'jackal & hide', 'fabiani', 'relay jeans'
  ], category: 'Clothing' },

  // ── Savings ──
  { patterns: [
    'easy equities', 'etf invest', 'tax free savings', 'tfsa', '10x ',
    'sygnia', 'coronation', 'ninety one', 'prudential invest', 'satrix',
    'provident fund', 'pension fund', 'retirement annuity', ' ra contribution',
    'unit trust', 'nedgroup invest', 'old mutual invest', 'allan gray'
  ], category: 'Savings' }
]

// Pre-categorise using SA_RULES before sending to Claude
function saPreCategory(description) {
  const lower = description.toLowerCase()
  for (const rule of SA_RULES) {
    for (const pattern of rule.patterns) {
      if (lower.includes(pattern)) return rule.category
    }
  }
  // Yoco wildcard — anything remaining from Yoco is likely a small business / Other
  if (lower.startsWith('yoco*')) return 'Other'
  return null
}

// Apply user-defined categorisation rules to a transaction
function applyRules(rules, description) {
  if (!rules || rules.length === 0) return null
  const lower = description.toLowerCase()
  for (const rule of rules) {
    if (lower.includes(rule.merchant_pattern.toLowerCase())) {
      return rule.category
    }
  }
  return null
}

// Chunk array into groups of N
function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export async function handler(event) {
  console.log('parse-bulk-transactions called', event.httpMethod)
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  // ── 1. Parse + validate ────────────────────────────────────────────────────
  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const extraFields = Object.keys(body).filter(k => !ALLOWED_FIELDS.has(k))
  if (extraFields.length > 0) {
    return { statusCode: 400, body: JSON.stringify({ error: `Unexpected fields: ${extraFields.join(', ')}` }) }
  }

  const { transactions, bank } = body

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: '`transactions` must be a non-empty array' }) }
  }

  if (transactions.length > 2000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Maximum 2000 transactions per import' }) }
  }

  // Validate each row
  for (const t of transactions) {
    if (!t.description || typeof t.description !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Each transaction needs a `description` string' }) }
    }
    if (typeof t.amount !== 'number') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Each transaction needs an `amount` number' }) }
    }
  }

  // ── 2. Auth ────────────────────────────────────────────────────────────────
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || ''
  console.log('auth header present:', authHeader.startsWith('Bearer '))
  if (!authHeader.startsWith('Bearer ')) {
    console.log('returning 401 - no bearer token')
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized - no session token' }) }
  }
  const token = authHeader.slice(7)

  const anonClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )
  const adminClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }
  }

  // ── 3. Rate limiting ───────────────────────────────────────────────────────
  const { data: profile } = await adminClient
    .from('profiles')
    .select('subscription_plan, is_admin')
    .eq('id', user.id)
    .single()

  const plan = profile?.subscription_plan || 'free'
  const isAdmin = profile?.is_admin || false
  const limit = isAdmin ? Infinity : (plan === 'pro' || plan === 'growth') ? 500 : 50
  const month = new Date().toISOString().slice(0, 7)

  const { data: usage } = await adminClient
    .from('ai_usage')
    .select('call_count')
    .eq('user_id', user.id)
    .eq('month', month)
    .maybeSingle()

  const callCount = usage?.call_count ?? 0

  if (limit !== Infinity && callCount >= limit) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: `Monthly limit of ${limit} AI analyses reached. Upgrade your plan for more.`
      })
    }
  }

  // ── 4. Load user's categorisation rules ───────────────────────────────────
  const { data: rules } = await adminClient
    .from('categorization_rules')
    .select('merchant_pattern, category')
    .eq('user_id', user.id)

  // ── 5. Apply rules: user rules first, then SA pre-rules, then Claude ──────
  const withRules = transactions.map((t, idx) => {
    // User-defined rules take highest priority
    const userCat = applyRules(rules, t.description)
    // SA merchant pre-categorisation second
    const saCat = userCat ? null : saPreCategory(t.description)
    return {
      idx,
      ...t,
      category: userCat || saCat || null
    }
  })

  const needsClaude = withRules.filter(t => !t.category)
  const hasCategory = withRules.filter(t => t.category)

  console.log(`Pre-categorised: ${hasCategory.length}, needs Claude: ${needsClaude.length}`)

  let claudeCategorised = []

  if (needsClaude.length > 0) {
    const chunks = chunk(needsClaude, 150)

    const buildPrompt = (chunkItems) => `You are categorising South African bank transactions for a personal budget app.

Bank: ${bank || 'Generic'}

Available categories (use EXACTLY one of these):
${CATEGORIES.join(', ')}

Rules:
- Salary/wages/payroll/credits from employer → "Income"
- Checkers/Woolworths Food/Pick n Pay/Spar/Shoprite → "Groceries"
- Uber Eats/Mr D/Dineplan/KFC/McDonald's/restaurants/cafés → "Eating out"
- Engen/BP/Shell/Sasol/Total fuel → "Fuel"
- Uber trips/Bolt ride/Gautrain/parking → "Transport"
- Netflix/Spotify/DSTV/Showmax/PlayStation/streaming/gym → "Subscriptions"
- Discovery Life/Vitality/Sanlam/Outsurance/insurance premiums → "Insurance"
- Rent/bond/body corporate levy → "Housing"
- ATM/cash withdrawal → "ATM / Cash"
- Monthly account fee/interest charged/bank charges → "Fees & Charges"
- Eskom/prepaid electricity/municipal/fibre/Telkom/MTN airtime → "Utilities"
- Clicks/Dis-Chem/pharmacy/doctor/medical/hospital → "Health"
- Mr Price/H&M/Zara/Woolworths fashion/Edgars/clothing stores → "Clothing"
- Udemy/school fees/university/tuition → "Education"
- Easy Equities/unit trust/retirement annuity → "Savings"
- Airbnb/hotel/flights/Kulula/FlySafair → "Travel"
- Gift cards/flowers/charity donations → "Gifts"
- Howler/Computicket/cinema/casino → "Entertainment"
- Yoco* payments are small businesses — infer from context if possible, else "Other"

Respond with ONLY a raw JSON array — no markdown, no explanation:
[{"idx": number, "category": "CategoryName"}, ...]

Transactions:
${JSON.stringify(chunkItems.map(t => ({ idx: t.idx, description: t.description, amount: t.amount })))}`

    const processChunk = async (chunkItems) => {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4000,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: buildPrompt(chunkItems) }]
          })
        })
        const data = await res.json()
        const text = data.content?.[0]?.text || '[]'
        try {
          const clean = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
          return JSON.parse(clean)
        } catch {
          return chunkItems.map(t => ({ idx: t.idx, category: 'Other' }))
        }
      } catch {
        return chunkItems.map(t => ({ idx: t.idx, category: 'Other' }))
      }
    }

    const results = await Promise.all(chunks.map(processChunk))
    claudeCategorised = results.flat()
  }

  // ── 6. Merge results ───────────────────────────────────────────────────────
  const categoryMap = {}
  for (const item of claudeCategorised) {
    categoryMap[item.idx] = item.category
  }

  const result = withRules.map(t => ({
    date: t.date,
    description: t.description,
    amount: t.amount,
    raw_merchant: t.raw_merchant || t.description,
    category: t.category || categoryMap[t.idx] || 'Other',
    rule_applied: !!t.category
  }))

  // ── 7. Increment usage (1 call per bulk import) ───────────────────────────
  if (limit !== Infinity) {
    await adminClient
      .from('ai_usage')
      .upsert(
        { user_id: user.id, month, call_count: callCount + 1 },
        { onConflict: 'user_id,month' }
      )
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ results: result })
  }
}
