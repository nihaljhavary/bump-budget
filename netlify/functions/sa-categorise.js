// ── Shared SA merchant categorisation rules ──────────────────────────────────
// Used by parse-transaction.js (single entry) and parse-bulk-transactions.js (bulk import)
// Each rule: { patterns: [...lowercase strings], category: 'Category' }
// Checked in ORDER — first match wins. Put more specific patterns before general ones.

export const CATEGORIES = [
  'Income', 'Transfer', 'Housing', 'Groceries', 'Eating out', 'Transport',
  'Entertainment', 'Health', 'Clothing', 'Subscriptions',
  'Education', 'Insurance', 'Savings', 'Fuel', 'ATM / Cash',
  'Fees & Charges', 'Utilities', 'Travel', 'Gifts', 'Home & Garden', 'Other'
]

// Categories that should NOT count as lifestyle spend in analytics
// (excluded from spendTxns calculations across Dashboard, Analytics, IncomeStatement)
export const EXCLUDED_FROM_SPEND = new Set(['Income', 'Transfer', 'Savings'])

export const SA_RULES = [
  // ── Transfer — HIGHEST PRIORITY (before any spend categories) ──
  // Internal account transfers, person-to-person payments — not lifestyle spend
  { patterns: [
    'discovery pay',
    'payshap',
    'capitec pay',
    'fnb send money',
    'own acc transfer',
    'own account transfer',
    'acc to acc',
    'account-to-account',
    'interbank transfer',
    'interacc transfer',
    'interaccount transfer',
    'savings account transfer',
    'savings acc transfer',
    'transfer to savings',
    'transfer from savings',
    'eft transfer',
    'capitec save',
    'fnb flexi fixd',   // FNB fixed deposit transfers
    'nedbank transfer',
    'absa flexifix',
    'standard bank transfer',
    'internal transfer',
  ], category: 'Transfer' },

  // ── Income ──
  { patterns: [
    'salary', 'wages', 'payroll', 'payslip',
    'dynamic interest cashback', 'interest cashback', 'cashback reward',
    'refund from', 'credit refund', 'reversal cr',
    'rental income', 'freelance payment', 'consulting fee income',
    'payment received', 'dividend', 'interest credit', 'interest earned',
  ], category: 'Income' },

  // ── Contextual merchants — BEFORE broad category rules ────────────────────
  // Delivery grocery services and petrol-station convenience stores that would
  // otherwise be swallowed by the broader Fuel / Clothing / Other patterns.
  { patterns: [
    // Woolworths grocery delivery (must precede woolworths→Clothing below)
    'woolworths dash', 'woolies dash', 'woolworths delivery', 'woolies delivery',
    // Checkers grocery delivery app
    'checkers sixty60', 'sixty60', 'sixty 60', 'checkers 6060',
    // Pick n Pay rapid delivery + online ordering
    'pick n pay asap', 'pnp asap', 'picknpay asap',
    'pnp online', 'pick n pay online', 'picknpay online',
    // Spar online ordering / delivery
    'spar online', 'spar deliver', 'spar2u',
    // Checkers online (non-Sixty60)
    'checkers online',
    // Woolworths online food ordering
    'woolworths online', 'woolies online',
    // Shoprite online / Usave delivery
    'shoprite online', 'shoprite usave delivery', 'usave online',
    // Engen Quickshop — convenience store at petrol station (not a fuel purchase)
    'engen quickshop',
    // Shell Select — convenience store at Shell (not a fuel purchase)
    'shell select',
    // BP convenience (Wild Bean Cafe food items)
    'wild bean cafe',
    // Caltex with Shoprite concession
    'caltex shoprite',
    // Other petrol-station convenience patterns
    'freshstop at caltex', 'freshstop caltex',
  ], category: 'Groceries' },

  // ── Fuel ── (after contextual merchants — "engen quickshop" caught above)
  { patterns: [
    'engen', 'bp ', 'bp/', 'bpexpress',
    'shell ', 'shell/', 'shellultraCity',
    'sasol', 'sasol oil',
    'total ', 'total/',
    'caltex', 'astron', 'astron energy',
    'petroport', 'petrosa',
    'fuel station', 'petrol station',
    'forecourt',
  ], category: 'Fuel' },

  // ── Eating out ──
  { patterns: [
    // Fast food chains
    'kfc', 'mcdonalds', "mcdonald's", 'mcd ',
    'burger king', 'hungry lion',
    'steers', 'debonairs',
    'nandos', "nando's",
    'wimpy', 'juicy lucy',
    'fishaways',
    'barcelos',
    "galito's", 'galitos',
    'chicken licken', 'popeyes', 'uncle chicken',
    "roman's pizza", 'roman pizza', 'panarottis',
    // Sit-down / casual
    'spur ', 'ocean basket',
    'mugg and bean', 'mugg & bean',
    'vida e caffe', 'vida caffe', 'vida ',
    'kauai',
    'tashas', "tasha's",
    'doppio zero',
    'paul bakery', 'paul restaurant',
    'mythos', 'primi piatti',
    'simply asia', 'thai wok', 'kung fu kitchen',
    'mozambik', 'yatai',
    'carne', 'cattle baron', 'hussar grill',
    'salt restaurant', 'the grillhouse', 'le coin',
    'pigalle', 'the palms',
    'wiesenhof', 'signature restaurant',
    'turn n tender', 'turn and tender',
    'roco mamas', "roco mama's",
    'chefs table', "chef's table",
    'karibu', 'col cacchio',
    'jason bakery', 'knead bakery', 'bottomless coffee',
    'terbodore', 'craft coffee',
    'truth coffee', 'origin coffee',
    'glory days', 'lucky bean',
    // Delivery
    'uber eats', 'ubereats', 'flw*uber eats', 'uber *eats',
    'mr d food', 'mrd food', 'mrdfood', 'mr d app',
    'bolt food',
    'deliveroo',
    // More SA fast food / QSR
    'kfc ', 'kfc/', 'kentucky fried',
    'chicken licken', 'steers ', 'steers/',
    'wimpy ', 'wimpy/', "roman's pizza", 'romans pizza',
    "jason's bakery", 'jasons bakery',
    'panarottis', 'ocean basket', 'spur ', 'spur/',
    'john dory', 'john dorys',
    'doppio zero', 'tashas ', "tasha's",
    'cafe neo', 'bootlegger', 'truth coffee', 'coffee on',
    'dineplan',
    'order in', 'orderin',
    // In-store hot food counters (must come after grocery-specific patterns)
    'woolworths hot food', 'woolies hot food',
    'checkers kitchen',
    // Generic descriptors
    'bakery', 'bagel', 'deli ',
    'coffee shop', 'roastery',
    'pizzeria', 'sushi ',
    'braai', 'chesa nyama',
    'restaurant', 'cafe ', 'bistro', 'eatery',
    'grill ', 'kitchen ', 'food bar',
    'burger ', 'wings ', 'shawarma', 'kebab', 'bunny chow',
    // Yoco-prefixed eating out
    'yoco*cafe', 'yoco*coffee', 'yoco*restaurant', 'yoco*bar',
    'yoco*grill', 'yoco*bistro', 'yoco*eatery', 'yoco*food',
    'yoco*kitchen', 'yoco*bakery', 'yoco*deli', 'yoco*pizza',
    'yoco*sushi',
  ], category: 'Eating out' },

  // ── Groceries ──
  { patterns: [
    // Woolworths food (before Woolworths general below)
    'woolworths food', 'woolies food', 'ww food',
    // Major chains
    'checkers ', 'checkers/', 'checkerssuperstore', 'checkers superstore',
    'pick n pay', 'picknpay', 'pnp ', 'pnp/',
    'spar ', 'spar/', 'superspar', 'kwikspar', 'kwik spar',
    'shoprite', 'shoprite checkers',
    'food lover', 'food lovers', "food lover's market",
    'freshstop',
    'usave', 'ok foods', 'ok grocer',
    'cambridge food',
    'fruit & veg city', 'fruit and veg city', 'freshmarket',
    'montagu', 'montagu nuts',
    // Wholesale / bulk
    'makro', 'game food',
    // Organic / health food
    'wellness warehouse', 'faithful to nature',
    'organic zone', 'the health store',
    // Liquor (linked to grocery shops)
    'tops ', 'tops/', 'liquorland', 'discount liquors',
    'makro deli',
  ], category: 'Groceries' },

  // ── Transport ──
  { patterns: [
    // Ridehailing
    'uber trip', 'uber - trip', 'flw*uber trip', 'flw*uber',
    'bolt ride', 'bolt trip',
    'indriver', 'taxify', 'lyft',
    // Public transit
    'gautrain', 'myciti', 'minibus',
    // Parking
    'parking', 'interpark', 'wilson parking', 'ace parking',
    'quick park', 'str parking', 'pay&go parking',
    'ncr parking', 'global parking',
    'parkhands', 'parkrite',
    // Road / vehicle
    'e-natis', 'enatis', 'aarto', 'traffic fine',
    'licensing fee', 'motor vehicle reg', 'motor vehicle',
    'roadworthy', 'e-toll', 'sanral',
    // Vehicle services
    'midas ', 'automotion', 'autozone ', 'supaquick',
    'tiger wheel', 'supa quick',
    'car wash', 'auto care',
    // Admyt
    'admyt',
  ], category: 'Transport' },

  // ── Subscriptions ──
  { patterns: [
    // Streaming video
    'netflix', 'showmax', 'dstv', 'dstv now',
    'disney+', 'disney plus', 'amazon prime',
    'apple tv+', 'apple one',
    'crunchyroll', 'mubi',
    // Streaming audio / gaming
    'spotify', 'apple music', 'tidal ',
    'playstation network', 'psn*', 'xbox game',
    'nintendo eshop', 'steam games',
    // Productivity / software / AI
    'google one', 'google play',
    'amazon prime', 'amzn prime', 'amazon*',
    'disney+', 'disney plus',
    'apple.com/bill', 'itunes', 'apple sub',
    'youtube premium', 'youtube music',
    'canva ', 'canva/',
    'adobe ',
    'microsoft 365', 'office 365', 'ms365',
    'adobe ', 'adobe*',
    'dropbox', 'icloud',
    'openai', 'chatgpt', 'claude.ai', 'anthropic',
    'github ', 'github*',
    'cursor ', 'replit', 'vercel',
    'notion ', 'airtable',
    'figma ', 'canva ',
    'slack ', 'zoom ',
    'wix.com', 'wix ',
    'shopify', 'squarespace',
    // VPN / security
    'nordvpn', 'expressvpn', 'surfshark',
    // Fitness / gym
    'planet fitness', 'virgin active', 'la fitness',
    'anytime fitness', 'gym ', 'fitness club', 'gymnasium',
    'crossfit ', '1life fit',
    // News / reading
    'talk360',
    // Cloud / domain / hosting
    'domain ', 'hosting ', 'cloud storage', 'antivirus',
    // Misc subscriptions
    'bark.com', 'bark ',
    'absolute pets',
    'youtube premium',
    'skillshare', 'masterclass',
    'duolingo',
  ], category: 'Subscriptions' },

  // ── Insurance ──
  { patterns: [
    'disclife', 'discovery life', 'discovery insure',
    'vitality money premium', 'vitality premium',
    'momentum life', 'momentum insur',
    'sanlam', 'sanlam insur',
    'old mutual insur', 'old mutual life',
    'outsurance', 'miway', 'hollard',
    'santam', 'guardrisk',
    'firstrand life', 'firstrand insur',
    'liberty life', 'liberty insur',
    'assupol', 'clientele',
    'african life', 'king price',
    'pps insur', 'professional provident',
    'nedgroup life', 'auto & general', 'auto and general',
    'budget insurance', 'vodacom insur', 'fnb insur',
    'absa insurance', 'standard bank insur',
    'capitec funeral', 'funeral cover',
    'credit life',
    'bidvest life',
    '1life insur', 'aar insur',
  ], category: 'Insurance' },

  // ── Health ──
  { patterns: [
    // Pharmacies / drugstores
    'clicks', 'dis-chem', 'dischem', 'medirite', 'alpha pharm',
    'pharmacy', 'chemist',
    // Medical aid
    'medical aid', 'discovery health', 'bonitas', 'fedhealth',
    'momentum health', 'gems ', 'bestmed', 'medihelp',
    'resolution health',
    // Practitioners / services
    'dr ', 'doctor ', 'medical centre', 'medical center',
    'dentist', 'dental ',
    'optometrist', 'optics', 'spec-savers', 'specsavers',
    'physiotherap', 'physio ',
    'psycholog', 'therapist', 'counsell',
    'audiolog', 'podiatrist',
    'chiropract',
    // Facilities
    'hospital', 'clinic ',
    'mediclinic', 'netcare', 'life healthcare',
    'intercare', 'medicross',
    // Wellness / beauty
    'health4me',
    'wellness ',
    'spa ', 'nail bar', 'nail salon',
    'beauty salon', 'hair salon', 'hairdress',
    'barber',
    // Veterinary
    'vet clinic', 'veterinar', 'animal hospital',
    'animal welfare', 'newlands blue cross',
    'dogzone', 'petzone',
    'pet store', 'petshop',
  ], category: 'Health' },

  // ── Entertainment ──
  { patterns: [
    // Ticketing
    'howler', 'computicket', 'ticketmaster', 'webtickets',
    'numetro', 'nu metro', 'ster-kinekor', 'sterkinekor',
    'cinema', 'imax ',
    // Venues
    'teatro', 'grand west casino', 'emperors palace',
    'montecasino', 'suncoast casino',
    // Betting / gambling
    'sunbet', 'hollywoodbets', 'betway', 'sportingbet',
    'supabets', 'gbets', 'tab ', 'pari-mutuel',
    'world sports betting', 'wsb ',
    // Gaming / events
    'truworthsgames',
    // Fashion (online, not clothing store)
    'supabalist', 'superbalist',
    // Activities
    'bowling', 'laser tag', 'paintball',
    'escape room', 'trampoline',
    'miniature golf', 'indoor go-kart',
    'axe throwing', 'archery',
    'theme park', 'amusement',
    // Sports
    'supersport', 'golf round', 'golf club membership',
  ], category: 'Entertainment' },

  // ── Travel ──
  { patterns: [
    // Accommodation
    'airbnb', 'booking.com', 'expedia', 'hotels.com',
    'hotel ', 'lodge ', 'guesthouse', 'backpackers',
    'lekkeslaap',
    'protea hotel', 'tsogo sun', 'sun international',
    // Airlines
    'kulula', 'flysafair', 'safair', 'mango air',
    'ba comair', 'british airways', 'comair',
    'ethiopian air', 'emirates', 'lufthansa',
    'qatar airways', 'airlink', 'federal air',
    'fastjet', 'airkenya', 'rwandair',
    // Travel services
    'global travel', 'airport tax', 'departure tax',
    'rennies travel', 'flight centre', 'club travel',
    'thompsons holidays', 'sure travel',
    'travelstart',
    // Airport related
    'acsa parking', 'airport park',
    // Car hire
    'avis ', 'budget car', 'hertz ', 'enterprise rent',
    'europcar', 'tempest car',
  ], category: 'Travel' },

  // ── Fees & Charges ──
  { patterns: [
    'monthly account fee', 'account fee',
    'bank charge', 'bank charges',
    'interest charged', 'interest debit',
    'intl payment fee', 'international payment fee',
    'foreign exchange fee', 'forex fee',
    'transaction fee', 'transact fee',
    'administration fee', 'admin fee',
    'late payment fee', 'overlimit fee',
    'atm surcharge', 'cash withdrawal fee',
    'cashsend fee', 'instant money fee',
    'penalty fee', 'penalty charge',
    'overdraft fee', 'overdraft interest',
    'return fee', 'returned debit',
    'service charge', 'annual fee',
    'card fee', 'replacement card fee',
    'sms notification fee', 'notification fee',
    'subscription fee debit',   // bank subscription fees
    'dishonour fee', 'dishonoured',
  ], category: 'Fees & Charges' },

  // ── ATM / Cash ──
  { patterns: [
    'atm withdrawal', 'cash withdrawal', 'cash withdrl',
    'cash deposit', 'cash advance',
    'cashsend', 'instant money',
    'cash@till', 'cash at till',
    'cardless cash',
  ], category: 'ATM / Cash' },

  // ── Housing ──
  { patterns: [
    'rent ', 'rental payment', 'bond repayment', 'bond payment',
    'sectional title levy', 'body corporate', 'hoa levy',
    'homeowner', 'property management',
    'property levy',
    're/max', 'pam golding', 'seeff', 'leapfrog',
    'property practitioners',
    'property management co',
    'semigration', 'estate agent fee',
  ], category: 'Housing' },

  // ── Utilities ──
  { patterns: [
    // Electricity
    'eskom', 'city power', 'prepaid electricity', 'prepaid elec',
    'prepaid power',
    // Municipal / rates
    'municipal ', 'city of johannesburg', 'city of cape town',
    'city of ekurhuleni', 'city of tshwane', 'city of ethekwini',
    'rates and taxes', 'rates & taxes', 'municipal rates',
    // Telco
    'telkom ', 'telkom*',
    'vodacom top', 'vodacom recharge',
    'mtn ', 'mtn/', 'mtn recharge',
    'cell c ', 'cellc',
    'rain ', 'rain*',
    // Internet
    'fibre', 'openserve', 'vumatel', 'metrofibre',
    'frogfoot', 'linkup ', 'afrihost', 'webafrica',
    'rsaweb', 'axxess', 'herotel', 'cybersmart',
    'cool ideas', 'octotel',
    // Water / waste
    'water & sanitation', 'water and sanitation',
    'refuse removal',
  ], category: 'Utilities' },

  // ── Education ──
  { patterns: [
    'school fee', 'school fees', 'tuition', 'tution',
    'university fee', 'university of', 'unisa',
    'college fee', 'varsity ', 'academy ',
    'udemy', 'coursera', 'linkedin learning',
    'van schaik', 'adams books', 'exclusive books',
    'abet ', 'tvet ',
    'matric', 'extra lessons',
    'daycare', 'creche', 'aftercare',
    'pre-school', 'preschool',
    'private school', 'christian school', 'montessori',
    'driving school', 'learner licence', 'driver licence',
  ], category: 'Education' },

  // ── Gifts ──
  { patterns: [
    'fresh flowers', 'paygate*fresh flowers', 'payfast*fresh flowers',
    'islamic relief', 'paygate*islamic',
    'gifts ', 'gift card', 'gift voucher',
    'woolworths gift', 'takealot gift',
    'heartfelt', 'interflora',
    'charity', 'donation', 'npo ', 'welfare',
    'birthday flowers',
  ], category: 'Gifts' },

  // ── Clothing ──
  { patterns: [
    'mr price ', 'mrp ', 'mrp/',
    'h&m', 'zara ', 'zara/',
    'cotton on',
    'edgars', 'truworths', 'truworthsgames',
    'jet ', 'ackermans',
    'pep ', 'pep/', 'pepkor',
    'sportscene', 'totalsports',
    'nike store', 'adidas store', 'new balance',
    'exact ', 'dunns ', 'identity ',
    'queenspark', 'foschini', 'tfg ',
    'cape union mart',
    'sportsmans warehouse', 'sport 4 all',
    'golfers club',
    'american swiss', 'jackal & hide', 'fabiani',
    'relay jeans', 'relay/',
    'shein', 'supabalist',
    'markham', 'YDE ',
    'bash.com', 'bash ',
    'levi', 'g-star', 'polo clothing',
    'la senza', 'bras and things',
  ], category: 'Clothing' },

  // ── Savings / Investment ──
  { patterns: [
    'easy equities', 'easyequities',
    'etf invest', 'tax free savings', 'tfsa',
    '10x ', '10x/', 'sygnia',
    'coronation', 'ninety one',
    'prudential invest', 'satrix',
    'provident fund', 'pension fund',
    'retirement annuity', ' ra contribution',
    'unit trust',
    'nedgroup invest', 'old mutual invest', 'allan gray',
    'investec ', 'prescient ',
    'stanlib', 'momentum invest',
    'discovery invest',
    'stash savings',
    'franc app', 'franc invest',
    'ovex ', 'luno ', 'valr ',   // crypto
  ], category: 'Savings' },

  // ── Home & Garden ── (DIY / hardware / furniture / home)
  { patterns: [
    'builders warehouse', 'builders express', 'builders tradeshed',
    'leroy merlin',
    'mica hardware', 'mica ',
    'timber town', 'timber city', 'saligna timber',
    'cnc hardware', 'mr hardware',
    'buco ', 'hardware',
    'hirsch', 'hirschs',
    'mr price home', 'mrph ',
    'homechoice', 'home choice',
    'weylandts', 'coricraft',
    'snatcher', '@home ',
    'the decor company',
    'lodge paints', 'plascon',
    'lawn ', 'garden centre', 'nursery ',
    'plumbmaster',
    'electro depot',
    'game store',    // Game SA sells electronics & hardware
    'incredible connection', 'incredible conn',
    'hi-fi corp', 'hifi corporation',
    'loot.co.za', 'loot ',
    'furniture ', 'beds online', 'mattress',
    'solar system', 'solar panel',
  ], category: 'Home & Garden' },

  // ── Online retail — removed hard-coded 'Other' mapping ──
  // Takealot, Amazon etc. are passed to Claude for category inference
  // (Electronics, Books, Home & Garden, Clothing etc.) rather than bulk-assigning Other.

  // ── Woolworths general — after food-specific rule above catches food ──
  { patterns: ['woolworths ', 'woolworths', 'woolies ', 'woolies'], category: 'Clothing' },
]

