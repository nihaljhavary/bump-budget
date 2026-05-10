/**
 * bump. — Merchant Intelligence Layer
 * src/utils/merchantNormalizer.js
 *
 * Provides wrapper stripping, canonical merchant identity,
 * transaction-type classification, and behavioural tagging.
 *
 * Used client-side for display normalization and analytics.
 * The server-side equivalent logic lives in netlify/functions/sa-categorise.js.
 *
 * Unit convention: amounts in RANDS throughout.
 */

// ── Payment wrapper / processor patterns ──────────────────────────────────────
// SA and global payment processors that prefix transaction descriptions.
// Order matters: longer/more-specific first.

const WRAPPER_PATTERNS = [
  /^FLW\*/i,           // Flutterwave
  /^PAYGATE\s*\*/i,   // PayGate
  /^PAYFAST\s*\*/i,   // PayFast
  /^YOCO\s*\*/i,      // Yoco POS
  /^SQ\s*\*/i,        // Square
  /^POS\s*\*/i,       // Generic POS prefix
  /^SNAPSCAN\s*\*/i,  // SnapScan
  /^OZOW\s*\*/i,      // Ozow
  /^PEACH\s*\*/i,     // Peach Payments
  /^NETCASH\s*\*/i,   // NetCash
  /^PAYU\s*\*/i,      // PayU
  /^STRIPE\s*\*/i,    // Stripe
  /^BLUESNAP\s*\*/i,  // BlueSnap
  /^CARD\s*PAYMENT\s*[-–]?\s*/i,  // Generic card payment prefix
  /^ONLINE\s*PURCHASE\s*[-–]?\s*/i,
  /^INTERNET\s*PURCHASE\s*[-–]?\s*/i,
  /^DEBIT\s*ORDER\s*[-–]?\s*/i,
]

/**
 * Strip payment wrapper/processor prefixes from a raw bank description.
 * @param {string} description
 * @returns {string}
 */
export function stripWrappers(description) {
  if (!description) return ''
  let s = description.trim()
  for (const pattern of WRAPPER_PATTERNS) {
    s = s.replace(pattern, '')
  }
  return s.trim()
}

/**
 * Normalize a raw bank description for display.
 * Strips wrappers, long reference numbers, excess whitespace, branch codes.
 * @param {string} description
 * @returns {string}
 */
export function normalizeForDisplay(description) {
  if (!description) return ''
  return stripWrappers(description)
    .replace(/\b\d{6,}\b/g, '')       // remove long ref numbers
    .replace(/\s{2,}/g, ' ')
    .replace(/[*\/\\]+$/, '')         // trailing separators
    .trim()
}

/**
 * Normalize for pattern matching: strip wrappers + lowercase.
 * @param {string} description
 * @returns {string}
 */
export function normalizeForMatching(description) {
  return normalizeForDisplay(description).toLowerCase()
}

// ── Canonical merchant database ───────────────────────────────────────────────
// Each entry: { patterns, canonical, category, subcategory, type, tags }
// patterns: lowercase strings to match against normalised description
// First match wins — put more specific patterns first within each group.

