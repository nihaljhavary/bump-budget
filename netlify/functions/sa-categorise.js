// ── Shared SA merchant categorisation rules ──────────────────────────────────
// Used by parse-transaction.js (single entry) and parse-bulk-transactions.js (bulk import)
// Each rule: { patterns: [...lowercase strings], category: 'Category' }
// Checked in ORDER — first match wins. Put more specific before general.

export const CATEGORIES = [
  'Income', 'Housing', 'Groceries', 'Eating out', 'Transport',
  'Entertainment', 'Health', 'Clothing', 'Subscriptions',
  'Education', 'Insurance', 'Savings', 'Fuel', 'ATM / Cash',
  'Fees & Charges', 'Utilities', 'Travel', 'Gifts', 'Other'
]

export const SA_RULES = [
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
    "galito's", 'galitos', 'chicken licken', 'uncle chicken', 'popeyes'
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
  { patterns: ['atm withdrawal', 'cash withdrawal', 'cash deposit', 'cash advance', 'cashsend', 'instant money'], category: 'ATM / Cash' },

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
  ], category: 'Savings' },

  // ── Woolworths general (after food-specific rules above) ──
  { patterns: ['woolworths ', 'woolies '], category: 'Clothing' },
]

/**
 * Pre-categorise a transaction description using SA_RULES.
 * Returns a category string or null if no rule matches.
 * @param {string} description
 * @returns {string|null}
 */
export function saPreCategory(description) {
  if (!description) return null
  const lower = description.toLowerCase()
  for (const rule of SA_RULES) {
    for (const pattern of rule.patterns) {
      if (lower.includes(pattern)) return rule.category
    }
  }
  // Yoco wildcard — anything remaining from Yoco is likely a small business
  if (lower.startsWith('yoco*')) return 'Other'
  return null
}