/**
 * Normalise a raw bank statement description.
 * Strips common payment-gateway prefixes, extra whitespace, branch codes.
 * @param {string} description
 * @returns {string}
 */
export function normalizeDescription(description) {
  if (!description) return ''
  return description
    // Strip payment wrapper/processor prefixes — order matters (longer/specific first)
    .replace(/^(FLW\s*\*|PAYGATE\s*\*|PAYFAST\s*\*|YOCO\s*\*|SQ\s*\*|POS\s*\*)/i, '')
    .replace(/^(SNAPSCAN\s*\*|OZOW\s*\*|PEACH\s*\*|NETCASH\s*\*|PAYU\s*\*)/i, '')
    .replace(/^(STRIPE\s*\*|BLUESNAP\s*\*)/i, '')
    .replace(/^(CARD\s*PAYMENT\s*[-–]?\s*|ONLINE\s*PURCHASE\s*[-–]?\s*|INTERNET\s*PURCHASE\s*[-–]?\s*)/i, '')
    .replace(/^(DEBIT\s*ORDER\s*[-–]?\s*)/i, '')
    .replace(/\b\d{6,}\b/g, '')    // strip long reference numbers (6+ digits)
    .replace(/\s{2,}/g, ' ')
    .replace(/[*\/\\]+$/, '')      // trailing separators
    .trim()
}