const CANONICAL_MERCHANTS = [

  // ── GROCERIES ────────────────────────────────────────────────────────────
  { patterns: ['woolworths food', 'woolies food', 'ww food'],
    canonical: 'Woolworths Food', category: 'Groceries', subcategory: 'supermarket',
    type: 'grocery', tags: ['essential', 'variable_cost', 'premium'] },
  { patterns: ['checkers superstore', 'checkers hyper'],
    canonical: 'Checkers Hyper', category: 'Groceries', subcategory: 'supermarket',
    type: 'grocery', tags: ['essential', 'variable_cost'] },
  { patterns: ['checkers'],
    canonical: 'Checkers', category: 'Groceries', subcategory: 'supermarket',
    type: 'grocery', tags: ['essential', 'variable_cost'] },
  { patterns: ['pick n pay', 'picknpay', 'pnp'],
    canonical: 'Pick n Pay', category: 'Groceries', subcategory: 'supermarket',
    type: 'grocery', tags: ['essential', 'variable_cost'] },
  { patterns: ['superspar', 'kwikspar', 'kwik spar'],
    canonical: 'Spar', category: 'Groceries', subcategory: 'supermarket',
    type: 'grocery', tags: ['essential', 'variable_cost'] },
  { patterns: ['spar'],
    canonical: 'Spar', category: 'Groceries', subcategory: 'supermarket',
    type: 'grocery', tags: ['essential', 'variable_cost'] },
  { patterns: ['shoprite checkers', 'shoprite'],
    canonical: 'Shoprite', category: 'Groceries', subcategory: 'supermarket',
    type: 'grocery', tags: ['essential', 'variable_cost', 'value'] },
  { patterns: ["food lover's market", 'food lovers market', 'food lovers'],
    canonical: "Food Lover's Market", category: 'Groceries', subcategory: 'specialty',
    type: 'grocery', tags: ['essential', 'variable_cost', 'premium'] },
  { patterns: ['fruit & veg city', 'fruit and veg city'],
    canonical: 'Fruit & Veg City', category: 'Groceries', subcategory: 'specialty',
    type: 'grocery', tags: ['essential', 'variable_cost'] },
  { patterns: ['cambridge food'],
    canonical: 'Cambridge Food', category: 'Groceries', subcategory: 'supermarket',
    type: 'grocery', tags: ['essential', 'variable_cost', 'value'] },
  { patterns: ['usave'],
    canonical: 'USave', category: 'Groceries', subcategory: 'supermarket',
    type: 'grocery', tags: ['essential', 'variable_cost', 'value'] },
  { patterns: ['ok foods', 'ok grocer'],
    canonical: 'OK Foods', category: 'Groceries', subcategory: 'supermarket',
    type: 'grocery', tags: ['essential', 'variable_cost'] },
  { patterns: ['freshstop'],
    canonical: 'FreshStop', category: 'Groceries', subcategory: 'convenience',
    type: 'grocery', tags: ['essential', 'variable_cost'] },
  { patterns: ['tops'],
    canonical: 'Tops Liquor', category: 'Groceries', subcategory: 'liquor',
    type: 'grocery', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['makro deli', 'makro food'],
    canonical: 'Makro (Food)', category: 'Groceries', subcategory: 'bulk',
    type: 'grocery', tags: ['essential', 'variable_cost'] },

  // ── EATING OUT ───────────────────────────────────────────────────────────
  { patterns: ['uber eats', 'ubereats', 'uber *eats'],
    canonical: 'Uber Eats', category: 'Eating out', subcategory: 'delivery',
    type: 'restaurant', tags: ['discretionary', 'variable_cost', 'digital'] },
  { patterns: ['mr d food', 'mrdfood', 'mrd food'],
    canonical: 'Mr D Food', category: 'Eating out', subcategory: 'delivery',
    type: 'restaurant', tags: ['discretionary', 'variable_cost', 'digital'] },
  { patterns: ['bolt food'],
    canonical: 'Bolt Food', category: 'Eating out', subcategory: 'delivery',
    type: 'restaurant', tags: ['discretionary', 'variable_cost', 'digital'] },
  { patterns: ['kfc'],
    canonical: 'KFC', category: 'Eating out', subcategory: 'fast_food',
    type: 'restaurant', tags: ['discretionary', 'variable_cost'] },
  { patterns: ["mcdonald's", 'mcdonalds', 'mcd '],
    canonical: "McDonald's", category: 'Eating out', subcategory: 'fast_food',
    type: 'restaurant', tags: ['discretionary', 'variable_cost'] },
  { patterns: ["nando's", 'nandos'],
    canonical: "Nando's", category: 'Eating out', subcategory: 'casual_dining',
    type: 'restaurant', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['steers'],
    canonical: 'Steers', category: 'Eating out', subcategory: 'fast_food',
    type: 'restaurant', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['debonairs'],
    canonical: 'Debonairs', category: 'Eating out', subcategory: 'fast_food',
    type: 'restaurant', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['burger king'],
    canonical: 'Burger King', category: 'Eating out', subcategory: 'fast_food',
    type: 'restaurant', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['wimpy'],
    canonical: 'Wimpy', category: 'Eating out', subcategory: 'casual_dining',
    type: 'restaurant', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['hungry lion'],
    canonical: 'Hungry Lion', category: 'Eating out', subcategory: 'fast_food',
    type: 'restaurant', tags: ['discretionary', 'variable_cost', 'value'] },
  { patterns: ['spur'],
    canonical: 'Spur', category: 'Eating out', subcategory: 'casual_dining',
    type: 'restaurant', tags: ['discretionary', 'variable_cost', 'social'] },
  { patterns: ['ocean basket'],
    canonical: 'Ocean Basket', category: 'Eating out', subcategory: 'casual_dining',
    type: 'restaurant', tags: ['discretionary', 'variable_cost', 'social'] },
  { patterns: ['mugg and bean', 'mugg & bean'],
    canonical: 'Mugg & Bean', category: 'Eating out', subcategory: 'casual_dining',
    type: 'restaurant', tags: ['discretionary', 'variable_cost', 'social'] },
  { patterns: ['vida e caffe', 'vida caffe', 'vida '],
    canonical: 'Vida e Caffè', category: 'Eating out', subcategory: 'coffee',
    type: 'restaurant', tags: ['discretionary', 'variable_cost', 'lifestyle'] },
  { patterns: ['kauai'],
    canonical: 'Kauai', category: 'Eating out', subcategory: 'healthy_fast_food',
    type: 'restaurant', tags: ['discretionary', 'variable_cost', 'premium'] },
  { patterns: ["tasha's", 'tashas'],
    canonical: "Tasha's", category: 'Eating out', subcategory: 'casual_dining',
    type: 'restaurant', tags: ['discretionary', 'variable_cost', 'social', 'premium'] },
  { patterns: ['doppio zero'],
    canonical: 'Doppio Zero', category: 'Eating out', subcategory: 'casual_dining',
    type: 'restaurant', tags: ['discretionary', 'variable_cost', 'social', 'premium'] },
  { patterns: ["roman's pizza", 'roman pizza'],
    canonical: "Roman's Pizza", category: 'Eating out', subcategory: 'fast_food',
    type: 'restaurant', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['panarottis'],
    canonical: 'Panarottis', category: 'Eating out', subcategory: 'fast_food',
    type: 'restaurant', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['fishaways'],
    canonical: 'Fishaways', category: 'Eating out', subcategory: 'fast_food',
    type: 'restaurant', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['barcelos'],
    canonical: 'Barcelos', category: 'Eating out', subcategory: 'fast_food',
    type: 'restaurant', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['chicken licken'],
    canonical: 'Chicken Licken', category: 'Eating out', subcategory: 'fast_food',
    type: 'restaurant', tags: ['discretionary', 'variable_cost'] },
  { patterns: ["galito's", 'galitos'],
    canonical: "Galito's", category: 'Eating out', subcategory: 'fast_food',
    type: 'restaurant', tags: ['discretionary', 'variable_cost'] },

  // ── FUEL ─────────────────────────────────────────────────────────────────
  { patterns: ['engen'],
    canonical: 'Engen', category: 'Fuel', subcategory: 'petrol_station',
    type: 'fuel', tags: ['essential', 'variable_cost'] },
  { patterns: ['bp/', 'bp ', 'bpexpress'],
    canonical: 'BP', category: 'Fuel', subcategory: 'petrol_station',
    type: 'fuel', tags: ['essential', 'variable_cost'] },
  { patterns: ['shell/', 'shell '],
    canonical: 'Shell', category: 'Fuel', subcategory: 'petrol_station',
    type: 'fuel', tags: ['essential', 'variable_cost'] },
  { patterns: ['sasol'],
    canonical: 'Sasol', category: 'Fuel', subcategory: 'petrol_station',
    type: 'fuel', tags: ['essential', 'variable_cost'] },
  { patterns: ['total/', 'total '],
    canonical: 'Total', category: 'Fuel', subcategory: 'petrol_station',
    type: 'fuel', tags: ['essential', 'variable_cost'] },
  { patterns: ['caltex'],
    canonical: 'Caltex', category: 'Fuel', subcategory: 'petrol_station',
    type: 'fuel', tags: ['essential', 'variable_cost'] },
  { patterns: ['astron energy', 'astron'],
    canonical: 'Astron Energy', category: 'Fuel', subcategory: 'petrol_station',
    type: 'fuel', tags: ['essential', 'variable_cost'] },

  // ── TRANSPORT ────────────────────────────────────────────────────────────
  { patterns: ['uber trip', 'uber - trip'],
    canonical: 'Uber', category: 'Transport', subcategory: 'ridehailing',
    type: 'transport', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['bolt ride', 'bolt trip'],
    canonical: 'Bolt', category: 'Transport', subcategory: 'ridehailing',
    type: 'transport', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['gautrain'],
    canonical: 'Gautrain', category: 'Transport', subcategory: 'public_transit',
    type: 'transport', tags: ['essential', 'variable_cost'] },
  { patterns: ['myciti'],
    canonical: 'MyCiTi', category: 'Transport', subcategory: 'public_transit',
    type: 'transport', tags: ['essential', 'variable_cost'] },
  { patterns: ['e-toll', 'sanral'],
    canonical: 'E-Toll / Sanral', category: 'Transport', subcategory: 'toll',
    type: 'debit_order', tags: ['essential', 'variable_cost'] },
  { patterns: ['admyt'],
    canonical: 'Admyt Parking', category: 'Transport', subcategory: 'parking',
    type: 'transport', tags: ['discretionary', 'variable_cost'] },

  // ── SUBSCRIPTIONS ────────────────────────────────────────────────────────
  { patterns: ['netflix'],
    canonical: 'Netflix', category: 'Subscriptions', subcategory: 'video_streaming',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital', 'entertainment'] },
  { patterns: ['showmax'],
    canonical: 'Showmax', category: 'Subscriptions', subcategory: 'video_streaming',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital', 'entertainment'] },
  { patterns: ['dstv'],
    canonical: 'DStv', category: 'Subscriptions', subcategory: 'tv',
    type: 'debit_order', tags: ['discretionary', 'fixed_cost', 'entertainment'] },
  { patterns: ['disney plus', 'disney+'],
    canonical: 'Disney+', category: 'Subscriptions', subcategory: 'video_streaming',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital', 'entertainment'] },
  { patterns: ['amazon prime'],
    canonical: 'Amazon Prime', category: 'Subscriptions', subcategory: 'video_streaming',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital'] },
  { patterns: ['apple tv+', 'apple tv'],
    canonical: 'Apple TV+', category: 'Subscriptions', subcategory: 'video_streaming',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital'] },
  { patterns: ['apple one'],
    canonical: 'Apple One', category: 'Subscriptions', subcategory: 'bundle',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital'] },
  { patterns: ['spotify'],
    canonical: 'Spotify', category: 'Subscriptions', subcategory: 'music_streaming',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital'] },
  { patterns: ['apple music'],
    canonical: 'Apple Music', category: 'Subscriptions', subcategory: 'music_streaming',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital'] },
  { patterns: ['youtube premium'],
    canonical: 'YouTube Premium', category: 'Subscriptions', subcategory: 'video_streaming',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital'] },
  { patterns: ['playstation network', 'psn*'],
    canonical: 'PlayStation Network', category: 'Subscriptions', subcategory: 'gaming',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital', 'entertainment'] },
  { patterns: ['xbox game'],
    canonical: 'Xbox Game Pass', category: 'Subscriptions', subcategory: 'gaming',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital', 'entertainment'] },
  { patterns: ['google one'],
    canonical: 'Google One', category: 'Subscriptions', subcategory: 'cloud_storage',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital'] },
  { patterns: ['microsoft 365', 'office 365', 'ms365'],
    canonical: 'Microsoft 365', category: 'Subscriptions', subcategory: 'productivity',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital'] },
  { patterns: ['adobe '],
    canonical: 'Adobe', category: 'Subscriptions', subcategory: 'creative_software',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital'] },
  { patterns: ['dropbox'],
    canonical: 'Dropbox', category: 'Subscriptions', subcategory: 'cloud_storage',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital'] },
  { patterns: ['openai', 'chatgpt'],
    canonical: 'OpenAI / ChatGPT', category: 'Subscriptions', subcategory: 'ai_tools',
    type: 'subscription', tags: ['discretionary', 'fixed_cost', 'digital'] },
  { patterns: ['planet fitness'],
    canonical: 'Planet Fitness', category: 'Subscriptions', subcategory: 'gym',
    type: 'debit_order', tags: ['lifestyle', 'fixed_cost'] },
  { patterns: ['virgin active'],
    canonical: 'Virgin Active', category: 'Subscriptions', subcategory: 'gym',
    type: 'debit_order', tags: ['lifestyle', 'fixed_cost', 'premium'] },
  { patterns: ['anytime fitness'],
    canonical: 'Anytime Fitness', category: 'Subscriptions', subcategory: 'gym',
    type: 'debit_order', tags: ['lifestyle', 'fixed_cost'] },

  // ── INSURANCE ────────────────────────────────────────────────────────────
  { patterns: ['discovery life'],
    canonical: 'Discovery Life', category: 'Insurance', subcategory: 'life',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['discovery insure'],
    canonical: 'Discovery Insure', category: 'Insurance', subcategory: 'vehicle',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['outsurance'],
    canonical: 'Outsurance', category: 'Insurance', subcategory: 'short_term',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['king price'],
    canonical: 'King Price', category: 'Insurance', subcategory: 'vehicle',
    type: 'debit_order', tags: ['essential', 'fixed_cost', 'value'] },
  { patterns: ['miway'],
    canonical: 'MiWay', category: 'Insurance', subcategory: 'short_term',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['momentum life', 'momentum insur'],
    canonical: 'Momentum', category: 'Insurance', subcategory: 'life',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['sanlam'],
    canonical: 'Sanlam', category: 'Insurance', subcategory: 'life',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['old mutual insur', 'old mutual life'],
    canonical: 'Old Mutual', category: 'Insurance', subcategory: 'life',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['hollard'],
    canonical: 'Hollard', category: 'Insurance', subcategory: 'short_term',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['santam'],
    canonical: 'Santam', category: 'Insurance', subcategory: 'short_term',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['budget insurance'],
    canonical: 'Budget Insurance', category: 'Insurance', subcategory: 'short_term',
    type: 'debit_order', tags: ['essential', 'fixed_cost', 'value'] },
  { patterns: ['assupol'],
    canonical: 'Assupol', category: 'Insurance', subcategory: 'life',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },

  // ── HEALTH ───────────────────────────────────────────────────────────────
  { patterns: ['dis-chem', 'dischem'],
    canonical: 'Dis-Chem', category: 'Health', subcategory: 'pharmacy',
    type: 'retail', tags: ['essential', 'variable_cost'] },
  { patterns: ['clicks'],
    canonical: 'Clicks', category: 'Health', subcategory: 'pharmacy',
    type: 'retail', tags: ['essential', 'variable_cost'] },
  { patterns: ['medirite'],
    canonical: 'MediRite', category: 'Health', subcategory: 'pharmacy',
    type: 'retail', tags: ['essential', 'variable_cost'] },
  { patterns: ['discovery health'],
    canonical: 'Discovery Health', category: 'Health', subcategory: 'medical_aid',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['bonitas'],
    canonical: 'Bonitas', category: 'Health', subcategory: 'medical_aid',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['fedhealth'],
    canonical: 'Fedhealth', category: 'Health', subcategory: 'medical_aid',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['momentum health'],
    canonical: 'Momentum Health', category: 'Health', subcategory: 'medical_aid',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['medihelp'],
    canonical: 'Medihelp', category: 'Health', subcategory: 'medical_aid',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['mediclinic'],
    canonical: 'Mediclinic', category: 'Health', subcategory: 'hospital',
    type: 'once_off', tags: ['essential', 'variable_cost'] },
  { patterns: ['netcare'],
    canonical: 'Netcare', category: 'Health', subcategory: 'hospital',
    type: 'once_off', tags: ['essential', 'variable_cost'] },
  { patterns: ['intercare'],
    canonical: 'Intercare', category: 'Health', subcategory: 'clinic',
    type: 'once_off', tags: ['essential', 'variable_cost'] },

  // ── SAVINGS / INVESTMENTS ─────────────────────────────────────────────────
  { patterns: ['easy equities', 'easyequities'],
    canonical: 'EasyEquities', category: 'Savings', subcategory: 'investment_platform',
    type: 'savings_transfer', tags: ['investment', 'variable_cost'] },
  { patterns: ['10x /', '10x invest', '10x retirement'],
    canonical: '10X Investments', category: 'Savings', subcategory: 'retirement',
    type: 'savings_transfer', tags: ['investment', 'fixed_cost'] },
  { patterns: ['sygnia'],
    canonical: 'Sygnia', category: 'Savings', subcategory: 'investment',
    type: 'savings_transfer', tags: ['investment', 'variable_cost'] },
  { patterns: ['satrix'],
    canonical: 'Satrix', category: 'Savings', subcategory: 'etf',
    type: 'savings_transfer', tags: ['investment', 'variable_cost'] },
  { patterns: ['allan gray'],
    canonical: 'Allan Gray', category: 'Savings', subcategory: 'unit_trust',
    type: 'savings_transfer', tags: ['investment', 'variable_cost'] },
  { patterns: ['coronation'],
    canonical: 'Coronation', category: 'Savings', subcategory: 'unit_trust',
    type: 'savings_transfer', tags: ['investment', 'variable_cost'] },
  { patterns: ['old mutual invest'],
    canonical: 'Old Mutual Invest', category: 'Savings', subcategory: 'unit_trust',
    type: 'savings_transfer', tags: ['investment', 'variable_cost'] },
  { patterns: ['discovery invest'],
    canonical: 'Discovery Invest', category: 'Savings', subcategory: 'investment',
    type: 'savings_transfer', tags: ['investment', 'variable_cost'] },
  { patterns: ['ninety one'],
    canonical: 'Ninety One', category: 'Savings', subcategory: 'unit_trust',
    type: 'savings_transfer', tags: ['investment', 'variable_cost'] },
  { patterns: ['stash savings', 'stash '],
    canonical: 'Stash', category: 'Savings', subcategory: 'savings_app',
    type: 'savings_transfer', tags: ['investment', 'variable_cost'] },
  { patterns: ['tax free savings', 'tfsa'],
    canonical: 'TFSA', category: 'Savings', subcategory: 'tax_free',
    type: 'savings_transfer', tags: ['investment', 'variable_cost'] },
  { patterns: ['retirement annuity', 'ra contribution'],
    canonical: 'Retirement Annuity', category: 'Savings', subcategory: 'retirement',
    type: 'debit_order', tags: ['investment', 'fixed_cost'] },
  { patterns: ['provident fund', 'pension fund'],
    canonical: 'Pension Fund', category: 'Savings', subcategory: 'retirement',
    type: 'debit_order', tags: ['investment', 'fixed_cost'] },

  // ── UTILITIES ────────────────────────────────────────────────────────────
  { patterns: ['eskom'],
    canonical: 'Eskom', category: 'Utilities', subcategory: 'electricity',
    type: 'utility', tags: ['essential', 'variable_cost'] },
  { patterns: ['city power'],
    canonical: 'City Power', category: 'Utilities', subcategory: 'electricity',
    type: 'utility', tags: ['essential', 'variable_cost'] },
  { patterns: ['prepaid electricity', 'prepaid elec', 'prepaid power'],
    canonical: 'Prepaid Electricity', category: 'Utilities', subcategory: 'electricity',
    type: 'utility', tags: ['essential', 'variable_cost'] },
  { patterns: ['telkom'],
    canonical: 'Telkom', category: 'Utilities', subcategory: 'telecom',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['vodacom top', 'vodacom recharge'],
    canonical: 'Vodacom', category: 'Utilities', subcategory: 'mobile',
    type: 'utility', tags: ['essential', 'variable_cost'] },
  { patterns: ['mtn /', 'mtn recharge', 'mtn airtime'],
    canonical: 'MTN', category: 'Utilities', subcategory: 'mobile',
    type: 'utility', tags: ['essential', 'variable_cost'] },
  { patterns: ['rain '],
    canonical: 'Rain', category: 'Utilities', subcategory: 'data',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['vumatel'],
    canonical: 'Vumatel', category: 'Utilities', subcategory: 'fibre',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['openserve'],
    canonical: 'Openserve', category: 'Utilities', subcategory: 'fibre',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['metrofibre'],
    canonical: 'MetroFibre', category: 'Utilities', subcategory: 'fibre',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['afrihost'],
    canonical: 'Afrihost', category: 'Utilities', subcategory: 'internet',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },
  { patterns: ['webafrica'],
    canonical: 'WebAfrica', category: 'Utilities', subcategory: 'internet',
    type: 'debit_order', tags: ['essential', 'fixed_cost'] },

  // ── CLOTHING ─────────────────────────────────────────────────────────────
  { patterns: ['mr price home', 'mrp home'],
    canonical: 'Mr Price Home', category: 'Home & Garden', subcategory: 'homeware',
    type: 'retail', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['mr price ', 'mrp '],
    canonical: 'Mr Price', category: 'Clothing', subcategory: 'clothing',
    type: 'retail', tags: ['discretionary', 'variable_cost', 'value'] },
  { patterns: ['woolworths ', 'woolworths', 'woolies'],
    canonical: 'Woolworths', category: 'Clothing', subcategory: 'fashion',
    type: 'retail', tags: ['discretionary', 'variable_cost', 'premium'] },
  { patterns: ['h&m'],
    canonical: 'H&M', category: 'Clothing', subcategory: 'fashion',
    type: 'retail', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['zara '],
    canonical: 'Zara', category: 'Clothing', subcategory: 'fashion',
    type: 'retail', tags: ['discretionary', 'variable_cost', 'premium'] },
  { patterns: ['cotton on'],
    canonical: 'Cotton On', category: 'Clothing', subcategory: 'casual',
    type: 'retail', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['edgars'],
    canonical: 'Edgars', category: 'Clothing', subcategory: 'fashion',
    type: 'retail', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['truworths'],
    canonical: 'Truworths', category: 'Clothing', subcategory: 'fashion',
    type: 'retail', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['foschini', 'tfg '],
    canonical: 'Foschini (TFG)', category: 'Clothing', subcategory: 'fashion',
    type: 'retail', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['pep /', 'pep store'],
    canonical: 'PEP', category: 'Clothing', subcategory: 'value_fashion',
    type: 'retail', tags: ['discretionary', 'variable_cost', 'value'] },
  { patterns: ['ackermans'],
    canonical: 'Ackermans', category: 'Clothing', subcategory: 'value_fashion',
    type: 'retail', tags: ['discretionary', 'variable_cost', 'value'] },
  { patterns: ['sportscene'],
    canonical: 'Sportscene', category: 'Clothing', subcategory: 'sport',
    type: 'retail', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['totalsports'],
    canonical: 'Totalsports', category: 'Clothing', subcategory: 'sport',
    type: 'retail', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['shein'],
    canonical: 'Shein', category: 'Clothing', subcategory: 'online_fashion',
    type: 'retail', tags: ['discretionary', 'variable_cost', 'digital', 'value'] },
  { patterns: ['superbalist', 'supabalist'],
    canonical: 'Superbalist', category: 'Clothing', subcategory: 'online_fashion',
    type: 'retail', tags: ['discretionary', 'variable_cost', 'digital'] },

  // ── HOME & GARDEN ────────────────────────────────────────────────────────
  { patterns: ['builders warehouse', 'builders express', 'builders tradeshed'],
    canonical: 'Builders Warehouse', category: 'Home & Garden', subcategory: 'hardware',
    type: 'retail', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['leroy merlin'],
    canonical: 'Leroy Merlin', category: 'Home & Garden', subcategory: 'hardware',
    type: 'retail', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['hirsch', 'hirschs'],
    canonical: "Hirsch's", category: 'Home & Garden', subcategory: 'appliances',
    type: 'retail', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['weylandts'],
    canonical: 'Weylandts', category: 'Home & Garden', subcategory: 'furniture',
    type: 'retail', tags: ['discretionary', 'variable_cost', 'premium'] },
  { patterns: ['coricraft'],
    canonical: 'Coricraft', category: 'Home & Garden', subcategory: 'furniture',
    type: 'retail', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['homechoice', 'home choice'],
    canonical: 'HomeChoice', category: 'Home & Garden', subcategory: 'homeware',
    type: 'retail', tags: ['discretionary', 'variable_cost'] },

  // ── ONLINE RETAIL ────────────────────────────────────────────────────────
  { patterns: ['takealot'],
    canonical: 'Takealot', category: 'Other', subcategory: 'online_retail',
    type: 'retail', tags: ['discretionary', 'variable_cost', 'digital'] },
  { patterns: ['amazon.co.za', 'amazon '],
    canonical: 'Amazon', category: 'Other', subcategory: 'online_retail',
    type: 'retail', tags: ['discretionary', 'variable_cost', 'digital'] },
  { patterns: ['loot.co.za'],
    canonical: 'Loot', category: 'Other', subcategory: 'online_retail',
    type: 'retail', tags: ['discretionary', 'variable_cost', 'digital'] },

  // ── TRAVEL ───────────────────────────────────────────────────────────────
  { patterns: ['flysafair', 'safair'],
    canonical: 'FlySafair', category: 'Travel', subcategory: 'flight',
    type: 'once_off', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['kulula'],
    canonical: 'Kulula', category: 'Travel', subcategory: 'flight',
    type: 'once_off', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['airbnb'],
    canonical: 'Airbnb', category: 'Travel', subcategory: 'accommodation',
    type: 'once_off', tags: ['discretionary', 'variable_cost', 'digital'] },
  { patterns: ['booking.com'],
    canonical: 'Booking.com', category: 'Travel', subcategory: 'accommodation',
    type: 'once_off', tags: ['discretionary', 'variable_cost', 'digital'] },
  { patterns: ['lekkeslaap'],
    canonical: 'LekkeSlaap', category: 'Travel', subcategory: 'accommodation',
    type: 'once_off', tags: ['discretionary', 'variable_cost'] },

  // ── ENTERTAINMENT ────────────────────────────────────────────────────────
  { patterns: ['ster-kinekor', 'sterkinekor'],
    canonical: 'Ster-Kinekor', category: 'Entertainment', subcategory: 'cinema',
    type: 'once_off', tags: ['discretionary', 'variable_cost', 'social'] },
  { patterns: ['nu metro', 'numetro'],
    canonical: 'Nu Metro', category: 'Entertainment', subcategory: 'cinema',
    type: 'once_off', tags: ['discretionary', 'variable_cost', 'social'] },
  { patterns: ['computicket'],
    canonical: 'Computicket', category: 'Entertainment', subcategory: 'tickets',
    type: 'once_off', tags: ['discretionary', 'variable_cost', 'social'] },
  { patterns: ['howler'],
    canonical: 'Howler', category: 'Entertainment', subcategory: 'events',
    type: 'once_off', tags: ['discretionary', 'variable_cost', 'social'] },
  { patterns: ['hollywoodbets'],
    canonical: 'Hollywoodbets', category: 'Entertainment', subcategory: 'gambling',
    type: 'once_off', tags: ['discretionary', 'variable_cost'] },
  { patterns: ['sunbet'],
    canonical: 'SunBet', category: 'Entertainment', subcategory: 'gambling',
    type: 'once_off', tags: ['discretionary', 'variable_cost'] },
]

/**
 * Look up a canonical merchant identity from a description.
 * Returns the best matching merchant record or null.
 *
 * @param {string} description - Raw or partially normalized description
 * @returns {{ canonical, category, subcategory, type, tags, confidence } | null}
 */
export function getCanonicalMerchant(description) {
  if (!description) return null
  const lower = normalizeForMatching(description)

  for (const merchant of CANONICAL_MERCHANTS) {
    for (const pattern of merchant.patterns) {
      if (lower.includes(pattern)) {
        return {
          canonical:   merchant.canonical,
          category:    merchant.category,
          subcategory: merchant.subcategory,
          type:        merchant.type,
          tags:        merchant.tags,
          confidence:  1.0,
        }
      }
    }
  }
  return null
}

/**
 * Classify a transaction's type based on category and amount.
 * Used for recurring detection and financial analysis.
 *
 * @param {string} category
 * @param {number} amount        - in rands
 * @param {boolean} [isFixed]    - true if amount is consistent across occurrences
 * @returns {string} type
 */
export function classifyTransactionType(category, amount, isFixed = false) {
  if (category === 'Income')   return 'salary'
  if (category === 'Transfer') return 'bank_transfer'
  if (category === 'Savings')  return 'savings_transfer'
  if (category === 'Subscriptions') return 'subscription'
  if (category === 'Insurance')     return 'debit_order'
  if (category === 'Housing')       return 'debit_order'
  if (category === 'Utilities' && isFixed) return 'utility'
  if (isFixed && amount > 500) return 'debit_order'
  return 'once_off'
}

/**
 * Get behavioral tags for a transaction based on canonical merchant lookup.
 * Falls back to category-based defaults.
 *
 * @param {string} description
 * @param {string} category
 * @returns {string[]} tags
 */
export function getMerchantTags(description, category) {
  const merchant = getCanonicalMerchant(description)
  if (merchant) return merchant.tags

  // Category-based fallbacks
  const fallbacks = {
    'Income':        ['salary', 'income'],
    'Transfer':      ['transfer'],
    'Savings':       ['investment'],
    'Housing':       ['essential', 'fixed_cost'],
    'Groceries':     ['essential', 'variable_cost'],
    'Eating out':    ['discretionary', 'variable_cost', 'social'],
    'Transport':     ['essential', 'variable_cost'],
    'Fuel':          ['essential', 'variable_cost'],
    'Subscriptions': ['discretionary', 'fixed_cost', 'digital'],
    'Insurance':     ['essential', 'fixed_cost'],
    'Health':        ['essential', 'variable_cost'],
    'Utilities':     ['essential', 'fixed_cost'],
    'Clothing':      ['discretionary', 'variable_cost'],
    'Entertainment': ['discretionary', 'variable_cost', 'social'],
    'Education':     ['essential', 'variable_cost'],
    'Travel':        ['discretionary', 'variable_cost'],
    'Home & Garden': ['discretionary', 'variable_cost'],
    'Fees & Charges':['essential', 'banking_fee'],
    'ATM / Cash':    ['variable_cost'],
    'Gifts':         ['discretionary', 'variable_cost'],
    'Other':         ['variable_cost'],
  }
  return fallbacks[category] || ['variable_cost']
}

/**
 * Full merchant interpretation for a single transaction.
 * Returns normalized name, canonical identity, type, tags, and confidence.
 *
 * @param {{ name: string, category: string, amount: number }} txn
 * @returns {{
 *   displayName:  string,
 *   canonical:    string|null,
 *   category:     string,
 *   subcategory:  string|null,
 *   type:         string,
 *   tags:         string[],
 *   confidence:   number,
 * }}
 */
export function interpretMerchant(txn) {
  const { name, category, amount } = txn
  const merchantRecord = getCanonicalMerchant(name)

  if (merchantRecord) {
    return {
      displayName:  merchantRecord.canonical,
      canonical:    merchantRecord.canonical,
      category:     merchantRecord.category,    // canonical DB wins over stored category
      subcategory:  merchantRecord.subcategory,
      type:         merchantRecord.type,
      tags:         merchantRecord.tags,
      confidence:   1.0,
    }
  }

  // Fallback: use stored category, normalize display name
  return {
    displayName:  normalizeForDisplay(name),
    canonical:    null,
    category:     category || 'Other',
    subcategory:  null,
    type:         classifyTransactionType(category, amount),
    tags:         getMerchantTags(name, category),
    confidence:   category ? 0.6 : 0.3,
  }
}