/**
 * Pre-categorise a transaction description using SA_RULES.
 * Returns a category string or null if no rule matches.
 * @param {string} description
 * @returns {string|null}
 */
export function saPreCategory(description) {
  if (!description) return null
  // CRITICAL: normalize BEFORE matching — strips wrappers like PAYFAST*, FLW*, etc.
  // so "PAYFAST*NETFLIX" matches 'netflix' -> Subscriptions, not 'payfast*' -> Other
  const normalized = normalizeDescription(description)
  const lower = normalized.toLowerCase()
  for (const rule of SA_RULES) {
    for (const pattern of rule.patterns) {
      if (lower.includes(pattern)) return rule.category
    }
  }
  // Yoco: the prefix is already stripped by normalizeDescription(), so by this
  // point `lower` contains the merchant name only. If SA_RULES didn't match,
  // return null and let Claude categorise from the clean merchant name.
  return null
}

/**
 * Aggressively clean a description down to just the merchant name.
 * Used when sending descriptions to Claude -- removes location tags,
 * phone numbers, and trailing noise so the AI sees "Vida e Caffe" not
 * "YOCO*VIDA E CAFFE 021 555 1234 CLAREMONT V&A".
 *
 * @param {string} description
 * @returns {string}
 */
export function cleanForAI(description) {
  if (!description) return ''
  let s = normalizeDescription(description)  // strips payment prefixes + long refs
  s = s
    // Strip SA phone numbers (landline + mobile patterns)
    .replace(/0\d{2}[\s-]?\d{3}[\s-]?\d{4}/g, '')
    // Strip short numeric tokens (branch codes, store numbers)
    .replace(/\d{1,5}/g, '')
    // Strip common trailing location noise
    .replace(/(jhb|cpt|dbn|pta|centurion|sandton|rosebank|waterfront|mall|centre|plaza|square|park|lifestyle|shopping)/gi, '')
    // Strip trailing separators left after removals
    .replace(/[-–|,]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  // If cleaning left an empty string, fall back to the normalized form
  return s || normalizeDescription(description)
}

/**
 * Returns true if the transaction should count as lifestyle spend
 * (i.e. not Income, not Transfer).
 * Use this everywhere spendTxns are calculated.
 * @param {{ category: string }} txn
 * @returns {boolean}
 */
export function isSpendTransaction(txn) {
  return !EXCLUDED_FROM_SPEND.has(txn?.category)
}
